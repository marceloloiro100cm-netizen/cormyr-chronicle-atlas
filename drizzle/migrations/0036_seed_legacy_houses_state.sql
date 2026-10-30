-- Superseded by 0042_reconcile_house_workbooks.sql.
-- Original snapshots are retained there for exact-state reconciliation.
-- The original importer cast text house IDs to UUID, omitted required updated_by,
-- wrote nonexistent ledger columns before/after, and overwrote existing states.
-- Keep this migration slot, but defer data writes to the guarded, audited import.
SELECT 1;
