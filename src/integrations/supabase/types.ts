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
      battle_dnd_cormyr_monsters: {
        Row: {
          ac: number
          catalog_version: number
          challenge_rating: number
          group_name: string
          hp: number
          id: string
          inserted_at: string
          melee: Json | null
          name: string
          ranged: Json | null
          size: string
          source: string
          speed_ft: number
        }
        Insert: {
          ac: number
          catalog_version?: number
          challenge_rating: number
          group_name: string
          hp: number
          id: string
          inserted_at?: string
          melee?: Json | null
          name: string
          ranged?: Json | null
          size: string
          source: string
          speed_ft: number
        }
        Update: {
          ac?: number
          catalog_version?: number
          challenge_rating?: number
          group_name?: string
          hp?: number
          id?: string
          inserted_at?: string
          melee?: Json | null
          name?: string
          ranged?: Json | null
          size?: string
          source?: string
          speed_ft?: number
        }
        Relationships: []
      }
      battle_dnd_custom_monsters: {
        Row: {
          catalog_version: number
          created_by: string
          id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          catalog_version?: number
          created_by?: string
          id: string
          payload: Json
          updated_at?: string
        }
        Update: {
          catalog_version?: number
          created_by?: string
          id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      battle_dnd_monster_overrides: {
        Row: {
          combat_patch: Json
          monster_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          combat_patch?: Json
          monster_id: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          combat_patch?: Json
          monster_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_dnd_monster_overrides_monster_id_fkey"
            columns: ["monster_id"]
            isOneToOne: true
            referencedRelation: "battle_dnd_cormyr_monsters"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_dnd_sessions: {
        Row: {
          battle_id: string
          owner_id: string
          replay: Json
          report: Json | null
          updated_at: string
        }
        Insert: {
          battle_id: string
          owner_id?: string
          replay: Json
          report?: Json | null
          updated_at?: string
        }
        Update: {
          battle_id?: string
          owner_id?: string
          replay?: Json
          report?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      battle_dnd_verified_sources: {
        Row: {
          combat_defaults: Json
          monster_id: string
          source_filename: string
          verified_at: string
        }
        Insert: {
          combat_defaults: Json
          monster_id: string
          source_filename: string
          verified_at?: string
        }
        Update: {
          combat_defaults?: Json
          monster_id?: string
          source_filename?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_dnd_verified_sources_monster_id_fkey"
            columns: ["monster_id"]
            isOneToOne: true
            referencedRelation: "battle_dnd_cormyr_monsters"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_house_roster_imports: {
        Row: {
          catalog_id: string
          house_id: string
          imported_at: string
          quantity: number
          simulation_only: boolean
          source_domain: string | null
          source_file_id: string
          source_key: string
          source_note: string | null
          source_region: string
          source_row: number
          source_status: string
          source_url: string | null
          standard_unit_strength: number
          training: string
          unit_name: string
          unit_strength_basis: string
          unit_type: string
        }
        Insert: {
          catalog_id: string
          house_id: string
          imported_at?: string
          quantity: number
          simulation_only?: boolean
          source_domain?: string | null
          source_file_id: string
          source_key: string
          source_note?: string | null
          source_region: string
          source_row: number
          source_status: string
          source_url?: string | null
          standard_unit_strength: number
          training: string
          unit_name: string
          unit_strength_basis?: string
          unit_type: string
        }
        Update: {
          catalog_id?: string
          house_id?: string
          imported_at?: string
          quantity?: number
          simulation_only?: boolean
          source_domain?: string | null
          source_file_id?: string
          source_key?: string
          source_note?: string | null
          source_region?: string
          source_row?: number
          source_status?: string
          source_url?: string | null
          standard_unit_strength?: number
          training?: string
          unit_name?: string
          unit_strength_basis?: string
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_house_roster_imports_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "house_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_sim_events: {
        Row: {
          actor_id: string
          command_id: string
          command_json: Json
          created_at: string
          event_json: Json
          prev_hash: string
          seq: number
          session_id: string
          state_hash: string
        }
        Insert: {
          actor_id: string
          command_id: string
          command_json: Json
          created_at?: string
          event_json: Json
          prev_hash: string
          seq: number
          session_id: string
          state_hash: string
        }
        Update: {
          actor_id?: string
          command_id?: string
          command_json?: Json
          created_at?: string
          event_json?: Json
          prev_hash?: string
          seq?: number
          session_id?: string
          state_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_sim_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "battle_sim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_sim_scenarios: {
        Row: {
          created_at: string
          created_by: string
          id: string
          map_json: Json
          name: string
          rules_version: string
          schema_version: number
          units_json: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          map_json: Json
          name: string
          rules_version?: string
          schema_version?: number
          units_json?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          map_json?: Json
          name?: string
          rules_version?: string
          schema_version?: number
          units_json?: Json
        }
        Relationships: []
      }
      battle_sim_sessions: {
        Row: {
          created_at: string
          created_by: string
          current_state_json: Json
          id: string
          initial_state_hash: string
          initial_state_json: Json
          name: string
          rules_version: string
          schema_version: number
          state_hash: string
          state_version: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_state_json: Json
          id?: string
          initial_state_hash: string
          initial_state_json: Json
          name: string
          rules_version?: string
          schema_version?: number
          state_hash: string
          state_version?: number
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_state_json?: Json
          id?: string
          initial_state_hash?: string
          initial_state_json?: Json
          name?: string
          rules_version?: string
          schema_version?: number
          state_hash?: string
          state_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      battle_v3_invitations: {
        Row: {
          attacker_commander: string
          attacker_model_id: string
          created_at: string
          created_by: string
          defender_commander: string
          defender_model_id: string
          id: string
          scenario: string
          status: string
          target_house_id: string
          title: string
        }
        Insert: {
          attacker_commander: string
          attacker_model_id: string
          created_at?: string
          created_by: string
          defender_commander: string
          defender_model_id: string
          id?: string
          scenario: string
          status?: string
          target_house_id: string
          title: string
        }
        Update: {
          attacker_commander?: string
          attacker_model_id?: string
          created_at?: string
          created_by?: string
          defender_commander?: string
          defender_model_id?: string
          id?: string
          scenario?: string
          status?: string
          target_house_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_v3_invitations_target_house_id_fkey"
            columns: ["target_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
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
      campaign_calendar: {
        Row: {
          auto_advance: boolean
          day: number
          festival: string | null
          id: boolean
          last_round: number | null
          month: number
          published_at: string | null
          published_week: number
          updated_at: string
          updated_by: string | null
          version: number
          year: number
        }
        Insert: {
          auto_advance?: boolean
          day?: number
          festival?: string | null
          id?: boolean
          last_round?: number | null
          month?: number
          published_at?: string | null
          published_week?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          year?: number
        }
        Update: {
          auto_advance?: boolean
          day?: number
          festival?: string | null
          id?: boolean
          last_round?: number | null
          month?: number
          published_at?: string | null
          published_week?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
          year?: number
        }
        Relationships: []
      }
      campaign_calendar_audit: {
        Row: {
          actor: string | null
          after_state: Json
          before_state: Json
          created_at: string
          id: string
          reason: string
        }
        Insert: {
          actor?: string | null
          after_state: Json
          before_state: Json
          created_at?: string
          id?: string
          reason: string
        }
        Update: {
          actor?: string | null
          after_state?: Json
          before_state?: Json
          created_at?: string
          id?: string
          reason?: string
        }
        Relationships: []
      }
      campaign_characters: {
        Row: {
          age_exception_note: string | null
          age_policy: string
          aliases: string[]
          alive_status: string
          apparent_age: string | null
          baseline_age: number | null
          baseline_year: number | null
          birth_date: string | null
          birth_year: number | null
          confidence: string
          created_at: string
          created_by: string
          death_date: string | null
          death_year: number | null
          display_name: string
          house_id: string | null
          id: string
          is_noble: boolean
          noble_roles: string[]
          owner_user_id: string | null
          race: string | null
          review_note: string
          review_status: string
          updated_at: string
          updated_by: string
          version: number
          visibility: string
        }
        Insert: {
          age_exception_note?: string | null
          age_policy?: string
          aliases?: string[]
          alive_status?: string
          apparent_age?: string | null
          baseline_age?: number | null
          baseline_year?: number | null
          birth_date?: string | null
          birth_year?: number | null
          confidence?: string
          created_at?: string
          created_by: string
          death_date?: string | null
          death_year?: number | null
          display_name: string
          house_id?: string | null
          id?: string
          is_noble?: boolean
          noble_roles?: string[]
          owner_user_id?: string | null
          race?: string | null
          review_note?: string
          review_status?: string
          updated_at?: string
          updated_by: string
          version?: number
          visibility?: string
        }
        Update: {
          age_exception_note?: string | null
          age_policy?: string
          aliases?: string[]
          alive_status?: string
          apparent_age?: string | null
          baseline_age?: number | null
          baseline_year?: number | null
          birth_date?: string | null
          birth_year?: number | null
          confidence?: string
          created_at?: string
          created_by?: string
          death_date?: string | null
          death_year?: number | null
          display_name?: string
          house_id?: string | null
          id?: string
          is_noble?: boolean
          noble_roles?: string[]
          owner_user_id?: string | null
          race?: string | null
          review_note?: string
          review_status?: string
          updated_at?: string
          updated_by?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_characters_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
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
      campaign_letter_consequences: {
        Row: {
          active: boolean
          changes: Json
          created_at: string
          created_by: string
          explanation: string
          house_id: string
          id: string
          letter_id: string
          operation_key: string
          reversal_key: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          active?: boolean
          changes: Json
          created_at?: string
          created_by: string
          explanation: string
          house_id: string
          id?: string
          letter_id: string
          operation_key: string
          reversal_key?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          active?: boolean
          changes?: Json
          created_at?: string
          created_by?: string
          explanation?: string
          house_id?: string
          id?: string
          letter_id?: string
          operation_key?: string
          reversal_key?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_letter_consequences_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_letter_consequences_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "campaign_letters"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_letters: {
        Row: {
          administrative_actor: string | null
          batch_key: string | null
          campaign_date: string | null
          content: string
          conversation_id: string | null
          court_assignment: string | null
          court_member_id: string | null
          created_at: string
          creation_week: number | null
          deleted_at: string | null
          deleted_by: string | null
          delivered_at: string | null
          delivery_week: number | null
          historical_recipient_name: string | null
          historical_source: string | null
          house_sheet_version: number | null
          id: string
          last_synced_at: string | null
          letter_kind: string
          letter_number: number | null
          military_unit_id: string | null
          origin_house_id: string | null
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
          court_assignment?: string | null
          court_member_id?: string | null
          created_at?: string
          creation_week?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_week?: number | null
          historical_recipient_name?: string | null
          historical_source?: string | null
          house_sheet_version?: number | null
          id?: string
          last_synced_at?: string | null
          letter_kind?: string
          letter_number?: number | null
          military_unit_id?: string | null
          origin_house_id?: string | null
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
          court_assignment?: string | null
          court_member_id?: string | null
          created_at?: string
          creation_week?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivered_at?: string | null
          delivery_week?: number | null
          historical_recipient_name?: string | null
          historical_source?: string | null
          house_sheet_version?: number | null
          id?: string
          last_synced_at?: string | null
          letter_kind?: string
          letter_number?: number | null
          military_unit_id?: string | null
          origin_house_id?: string | null
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
            foreignKeyName: "campaign_letters_origin_house_id_fkey"
            columns: ["origin_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
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
      campaign_private_gm_content: {
        Row: {
          id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          id: string
          payload: Json
          updated_at?: string
        }
        Update: {
          id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      campaign_private_vassal_workbooks: {
        Row: {
          parent_house_id: string
          payload: Json
          updated_at: string
          vassal_house_id: string
        }
        Insert: {
          parent_house_id: string
          payload: Json
          updated_at?: string
          vassal_house_id: string
        }
        Update: {
          parent_house_id?: string
          payload?: Json
          updated_at?: string
          vassal_house_id?: string
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
      campaign_schedule_event_audit: {
        Row: {
          actor: string | null
          after_state: Json | null
          before_state: Json | null
          changed_at: string
          event_id: string
          id: string
          reason: string
        }
        Insert: {
          actor?: string | null
          after_state?: Json | null
          before_state?: Json | null
          changed_at?: string
          event_id: string
          id?: string
          reason: string
        }
        Update: {
          actor?: string | null
          after_state?: Json | null
          before_state?: Json | null
          changed_at?: string
          event_id?: string
          id?: string
          reason?: string
        }
        Relationships: []
      }
      campaign_schedule_events: {
        Row: {
          draft_date: string
          draft_deleted: boolean
          draft_description: string
          draft_title: string
          id: string
          published_date: string | null
          published_description: string | null
          published_title: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          draft_date: string
          draft_deleted?: boolean
          draft_description?: string
          draft_title: string
          id?: string
          published_date?: string | null
          published_description?: string | null
          published_title?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          draft_date?: string
          draft_deleted?: boolean
          draft_description?: string
          draft_title?: string
          id?: string
          published_date?: string | null
          published_description?: string | null
          published_title?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      campaign_temporal_consumers: {
        Row: {
          boundary: string
          code: string
          created_at: string
          description: string
          enabled: boolean
          mode: string
          title: string
        }
        Insert: {
          boundary: string
          code: string
          created_at?: string
          description: string
          enabled?: boolean
          mode: string
          title: string
        }
        Update: {
          boundary?: string
          code?: string
          created_at?: string
          description?: string
          enabled?: boolean
          mode?: string
          title?: string
        }
        Relationships: []
      }
      campaign_temporal_deliveries: {
        Row: {
          boundary: string
          calendar_version: number
          consumer_code: string
          created_at: string
          direction: string
          from_date: string
          id: string
          mode: string
          operation_id: string
          payload: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          to_date: string
        }
        Insert: {
          boundary: string
          calendar_version: number
          consumer_code: string
          created_at?: string
          direction: string
          from_date: string
          id?: string
          mode: string
          operation_id: string
          payload: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status: string
          to_date: string
        }
        Update: {
          boundary?: string
          calendar_version?: number
          consumer_code?: string
          created_at?: string
          direction?: string
          from_date?: string
          id?: string
          mode?: string
          operation_id?: string
          payload?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_temporal_deliveries_consumer_code_fkey"
            columns: ["consumer_code"]
            isOneToOne: false
            referencedRelation: "campaign_temporal_consumers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "campaign_temporal_deliveries_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "campaign_time_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_temporal_delivery_resolutions: {
        Row: {
          actor: string
          created_at: string
          delivery_id: string
          note: string
          request_hash: string
          request_key: string
          status: string
        }
        Insert: {
          actor: string
          created_at?: string
          delivery_id: string
          note: string
          request_hash: string
          request_key: string
          status: string
        }
        Update: {
          actor?: string
          created_at?: string
          delivery_id?: string
          note?: string
          request_hash?: string
          request_key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_temporal_delivery_resolutions_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "campaign_temporal_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_temporal_effect_checkpoints: {
        Row: {
          consumer_code: string
          effect_key: string
          first_operation_id: string
          recorded_at: string
        }
        Insert: {
          consumer_code: string
          effect_key: string
          first_operation_id: string
          recorded_at?: string
        }
        Update: {
          consumer_code?: string
          effect_key?: string
          first_operation_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_temporal_effect_checkpoints_consumer_code_fkey"
            columns: ["consumer_code"]
            isOneToOne: false
            referencedRelation: "campaign_temporal_consumers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "campaign_temporal_effect_checkpoints_first_operation_id_fkey"
            columns: ["first_operation_id"]
            isOneToOne: false
            referencedRelation: "campaign_time_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_time_operations: {
        Row: {
          actor: string
          after_state: Json
          before_state: Json
          created_at: string
          expected_version: number
          from_date: string
          id: string
          mode: string
          reason: string
          request_hash: string
          to_date: string
        }
        Insert: {
          actor: string
          after_state: Json
          before_state: Json
          created_at?: string
          expected_version: number
          from_date: string
          id: string
          mode: string
          reason: string
          request_hash: string
          to_date: string
        }
        Update: {
          actor?: string
          after_state?: Json
          before_state?: Json
          created_at?: string
          expected_version?: number
          from_date?: string
          id?: string
          mode?: string
          reason?: string
          request_hash?: string
          to_date?: string
        }
        Relationships: []
      }
      campaign_translations: {
        Row: {
          entity_id: string
          entity_type: string
          field_name: string
          id: string
          locale: string
          translated_text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          entity_id: string
          entity_type: string
          field_name: string
          id?: string
          locale: string
          translated_text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          entity_id?: string
          entity_type?: string
          field_name?: string
          id?: string
          locale?: string
          translated_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      character_registry_audit: {
        Row: {
          action: string
          actor: string
          after_state: Json | null
          before_state: Json | null
          character_id: string | null
          created_at: string
          id: string
          reason: string
          source_key: string | null
          source_kind: string | null
        }
        Insert: {
          action: string
          actor: string
          after_state?: Json | null
          before_state?: Json | null
          character_id?: string | null
          created_at?: string
          id?: string
          reason: string
          source_key?: string | null
          source_kind?: string | null
        }
        Update: {
          action?: string
          actor?: string
          after_state?: Json | null
          before_state?: Json | null
          character_id?: string | null
          created_at?: string
          id?: string
          reason?: string
          source_key?: string | null
          source_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "character_registry_audit_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "campaign_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_relations: {
        Row: {
          approved_by: string
          created_at: string
          from_character: string
          id: string
          note: string
          relation: string
          to_character: string
        }
        Insert: {
          approved_by: string
          created_at?: string
          from_character: string
          id?: string
          note?: string
          relation: string
          to_character: string
        }
        Update: {
          approved_by?: string
          created_at?: string
          from_character?: string
          id?: string
          note?: string
          relation?: string
          to_character?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_relations_from_character_fkey"
            columns: ["from_character"]
            isOneToOne: false
            referencedRelation: "campaign_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_relations_to_character_fkey"
            columns: ["to_character"]
            isOneToOne: false
            referencedRelation: "campaign_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_review_queue: {
        Row: {
          character_id: string | null
          claimed_age: number | null
          claimed_age_year: number | null
          claimed_birth_year: number | null
          created_at: string
          evidence: Json
          house_id: string | null
          id: string
          proposed_name: string
          review_note: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_key: string
          source_kind: string
          source_visibility: string
          status: string
          updated_at: string
        }
        Insert: {
          character_id?: string | null
          claimed_age?: number | null
          claimed_age_year?: number | null
          claimed_birth_year?: number | null
          created_at?: string
          evidence?: Json
          house_id?: string | null
          id?: string
          proposed_name: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_key: string
          source_kind: string
          source_visibility?: string
          status?: string
          updated_at?: string
        }
        Update: {
          character_id?: string | null
          claimed_age?: number | null
          claimed_age_year?: number | null
          claimed_birth_year?: number | null
          created_at?: string
          evidence?: Json
          house_id?: string | null
          id?: string
          proposed_name?: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_key?: string
          source_kind?: string
          source_visibility?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_review_queue_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "campaign_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_review_queue_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      character_source_links: {
        Row: {
          character_id: string
          confirmed_at: string
          confirmed_by: string
          id: string
          source_key: string
          source_kind: string
          source_reference: Json
          source_visibility: string
        }
        Insert: {
          character_id: string
          confirmed_at?: string
          confirmed_by: string
          id?: string
          source_key: string
          source_kind: string
          source_reference?: Json
          source_visibility?: string
        }
        Update: {
          character_id?: string
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          source_key?: string
          source_kind?: string
          source_reference?: Json
          source_visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_source_links_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "campaign_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_year_transitions: {
        Row: {
          actor: string
          calendar_version: number
          created_at: string
          from_year: number
          id: string
          to_year: number
        }
        Insert: {
          actor: string
          calendar_version: number
          created_at?: string
          from_year: number
          id?: string
          to_year: number
        }
        Update: {
          actor?: string
          calendar_version?: number
          created_at?: string
          from_year?: number
          id?: string
          to_year?: number
        }
        Relationships: []
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
          can_edit_attributes: boolean
          house_id: string
          player_id: string
        }
        Insert: {
          authorized_at?: string
          authorized_by?: string
          can_edit?: boolean
          can_edit_attributes?: boolean
          house_id: string
          player_id: string
        }
        Update: {
          authorized_at?: string
          authorized_by?: string
          can_edit?: boolean
          can_edit_attributes?: boolean
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
          deleted_at: string | null
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
          updated_at: string
          version: number
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
          deleted_at?: string | null
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
          updated_at?: string
          version?: number
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
          deleted_at?: string | null
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
          updated_at?: string
          version?: number
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
      letter_reply_versions: {
        Row: {
          author: string
          created_at: string
          id: string
          reply_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          author: string
          created_at?: string
          id?: string
          reply_id: string
          snapshot: Json
          version: number
        }
        Update: {
          author?: string
          created_at?: string
          id?: string
          reply_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_reply_versions_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "letter_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_rounds: {
        Row: {
          closed: boolean
          closed_at: string | null
          closed_by: string | null
          harptos_period: string | null
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
          harptos_period?: string | null
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
          harptos_period?: string | null
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
      mail_submissions: {
        Row: {
          author_user_id: string
          created_at: string
          id: string
          request: Json
        }
        Insert: {
          author_user_id: string
          created_at?: string
          id: string
          request: Json
        }
        Update: {
          author_user_id?: string
          created_at?: string
          id?: string
          request?: Json
        }
        Relationships: []
      }
      narrator_mail_notes: {
        Row: {
          id: string
          letter_id: string | null
          notes: Json
          reply_id: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          id: string
          letter_id?: string | null
          notes?: Json
          reply_id?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          id?: string
          letter_id?: string | null
          notes?: Json
          reply_id?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrator_mail_notes_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "campaign_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrator_mail_notes_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "letter_replies"
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
      noble_house_source_links: {
        Row: {
          actor: string
          after_version: number
          before_state: Json
          confirmed_totals: Json
          created_at: string
          house_id: string
          record_id: string
          source_file_id: string | null
          source_modified_at: string | null
          source_snapshot: Json
          source_version: number
        }
        Insert: {
          actor: string
          after_version: number
          before_state: Json
          confirmed_totals: Json
          created_at?: string
          house_id: string
          record_id: string
          source_file_id?: string | null
          source_modified_at?: string | null
          source_snapshot: Json
          source_version: number
        }
        Update: {
          actor?: string
          after_version?: number
          before_state?: Json
          confirmed_totals?: Json
          created_at?: string
          house_id?: string
          record_id?: string
          source_file_id?: string | null
          source_modified_at?: string | null
          source_snapshot?: Json
          source_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "noble_house_source_links_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noble_house_source_links_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "campaign_records"
            referencedColumns: ["id"]
          },
        ]
      }
      noble_house_workbook_imports: {
        Row: {
          batch: string
          checked_at: string
          detail: string
          house_id: string | null
          house_key: string
          status: string
        }
        Insert: {
          batch: string
          checked_at?: string
          detail: string
          house_id?: string | null
          house_key: string
          status: string
        }
        Update: {
          batch?: string
          checked_at?: string
          detail?: string
          house_id?: string | null
          house_key?: string
          status?: string
        }
        Relationships: []
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
      spy_agent_history: {
        Row: {
          actor: string
          agent_id: string
          agent_rank: string
          calendar_version: number
          created_at: string
          cunning: number
          detail: string
          event_date_key: string
          event_type: string
          failure_degrees: number | null
          guard_present: boolean | null
          id: string
          law_snapshot: number | null
          modifier: number | null
          operation_id: string | null
          owner_house_id: string
          prison_present: boolean | null
          request_key: string
          roll_total: number | null
          target_difficulty: number | null
          target_house_id: string | null
          target_name: string | null
          target_region: string | null
          total_successes: number
        }
        Insert: {
          actor: string
          agent_id: string
          agent_rank: string
          calendar_version: number
          created_at?: string
          cunning: number
          detail: string
          event_date_key: string
          event_type: string
          failure_degrees?: number | null
          guard_present?: boolean | null
          id?: string
          law_snapshot?: number | null
          modifier?: number | null
          operation_id?: string | null
          owner_house_id: string
          prison_present?: boolean | null
          request_key: string
          roll_total?: number | null
          target_difficulty?: number | null
          target_house_id?: string | null
          target_name?: string | null
          target_region?: string | null
          total_successes: number
        }
        Update: {
          actor?: string
          agent_id?: string
          agent_rank?: string
          calendar_version?: number
          created_at?: string
          cunning?: number
          detail?: string
          event_date_key?: string
          event_type?: string
          failure_degrees?: number | null
          guard_present?: boolean | null
          id?: string
          law_snapshot?: number | null
          modifier?: number | null
          operation_id?: string | null
          owner_house_id?: string
          prison_present?: boolean | null
          request_key?: string
          roll_total?: number | null
          target_difficulty?: number | null
          target_house_id?: string | null
          target_name?: string | null
          target_region?: string | null
          total_successes?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_agent_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "spy_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_agent_history_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_agent_history_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_agent_removals: {
        Row: {
          agent_id: string
          codename: string
          owner_house_id: string
          portrait_id: string | null
          refunded_wealth: number
          removed_at: string
          removed_by: string
          request_key: string
        }
        Insert: {
          agent_id: string
          codename: string
          owner_house_id: string
          portrait_id?: string | null
          refunded_wealth: number
          removed_at?: string
          removed_by: string
          request_key: string
        }
        Update: {
          agent_id?: string
          codename?: string
          owner_house_id?: string
          portrait_id?: string | null
          refunded_wealth?: number
          removed_at?: string
          removed_by?: string
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_agent_removals_agent_id_owner_house_id_fkey"
            columns: ["agent_id", "owner_house_id"]
            isOneToOne: false
            referencedRelation: "spy_assets"
            referencedColumns: ["id", "owner_house_id"]
          },
          {
            foreignKeyName: "spy_agent_removals_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_agent_upgrades: {
        Row: {
          agent_id: string
          cost_wealth: number
          owner_house_id: string
          purchased_at: string
          purchased_by: string
          request_key: string
          upgrade_code: string
        }
        Insert: {
          agent_id: string
          cost_wealth?: number
          owner_house_id: string
          purchased_at?: string
          purchased_by: string
          request_key: string
          upgrade_code: string
        }
        Update: {
          agent_id?: string
          cost_wealth?: number
          owner_house_id?: string
          purchased_at?: string
          purchased_by?: string
          request_key?: string
          upgrade_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_agent_upgrades_agent_id_owner_house_id_fkey"
            columns: ["agent_id", "owner_house_id"]
            isOneToOne: false
            referencedRelation: "spy_assets"
            referencedColumns: ["id", "owner_house_id"]
          },
          {
            foreignKeyName: "spy_agent_upgrades_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_assets: {
        Row: {
          codename: string
          created_at: string
          current_location_id: string | null
          id: string
          kind: string
          mission_successes: number
          owner_house_id: string
          portrait_id: string | null
          rules_version: string
          source_holding_id: string | null
          source_ref: string
          status: string
          version: number
        }
        Insert: {
          codename: string
          created_at?: string
          current_location_id?: string | null
          id?: string
          kind: string
          mission_successes?: number
          owner_house_id: string
          portrait_id?: string | null
          rules_version: string
          source_holding_id?: string | null
          source_ref: string
          status?: string
          version?: number
        }
        Update: {
          codename?: string
          created_at?: string
          current_location_id?: string | null
          id?: string
          kind?: string
          mission_successes?: number
          owner_house_id?: string
          portrait_id?: string | null
          rules_version?: string
          source_holding_id?: string | null
          source_ref?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_assets_current_location_id_fkey"
            columns: ["current_location_id"]
            isOneToOne: false
            referencedRelation: "spy_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_assets_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_assets_portrait_id_fkey"
            columns: ["portrait_id"]
            isOneToOne: false
            referencedRelation: "spy_portrait_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_contract_receipts: {
        Row: {
          created_at: string
          holding_id: string
          operation_key: string
          owner_house_id: string
        }
        Insert: {
          created_at?: string
          holding_id: string
          operation_key: string
          owner_house_id: string
        }
        Update: {
          created_at?: string
          holding_id?: string
          operation_key?: string
          owner_house_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_contract_receipts_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_contract_receipts_owner_house_id_operation_key_fkey"
            columns: ["owner_house_id", "operation_key"]
            isOneToOne: true
            referencedRelation: "noble_house_ledger"
            referencedColumns: ["house_id", "operation_key"]
          },
        ]
      }
      spy_cormyr_mission_links: {
        Row: {
          active: boolean
          from_region: string
          passage: string
          to_region: string
        }
        Insert: {
          active?: boolean
          from_region: string
          passage: string
          to_region: string
        }
        Update: {
          active?: boolean
          from_region?: string
          passage?: string
          to_region?: string
        }
        Relationships: []
      }
      spy_dossier_facts: {
        Row: {
          approved: boolean
          confidence: string
          disclosed_value: Json
          dossier_id: string
          field_code: string
          id: string
          observed_date_key: string
          owner_house_id: string
          report_id: string
          stale_at_key: string | null
        }
        Insert: {
          approved?: boolean
          confidence: string
          disclosed_value: Json
          dossier_id: string
          field_code: string
          id: string
          observed_date_key: string
          owner_house_id: string
          report_id: string
          stale_at_key?: string | null
        }
        Update: {
          approved?: boolean
          confidence?: string
          disclosed_value?: Json
          dossier_id?: string
          field_code?: string
          id?: string
          observed_date_key?: string
          owner_house_id?: string
          report_id?: string
          stale_at_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spy_dossier_facts_dossier_id_owner_house_id_fkey"
            columns: ["dossier_id", "owner_house_id"]
            isOneToOne: false
            referencedRelation: "spy_dossiers"
            referencedColumns: ["id", "owner_house_id"]
          },
          {
            foreignKeyName: "spy_dossier_facts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "spy_intel_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_dossiers: {
        Row: {
          id: string
          owner_house_id: string
          target_id: string
          target_type: string
          version: number
        }
        Insert: {
          id?: string
          owner_house_id: string
          target_id: string
          target_type: string
          version?: number
        }
        Update: {
          id?: string
          owner_house_id?: string
          target_id?: string
          target_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_dossiers_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_intel_reports: {
        Row: {
          asset_codename: string
          code: string
          created_at: string
          facts: Json
          id: string
          location_label: string
          observed_date_key: string
          operation_id: string
          owner_house_id: string
          release_by: string | null
          release_date_key: string | null
          release_key: string | null
          release_reason: string | null
          requested_fields: string[]
          status: string
          version: number
        }
        Insert: {
          asset_codename: string
          code: string
          created_at?: string
          facts?: Json
          id?: string
          location_label: string
          observed_date_key: string
          operation_id: string
          owner_house_id: string
          release_by?: string | null
          release_date_key?: string | null
          release_key?: string | null
          release_reason?: string | null
          requested_fields: string[]
          status?: string
          version?: number
        }
        Update: {
          asset_codename?: string
          code?: string
          created_at?: string
          facts?: Json
          id?: string
          location_label?: string
          observed_date_key?: string
          operation_id?: string
          owner_house_id?: string
          release_by?: string | null
          release_date_key?: string | null
          release_key?: string | null
          release_reason?: string | null
          requested_fields?: string[]
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_intel_reports_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_intel_reports_operation_id_owner_house_id_fkey"
            columns: ["operation_id", "owner_house_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id", "owner_house_id"]
          },
          {
            foreignKeyName: "spy_intel_reports_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_intelligence_admin_audit: {
        Row: {
          action: string
          actor: string
          after_snapshot: Json | null
          before_snapshot: Json | null
          campaign_date_key: string
          created_at: string
          dossier_id: string
          id: string
          objective: string
          reason: string
          subject_key: string
        }
        Insert: {
          action: string
          actor: string
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          campaign_date_key: string
          created_at?: string
          dossier_id: string
          id?: string
          objective: string
          reason: string
          subject_key: string
        }
        Update: {
          action?: string
          actor?: string
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          campaign_date_key?: string
          created_at?: string
          dossier_id?: string
          id?: string
          objective?: string
          reason?: string
          subject_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_intelligence_admin_audit_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "spy_intelligence_dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_intelligence_dossiers: {
        Row: {
          created_at: string
          id: string
          owner_house_id: string
          target_house_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_house_id: string
          target_house_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_house_id?: string
          target_house_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_intelligence_dossiers_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_intelligence_dossiers_target_house_id_fkey"
            columns: ["target_house_id"]
            isOneToOne: false
            referencedRelation: "house_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_intelligence_events: {
        Row: {
          calendar_version: number
          campaign_date_key: string
          created_at: string
          dossier_id: string
          event_type: string
          id: string
          new_snapshot: Json
          objective: string
          operation_id: string
          previous_snapshot: Json | null
          subject_key: string
        }
        Insert: {
          calendar_version: number
          campaign_date_key: string
          created_at?: string
          dossier_id: string
          event_type: string
          id?: string
          new_snapshot: Json
          objective: string
          operation_id: string
          previous_snapshot?: Json | null
          subject_key: string
        }
        Update: {
          calendar_version?: number
          campaign_date_key?: string
          created_at?: string
          dossier_id?: string
          event_type?: string
          id?: string
          new_snapshot?: Json
          objective?: string
          operation_id?: string
          previous_snapshot?: Json | null
          subject_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_intelligence_events_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "spy_intelligence_dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_intelligence_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_intelligence_findings: {
        Row: {
          discovered_at: string
          discovered_date_key: string
          discovered_operation_id: string | null
          dossier_id: string
          id: string
          objective: string
          subject_key: string
          value_snapshot: Json
          verified_at: string
          verified_date_key: string
          verified_operation_id: string | null
        }
        Insert: {
          discovered_at?: string
          discovered_date_key: string
          discovered_operation_id?: string | null
          dossier_id: string
          id?: string
          objective: string
          subject_key: string
          value_snapshot: Json
          verified_at?: string
          verified_date_key: string
          verified_operation_id?: string | null
        }
        Update: {
          discovered_at?: string
          discovered_date_key?: string
          discovered_operation_id?: string | null
          dossier_id?: string
          id?: string
          objective?: string
          subject_key?: string
          value_snapshot?: Json
          verified_at?: string
          verified_date_key?: string
          verified_operation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spy_intelligence_findings_discovered_operation_id_fkey"
            columns: ["discovered_operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_intelligence_findings_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "spy_intelligence_dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_intelligence_findings_verified_operation_id_fkey"
            columns: ["verified_operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_intelligence_mission_awards: {
        Row: {
          campaign_date_key: string
          created_at: string
          dossier_id: string
          objective: string
          operation_id: string
          processing_state: string
          refreshed_count: number
          reveal_capacity: number
          revealed_count: number
          success_degrees: number
        }
        Insert: {
          campaign_date_key: string
          created_at?: string
          dossier_id: string
          objective: string
          operation_id: string
          processing_state: string
          refreshed_count?: number
          reveal_capacity: number
          revealed_count?: number
          success_degrees: number
        }
        Update: {
          campaign_date_key?: string
          created_at?: string
          dossier_id?: string
          objective?: string
          operation_id?: string
          processing_state?: string
          refreshed_count?: number
          reveal_capacity?: number
          revealed_count?: number
          success_degrees?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_intelligence_mission_awards_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "spy_intelligence_dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_intelligence_mission_awards_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_legacy_seed_archive: {
        Row: {
          archived_at: string
          archived_snapshot: Json
          id: string
          owner_house_id: string
          reason: string
        }
        Insert: {
          archived_at?: string
          archived_snapshot: Json
          id: string
          owner_house_id: string
          reason: string
        }
        Update: {
          archived_at?: string
          archived_snapshot?: Json
          id?: string
          owner_house_id?: string
          reason?: string
        }
        Relationships: []
      }
      spy_locations: {
        Row: {
          approved: boolean
          id: string
          kind: string
          name: string
          ref_id: string
          region_id: string | null
          source: string
          version: number
          visibility: string
        }
        Insert: {
          approved?: boolean
          id?: string
          kind: string
          name: string
          ref_id: string
          region_id?: string | null
          source: string
          version?: number
          visibility?: string
        }
        Update: {
          approved?: boolean
          id?: string
          kind?: string
          name?: string
          ref_id?: string
          region_id?: string | null
          source?: string
          version?: number
          visibility?: string
        }
        Relationships: []
      }
      spy_mission_decisions: {
        Row: {
          created_at: string
          difficulty: number | null
          id: string
          law_source: string | null
          law_source_version: number | null
          modifiers: Json
          operation_id: string
          rationale: string | null
          resolution: string
          reviewer: string | null
          rule_version: string | null
          target_law: number | null
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          id?: string
          law_source?: string | null
          law_source_version?: number | null
          modifiers?: Json
          operation_id: string
          rationale?: string | null
          resolution?: string
          reviewer?: string | null
          rule_version?: string | null
          target_law?: number | null
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          id?: string
          law_source?: string | null
          law_source_version?: number | null
          modifiers?: Json
          operation_id?: string
          rationale?: string | null
          resolution?: string
          reviewer?: string | null
          rule_version?: string | null
          target_law?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "spy_mission_decisions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_mission_timeline: {
        Row: {
          agent_id: string
          arrival_key: string
          created_at: string
          departure_key: string
          destination_location_id: string
          destination_region: string
          investigation_end_key: string
          operation_id: string
          origin_region: string
          owner_house_id: string
          route: Json
          source_calendar_version: number
          source_location_id: string
          travel_days: number
          travel_rounds: number
        }
        Insert: {
          agent_id: string
          arrival_key: string
          created_at?: string
          departure_key: string
          destination_location_id: string
          destination_region: string
          investigation_end_key: string
          operation_id: string
          origin_region: string
          owner_house_id: string
          route?: Json
          source_calendar_version: number
          source_location_id: string
          travel_days: number
          travel_rounds: number
        }
        Update: {
          agent_id?: string
          arrival_key?: string
          created_at?: string
          departure_key?: string
          destination_location_id?: string
          destination_region?: string
          investigation_end_key?: string
          operation_id?: string
          origin_region?: string
          owner_house_id?: string
          route?: Json
          source_calendar_version?: number
          source_location_id?: string
          travel_days?: number
          travel_rounds?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_mission_timeline_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "spy_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_mission_timeline_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "spy_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_mission_timeline_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_mission_timeline_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_mission_timeline_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "spy_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_noble_house_stats: {
        Row: {
          attribute_origin: string
          budget: number
          defense: number
          difference: number
          hierarchy: string
          house_id: string
          house_name: string
          imported_at: string
          influence: number
          lands: number
          law: number
          overlord: string
          population: number
          power: number
          region_id: string
          source_modified_at: string
          source_row: number
          source_sheet: string
          source_spreadsheet_id: string
          total: number
          wealth: number
        }
        Insert: {
          attribute_origin: string
          budget: number
          defense: number
          difference: number
          hierarchy?: string
          house_id: string
          house_name: string
          imported_at?: string
          influence: number
          lands: number
          law: number
          overlord?: string
          population: number
          power: number
          region_id: string
          source_modified_at?: string
          source_row: number
          source_sheet?: string
          source_spreadsheet_id?: string
          total: number
          wealth: number
        }
        Update: {
          attribute_origin?: string
          budget?: number
          defense?: number
          difference?: number
          hierarchy?: string
          house_id?: string
          house_name?: string
          imported_at?: string
          influence?: number
          lands?: number
          law?: number
          overlord?: string
          population?: number
          power?: number
          region_id?: string
          source_modified_at?: string
          source_row?: number
          source_sheet?: string
          source_spreadsheet_id?: string
          total?: number
          wealth?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_noble_house_stats_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "house_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_operation_events: {
        Row: {
          actor: string | null
          calendar_version: number | null
          event_type: string
          id: string
          new_state: string | null
          occurred_at: string
          old_state: string | null
          operation_id: string | null
          reason: string
          request_key: string
        }
        Insert: {
          actor?: string | null
          calendar_version?: number | null
          event_type: string
          id?: string
          new_state?: string | null
          occurred_at?: string
          old_state?: string | null
          operation_id?: string | null
          reason: string
          request_key: string
        }
        Update: {
          actor?: string | null
          calendar_version?: number | null
          event_type?: string
          id?: string
          new_state?: string | null
          occurred_at?: string
          old_state?: string | null
          operation_id?: string | null
          reason?: string
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_operation_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_operation_segments: {
        Row: {
          arrival_key: string
          departure_key: string
          duration_days: number
          edge_id: string
          edge_version: number
          from_location_id: string
          id: string
          operation_id: string
          ordinal: number
          status: string
          to_location_id: string
        }
        Insert: {
          arrival_key: string
          departure_key: string
          duration_days: number
          edge_id: string
          edge_version: number
          from_location_id: string
          id?: string
          operation_id: string
          ordinal: number
          status?: string
          to_location_id: string
        }
        Update: {
          arrival_key?: string
          departure_key?: string
          duration_days?: number
          edge_id?: string
          edge_version?: number
          from_location_id?: string
          id?: string
          operation_id?: string
          ordinal?: number
          status?: string
          to_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_operation_segments_edge_id_fkey"
            columns: ["edge_id"]
            isOneToOne: false
            referencedRelation: "spy_travel_edges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_operation_segments_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "spy_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_operation_segments_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "spy_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_operation_segments_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "spy_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_operations: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string
          id: string
          mission_kind: string
          operation_key: string
          owner_house_id: string
          requested_fields: string[]
          rules_version: string
          source_calendar_version: number
          status: string
          target_id: string
          target_type: string
          version: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by: string
          id?: string
          mission_kind: string
          operation_key: string
          owner_house_id: string
          requested_fields: string[]
          rules_version: string
          source_calendar_version: number
          status?: string
          target_id: string
          target_type: string
          version?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string
          id?: string
          mission_kind?: string
          operation_key?: string
          owner_house_id?: string
          requested_fields?: string[]
          rules_version?: string
          source_calendar_version?: number
          status?: string
          target_id?: string
          target_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_operations_asset_id_owner_house_id_fkey"
            columns: ["asset_id", "owner_house_id"]
            isOneToOne: false
            referencedRelation: "spy_assets"
            referencedColumns: ["id", "owner_house_id"]
          },
          {
            foreignKeyName: "spy_operations_owner_house_id_fkey"
            columns: ["owner_house_id"]
            isOneToOne: false
            referencedRelation: "campaign_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_portrait_catalog: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          image_url: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      spy_region_links: {
        Row: {
          approval_reason: string | null
          approved: boolean
          approved_by: string | null
          bidirectional: boolean
          blocked: boolean
          from_region: string
          id: string
          passage: string
          source: string
          to_region: string
          version: number
          visibility: string
        }
        Insert: {
          approval_reason?: string | null
          approved?: boolean
          approved_by?: string | null
          bidirectional?: boolean
          blocked?: boolean
          from_region: string
          id?: string
          passage: string
          source: string
          to_region: string
          version?: number
          visibility?: string
        }
        Update: {
          approval_reason?: string | null
          approved?: boolean
          approved_by?: string | null
          bidirectional?: boolean
          blocked?: boolean
          from_region?: string
          id?: string
          passage?: string
          source?: string
          to_region?: string
          version?: number
          visibility?: string
        }
        Relationships: []
      }
      spy_rule_sets: {
        Row: {
          approved_by: string
          code: string
          definition: Json
          id: string
          reason: string
          version: number
        }
        Insert: {
          approved_by: string
          code: string
          definition: Json
          id?: string
          reason: string
          version: number
        }
        Update: {
          approved_by?: string
          code?: string
          definition?: Json
          id?: string
          reason?: string
          version?: number
        }
        Relationships: []
      }
      spy_temporal_deliveries: {
        Row: {
          calendar_version: number
          first_processed_at: string
          id: string
          segment_id: string
          transition: string
        }
        Insert: {
          calendar_version: number
          first_processed_at?: string
          id?: string
          segment_id: string
          transition: string
        }
        Update: {
          calendar_version?: number
          first_processed_at?: string
          id?: string
          segment_id?: string
          transition?: string
        }
        Relationships: [
          {
            foreignKeyName: "spy_temporal_deliveries_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "spy_operation_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      spy_travel_edges: {
        Row: {
          approval_reason: string | null
          approved: boolean
          approved_by: string | null
          base_days: number
          bidirectional: boolean
          blocked: boolean
          from_location_id: string
          id: string
          mode: string
          source: string
          to_location_id: string
          version: number
        }
        Insert: {
          approval_reason?: string | null
          approved?: boolean
          approved_by?: string | null
          base_days: number
          bidirectional?: boolean
          blocked?: boolean
          from_location_id: string
          id?: string
          mode: string
          source: string
          to_location_id: string
          version?: number
        }
        Update: {
          approval_reason?: string | null
          approved?: boolean
          approved_by?: string | null
          base_days?: number
          bidirectional?: boolean
          blocked?: boolean
          from_location_id?: string
          id?: string
          mode?: string
          source?: string
          to_location_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "spy_travel_edges_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "spy_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spy_travel_edges_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "spy_locations"
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
      apply_calendar_months: { Args: { delta: number }; Returns: undefined }
      apply_drive_record: {
        Args: {
          p_binding: string
          p_doc: Json
          p_file: string
          p_site_version: number
        }
        Returns: boolean
      }
      apply_letter_consequence: {
        Args: {
          p_changes: Json
          p_expected_version: number
          p_explanation: string
          p_house: string
          p_key: string
          p_letter: string
        }
        Returns: Json
      }
      battle_sim_commit_replay: {
        Args: {
          p_actor: string
          p_current: Json
          p_current_hash: string
          p_initial: Json
          p_initial_hash: string
          p_name: string
          p_receipts: Json
        }
        Returns: string
      }
      battle_sim_commit_step: {
        Args: {
          p_actor: string
          p_command: Json
          p_command_id: string
          p_current: Json
          p_expected: number
          p_prev_hash: string
          p_receipt: Json
          p_session: string
          p_state_hash: string
        }
        Returns: Json
      }
      calendar_mail_events: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      campaign_access_active: { Args: never; Returns: boolean }
      campaign_date_in_month: {
        Args: { p_date: string; p_month: number; p_year: number }
        Returns: boolean
      }
      campaign_representation_action: {
        Args: { p_action: string; p_args: Json }
        Returns: Json
      }
      can_edit_record: {
        Args: { r: Database["public"]["Tables"]["campaign_records"]["Row"] }
        Returns: boolean
      }
      can_export_mail: {
        Args: { p_id: string; p_type: string; p_viewer: string }
        Returns: boolean
      }
      can_read_letter: {
        Args: { l: Database["public"]["Tables"]["campaign_letters"]["Row"] }
        Returns: boolean
      }
      can_read_letter_as: {
        Args: {
          l: Database["public"]["Tables"]["campaign_letters"]["Row"]
          viewer: string
        }
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
      can_read_reply_as: {
        Args: {
          r: Database["public"]["Tables"]["letter_replies"]["Row"]
          viewer: string
        }
        Returns: boolean
      }
      can_read_reply_version: { Args: { p_reply: string }; Returns: boolean }
      character_age_state: {
        Args: {
          p_character: Database["public"]["Tables"]["campaign_characters"]["Row"]
          p_year: number
        }
        Returns: Json
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
      commit_noble_house_source: {
        Args: {
          p_actor: string
          p_house: string
          p_key: string
          p_note: string
          p_record: string
          p_source_hash: string
          p_source_version: number
          p_state: Json
          p_totals: Json
          p_version: number
        }
        Returns: Json
      }
      dated_mail_action: {
        Args: { p_action: string; p_args: Json; p_date: string }
        Returns: Json
      }
      delete_campaign_letter: { Args: { p_id: string }; Returns: undefined }
      delete_letter_reply: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
      }
      edit_campaign_letter: {
        Args: {
          p_content: string
          p_id: string
          p_subject: string
          p_version: number
        }
        Returns: Json
      }
      edit_letter_draft: {
        Args: {
          p_content: string
          p_id: string
          p_subject: string
          p_version: number
        }
        Returns: Json
      }
      edit_letter_reply: {
        Args: { p_content: string; p_id: string; p_version: number }
        Returns: Json
      }
      edit_linked_mail_draft: {
        Args: {
          p_content: string
          p_court: string
          p_id: string
          p_origin: string
          p_role: string
          p_subject: string
          p_unit: string
          p_version: number
        }
        Returns: Json
      }
      get_campaign_calendar: { Args: never; Returns: Json }
      get_campaign_chronology: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      get_campaign_schedule_drafts: { Args: never; Returns: Json }
      get_campaign_schedule_events: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      get_campaign_time_history: { Args: { p_limit?: number }; Returns: Json }
      get_character_age_dashboard: {
        Args: { p_limit?: number; p_target_year?: number; p_year?: number }
        Returns: Json
      }
      get_character_registry_hub: { Args: { p_limit?: number }; Returns: Json }
      get_character_year_transitions: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_house_character_ages: { Args: { p_house: string }; Returns: Json }
      get_public_campaign_time: { Args: never; Returns: Json }
      get_temporal_consumer_dashboard: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_temporal_release_preflight: { Args: never; Returns: Json }
      harptos_advance_desdia: {
        Args: { p_count: number; p_start: string }
        Returns: string
      }
      harptos_calendar_ordinal: { Args: { p_date: string }; Returns: number }
      harptos_from_ordinary_index: {
        Args: { p_index: number }
        Returns: string
      }
      harptos_ordinary_index: { Args: { p_date: string }; Returns: number }
      harptos_time_key: {
        Args: {
          p_day: number
          p_festival: string
          p_month: number
          p_year: number
        }
        Returns: string
      }
      house_gallery_mail_images: { Args: { p_house: string }; Returns: Json }
      import_character_source_candidates: {
        Args: { p_candidates: Json }
        Returns: number
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
      mail_compose_options: { Args: never; Returns: Json }
      mail_insights: { Args: never; Returns: Json }
      mail_insights_grouped: { Args: { p_house_ids: string[] }; Returns: Json }
      mail_overview_grouped: { Args: { p_house_ids: string[] }; Returns: Json }
      mail_page: {
        Args: { p_filters?: Json; p_page?: number; p_size?: number }
        Returns: Json
      }
      mail_recipient_read: { Args: { p_id: string }; Returns: boolean }
      mail_trash_page: {
        Args: { p_filters?: Json; p_page?: number; p_size?: number }
        Returns: Json
      }
      mark_letter_read: { Args: { p_id: string }; Returns: undefined }
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
      preview_campaign_time_change: {
        Args: {
          p_allow_backdate?: boolean
          p_count?: number
          p_date?: string
          p_mode: string
          p_version: number
        }
        Returns: Json
      }
      preview_house_time_impacts: {
        Args: { p_target_date: string; p_version: number }
        Returns: Json
      }
      public_player_houses: {
        Args: never
        Returns: {
          house_id: string
        }[]
      }
      publish_campaign_schedule: {
        Args: {
          p_auto: boolean
          p_date: string
          p_version: number
          p_week: number
        }
        Returns: undefined
      }
      publish_campaign_schedule_confirmed: {
        Args: {
          p_auto: boolean
          p_date: string
          p_version: number
          p_week: number
        }
        Returns: Json
      }
      publish_campaign_time_change: {
        Args: {
          p_allow_backdate?: boolean
          p_count?: number
          p_date?: string
          p_key: string
          p_mode: string
          p_reason?: string
          p_version: number
        }
        Returns: Json
      }
      replay_temporal_delivery: { Args: { p_id: string }; Returns: Json }
      reply_campaign_letter: {
        Args: { p_content: string; p_key: string; p_letter: string }
        Returns: string
      }
      reply_delivery_week: { Args: { p_recipient: string }; Returns: number }
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
      resolve_campaign_time_target: {
        Args: {
          p_count: number
          p_current: string
          p_date: string
          p_mode: string
        }
        Returns: string
      }
      resolve_drive_import: {
        Args: { p_choice: string; p_content?: string; p_id: string }
        Returns: undefined
      }
      resolve_temporal_delivery: {
        Args: {
          p_id: string
          p_note: string
          p_request_key: string
          p_status: string
        }
        Returns: Json
      }
      restore_campaign_letter: { Args: { p_id: string }; Returns: undefined }
      restore_letter_reply: {
        Args: { p_id: string; p_version: number }
        Returns: undefined
      }
      reverse_letter_consequence: {
        Args: {
          p_expected_version: number
          p_id: string
          p_key: string
          p_reason: string
        }
        Returns: Json
      }
      review_character_source: {
        Args: {
          p_action: string
          p_character_id?: string
          p_queue_id: string
          p_reason?: string
        }
        Returns: Json
      }
      save_campaign_character: {
        Args: {
          p_id: string
          p_payload: Json
          p_reason: string
          p_version: number
        }
        Returns: Json
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
      save_campaign_schedule_event: { Args: { p_payload: Json }; Returns: Json }
      save_character_relation: {
        Args: {
          p_from: string
          p_note: string
          p_reason: string
          p_relation: string
          p_to: string
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
      send_linked_mail: {
        Args: {
          p_content: string
          p_court?: string
          p_draft?: boolean
          p_key: string
          p_origin: string
          p_role?: string
          p_subject: string
          p_targets: string[]
          p_unit?: string
          p_week?: number
        }
        Returns: Json
      }
      set_campaign_calendar: {
        Args: { p_auto: boolean; p_date: string; p_version: number }
        Returns: undefined
      }
      set_letter_round: {
        Args: { p_closed: boolean; p_number: number }
        Returns: undefined
      }
      spy_add_desdias: {
        Args: { p_date_key: string; p_rounds: number }
        Returns: string
      }
      spy_assign_agent_portrait: {
        Args: {
          p_agent: string
          p_expected_version: number
          p_house: string
          p_portrait: string
        }
        Returns: Json
      }
      spy_buy_agent_upgrade: {
        Args: {
          p_agent: string
          p_code: string
          p_expected_agent_version: number
          p_expected_house_version: number
          p_house: string
          p_key: string
        }
        Returns: Json
      }
      spy_campaign_ordinal: { Args: { p_key: string }; Returns: number }
      spy_cancel_house_mission: {
        Args: {
          p_expected_version: number
          p_house: string
          p_operation: string
          p_request_key: string
        }
        Returns: Json
      }
      spy_cormyr_mission_route: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      spy_cormyr_normalize_region: { Args: { v: string }; Returns: string }
      spy_create_agent: {
        Args: {
          p_codename: string
          p_house: string
          p_portrait: string
          p_request_key: string
          p_source_holding: string
          p_upgrades: string[]
        }
        Returns: Json
      }
      spy_get_regional_strategy: { Args: { p_house: string }; Returns: Json }
      spy_house_counterintelligence: {
        Args: { p_house: string }
        Returns: Json
      }
      spy_house_management: { Args: { p_house: string }; Returns: Json }
      spy_house_mission_timeline: { Args: { p_house: string }; Returns: Json }
      spy_intelligence_admin_action: {
        Args: {
          p_action: string
          p_dossier: string
          p_objective: string
          p_reason: string
          p_resources?: Json
          p_subject_key: string
        }
        Returns: Json
      }
      spy_intelligence_admin_options: {
        Args: { p_dossier: string }
        Returns: Json
      }
      spy_intelligence_admin_pending: { Args: never; Returns: Json }
      spy_intelligence_capacity: { Args: { p_margin: number }; Returns: number }
      spy_intelligence_finalize: {
        Args: { p_operation: string; p_resources?: Json }
        Returns: Json
      }
      spy_intelligence_operation_status: {
        Args: { p_operation: string }
        Returns: Json
      }
      spy_intelligence_read: { Args: { p_house?: string }; Returns: Json }
      spy_intelligence_source_items: {
        Args: { p_objective: string; p_resources?: Json; p_target: string }
        Returns: Json
      }
      spy_narrator_incident_history: { Args: never; Returns: Json }
      spy_narrator_noble_defense_source: {
        Args: { p_house: string }
        Returns: Json
      }
      spy_narrator_operations_dashboard: { Args: never; Returns: Json }
      spy_official_date_key: { Args: never; Returns: string }
      spy_player_mission_preview: {
        Args: { p_agent: string; p_house: string; p_target: string }
        Returns: Json
      }
      spy_public_noble_targets: {
        Args: never
        Returns: {
          id: string
          name: string
          region: string
        }[]
      }
      spy_recruit_agent: {
        Args: {
          p_codename: string
          p_house: string
          p_request_key: string
          p_source_holding: string
        }
        Returns: Json
      }
      spy_recruitment_options: { Args: { p_house: string }; Returns: Json }
      spy_remove_agent: {
        Args: {
          p_agent: string
          p_expected_agent_version: number
          p_expected_house_version: number
          p_house: string
          p_request_key: string
        }
        Returns: Json
      }
      spy_rename_agent: {
        Args: {
          p_agent: string
          p_expected_version: number
          p_house: string
          p_name: string
          p_request_key: string
        }
        Returns: Json
      }
      spy_resolve_agent_mission: {
        Args: {
          p_discovered: boolean
          p_expected_version: number
          p_guard_override: boolean
          p_modifier: number
          p_operation: string
          p_prison_override: boolean
          p_reason: string
          p_request_key: string
          p_roll: number
        }
        Returns: Json
      }
      spy_review_region_link: {
        Args: {
          p_approved: boolean
          p_bidirectional: boolean
          p_blocked: boolean
          p_expected_version: number
          p_from: string
          p_id: string
          p_passage: string
          p_reason: string
          p_request_key: string
          p_source: string
          p_to: string
          p_visibility: string
        }
        Returns: Json
      }
      spy_submit_house_mission:
        | {
            Args: {
              p_agent: string
              p_destination: string
              p_expected_agent_version: number
              p_expected_calendar_version: number
              p_house: string
              p_request_key: string
              p_target: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_agent: string
              p_destination: string
              p_expected_agent_version: number
              p_expected_calendar_version: number
              p_house: string
              p_objective: string
              p_request_key: string
              p_target: string
            }
            Returns: Json
          }
      stage_campaign_character_sources: { Args: never; Returns: Json }
      start_campaign_representation: {
        Args: { p_player: string }
        Returns: undefined
      }
      stop_campaign_representation: { Args: never; Returns: undefined }
      temporal_season_crossings: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      valid_campaign_date: { Args: { v: string }; Returns: boolean }
      validate_mail_links: {
        Args: {
          p_court: string
          p_origin: string
          p_role: string
          p_unit: string
        }
        Returns: number
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
