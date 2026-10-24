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
      archive_source_review: {
        Row: {
          created_at: string
          house_id: string
          id: string
          local_text: string | null
          modified_at: string
          reason: string
          remote_text: string | null
          source_file_id: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          local_text?: string | null
          modified_at: string
          reason: string
          remote_text?: string | null
          source_file_id: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          local_text?: string | null
          modified_at?: string
          reason?: string
          remote_text?: string | null
          source_file_id?: string
        }
        Relationships: []
      }
      campaign_admin_audit: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          id: string
          target_player: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          details?: Json
          id?: string
          target_player?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          id?: string
          target_player?: string | null
        }
        Relationships: []
      }
      campaign_houses: {
        Row: {
          active: boolean
          archive_house_id: string | null
          castle: string | null
          crest: string | null
          details: string
          folder_id: string | null
          id: string
          lord_name: string | null
          name: string
          region: string | null
          review_note: string | null
          season: number
          source: string
        }
        Insert: {
          active?: boolean
          archive_house_id?: string | null
          castle?: string | null
          crest?: string | null
          details?: string
          folder_id?: string | null
          id: string
          lord_name?: string | null
          name: string
          region?: string | null
          review_note?: string | null
          season?: number
          source?: string
        }
        Update: {
          active?: boolean
          archive_house_id?: string | null
          castle?: string | null
          crest?: string | null
          details?: string
          folder_id?: string | null
          id?: string
          lord_name?: string | null
          name?: string
          region?: string | null
          review_note?: string | null
          season?: number
          source?: string
        }
        Relationships: []
      }
      campaign_letters: {
        Row: {
          administrative_actor: string | null
          batch_key: string | null
          campaign_date: string | null
          content: string
          conversation_id: string | null
          created_at: string
          creation_week: number | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_week: number | null
          id: string
          last_synced_at: string | null
          letter_kind: string
          letter_number: number | null
          publication_state: string
          recipient_house_id: string | null
          recipient_player_id: string | null
          reply_to_id: string | null
          sender_name: string
          sender_player_id: string | null
          sender_user_id: string
          subject: string
          sync_state: string
          updated_at: string
          version: number
        }
        Insert: {
          administrative_actor?: string | null
          batch_key?: string | null
          campaign_date?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          creation_week?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_week?: number | null
          id?: string
          last_synced_at?: string | null
          letter_kind?: string
          letter_number?: number | null
          publication_state?: string
          recipient_house_id?: string | null
          recipient_player_id?: string | null
          reply_to_id?: string | null
          sender_name: string
          sender_player_id?: string | null
          sender_user_id?: string
          subject: string
          sync_state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          administrative_actor?: string | null
          batch_key?: string | null
          campaign_date?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          creation_week?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_week?: number | null
          id?: string
          last_synced_at?: string | null
          letter_kind?: string
          letter_number?: number | null
          publication_state?: string
          recipient_house_id?: string | null
          recipient_player_id?: string | null
          reply_to_id?: string | null
          sender_name?: string
          sender_player_id?: string | null
          sender_user_id?: string
          subject?: string
          sync_state?: string
          updated_at?: string
          version?: number
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
      campaign_migration_backups: {
        Row: {
          created_at: string
          id: string
          reason: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          snapshot?: Json
        }
        Relationships: []
      }
      campaign_players: {
        Row: {
          active: boolean
          created_at: string
          details: string
          folder_id: string | null
          id: string
          lord_name: string | null
          name: string
          require_password_change: boolean
          roster_house_id: string | null
          roster_source: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          details?: string
          folder_id?: string | null
          id?: string
          lord_name?: string | null
          name: string
          require_password_change?: boolean
          roster_house_id?: string | null
          roster_source?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          details?: string
          folder_id?: string | null
          id?: string
          lord_name?: string | null
          name?: string
          require_password_change?: boolean
          roster_house_id?: string | null
          roster_source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_players_roster_house_id_fkey"
            columns: ["roster_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
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
          source_file_id: string | null
          source_modified_at: string | null
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
          source_file_id?: string | null
          source_modified_at?: string | null
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
          source_file_id?: string | null
          source_modified_at?: string | null
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
      campaign_representation_sessions: {
        Row: {
          actor: string
          expires_at: string
          player_id: string
          started_at: string
        }
        Insert: {
          actor: string
          expires_at: string
          player_id: string
          started_at?: string
        }
        Update: {
          actor?: string
          expires_at?: string
          player_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_representation_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "campaign_players"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_sync_bindings: {
        Row: {
          confirmed_by: string
          enabled: boolean
          folder_id: string
          house_id: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          owner_user_id: string
          player_id: string | null
          privacy_reviewed: boolean
          runtime_authorized: boolean
          scope: string
          technical_folder_id: string | null
        }
        Insert: {
          confirmed_by: string
          enabled?: boolean
          folder_id: string
          house_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          owner_user_id: string
          player_id?: string | null
          privacy_reviewed?: boolean
          runtime_authorized?: boolean
          scope: string
          technical_folder_id?: string | null
        }
        Update: {
          confirmed_by?: string
          enabled?: boolean
          folder_id?: string
          house_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          owner_user_id?: string
          player_id?: string | null
          privacy_reviewed?: boolean
          runtime_authorized?: boolean
          scope?: string
          technical_folder_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drive_sync_bindings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_sync_bindings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "campaign_players"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_sync_files: {
        Row: {
          base_snapshot: Json
          binding_id: string
          entity_id: string
          entity_type: string
          etag: string | null
          file_id: string
          id: string
          last_synced_at: string
          remote_hash: string
        }
        Insert: {
          base_snapshot: Json
          binding_id: string
          entity_id: string
          entity_type: string
          etag?: string | null
          file_id: string
          id?: string
          last_synced_at?: string
          remote_hash: string
        }
        Update: {
          base_snapshot?: Json
          binding_id?: string
          entity_id?: string
          entity_type?: string
          etag?: string | null
          file_id?: string
          id?: string
          last_synced_at?: string
          remote_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_sync_files_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "drive_sync_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_sync_inbox: {
        Row: {
          binding_id: string
          created_at: string
          etag: string | null
          file_id: string
          folder_snapshot: Json
          id: string
          remote_hash: string
          resolved_at: string | null
          resolved_by: string | null
          site_snapshot: Json | null
          state: string
        }
        Insert: {
          binding_id: string
          created_at?: string
          etag?: string | null
          file_id: string
          folder_snapshot: Json
          id?: string
          remote_hash: string
          resolved_at?: string | null
          resolved_by?: string | null
          site_snapshot?: Json | null
          state?: string
        }
        Update: {
          binding_id?: string
          created_at?: string
          etag?: string | null
          file_id?: string
          folder_snapshot?: Json
          id?: string
          remote_hash?: string
          resolved_at?: string | null
          resolved_by?: string | null
          site_snapshot?: Json | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_sync_inbox_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "drive_sync_bindings"
            referencedColumns: ["id"]
          },
        ]
      }
      house_catalog: {
        Row: {
          archive_data: Json
          classification: string
          gallery: Json
          id: string
          name: string
          narrative_text: string | null
          public_reviewed: boolean
          region: string
          source_folder_id: string | null
          source_modified_at: string | null
          updated_at: string
        }
        Insert: {
          archive_data: Json
          classification?: string
          gallery?: Json
          id: string
          name: string
          narrative_text?: string | null
          public_reviewed?: boolean
          region: string
          source_folder_id?: string | null
          source_modified_at?: string | null
          updated_at?: string
        }
        Update: {
          archive_data?: Json
          classification?: string
          gallery?: Json
          id?: string
          name?: string
          narrative_text?: string | null
          public_reviewed?: boolean
          region?: string
          source_folder_id?: string | null
          source_modified_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
          administrative_actor: string | null
          author_name: string
          author_player_id: string | null
          author_user_id: string
          campaign_date: string | null
          content: string
          conversation_id: string | null
          created_at: string
          creation_week: number | null
          delivered_at: string | null
          delivery_week: number | null
          house_id: string | null
          id: string
          idempotency_key: string
          last_synced_at: string | null
          letter_id: string
          publication_state: string
          recipient_user_id: string
          reply_to_id: string | null
          sync_state: string
        }
        Insert: {
          administrative_actor?: string | null
          author_name: string
          author_player_id?: string | null
          author_user_id?: string
          campaign_date?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          creation_week?: number | null
          delivered_at?: string | null
          delivery_week?: number | null
          house_id?: string | null
          id?: string
          idempotency_key: string
          last_synced_at?: string | null
          letter_id: string
          publication_state?: string
          recipient_user_id: string
          reply_to_id?: string | null
          sync_state?: string
        }
        Update: {
          administrative_actor?: string | null
          author_name?: string
          author_player_id?: string | null
          author_user_id?: string
          campaign_date?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          creation_week?: number | null
          delivered_at?: string | null
          delivery_week?: number | null
          house_id?: string | null
          id?: string
          idempotency_key?: string
          last_synced_at?: string | null
          letter_id?: string
          publication_state?: string
          recipient_user_id?: string
          reply_to_id?: string | null
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
      letter_rounds: {
        Row: {
          closed: boolean
          closed_at: string | null
          closed_by: string | null
          number: number
          opened_at: string | null
          opened_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          closed?: boolean
          closed_at?: string | null
          closed_by?: string | null
          number: number
          opened_at?: string | null
          opened_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          closed?: boolean
          closed_at?: string | null
          closed_by?: string | null
          number?: number
          opened_at?: string | null
          opened_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      letter_versions: {
        Row: {
          author: string
          created_at: string
          id: string
          letter_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          author: string
          created_at?: string
          id?: string
          letter_id: string
          snapshot: Json
          version: number
        }
        Update: {
          author?: string
          created_at?: string
          id?: string
          letter_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_versions_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "campaign_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      noble_house_drive_exports: {
        Row: {
          binding_id: string
          content_hash: string | null
          error: string | null
          exported_version: number
          file_id: string | null
          house_id: string
          last_synced_at: string | null
          provider_etag: string | null
          status: string
        }
        Insert: {
          binding_id: string
          content_hash?: string | null
          error?: string | null
          exported_version?: number
          file_id?: string | null
          house_id: string
          last_synced_at?: string | null
          provider_etag?: string | null
          status?: string
        }
        Update: {
          binding_id?: string
          content_hash?: string | null
          error?: string | null
          exported_version?: number
          file_id?: string | null
          house_id?: string
          last_synced_at?: string | null
          provider_etag?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "noble_house_drive_exports_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: true
            referencedRelation: "drive_sync_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noble_house_drive_exports_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      noble_house_gm_notes: {
        Row: {
          house_id: string
          notes: string
          secret_state: Json
          updated_at: string
        }
        Insert: {
          house_id: string
          notes?: string
          secret_state?: Json
          updated_at?: string
        }
        Update: {
          house_id?: string
          notes?: string
          secret_state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "noble_house_gm_notes_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      noble_house_ledger: {
        Row: {
          action: string
          actor: string
          after_state: Json
          before_state: Json
          campaign_month: number
          created_at: string
          explanation: string
          house_id: string
          id: string
          operation_key: string
          rule: string
          version: number
        }
        Insert: {
          action: string
          actor: string
          after_state: Json
          before_state: Json
          campaign_month: number
          created_at?: string
          explanation?: string
          house_id: string
          id?: string
          operation_key: string
          rule?: string
          version: number
        }
        Update: {
          action?: string
          actor?: string
          after_state?: Json
          before_state?: Json
          campaign_month?: number
          created_at?: string
          explanation?: string
          house_id?: string
          id?: string
          operation_key?: string
          rule?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "noble_house_ledger_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      noble_house_rule_overrides: {
        Row: {
          definition: Json
          id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          definition: Json
          id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          definition?: Json
          id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: []
      }
      noble_house_sheets: {
        Row: {
          house_id: string
          state: Json
          sync_state: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          house_id: string
          state?: Json
          sync_state?: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          house_id?: string
          state?: Json
          sync_state?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "noble_house_sheets_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "campaign_houses"
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
      public_archive_roots: {
        Row: {
          approved_at: string
          approved_by: string
          enabled: boolean
          id: string
          last_checked_at: string | null
          last_error: string | null
          name: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          enabled?: boolean
          id: string
          last_checked_at?: string | null
          last_error?: string | null
          name: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          name?: string
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
          next_attempt_at: string
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
          next_attempt_at?: string
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
          next_attempt_at?: string
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
      admin_save_player_account: {
        Args: {
          p_active: boolean
          p_actor: string
          p_change: boolean
          p_edit: boolean
          p_folder: string
          p_house: string
          p_name: string
          p_password_set: boolean
          p_player: string
          p_user: string
        }
        Returns: string
      }
      apply_drive_record: {
        Args: {
          p_binding: string
          p_doc: Json
          p_file: string
          p_site_version: number
        }
        Returns: boolean
      }
      campaign_access_active: { Args: never; Returns: boolean }
      campaign_representation_action: {
        Args: { p_action: string; p_args: Json }
        Returns: Json
      }
      can_edit_record: {
        Args: { r: Database["public"]["Tables"]["campaign_records"]["Row"] }
        Returns: boolean
      }
      can_read_letter: {
        Args: { l: Database["public"]["Tables"]["campaign_letters"]["Row"] }
        Returns: boolean
      }
      can_read_public_gallery_image: {
        Args: { p_path: string }
        Returns: boolean
      }
      can_read_record: {
        Args: { r: Database["public"]["Tables"]["campaign_records"]["Row"] }
        Returns: boolean
      }
      can_read_reply: {
        Args: { r: Database["public"]["Tables"]["letter_replies"]["Row"] }
        Returns: boolean
      }
      claim_drive_binding: {
        Args: { p_id: string; p_token: string }
        Returns: boolean
      }
      commit_noble_house_operation: {
        Args: {
          p_action: string
          p_actor: string
          p_explanation: string
          p_house: string
          p_key: string
          p_rule: string
          p_state: Json
          p_version: number
        }
        Returns: Json
      }
      delete_campaign_letter: { Args: { p_id: string }; Returns: undefined }
      edit_campaign_letter: {
        Args: {
          p_content: string
          p_id: string
          p_subject: string
          p_version: number
        }
        Returns: Json
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
      open_letter_round: { Args: never; Returns: number }
      player_send_letter: {
        Args: { p_content: string; p_key: string; p_subject: string }
        Returns: string
      }
      player_send_letter_to: {
        Args: {
          p_content: string
          p_house: string
          p_key: string
          p_subject: string
        }
        Returns: string
      }
      prepare_letter_week: { Args: { p_number: number }; Returns: undefined }
      public_player_houses: {
        Args: never
        Returns: {
          house_id: string
        }[]
      }
      reply_campaign_letter: {
        Args: { p_content: string; p_key: string; p_letter: string }
        Returns: string
      }
      reply_weekly_message: {
        Args: {
          p_content: string
          p_draft?: boolean
          p_key: string
          p_letter: string
          p_reply: string
        }
        Returns: string
      }
      resolve_drive_import: {
        Args: { p_choice: string; p_content?: string; p_id: string }
        Returns: undefined
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
      save_imported_source: {
        Args: { p_content: string; p_id: string; p_modified: string }
        Returns: undefined
      }
      save_letter_batch_drafts: {
        Args: {
          p_content: string
          p_key: string
          p_kind: string
          p_number: number
          p_recipients: string[]
          p_subject: string
        }
        Returns: number
      }
      save_letter_draft: {
        Args: {
          p_content: string
          p_house: string
          p_id: string
          p_subject: string
          p_week: number
        }
        Returns: string
      }
      save_weekly_reply_draft: {
        Args: {
          p_content: string
          p_id: string
          p_letter: string
          p_reply: string
        }
        Returns: string
      }
      schedule_letter_draft: {
        Args: { p_id: string; p_week: number }
        Returns: undefined
      }
      schedule_weekly_reply_draft: {
        Args: { p_id: string }
        Returns: undefined
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
      send_campaign_letter_batch: {
        Args: {
          p_content: string
          p_key: string
          p_kind: string
          p_number: number
          p_recipients: string[]
          p_subject: string
        }
        Returns: number
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
      set_letter_round: {
        Args: { p_closed: boolean; p_number: number }
        Returns: undefined
      }
      start_campaign_representation: {
        Args: { p_player: string }
        Returns: undefined
      }
      stop_campaign_representation: { Args: never; Returns: undefined }
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
