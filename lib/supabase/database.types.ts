export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          company_name: string | null;
          department_name: string | null;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          postal_code: string | null;
          address: string | null;
          newsletter_enabled: boolean;
          created_at: string;
          updated_at: string;
          role: 'customer' | 'admin';
        };
        Insert: {
          id: string;
          company_name?: string | null;
          department_name?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          address?: string | null;
          newsletter_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
          role?: 'customer' | 'admin';
        };
        Update: {
          company_name?: string | null;
          department_name?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          address?: string | null;
          newsletter_enabled?: boolean;
          updated_at?: string;
          role?: 'customer' | 'admin';
        };
        Relationships: [];
      };

      estimates: {
        Row: {
          id: string;
          estimate_code: string;
          user_id: string;
          production_method: string | null;
          usage: string | null;
          expression: string | null;
          quantity: number;
          estimated_hours: number | null;
          estimated_amount: number | null;
          complexity_score: number | null;
          image_path: string | null;
          confidence: number | null;
          ai_comment: string | null;
          customer_notes: string | null;
          input_data: Json;
          analysis_data: Json;
          status:
            | 'draft'
            | 'estimated'
            | 'quote_requested'
            | 'converted'
            | 'expired';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          estimate_code: string;
          user_id: string;
          production_method?: string | null;
          usage?: string | null;
          expression?: string | null;
          quantity?: number;
          estimated_hours?: number | null;
          estimated_amount?: number | null;
          complexity_score?: number | null;
          image_path?: string | null;
          confidence?: number | null;
          ai_comment?: string | null;
          customer_notes?: string | null;
          input_data?: Json;
          analysis_data?: Json;
          status?:
            | 'draft'
            | 'estimated'
            | 'quote_requested'
            | 'converted'
            | 'expired';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          production_method?: string | null;
          usage?: string | null;
          expression?: string | null;
          quantity?: number;
          estimated_hours?: number | null;
          estimated_amount?: number | null;
          complexity_score?: number | null;
          image_path?: string | null;
          confidence?: number | null;
          ai_comment?: string | null;
          customer_notes?: string | null;
          input_data?: Json;
          analysis_data?: Json;
          status?:
            | 'draft'
            | 'estimated'
            | 'quote_requested'
            | 'converted'
            | 'expired';
          updated_at?: string;
        };
        Relationships: [];
      };

      projects: {
        Row: {
          id: string;
          project_code: string;
          user_id: string;
          estimate_id: string | null;
          title: string;
          description: string | null;
          status:
            | 'quote_requested'
            | 'quote_reviewing'
            | 'quote_presented'
            | 'ordered'
            | 'in_production'
            | 'customer_review'
            | 'revision'
            | 'delivered'
            | 'completed'
            | 'cancelled';
          quoted_amount: number | null;
          quoted_hours: number | null;
          desired_deadline: string | null;
          confirmed_deadline: string | null;
          quote_presented_at: string | null;
          ordered_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_code: string;
          user_id: string;
          estimate_id?: string | null;
          title: string;
          description?: string | null;
          status?:
            | 'quote_requested'
            | 'quote_reviewing'
            | 'quote_presented'
            | 'ordered'
            | 'in_production'
            | 'customer_review'
            | 'revision'
            | 'delivered'
            | 'completed'
            | 'cancelled';
          quoted_amount?: number | null;
          quoted_hours?: number | null;
          desired_deadline?: string | null;
          confirmed_deadline?: string | null;
          quote_presented_at?: string | null;
          ordered_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          status?:
            | 'quote_requested'
            | 'quote_reviewing'
            | 'quote_presented'
            | 'ordered'
            | 'in_production'
            | 'customer_review'
            | 'revision'
            | 'delivered'
            | 'completed'
            | 'cancelled';
          quoted_amount?: number | null;
          quoted_hours?: number | null;
          desired_deadline?: string | null;
          confirmed_deadline?: string | null;
          quote_presented_at?: string | null;
          ordered_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
