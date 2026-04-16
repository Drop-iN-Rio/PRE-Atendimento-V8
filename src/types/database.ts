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
          created_at: string;
          updated_at: string;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          instance_name: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          instance_name?: string;
          status?: string;
          updated_at?: string;
          metadata?: Json | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      instance_status: 'creating' | 'active' | 'inactive' | 'error';
    };
  };
}
