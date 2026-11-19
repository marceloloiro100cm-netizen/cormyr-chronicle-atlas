// Source column types from the checked-in database contract. No campaign data.
export const columnTypes = {
  "battle_dnd_cormyr_monsters": {
    "ac": "number",
    "catalog_version": "number",
    "challenge_rating": "number",
    "hp": "number",
    "melee": "Json",
    "ranged": "Json",
    "speed_ft": "number"
  },
  "battle_dnd_custom_monsters": {
    "catalog_version": "number",
    "payload": "Json"
  },
  "battle_dnd_monster_overrides": {
    "combat_patch": "Json"
  },
  "battle_dnd_sessions": {
    "replay": "Json",
    "report": "Json"
  },
  "battle_dnd_verified_sources": {
    "combat_defaults": "Json"
  },
  "battle_house_roster_imports": {
    "quantity": "number",
    "simulation_only": "boolean",
    "source_row": "number",
    "standard_unit_strength": "number"
  },
  "battle_sim_events": {
    "command_json": "Json",
    "event_json": "Json",
    "seq": "number"
  },
  "battle_sim_scenarios": {
    "map_json": "Json",
    "schema_version": "number",
    "units_json": "Json"
  },
  "battle_sim_sessions": {
    "current_state_json": "Json",
    "initial_state_json": "Json",
    "schema_version": "number",
    "state_version": "number"
  },
  "campaign_access_profiles": {
    "active": "boolean"
  },
  "campaign_admin_audit": {
    "details": "Json"
  },
  "campaign_calendar": {
    "auto_advance": "boolean",
    "day": "number",
    "id": "boolean",
    "last_round": "number",
    "month": "number",
    "published_week": "number",
    "version": "number",
    "year": "number"
  },
  "campaign_calendar_audit": {
    "after_state": "Json",
    "before_state": "Json"
  },
  "campaign_characters": {
    "aliases": "string[]",
    "baseline_age": "number",
    "baseline_year": "number",
    "birth_year": "number",
    "death_year": "number",
    "is_noble": "boolean",
    "noble_roles": "string[]",
    "version": "number"
  },
  "campaign_houses": {
    "active": "boolean",
    "season": "number"
  },
  "campaign_letter_consequences": {
    "active": "boolean",
    "changes": "Json"
  },
  "campaign_letters": {
    "creation_week": "number",
    "delivery_week": "number",
    "house_sheet_version": "number",
    "letter_number": "number",
    "version": "number"
  },
  "campaign_migration_backups": {
    "snapshot": "Json"
  },
  "campaign_newspaper_commissions": {
    "cost_wealth": "number"
  },
  "campaign_newspaper_engravings": {
    "in_collection": "boolean"
  },
  "campaign_newspaper_reads": {
    "read_version": "number"
  },
  "campaign_newspaper_revisions": {
    "id": "number",
    "previous_version": "number",
    "snapshot": "Json"
  },
  "campaign_newspaper_settings": {
    "id": "boolean"
  },
  "campaign_newspaper_staff": {
    "sort_order": "number"
  },
  "campaign_newspaper_story_models": {
    "blocks": "Json"
  },
  "campaign_newspapers": {
    "blocks": "Json",
    "edition_no": "number",
    "publication_revision": "number",
    "version": "number"
  },
  "campaign_players": {
    "active": "boolean",
    "require_password_change": "boolean"
  },
  "campaign_private_gm_content": {
    "payload": "Json"
  },
  "campaign_private_vassal_workbooks": {
    "payload": "Json"
  },
  "campaign_records": {
    "version": "number"
  },
  "campaign_schedule_event_audit": {
    "after_state": "Json",
    "before_state": "Json"
  },
  "campaign_schedule_events": {
    "draft_deleted": "boolean",
    "version": "number"
  },
  "campaign_temporal_consumers": {
    "enabled": "boolean"
  },
  "campaign_temporal_deliveries": {
    "calendar_version": "number",
    "payload": "Json"
  },
  "campaign_time_operations": {
    "after_state": "Json",
    "before_state": "Json",
    "expected_version": "number"
  },
  "character_registry_audit": {
    "after_state": "Json",
    "before_state": "Json"
  },
  "character_review_queue": {
    "claimed_age": "number",
    "claimed_age_year": "number",
    "claimed_birth_year": "number",
    "evidence": "Json"
  },
  "character_source_links": {
    "source_reference": "Json"
  },
  "character_year_transitions": {
    "calendar_version": "number",
    "from_year": "number",
    "to_year": "number"
  },
  "drive_sync_bindings": {
    "enabled": "boolean",
    "privacy_reviewed": "boolean",
    "runtime_authorized": "boolean"
  },
  "drive_sync_files": {
    "base_snapshot": "Json"
  },
  "drive_sync_inbox": {
    "folder_snapshot": "Json",
    "site_snapshot": "Json"
  },
  "house_catalog": {
    "archive_data": "Json",
    "gallery": "Json",
    "public_reviewed": "boolean"
  },
  "house_memberships": {
    "can_edit": "boolean",
    "can_edit_attributes": "boolean"
  },
  "letter_replies": {
    "creation_week": "number",
    "delivery_week": "number",
    "version": "number"
  },
  "letter_reply_versions": {
    "snapshot": "Json",
    "version": "number"
  },
  "letter_rounds": {
    "closed": "boolean",
    "number": "number"
  },
  "letter_versions": {
    "snapshot": "Json",
    "version": "number"
  },
  "mail_submissions": {
    "request": "Json"
  },
  "narrator_mail_notes": {
    "notes": "Json"
  },
  "noble_house_drive_exports": {
    "exported_version": "number"
  },
  "noble_house_gm_notes": {
    "secret_state": "Json"
  },
  "noble_house_ledger": {
    "after_state": "Json",
    "before_state": "Json",
    "campaign_month": "number",
    "version": "number"
  },
  "noble_house_rule_overrides": {
    "definition": "Json",
    "version": "number"
  },
  "noble_house_sheets": {
    "state": "Json",
    "version": "number"
  },
  "noble_house_source_links": {
    "after_version": "number",
    "before_state": "Json",
    "confirmed_totals": "Json",
    "source_snapshot": "Json",
    "source_version": "number"
  },
  "public_archive_roots": {
    "enabled": "boolean"
  },
  "record_versions": {
    "snapshot": "Json",
    "version": "number"
  },
  "spy_agent_history": {
    "calendar_version": "number",
    "cunning": "number",
    "failure_degrees": "number",
    "guard_present": "boolean",
    "law_snapshot": "number",
    "modifier": "number",
    "prison_present": "boolean",
    "roll_total": "number",
    "target_difficulty": "number",
    "total_successes": "number"
  },
  "spy_agent_removals": {
    "refunded_wealth": "number"
  },
  "spy_agent_upgrades": {
    "cost_wealth": "number"
  },
  "spy_assets": {
    "mission_successes": "number",
    "version": "number"
  },
  "spy_cormyr_mission_links": {
    "active": "boolean"
  },
  "spy_dossier_facts": {
    "approved": "boolean",
    "disclosed_value": "Json"
  },
  "spy_dossiers": {
    "version": "number"
  },
  "spy_intel_reports": {
    "facts": "Json",
    "requested_fields": "string[]",
    "version": "number"
  },
  "spy_intelligence_admin_audit": {
    "after_snapshot": "Json",
    "before_snapshot": "Json"
  },
  "spy_intelligence_events": {
    "calendar_version": "number",
    "new_snapshot": "Json",
    "previous_snapshot": "Json"
  },
  "spy_intelligence_findings": {
    "value_snapshot": "Json"
  },
  "spy_intelligence_mission_awards": {
    "refreshed_count": "number",
    "reveal_capacity": "number",
    "revealed_count": "number",
    "success_degrees": "number"
  },
  "spy_legacy_seed_archive": {
    "archived_snapshot": "Json"
  },
  "spy_locations": {
    "approved": "boolean",
    "version": "number"
  },
  "spy_mission_decisions": {
    "difficulty": "number",
    "law_source_version": "number",
    "modifiers": "Json",
    "target_law": "number"
  },
  "spy_mission_timeline": {
    "route": "Json",
    "source_calendar_version": "number",
    "travel_days": "number",
    "travel_rounds": "number"
  },
  "spy_noble_house_stats": {
    "budget": "number",
    "defense": "number",
    "difference": "number",
    "influence": "number",
    "lands": "number",
    "law": "number",
    "population": "number",
    "power": "number",
    "source_row": "number",
    "total": "number",
    "wealth": "number"
  },
  "spy_operation_events": {
    "calendar_version": "number"
  },
  "spy_operation_segments": {
    "duration_days": "number",
    "edge_version": "number",
    "ordinal": "number"
  },
  "spy_operations": {
    "requested_fields": "string[]",
    "source_calendar_version": "number",
    "version": "number"
  },
  "spy_portrait_catalog": {
    "active": "boolean",
    "sort_order": "number"
  },
  "spy_region_links": {
    "approved": "boolean",
    "bidirectional": "boolean",
    "blocked": "boolean",
    "version": "number"
  },
  "spy_rule_sets": {
    "definition": "Json",
    "version": "number"
  },
  "spy_temporal_deliveries": {
    "calendar_version": "number"
  },
  "spy_travel_edges": {
    "approved": "boolean",
    "base_days": "number",
    "bidirectional": "boolean",
    "blocked": "boolean",
    "version": "number"
  },
  "sync_conflicts": {
    "folder_snapshot": "Json",
    "site_snapshot": "Json"
  },
  "sync_outbox": {
    "attempts": "number",
    "payload": "Json",
    "version": "number"
  }
};
