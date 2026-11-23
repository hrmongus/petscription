// Vygenerované zo Supabase projektu granula (Supabase MCP generate_typescript_types). Needitovať ručne;
// po každej migrácii pregenerovať.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          carrier: string
          city: string | null
          country: string
          created_at: string
          customer_id: string
          delivery_method: string
          id: string
          is_default: boolean
          name: string
          point_id: string | null
          point_label: string | null
          street: string | null
          zip: string | null
        }
        Insert: {
          carrier: string
          city?: string | null
          country?: string
          created_at?: string
          customer_id: string
          delivery_method: string
          id?: string
          is_default?: boolean
          name: string
          point_id?: string | null
          point_label?: string | null
          street?: string | null
          zip?: string | null
        }
        Update: {
          carrier?: string
          city?: string | null
          country?: string
          created_at?: string
          customer_id?: string
          delivery_method?: string
          id?: string
          is_default?: boolean
          name?: string
          point_id?: string | null
          point_label?: string | null
          street?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
        }
        Relationships: []
      }
      customers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dogs: {
        Row: {
          answers: Json
          birth_date: string | null
          created_at: string
          customer_id: string
          id: string
          name: string
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          answers: Json
          birth_date?: string | null
          created_at?: string
          customer_id: string
          id?: string
          name: string
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          answers?: Json
          birth_date?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          name?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dogs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          key: string
          kind: string
          order_id: string | null
          provider_id: string | null
          sent_at: string
          status: string
          to_email: string
        }
        Insert: {
          key: string
          kind: string
          order_id?: string | null
          provider_id?: string | null
          sent_at?: string
          status: string
          to_email: string
        }
        Update: {
          key?: string
          kind?: string
          order_id?: string | null
          provider_id?: string | null
          sent_at?: string
          status?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fhb_events: {
        Row: {
          id: string
          order_id: string | null
          payload: Json | null
          received_at: string
          type: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          payload?: Json | null
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          order_id?: string | null
          payload?: Json | null
          received_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fhb_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_cents: number
          created_at: string
          customer_id: string
          delivered_at: string | null
          fhb_error: Json | null
          id: string
          items: Json
          kind: string
          number: number
          ship_to: Json
          shipped_at: string | null
          status: string
          stripe_ref: string
          subscription_id: string | null
          tracking: Json | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          fhb_error?: Json | null
          id?: string
          items?: Json
          kind: string
          number?: number
          ship_to: Json
          shipped_at?: string | null
          status?: string
          stripe_ref: string
          subscription_id?: string | null
          tracking?: Json | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          fhb_error?: Json | null
          id?: string
          items?: Json
          kind?: string
          number?: number
          ship_to?: Json
          shipped_at?: string | null
          status?: string
          stripe_ref?: string
          subscription_id?: string | null
          tracking?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          event_id: string
          processed_at: string
          type: string
        }
        Insert: {
          event_id: string
          processed_at?: string
          type: string
        }
        Update: {
          event_id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          address_id: string
          bag_id: string
          created_at: string
          customer_id: string
          days_per_bag: number
          dog_id: string
          engine_snapshot: Json | null
          grams_per_day: number
          id: string
          last_delivered_at: string | null
          next_charge_at: string | null
          plan: string
          product_id: string
          status: string
          stripe_subscription_id: string | null
          unit_amount_cents: number
          updated_at: string
        }
        Insert: {
          address_id: string
          bag_id: string
          created_at?: string
          customer_id: string
          days_per_bag: number
          dog_id: string
          engine_snapshot?: Json | null
          grams_per_day: number
          id?: string
          last_delivered_at?: string | null
          next_charge_at?: string | null
          plan?: string
          product_id: string
          status?: string
          stripe_subscription_id?: string | null
          unit_amount_cents: number
          updated_at?: string
        }
        Update: {
          address_id?: string
          bag_id?: string
          created_at?: string
          customer_id?: string
          days_per_bag?: number
          dog_id?: string
          engine_snapshot?: Json | null
          grams_per_day?: number
          id?: string
          last_delivered_at?: string | null
          next_charge_at?: string | null
          plan?: string
          product_id?: string
          status?: string
          stripe_subscription_id?: string | null
          unit_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          refund_due_at: string | null
          return_status: string
          return_received_at: string | null
          return_condition: string | null
          return_note: string | null
          refunded_at: string | null
          refund_amount_cents: number | null
          stripe_refund_id: string | null
          actions: Json
          customer_id: string | null
          deadline_at: string | null
          in_deadline: boolean | null
          needs_review: boolean
          review_note: string | null
          confirmation_sent_at: string | null
          content: Json
          contract_ref: string
          email: string
          id: string
          name: string
          order_id: string | null
          reason: string | null
          status: string
          submitted_at: string
          subscription_id: string | null
        }
        Insert: {
          refund_due_at?: string | null
          return_status?: string
          return_received_at?: string | null
          return_condition?: string | null
          return_note?: string | null
          refunded_at?: string | null
          refund_amount_cents?: number | null
          stripe_refund_id?: string | null
          actions?: Json
          customer_id?: string | null
          deadline_at?: string | null
          in_deadline?: boolean | null
          needs_review?: boolean
          review_note?: string | null
          confirmation_sent_at?: string | null
          content: Json
          contract_ref: string
          email: string
          id?: string
          name: string
          order_id?: string | null
          reason?: string | null
          status?: string
          submitted_at?: string
          subscription_id?: string | null
        }
        Update: {
          refund_due_at?: string | null
          return_status?: string
          return_received_at?: string | null
          return_condition?: string | null
          return_note?: string | null
          refunded_at?: string | null
          refund_amount_cents?: number | null
          stripe_refund_id?: string | null
          actions?: Json
          customer_id?: string | null
          deadline_at?: string | null
          in_deadline?: boolean | null
          needs_review?: boolean
          review_note?: string | null
          confirmation_sent_at?: string | null
          content?: Json
          contract_ref?: string
          email?: string
          id?: string
          name?: string
          order_id?: string | null
          reason?: string | null
          status?: string
          submitted_at?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
