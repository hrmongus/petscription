/* Vygenerované zo supabase/migrations (lokálny Postgres, formát `supabase gen types typescript`).
   Po pripojení Supabase projektu pregenerovať: npx supabase gen types typescript --project-id <id> > lib/database.types.ts */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      addresses: {
        Row: {
          id: string;
          customer_id: string;
          name: string;
          street: string | null;
          city: string | null;
          zip: string | null;
          country: string;
          carrier: string;
          delivery_method: string;
          point_id: string | null;
          point_label: string | null;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          name: string;
          street?: string | null;
          city?: string | null;
          zip?: string | null;
          country?: string;
          carrier: string;
          delivery_method: string;
          point_id?: string | null;
          point_label?: string | null;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          name?: string;
          street?: string | null;
          city?: string | null;
          zip?: string | null;
          country?: string;
          carrier?: string;
          delivery_method?: string;
          point_id?: string | null;
          point_label?: string | null;
          is_default?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "addresses_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      audit_log: {
        Row: {
          id: number;
          actor: string;
          action: string;
          entity: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          at: string;
        };
        Insert: {
          id?: number;
          actor: string;
          action: string;
          entity: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          at?: string;
        };
        Update: {
          id?: number;
          actor?: string;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          at?: string;
        };
        Relationships: [
        ];
      };
      customers: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          name: string | null;
          phone: string | null;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          name?: string | null;
          phone?: string | null;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          email?: string;
          name?: string | null;
          phone?: string | null;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      dogs: {
        Row: {
          id: string;
          customer_id: string;
          name: string;
          answers: Json;
          weight_kg: number | null;
          birth_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          name: string;
          answers: Json;
          weight_kg?: number | null;
          birth_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          name?: string;
          answers?: Json;
          weight_kg?: number | null;
          birth_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "dogs_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      fhb_events: {
        Row: {
          id: string;
          order_id: string | null;
          type: string;
          payload: Json | null;
          received_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          type: string;
          payload?: Json | null;
          received_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string | null;
          type?: string;
          payload?: Json | null;
          received_at?: string;
        };
        Relationships: [
          { foreignKeyName: "fhb_events_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
        ];
      };
      orders: {
        Row: {
          id: string;
          number: number;
          customer_id: string;
          subscription_id: string | null;
          kind: string;
          stripe_ref: string;
          amount_cents: number;
          items: Json;
          ship_to: Json;
          status: string;
          fhb_error: Json | null;
          tracking: Json | null;
          shipped_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          number?: number;
          customer_id: string;
          subscription_id?: string | null;
          kind: string;
          stripe_ref: string;
          amount_cents: number;
          items?: Json;
          ship_to: Json;
          status?: string;
          fhb_error?: Json | null;
          tracking?: Json | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          number?: number;
          customer_id?: string;
          subscription_id?: string | null;
          kind?: string;
          stripe_ref?: string;
          amount_cents?: number;
          items?: Json;
          ship_to?: Json;
          status?: string;
          fhb_error?: Json | null;
          tracking?: Json | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "orders_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_subscription_id_fkey"; columns: ["subscription_id"]; isOneToOne: false; referencedRelation: "subscriptions"; referencedColumns: ["id"] },
        ];
      };
      stripe_events: {
        Row: {
          event_id: string;
          type: string;
          processed_at: string;
        };
        Insert: {
          event_id: string;
          type: string;
          processed_at?: string;
        };
        Update: {
          event_id?: string;
          type?: string;
          processed_at?: string;
        };
        Relationships: [
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          customer_id: string;
          dog_id: string;
          address_id: string;
          stripe_subscription_id: string | null;
          status: string;
          product_id: string;
          bag_id: string;
          grams_per_day: number;
          days_per_bag: number;
          unit_amount_cents: number;
          plan: string;
          next_charge_at: string | null;
          last_delivered_at: string | null;
          engine_snapshot: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          dog_id: string;
          address_id: string;
          stripe_subscription_id?: string | null;
          status?: string;
          product_id: string;
          bag_id: string;
          grams_per_day: number;
          days_per_bag: number;
          unit_amount_cents: number;
          plan?: string;
          next_charge_at?: string | null;
          last_delivered_at?: string | null;
          engine_snapshot?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          dog_id?: string;
          address_id?: string;
          stripe_subscription_id?: string | null;
          status?: string;
          product_id?: string;
          bag_id?: string;
          grams_per_day?: number;
          days_per_bag?: number;
          unit_amount_cents?: number;
          plan?: string;
          next_charge_at?: string | null;
          last_delivered_at?: string | null;
          engine_snapshot?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "subscriptions_address_id_fkey"; columns: ["address_id"]; isOneToOne: false; referencedRelation: "addresses"; referencedColumns: ["id"] },
          { foreignKeyName: "subscriptions_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "subscriptions_dog_id_fkey"; columns: ["dog_id"]; isOneToOne: false; referencedRelation: "dogs"; referencedColumns: ["id"] },
        ];
      };
      withdrawals: {
        Row: {
          id: string;
          order_id: string | null;
          subscription_id: string | null;
          name: string;
          email: string;
          contract_ref: string;
          reason: string | null;
          content: Json;
          submitted_at: string;
          confirmation_sent_at: string | null;
          status: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          subscription_id?: string | null;
          name: string;
          email: string;
          contract_ref: string;
          reason?: string | null;
          content: Json;
          submitted_at?: string;
          confirmation_sent_at?: string | null;
          status?: string;
        };
        Update: {
          id?: string;
          order_id?: string | null;
          subscription_id?: string | null;
          name?: string;
          email?: string;
          contract_ref?: string;
          reason?: string | null;
          content?: Json;
          submitted_at?: string;
          confirmation_sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          { foreignKeyName: "withdrawals_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "withdrawals_subscription_id_fkey"; columns: ["subscription_id"]; isOneToOne: false; referencedRelation: "subscriptions"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
