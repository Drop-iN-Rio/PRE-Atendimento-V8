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
      instances: {
        Row: {
          id: string;
          instance_name: string;
          status: string;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          instance_name: string;
          status?: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          instance_name?: string;
          status?: string;
          metadata?: Json | null;
          updated_at?: string;
        };
      };
      instance_logs: {
        Row: {
          id: string;
          instance_id: string;
          event: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          instance_id: string;
          event: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event?: string;
          payload?: Json | null;
        };
      };
      evolution_configs: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          api_key: string;
          instance_name: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          api_key: string;
          instance_name: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          api_key?: string;
          instance_name?: string;
          updated_at?: string;
        };
      };
      leads: {
        Row: {
          id: string;
          name: string;
          email: string;
          whatsapp: string;
          accepted_contract: boolean;
          created_at: string;
          ip_address: string | null;
          user_agent: string | null;
          fingerprint: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          whatsapp: string;
          accepted_contract: boolean;
          created_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          fingerprint?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          whatsapp?: string;
          accepted_contract?: boolean;
          ip_address?: string | null;
          user_agent?: string | null;
          fingerprint?: string | null;
        };
      };
      leads2: {
        Row: {
          id: number;
          created_at: string;
          numero: number | null;
        };
        Insert: {
          id?: number;
          created_at?: string;
          numero?: number | null;
        };
        Update: {
          id?: number;
          numero?: number | null;
        };
      };
      users: {
        Row: {
          id: string;
          name: string;
          email: string;
          password_hash: string;
          role: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          password_hash: string;
          role?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          password_hash?: string;
          role?: string;
          active?: boolean;
          updated_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          logged_at: string;
          admin_id: string;
          admin_email: string;
          action: string;
          target_id: string;
          target_email: string | null;
          detail: string;
        };
        Insert: {
          id?: string;
          logged_at?: string;
          admin_id: string;
          admin_email: string;
          action: string;
          target_id: string;
          target_email?: string | null;
          detail: string;
        };
        Update: {
          id?: string;
          action?: string;
          target_id?: string;
          target_email?: string | null;
          detail?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
