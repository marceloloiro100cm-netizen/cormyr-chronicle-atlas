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
      campaign_houses: {
        Row: {
          active: boolean
          castle: string | null
          crest: string | null
          details: string
          folder_id: string | null
          id: string
          name: string
          season: number
          source: string
        }
        Insert: {
          active?: boolean
          castle?: string | null
          crest?: string | null
          details?: string
          folder_id?: string | null
          id: string
          name: string
          season?: number
          source?: string
        }
        Update: {
          active?: boolean
          castle?: string | null
          crest?: string | null
          details?: string
          folder_id?: string | null
          id?: string
          name?: string
          season?: number
          source?: string
        }
        Relationships: []
      }
      campaign_letters: {
        Row: {
          content: string
          created_at: string
          id: string
          last_synced_at: string | null
          recipient_house_id: string | null
          recipient_player_id: string | null
          sender_name: string
          sender_player_id: string | null
          sender_user_id: string
          subject: string
          sync_state: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          recipient_house_id?: string | null
          recipient_player_id?: string | null
          sender_name: string
          sender_player_id?: string | null
          sender_user_id?: string
          subject: string
          sync_state?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          recipient_house_id?: string | null
          recipient_player_id?: string | null
          sender_name?: string
          sender_player_id?: string | null
          sender_user_id?: string
          subject?: string
          sync_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_letters_recipient_house_id_fkey"
            columns: ["recipient_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_letters_recipient_player_id_fkey"
            columns: ["recipient_player_id"]
            isOneToOne: false
            referencedRelation: "campaign_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_letters_sender_player_id_fkey"
            columns: ["sender_player_id"]
            isOneToOne: false
            referencedRelation: "campaign_players"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_players: {
        Row: {
          created_at: string
          details: string
          folder_id: string | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string
          folder_id?: string | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string
          folder_id?: string | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      campaign_records: {
        Row: {
          content: string
          created_at: string
          created_by: string
          house_id: string | null
          id: string
          kind: string
          last_synced_at: string | null
          player_id: string | null
          sync_state: string
          title: string
          updated_at: string
          updated_by: string
          version: number
          visibility: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string
          house_id?: string | null
          id?: string
          kind: string
          last_synced_at?: string | null
          player_id?: string | null
          sync_state?: string
          title: string
          updated_at?: string
          updated_by?: string
          version?: number
          visibility: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          house_id?: string | null
          id?: string
          kind?: string
          last_synced_at?: string | null
          player_id?: string | null
          sync_state?: string
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_records_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "campaign_players"
            referencedColumns: ["id"]
          },
        ]
      }
      house_memberships: {
        Row: {
          authorized_at: string
          authorized_by: string
          can_edit: boolean
          house_id: string
          player_id: string
        }
        Insert: {
          authorized_at?: string
          authorized_by?: string
          can_edit?: boolean
          house_id: string
          player_id: string
        }
        Update: {
          authorized_at?: string
          authorized_by?: string
          can_edit?: boolean
          house_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_memberships_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "campaign_players"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_receipts: {
        Row: {
          letter_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          letter_id: string
          read_at?: string
          user_id?: string
        }
        Update: {
          letter_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_receipts_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "campaign_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_replies: {
        Row: {
          author_name: string
          author_player_id: string | null
          author_user_id: string
          content: string
          created_at: string
          house_id: string | null
          id: string
          idempotency_key: string
          last_synced_at: string | null
          letter_id: string
          recipient_user_id: string
          sync_state: string
        }
        Insert: {
          author_name: string
          author_player_id?: string | null
          author_user_id?: string
          content: string
          created_at?: string
          house_id?: string | null
          id?: string
          idempotency_key: string
          last_synced_at?: string | null
          letter_id: string
          recipient_user_id: string
          sync_state?: string
        }
        Update: {
          author_name?: string
          author_player_id?: string | null
          author_user_id?: string
          content?: string
          created_at?: string
          house_id?: string | null
          id?: string
          idempotency_key?: string
          last_synced_at?: string | null
          letter_id?: string
          recipient_user_id?: string
          sync_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_replies_author_player_id_fkey"
            columns: ["author_player_id"]
            isOneToOne: false
            referencedRelation: "campaign_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_replies_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_replies_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "campaign_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      record_versions: {
        Row: {
          author: string | null
          created_at: string
          id: string
          record_id: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          author?: string | null
          created_at?: string
          id?: string
          record_id?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          author?: string | null
          created_at?: string
          id?: string
          record_id?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "record_versions_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "campaign_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          created_at: string
          folder_snapshot: Json
          id: string
          record_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          site_snapshot: Json
        }
        Insert: {
          created_at?: string
          folder_snapshot: Json
          id?: string
          record_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          site_snapshot: Json
        }
        Update: {
          created_at?: string
          folder_snapshot?: Json
          id?: string
          record_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          site_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "campaign_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_outbox: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          entity_type: string
          error: string | null
          id: string
          last_attempt_at: string | null
          payload: Json
          state: string
          version: number
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          entity_type: string
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          payload: Json
          state?: string
          version?: number
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          error?: string | null
          id?: string
          last_attempt_at?: string | null
          payload?: Json
          state?: string
          version?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          role: string
          user_id: string
        }
        Insert: {
          role: string
          user_id: string
        }
        Update: {
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_record: {
        Args: { r: Database["public"]["Tables"]["campaign_records"]["Row"] }
        Returns: boolean
      }
      can_read_letter: {
        Args: { l: Database["public"]["Tables"]["campaign_letters"]["Row"] }
        Returns: boolean
      }
      can_read_record: {
        Args: { r: Database["public"]["Tables"]["campaign_records"]["Row"] }
        Returns: boolean
      }
      in_campaign_house: {
        Args: { edit_required?: boolean; h: string }
        Returns: boolean
      }
      is_campaign_admin: { Args: never; Returns: boolean }
      letter_recipient: {
        Args: { l: Database["public"]["Tables"]["campaign_letters"]["Row"] }
        Returns: boolean
      }
      my_player_id: { Args: never; Returns: string }
      reply_campaign_letter: {
        Args: { p_content: string; p_key: string; p_letter: string }
        Returns: string
      }
      save_campaign_record: {
        Args: {
          p_content: string
          p_id: string
          p_title: string
          p_version: number
        }
        Returns: Json
      }
      send_campaign_letter: {
        Args: {
          p_content: string
          p_house: string
          p_key: string
          p_player: string
          p_subject: string
        }
        Returns: string
      }
      send_campaign_message: {
        Args: {
          p_content: string
          p_key: string
          p_recipient: string
          p_subject: string
        }
        Returns: string
      }
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
