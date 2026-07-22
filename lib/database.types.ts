// ============================================================================
// database.types.ts
// Tipos de la base de datos para @supabase/supabase-js.
//
// El spec pide generarlos con `supabase gen types typescript`. Este archivo está
// escrito a mano a partir de las migraciones porque el entorno de desarrollo no
// tiene Docker/Postgres para correr una BD local. Cuando tengas la BD levantada,
// REGENÉRALO con:
//   npx supabase gen types typescript --local > lib/database.types.ts
//   # o, contra un proyecto remoto:
//   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          timezone: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string | null;
          full_name: string | null;
          role: "owner" | "staff";
          created_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string | null;
          full_name?: string | null;
          role?: "owner" | "staff";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      whatsapp_configs: {
        Row: {
          organization_id: string;
          phone_number_id: string;
          waba_id: string;
          access_token_encrypted: string;
          verify_token: string;
          app_secret_encrypted: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          phone_number_id: string;
          waba_id: string;
          access_token_encrypted: string;
          verify_token: string;
          app_secret_encrypted: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_configs"]["Insert"]>;
        Relationships: [];
      };
      google_calendar_configs: {
        Row: {
          organization_id: string;
          calendar_id: string;
          refresh_token_encrypted: string;
          access_token_encrypted: string | null;
          token_expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          calendar_id: string;
          refresh_token_encrypted: string;
          access_token_encrypted?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["google_calendar_configs"]["Insert"]>;
        Relationships: [];
      };
      agent_configs: {
        Row: {
          organization_id: string;
          system_prompt: string;
          tone: string;
          business_info: Json;
          services: Json;
          business_hours: Json;
          collect_new_patient: boolean;
          handoff_message: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          system_prompt: string;
          tone?: string;
          business_info?: Json;
          services?: Json;
          business_hours?: Json;
          collect_new_patient?: boolean;
          handoff_message?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agent_configs"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          organization_id: string;
          wa_phone: string;
          full_name: string | null;
          is_new_patient: boolean | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          wa_phone: string;
          full_name?: string | null;
          is_new_patient?: boolean | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          organization_id: string;
          contact_id: string;
          bot_active: boolean;
          last_message_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contact_id: string;
          bot_active?: boolean;
          last_message_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: true;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          organization_id: string;
          wa_message_id: string | null;
          direction: "inbound" | "outbound";
          sender: "contact" | "bot" | "human";
          content: string | null;
          raw: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          organization_id: string;
          wa_message_id?: string | null;
          direction: "inbound" | "outbound";
          sender: "contact" | "bot" | "human";
          content?: string | null;
          raw?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          organization_id: string;
          contact_id: string;
          service: string;
          starts_at: string;
          ends_at: string;
          google_event_id: string | null;
          status: "confirmed" | "cancelled" | "completed";
          is_new_patient: boolean | null;
          full_name: string;
          phone: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contact_id: string;
          service: string;
          starts_at: string;
          ends_at: string;
          google_event_id?: string | null;
          status?: "confirmed" | "cancelled" | "completed";
          is_new_patient?: boolean | null;
          full_name: string;
          phone: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["appointments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      auth_org_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_organization_for_user: {
        Args: {
          org_name: string;
          org_slug: string;
          full_name?: string | null;
          org_timezone?: string;
        };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

// Atajos útiles para el resto del código.
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
