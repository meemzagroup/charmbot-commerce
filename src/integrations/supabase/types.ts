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
          address: string | null
          api_key: string
          city: string | null
          company_code: string | null
          country: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          is_archived: boolean
          language: string
          legal_name: string | null
          limit_overrides: Json
          logo_url: string | null
          name: string
          owner_user_id: string | null
          package_id: string | null
          phone: string | null
          state: string | null
          status: string
          subscription_expiry: string | null
          subscription_start: string | null
          tax_id: string | null
          timezone: string
          trial_ends_at: string | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          api_key?: string
          city?: string | null
          company_code?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_archived?: boolean
          language?: string
          legal_name?: string | null
          limit_overrides?: Json
          logo_url?: string | null
          name: string
          owner_user_id?: string | null
          package_id?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          subscription_expiry?: string | null
          subscription_start?: string | null
          tax_id?: string | null
          timezone?: string
          trial_ends_at?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          api_key?: string
          city?: string | null
          company_code?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_archived?: boolean
          language?: string
          legal_name?: string | null
          limit_overrides?: Json
          logo_url?: string | null
          name?: string
          owner_user_id?: string | null
          package_id?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          subscription_expiry?: string | null
          subscription_start?: string | null
          tax_id?: string | null
          timezone?: string
          trial_ends_at?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      company_secrets: {
        Row: {
          api_key: string
          company_id: string
          created_at: string
        }
        Insert: {
          api_key: string
          company_id: string
          created_at?: string
        }
        Update: {
          api_key?: string
          company_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_secrets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          decimals: number
          exchange_rate: number
          is_active: boolean
          name: string
          symbol: string
        }
        Insert: {
          code: string
          decimals?: number
          exchange_rate?: number
          is_active?: boolean
          name: string
          symbol: string
        }
        Update: {
          code?: string
          decimals?: number
          exchange_rate?: number
          is_active?: boolean
          name?: string
          symbol?: string
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
      invitations: {
        Row: {
          accepted_at: string | null
          activated_at: string | null
          company_id: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          invited_email_masked: string | null
          opened_at: string | null
          personal_message: string | null
          role_title: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          activated_at?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_email_masked?: string | null
          opened_at?: string | null
          personal_message?: string | null
          role_title?: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          activated_at?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_email_masked?: string | null
          opened_at?: string | null
          personal_message?: string | null
          role_title?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
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
      platform_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          company_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          employee_id: string | null
          full_name: string | null
          id: string
          is_super_admin: boolean
          mobile_number: string | null
          must_reset_password: boolean
          status: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          mobile_number?: string | null
          must_reset_password?: boolean
          status?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          mobile_number?: string | null
          must_reset_password?: boolean
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
      recovery_attempts: {
        Row: {
          created_at: string
          id: string
          identifier: string
          ip_address: string | null
          kind: string
          succeeded: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          ip_address?: string | null
          kind: string
          succeeded?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          ip_address?: string | null
          kind?: string
          succeeded?: boolean
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_program_settings: {
        Row: {
          enabled: boolean
          id: boolean
          qualification: string
          requires_approval: boolean
          reward_type: string
          reward_value: number
          terms: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: boolean
          qualification?: string
          requires_approval?: boolean
          reward_type?: string
          reward_value?: number
          terms?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: boolean
          qualification?: string
          requires_approval?: boolean
          reward_type?: string
          reward_value?: number
          terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          invited_company_id: string | null
          invited_user_id: string | null
          invitee_email: string | null
          referrer_company_id: string | null
          referrer_user_id: string | null
          reward_note: string | null
          reward_status: string
          reward_type: string | null
          reward_value: number | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          invited_company_id?: string | null
          invited_user_id?: string | null
          invitee_email?: string | null
          referrer_company_id?: string | null
          referrer_user_id?: string | null
          reward_note?: string | null
          reward_status?: string
          reward_type?: string | null
          reward_value?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          invited_company_id?: string | null
          invited_user_id?: string | null
          invitee_email?: string | null
          referrer_company_id?: string | null
          referrer_user_id?: string | null
          reward_note?: string | null
          reward_status?: string
          reward_type?: string | null
          reward_value?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_invited_company_id_fkey"
            columns: ["invited_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_company_id_fkey"
            columns: ["referrer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          company_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_packages: {
        Row: {
          ai_message_limit: number | null
          annual_price: number
          api_access: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          max_branches: number | null
          max_campaigns_per_month: number | null
          max_customers: number | null
          max_orders: number | null
          max_users: number | null
          max_whatsapp_channels: number | null
          modules: Json
          monthly_price: number
          name: string
          storage_mb: number | null
          support_level: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          ai_message_limit?: number | null
          annual_price?: number
          api_access?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          max_branches?: number | null
          max_campaigns_per_month?: number | null
          max_customers?: number | null
          max_orders?: number | null
          max_users?: number | null
          max_whatsapp_channels?: number | null
          modules?: Json
          monthly_price?: number
          name: string
          storage_mb?: number | null
          support_level?: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          ai_message_limit?: number | null
          annual_price?: number
          api_access?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          max_branches?: number | null
          max_campaigns_per_month?: number | null
          max_customers?: number | null
          max_orders?: number | null
          max_users?: number | null
          max_whatsapp_channels?: number | null
          modules?: Json
          monthly_price?: number
          name?: string
          storage_mb?: number | null
          support_level?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
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
      user_permissions: {
        Row: {
          action: string
          allowed: boolean
          company_id: string | null
          created_at: string
          id: string
          module: string
          user_id: string
        }
        Insert: {
          action: string
          allowed?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          module: string
          user_id: string
        }
        Update: {
          action?: string
          allowed?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          module?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_company_id_fkey"
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
          department: string | null
          id: string
          instance_key: string | null
          is_active: boolean
          label: string
          last_connected_at: string | null
          phone_number: string
          team_member_id: string | null
          team_name: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          department?: string | null
          id?: string
          instance_key?: string | null
          is_active?: boolean
          label: string
          last_connected_at?: string | null
          phone_number: string
          team_member_id?: string | null
          team_name?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          department?: string | null
          id?: string
          instance_key?: string | null
          is_active?: boolean
          label?: string
          last_connected_at?: string | null
          phone_number?: string
          team_member_id?: string | null
          team_name?: string | null
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
      company_limit: {
        Args: { _company_id: string; _key: string }
        Returns: number
      }
      company_module_enabled: {
        Args: { _company_id: string; _module: string }
        Returns: boolean
      }
      company_plan: { Args: { _company_id: string }; Returns: Json }
      company_subscription_active: {
        Args: { _company_id: string }
        Returns: boolean
      }
      default_company_id: { Args: never; Returns: string }
      delete_customer_atomic: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      delete_order_atomic: { Args: { _order_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      log_call_atomic: {
        Args: {
          _agent_id?: string
          _call_type: string
          _caller_name: string
          _caller_number: string
          _duration_seconds: number
          _notes?: string
          _recording_url?: string
        }
        Returns: string
      }
      process_order_return: { Args: { _order_id: string }; Returns: undefined }
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
