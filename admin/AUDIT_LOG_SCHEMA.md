# Audit Log Schema (Clean + Safe)

## Table: `audit_log`

| Column          | Type      | Constraints |
|-----------------|-----------|-------------|
| id              | uuid      | PK, default gen_random_uuid() |
| actor_email     | text      | |
| action_type     | text      | NOT NULL, CHECK IN ('GRANT', 'REVOKE', 'TIER_CHANGE') |
| target_email    | text      | |
| tool_scope      | text      | NOT NULL, CHECK IN ('calculator', 'academy', 'internal') |
| tool_name       | text      | |
| previous_value  | text      | |
| new_value       | text      | |
| reason          | text      | NOT NULL (required) |
| created_at      | timestamptz | DEFAULT NOW() |

## Tool scope rules

- **Investor Buy Box** (and all internal tools): log with `tool_scope = 'internal'`.
- **Member calculator** grants/revokes (e.g. calc_starter, Property Offer, BRRRR, Deal Check): log with `tool_scope = 'calculator'`.
- **Academy** grants/revokes (e.g. academy_starter, academy_pro, academy_premium): log with `tool_scope = 'academy'`.

Backend/API must set `tool_scope` accordingly when writing audit rows.

## Integrity and immutability

- **Append-only**: RLS has no UPDATE or DELETE policies. Only INSERT is allowed (service role or authenticated admins).
- **Trigger enforcement**: `BEFORE UPDATE` and `BEFORE DELETE` triggers raise an exception so rows cannot be modified or removed at the database level.
- **Required reason**: `reason` is NOT NULL so every audit entry is justified.

## Migration

Run `supabase/migrations/004_audit_log_schema.sql` after `001_membership_automation.sql`. The previous `audit_log` table is renamed to `audit_log_legacy`; the new table uses the schema above.
