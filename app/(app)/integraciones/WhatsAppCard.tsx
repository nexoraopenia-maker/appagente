"use client";

import { useActionState, useState } from "react";
import { Copy, CheckCircle } from "@phosphor-icons/react";
import {
  saveWhatsAppConfig,
  testWhatsAppConnection,
  type ActionResult,
} from "./actions";

const empty: ActionResult = {};

interface Props {
  webhookUrl: string;
  orgSlug: string;
  existing: {
    phone_number_id: string;
    waba_id: string;
    verify_token: string;
    hasSecrets: boolean;
  } | null;
}

export function WhatsAppCard({ webhookUrl, orgSlug, existing }: Props) {
  const [saveState, saveAction, saving] = useActionState(saveWhatsAppConfig, empty);
  const [testState, testAction, testing] = useActionState(testWhatsAppConnection, empty);
  const [verifyToken, setVerifyToken] = useState(existing?.verify_token ?? "");
  const [copied, setCopied] = useState<string | null>(null);

  // El token completo que el usuario pega en Meta codifica el slug de la org,
  // para que el webhook GET pueda identificarla.
  const fullVerifyToken = verifyToken ? `${orgSlug}:${verifyToken}` : "";

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-semibold text-lg">WhatsApp Cloud API</h2>
      <p className="text-sm text-muted mt-1">
        Credenciales del System User de Meta. Los tokens se guardan cifrados.
      </p>

      {/* Datos a copiar hacia Meta */}
      <div className="mt-4 space-y-3">
        <ReadonlyRow
          label="URL del webhook"
          value={webhookUrl}
          copied={copied === "url"}
          onCopy={() => copy(webhookUrl, "url")}
        />
        <ReadonlyRow
          label="Verify token (pégalo en Meta)"
          value={fullVerifyToken || "— escribe un verify token abajo —"}
          copied={copied === "vt"}
          onCopy={() => fullVerifyToken && copy(fullVerifyToken, "vt")}
        />
      </div>

      {/* Formulario de credenciales */}
      <form action={saveAction} className="mt-6 grid sm:grid-cols-2 gap-4">
        <Field name="phone_number_id" label="Phone Number ID" defaultValue={existing?.phone_number_id} required />
        <Field name="waba_id" label="WhatsApp Business Account ID" defaultValue={existing?.waba_id} required />
        <Field
          name="verify_token"
          label="Verify token (secreto que tú eliges)"
          defaultValue={existing?.verify_token}
          onChange={setVerifyToken}
          required
        />
        <Field
          name="access_token"
          label="Access Token (System User)"
          type="password"
          placeholder={existing?.hasSecrets ? "•••• guardado — reescríbelo para cambiarlo" : ""}
          required
        />
        <Field
          name="app_secret"
          label="App Secret"
          type="password"
          placeholder={existing?.hasSecrets ? "•••• guardado — reescríbelo para cambiarlo" : ""}
          required
        />

        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar credenciales"}
          </button>
          <button
            type="submit"
            formAction={testAction}
            disabled={testing}
            className="rounded-lg border border-border px-4 py-2 disabled:opacity-60"
          >
            {testing ? "Probando…" : "Probar conexión"}
          </button>
        </div>
      </form>

      <Feedback state={saveState} />
      <Feedback state={testState} />
    </section>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  required,
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="block mb-1">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
      />
    </label>
  );
}

function ReadonlyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <span className="block text-xs text-muted mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="p-2 rounded-lg border border-border hover:bg-background"
          aria-label="Copiar"
        >
          {copied ? (
            <CheckCircle size={18} className="text-primary" weight="fill" />
          ) : (
            <Copy size={18} />
          )}
        </button>
      </div>
    </div>
  );
}

function Feedback({ state }: { state: ActionResult }) {
  if (state.error)
    return <p className="mt-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state.message)
    return <p className="mt-3 text-sm text-primary">{state.message}</p>;
  return null;
}
