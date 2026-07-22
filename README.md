# Agente IA de atención por WhatsApp

Plataforma SaaS **multi-tenant** que atiende a los clientes de un negocio por WhatsApp con un agente de IA y agenda citas en Google Calendar. Incluye un panel web donde el dueño configura el agente, ve conversaciones en tiempo real y gestiona citas.

Pensada para clínicas dentales, pero flexible a cualquier negocio con agendamiento (los servicios y horarios se configuran por organización).

---

## Arquitectura

```
[Cliente WhatsApp] ──> [Meta Cloud API] ──webhook──> [Next.js /api/webhooks/whatsapp]
                                                          │
                                                          ├─ verifica firma HMAC X-Hub-Signature-256
                                                          ├─ responde 200 de inmediato
                                                          └─ after(): procesa en background
                                                                ├─ upsert contacto / conversación
                                                                ├─ inserta mensaje (idempotente por wa_message_id)
                                                                ├─ si bot_active → Agente IA (AI SDK 6 + Claude Sonnet 5)
                                                                │     ├─ tool: get_available_slots (Google Calendar FreeBusy)
                                                                │     ├─ tool: book_appointment    (Google Calendar + Supabase)
                                                                │     ├─ tool: save_contact_info
                                                                │     └─ tool: request_human_handoff
                                                                └─ envía respuesta vía Graph API

[Dueño del negocio] ──> [Panel Next.js] ──> [Supabase Auth + Postgres con RLS]
                                              rutas: dashboard, citas, conversaciones,
                                                     personalización, integraciones
```

Cada usuario pertenece a una `organization`. Todas las tablas llevan `organization_id` con **Row Level Security**: una organización nunca ve datos de otra. El webhook, que no tiene sesión de usuario, usa la `service_role` key y resuelve la organización a partir del `phone_number_id` del payload.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js **16.2.6** (App Router, TypeScript strict) |
| Estilos | TailwindCSS v4 |
| Iconos | Phosphor Icons |
| BD + Auth | Supabase (Postgres + Auth + RLS + Realtime) |
| Agente IA | Vercel AI SDK **6** (`ai@6` + `@ai-sdk/anthropic@3`) |
| Modelo LLM | Anthropic **Claude Sonnet 5** (`claude-sonnet-5`) |
| WhatsApp | WhatsApp Cloud API (Graph API **v25.0**) |
| Calendario | Google Calendar API (OAuth 2.0) |
| Deploy | Vercel (Node.js runtime para los webhooks) |

### Decisiones de stack (frente al brief original)

El brief fijaba versiones que quedaron desactualizadas al construir el proyecto. Se ajustaron así, verificando cada una contra el registro npm:

- **Modelo `claude-sonnet-5`** en vez de `claude-sonnet-4-6`: es el Sonnet actual, calidad cercana a Opus en tareas agénticas al mismo precio de lista. Consecuencia: Sonnet 5 **rechaza `temperature` distinto del default** (error 400), así que el agente no envía `temperature` y el tono se controla desde el system prompt. Corre *adaptive thinking* por defecto; para cumplir el criterio de latencia (< 5 s) el agente lo desactiva (`thinking: { type: 'disabled' }`) y usa `effort: 'medium'`. Si la calidad de agendamiento lo pide, sube a `effort: 'high'` en `lib/agent/index.ts` antes de reactivar el thinking.
- **AI SDK 6 pineado** (`ai@6.0.228`, `@ai-sdk/anthropic@3.0.97`): el `latest` de `ai` ya es la 7. Se instalan pineados vía el tag `ai-v6`. La API usada (`generateText`, `tool({ inputSchema })`, `stopWhen: stepCountIs(8)`) es la de la 6.
- **Calendario con grilla propia de Tailwind** en vez de `react-big-calendar`: cero dependencias nuevas.

> ⚠️ **Antes de desplegar, verifica la versión del Graph API.** Meta libera una versión nueva cada ~3 meses. `v25.0` era la vigente al construir esto. La constante `GRAPH_API_VERSION` está centralizada en [`lib/whatsapp/config.ts`](lib/whatsapp/config.ts): migrar es cambiar una línea. Consulta el [changelog de Meta](https://developers.facebook.com/docs/graph-api/changelog).

---

## Requisitos

- **Node.js 20+** (probado con 24).
- **pnpm** vía Corepack (viene con Node). Si `corepack enable` falla por permisos en `/usr/local/bin`, usa el prefijo `corepack pnpm …` en cada comando (no necesita instalar nada global). Los comandos de abajo asumen `pnpm` disponible; si no lo tienes en el PATH, antepón `corepack `.
- **Supabase CLI** para migraciones locales (`npx supabase …`). Aplicar migraciones a una BD local requiere **Docker**.
- Una cuenta de **Supabase**, una app de **Meta** con WhatsApp, credenciales **OAuth de Google** y una **API key de Anthropic**.

---

## Setup local

### 1. Instalar dependencias

```bash
corepack pnpm install     # o `pnpm install` si ya está en el PATH
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Rellena `.env.local` (ver la sección [Variables de entorno](#variables-de-entorno)). Genera la clave de cifrado con:

```bash
openssl rand -base64 32   # pégala en ENCRYPTION_KEY
```

### 3. Base de datos

Con la Supabase CLI enlazada a tu proyecto (o local con Docker):

```bash
# Local (requiere Docker):
npx supabase start
npx supabase db reset        # aplica migraciones + seed

# O contra un proyecto remoto ya enlazado:
npx supabase db push
```

Las migraciones están en [`supabase/migrations/`](supabase/migrations/) e incluyen esquema, RLS, la función de onboarding y la habilitación de Realtime. El seed ([`supabase/seed.sql`](supabase/seed.sql)) crea dos organizaciones de ejemplo para probar el aislamiento multi-tenant.

**Regenera los tipos** tras cualquier cambio de esquema (el archivo actual está escrito a mano porque se construyó sin BD local):

```bash
npx supabase gen types typescript --local > lib/database.types.ts
```

### 4. Arrancar

```bash
corepack pnpm dev
```

Abre `http://localhost:3000`, crea una cuenta y completa el onboarding.

---

## Configurar la app de Meta (WhatsApp) paso a paso

1. En [developers.facebook.com](https://developers.facebook.com/), crea una app de tipo **Business** y añade el producto **WhatsApp**.
2. En **WhatsApp → API Setup** anota el **Phone Number ID** y el **WhatsApp Business Account ID (WABA ID)**. Para pruebas, Meta te da un número de prueba.
3. Crea un **System User** (Business Settings → Users → System Users) con un **Access Token** que tenga los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Usa este token (no un token personal).
4. Copia el **App Secret** desde **App Settings → Basic**.
5. En el panel, ve a **Integraciones** y pega los cinco valores: Phone Number ID, WABA ID, Access Token, un **Verify Token** (un secreto que tú eliges) y el App Secret. Pulsa **Probar conexión** para validar antes de guardar. Los tokens se guardan **cifrados** (AES-256-GCM).
6. La página te muestra dos valores para copiar hacia Meta:
   - **URL del webhook**: `https://TU-DOMINIO/api/webhooks/whatsapp`
   - **Verify token**: con el formato `{org_slug}:{tu_verify_token}` (codifica tu organización para que el webhook la identifique).
7. En **WhatsApp → Configuration → Webhook**, pega la URL y el verify token, y **suscríbete al campo `messages`**. Meta hará un `GET` de verificación; si el token coincide, quedará verificado.
8. Envía un mensaje al número de WhatsApp. Debería aparecer en **Conversaciones** y, si el bot está activo y hay calendario conectado, recibir respuesta del agente.

> **mTLS / trust store (desde el 31 de marzo de 2026):** Meta firma sus llamadas a webhooks con una CA interna nueva. En **Vercel** esto está cubierto por su trust store gestionado, no hay que hacer nada. Si en el futuro autohospedas (Docker, EC2, etc.), el sistema debe confiar en la *Meta Internal CA* o el handshake TLS fallará y dejarás de recibir eventos.

---

## Configurar OAuth de Google (Calendar)

1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y habilita la **Google Calendar API**.
2. Configura la **pantalla de consentimiento OAuth** (tipo External; añade tu email como test user mientras esté en modo prueba).
3. Crea una credencial **OAuth 2.0 Client ID** de tipo **Web application**.
4. En **Authorized redirect URIs** añade EXACTAMENTE el valor de `GOOGLE_OAUTH_REDIRECT_URI`:
   - Local: `http://localhost:3000/api/auth/google/callback`
   - Producción: `https://TU-DOMINIO/api/auth/google/callback`
5. Copia el **Client ID** y **Client Secret** a `.env.local`.
6. En el panel, **Integraciones → Conectar con Google**. Tras autorizar, elige el calendario a usar. El `refresh_token` se guarda cifrado y el access token se refresca solo cuando vence.

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (cliente con RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (bypasea RLS). **Solo servidor**, usada por el webhook. |
| `ANTHROPIC_API_KEY` | API key de Anthropic. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth de Google. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Redirect URI, idéntica a la registrada en Google Cloud. |
| `ENCRYPTION_KEY` | 32 bytes en base64 (`openssl rand -base64 32`). Cifra los tokens en BD. |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app, sin barra final. |

Las credenciales de WhatsApp **no** son variables de entorno: se guardan cifradas por organización en la tabla `whatsapp_configs` (multi-tenant).

> Si pierdes o rotas `ENCRYPTION_KEY`, los tokens ya cifrados quedan irrecuperables y habrá que reconectar WhatsApp y Google Calendar en cada organización.

---

## Deploy en Vercel

1. Importa el repositorio en Vercel.
2. Añade todas las variables de entorno del proyecto (con los valores de producción). Ajusta `NEXT_PUBLIC_APP_URL` y `GOOGLE_OAUTH_REDIRECT_URI` al dominio de Vercel.
3. En Google Cloud, añade la redirect URI de producción a la credencial OAuth.
4. Deploy. Los webhooks corren en runtime **Node.js** (declarado en la ruta), necesario para el HMAC nativo y el procesamiento en `after()`.
5. En Meta, actualiza la URL del webhook al dominio de producción y re-verifica.

El webhook responde **200 de inmediato** y procesa en background con `after()`, así que un fallo posterior no provoca reintentos de Meta; los errores quedan en logs estructurados (JSON) con `wa_message_id`, `organization_id`, latencia y error.

---

## Seguridad

- **RLS** habilitado en las 9 tablas; las políticas filtran por la organización del usuario autenticado (`public.auth_org_id()`).
- **Cifrado en BD** (AES-256-GCM) de todos los access tokens, refresh tokens y app secrets, vía [`lib/crypto.ts`](lib/crypto.ts).
- **Verificación de firma** `X-Hub-Signature-256` (HMAC-SHA256 con `timingSafeEqual`) contra el body crudo, antes de procesar nada.
- **Idempotencia** por `unique (wa_message_id)`: un reenvío de Meta no duplica ni re-responde.
- Ningún secreto hard-codeado; todo en `.env.local` (en `.gitignore`).

---

## Estructura del proyecto

```
app/
  (marketing)/        landing pública
  (auth)/             login, signup, callback, acciones
  onboarding/         creación de organización
  (app)/              panel protegido (layout con sidebar)
    dashboard/  citas/  conversaciones/  personalizacion/  integraciones/
  api/
    webhooks/whatsapp/  webhook (GET verificación, POST eventos)
    auth/google/callback/  callback OAuth de Google
lib/
  crypto.ts           AES-256-GCM
  tz.ts               utilidades de timezone (sin dependencias)
  log.ts              logs estructurados JSON
  supabase/           clientes browser / server / admin
  whatsapp/           config (GRAPH_API_VERSION), firma, envío, procesamiento
  google/             oauth + calendar (FreeBusy, eventos)
  agent/              runner, config del prompt, sandbox, tools/
supabase/
  migrations/         esquema, RLS, onboarding, realtime
  seed.sql            datos de desarrollo
```

---

## Criterios de aceptación cubiertos

- Un mensaje de WhatsApp recibe respuesta del agente (con `thinking` desactivado y `effort: medium` para la latencia).
- El agente recopila los datos requeridos antes de confirmar la cita.
- La cita aparece a la vez en Google Calendar y en `/citas`.
- Desactivar el bot en una conversación detiene las respuestas del agente en ese hilo; los mensajes siguen llegando en tiempo real vía Realtime.
- Cambiar el prompt en `/personalizacion` afecta a la siguiente respuesta (el system prompt se compone en cada llamada, sin caché).
- Aislamiento total entre organizaciones vía RLS.
- El webhook responde 200 incluso si el procesamiento posterior falla; los errores se loguean.
