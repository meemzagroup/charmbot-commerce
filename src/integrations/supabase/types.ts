export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          agent_id: string | null
          call_type: string
          caller_name: string | null
          caller_number: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          duration_seconds: number
          id: string
          notes: string | null
          recording_url: string | null
          status: string
          thread_id: string | null
          transcript: string | null
        }
        Insert: {
          agent_id?: string | null
          call_type?: string
          caller_name?: string | null
          caller_number?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          notes?: string | null
          recording_url?: string | null
          status?: string
          thread_id?: string | null
          transcript?: string | null
        }
        Update: {
          agent_id?: string | null
          call_type?: string
          caller_name?: string | null
          caller_number?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          notes?: string | null
          recording_url?: string | null
          status?: string
          thread_id?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_conversations: {
        Row: {
          company_id: string | null
          created_at: string
          full_transcript: Json
          id: string
          inquiry_topic: string | null
          is_resolved_by_bot: boolean
          session_id: string
          updated_at: string
          visitor_email: string | null
          visitor_phone: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          full_transcript?: Json
          id?: string
          inquiry_topic?: string | null
          is_resolved_by_bot?: boolean
          session_id: string
          updated_at?: string
          visitor_email?: string | null
          visitor_phone?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          full_transcript?: Json
          id?: string
          inquiry_topic?: string | null
          is_resolved_by_bot?: boolean
          session_id?: string
          updated_at?: string
          visitor_email?: string | null
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          assigned_to: string | null
          channel_number: string | null
          channel_type: string
          company_id: string | null
          contact_handle: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string
          external_id: string | null
          id: string
          last_message_at: string
          status: string
          subject: string | null
          unread_count: number
        }
        Insert: {
          assigned_to?: string | null
          channel_number?: string | null
          channel_type?: string
          company_id?: string | null
          contact_handle?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_message_at?: string
          status?: string
          subject?: string | null
          unread_count?: number
        }
        Update: {
          assigned_to?: string | null
          channel_number?: string | null
          channel_type?: string
          company_id?: string | null
          contact_handle?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_message_at?: string
          status?: string
          subject?: string | null
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "communication_threads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          api_key: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          api_key?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          created_at: string
          customer_tag: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          shipping_address: string | null
          total_orders: number
          total_spend: number
          whatsapp_opt_out_date: string | null
          whatsapp_opted_out: boolean
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          customer_tag?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          total_orders?: number
          total_spend?: number
          whatsapp_opt_out_date?: string | null
          whatsapp_opted_out?: boolean
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          customer_tag?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          total_orders?: number
          total_spend?: number
          whatsapp_opt_out_date?: string | null
          whatsapp_opted_out?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_inquiries: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          id: string
          inquiry_type: string
          message: string | null
          name: string | null
          phone: string | null
          source: string
          status: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          inquiry_type?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          source?: string
          status?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          inquiry_type?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_inquiries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_inquiries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_inquiries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          company_id: string | null
          content: string
          created_at: string
          delivery_status: string
          id: string
          metadata: Json
          sender_name: string | null
          sender_type: string
          subject: string | null
          thread_id: string
        }
        Insert: {
          company_id?: string | null
          content?: string
          created_at?: string
          delivery_status?: string
          id?: string
          metadata?: Json
          sender_name?: string | null
          sender_type?: string
          subject?: string | null
          thread_id: string
        }
        Update: {
          company_id?: string | null
          content?: string
          created_at?: string
          delivery_status?: string
          id?: string
          metadata?: Json
          sender_name?: string | null
          sender_type?: string
          subject?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          courier_name: string | null
          created_at: string
          customer_id: string | null
          id: string
          notes: string | null
          order_number: string
          order_status: string
          payment_status: string
          total_amount: number
          tracking_number: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          courier_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          order_number: string
          order_status?: string
          payment_status?: string
          total_amount?: number
          tracking_number?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          courier_name?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          order_status?: string
          payment_status?: string
          total_amount?: number
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number
          price: number
          sku: string | null
          stock_quantity: number
          title: string
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          price?: number
          sku?: string | null
          stock_quantity?: number
          title: string
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          price?: number
          sku?: string | null
          stock_quantity?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_super_admin: boolean
          status: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          status?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role_title: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role_title?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role_title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_campaign_logs: {
        Row: {
          campaign_id: string
          company_id: string | null
          created_at: string
          customer_id: string | null
          error_reason: string | null
          external_id: string | null
          id: string
          phone_number: string
          rendered_message: string
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_reason?: string | null
          external_id?: string | null
          id?: string
          phone_number: string
          rendered_message: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_reason?: string | null
          external_id?: string | null
          id?: string
          phone_number?: string
          rendered_message?: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaigns: {
        Row: {
          company_id: string | null
          created_at: string
          failed_count: number
          id: string
          instance_name: string | null
          scheduled_at: string | null
          sent_count: number
          status: string
          template_id: string | null
          title: string
          total_contacts: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          instance_name?: string | null
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          template_id?: string | null
          title: string
          total_contacts?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          instance_name?: string | null
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          template_id?: string | null
          title?: string
          total_contacts?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_channels: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          phone_number: string
          team_member_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          phone_number: string
          team_member_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          phone_number?: string
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_channels_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string
          company_id: string | null
          content: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          content: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category?: string
          company_id?: string | null
          content?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_products: {
        Row: {
          category: string | null
          id: string | null
          image_url: string | null
          price: number | null
          title: string | null
        }
        Insert: {
          category?: string | null
          id?: string | null
          image_url?: string | null
          price?: number | null
          title?: string | null
        }
        Update: {
          category?: string | null
          id?: string | null
          image_url?: string | null
          price?: number | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "store_manager" | "support_agent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "store_manager", "support_agent"],
    },
  },
} as const
