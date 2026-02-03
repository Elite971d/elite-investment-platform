# Admin Override Panel – Member vs Internal Tools

## Separation

| Category | Where defined | Shown in dashboard? | Shown in pricing? | How access is granted |
|----------|----------------|---------------------|-------------------|------------------------|
| **Member tools** | `js/tools-config.js` → `MEMBER_TOOLS` | Yes | Yes (via tiers) | Tier override; member product entitlements |
| **Internal tools** | `js/tools-config.js` → `INTERNAL_TOOLS` | No | No | Admin grant/revoke only (Override Panel) |

## Member tools

- **Calculators**: Property Offer, BRRRR, Rehab Tracker, PWT, Deal Check, Commercial (tier-gated).
- **Academy access**: Elite/Pro and Academy tiers.

These are the only tools/features that appear in the member dashboard and on the public pricing page. Access is controlled by membership tier (or admin tier override).

## Internal tools

- **Investor Buy Box** (product key: `internal_investor_buy_box`).
- Add more in `INTERNAL_TOOLS` in `js/tools-config.js` as needed.

Internal tools:

- Never appear in the member dashboard.
- Never appear in pricing or any public tier matrix.
- Are only accessible when an admin has granted the corresponding entitlement (e.g. `internal_investor_buy_box`).

## Admin abilities (Override Panel)

1. **Override member tier** (User & Tier tab)  
   - Requires a **reason** for every override (audit).

2. **Grant internal tool access** (Override Panel tab)  
   - Target email + **reason** required.  
   - Calls `POST /api/admin/grant-entitlement` with `product_key` = e.g. `internal_investor_buy_box`.  
   - Backend must accept `internal_*` product keys and record `reason` in audit.

3. **Revoke internal tool access** (Override Panel tab)  
   - Target email + **reason** required.  
   - Calls `POST /api/admin/revoke-entitlement` with `target_email`, `product_key`, `reason`.  
   - Backend should set the matching entitlement to `canceled` (or equivalent) and write an audit log entry (e.g. `entitlement_revoke`).

## Grant Entitlement tab

- For **member** product keys only (e.g. `calc_starter`, `academy_pro`).
- **Reason** is required for every grant.
- For internal tools, use the **Override Panel** tab instead.

## Backend requirements

- **Tier override**: `POST /api/admin/tier-override` must require `reason` and insert into `audit_log` with `action_type = 'TIER_CHANGE'`, `tool_scope` set by context (e.g. member tier → `calculator` or `academy` as appropriate), `previous_value`/`new_value` for tier.
- **Grant entitlement**: `POST /api/admin/grant-entitlement` must require `reason`, accept `internal_tool: true` and `product_key` values starting with `internal_`. Insert into `audit_log` with `action_type = 'GRANT'` and:
  - **Investor Buy Box / internal tools**: `tool_scope = 'internal'`.
  - **Member calculator products**: `tool_scope = 'calculator'`.
  - **Academy products**: `tool_scope = 'academy'`.
- **Revoke entitlement**: `POST /api/admin/revoke-entitlement` with body `{ target_email, product_key, reason }` must update/cancel the entitlement and insert into `audit_log` with `action_type = 'REVOKE'` and the same `tool_scope` rules as grant. See `admin/AUDIT_LOG_SCHEMA.md` for the full audit schema.

## Single source of truth

- **`js/tools-config.js`**: `MEMBER_TOOLS`, `INTERNAL_TOOLS`, `getMemberTools()`, `getInternalTools()`, `isInternalTool()`, `isInternalProductKey()`.
- **`js/tier-config.js`**: `TOOL_ACCESS` contains only member tool IDs; internal tools must never be added there.
