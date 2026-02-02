# Admin Panel - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                              │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     /admin.html                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │  │
│  │  │ User Search │  │ Tier Update │  │ Audit Log Viewer │  │  │
│  │  └─────────────┘  └─────────────┘  └──────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │           Grant Entitlement Form                   │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                               ▲                                  │
│                               │                                  │
│                               ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     (admin.html)                        │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │ Security Layer 1: Client-Side Protection             │ │  │
│  │  │ • Session verification                                │ │  │
│  │  │ • Admin role check (UX only)                         │ │  │
│  │  │ • Redirect non-admins                                │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬───────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        ┌───────────────┐  ┌────────────────┐  ┌──────────────┐
        │  Supabase     │  │  API Endpoint  │  │ API Endpoint │
        │  Direct RLS   │  │  tier-override │  │     grant    │
        │  (Audit Read) │  │                │  │  entitlement │
        └───────┬───────┘  └────────┬───────┘  └──────┬───────┘
                │                   │                   │
                │                   │                   │
┌───────────────┴───────────────────┴───────────────────┴──────────┐
│                     SECURITY LAYER 2 & 3                          │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ API Layer (Serverless Functions)                          │   │
│  │ • Verify Bearer token                                     │   │
│  │ • Check admin role server-side                            │   │
│  │ • Use service_role key                                    │   │
│  │ • Write audit_log                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                               │                                  │
│                               ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Supabase (PostgreSQL + RLS)                               │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐  │   │
│  │  │   profiles   │  │  entitlements  │  │  audit_log   │  │   │
│  │  │              │  │                │  │              │  │   │
│  │  │ • tier       │  │ • product_key  │  │ • action     │  │   │
│  │  │ • role       │  │ • expires_at   │  │ • actor      │  │   │
│  │  │ • email      │  │ • status       │  │ • target     │  │   │
│  │  │              │  │                │  │ • metadata   │  │   │
│  │  └──────────────┘  └────────────────┘  └──────────────┘  │   │
│  │                                                            │   │
│  │  RLS Policies:                                            │   │
│  │  • Admins can read all profiles ✓                         │   │
│  │  • Admins can update any profile ✓                        │   │
│  │  • Admins can read audit_log ✓                            │   │
│  │  • Service role can write entitlements ✓                  │   │
│  │  • Service role can write audit_log ✓                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Request Flow

### 1. Page Load & Authentication

```
User navigates to /admin.html
          │
          ▼
    admin.js loads
          │
          ▼
    Check Supabase session
          │
          ├─► No session? → Redirect to /login.html
          │
          ▼
    Session exists
          │
          ▼
    Fetch profile.role via RLS
          │
          ├─► role !== 'admin'? → Show "Access Denied"
          │
          ▼
    role === 'admin'
          │
          ▼
    Show admin panel ✓
```

### 2. User Search Flow

```
Admin enters email
          │
          ▼
    Click "Search"
          │
          ▼
    searchUser(email)
          │
          ▼
    Query: SELECT * FROM profiles WHERE email = ?
          │
          ├─► RLS Check: Is auth.uid() admin?
          │         │
          │         ├─► No: Return empty set
          │         └─► Yes: Return profile ✓
          │
          ▼
    Display user card with:
    • Current tier
    • Role
    • Member since
    • Email
```

### 3. Tier Override Flow

```
Admin selects new tier
          │
          ▼
    Click "Save Tier"
          │
          ▼
    saveTierOverride()
          │
          ▼
    POST /api/admin/tier-override
    Headers: { Authorization: Bearer <token> }
    Body: { target_email, new_tier, reason }
          │
          ▼
┌─────────────────────────────────────────────────┐
│         API Endpoint Security Checks            │
│  1. Verify Bearer token is valid                │
│  2. Extract user ID from token                  │
│  3. Query profiles: role = ?                    │
│  4. If role !== 'admin': return 403 ✗           │
│  5. If admin: continue ✓                        │
└─────────────────────────────────────────────────┘
          │
          ▼
    Fetch target user profile
          │
          ▼
    Update profiles SET tier = new_tier
    (using service_role key to bypass RLS)
          │
          ▼
    Insert audit_log:
    {
      actor_user_id: <admin_id>,
      actor_email: <admin_email>,
      action: 'tier_override',
      target_user_id: <target_id>,
      target_email: <target_email>,
      metadata: {
        old_tier: 'starter',
        new_tier: 'elite',
        reason: 'Support ticket #123'
      }
    }
          │
          ▼
    Return success ✓
          │
          ▼
    Client updates UI
```

### 4. Grant Entitlement Flow

```
Admin fills form:
• target_email
• product_key
• expires_at (optional)
          │
          ▼
    Click "Grant Entitlement"
          │
          ▼
    grantEntitlement()
          │
          ▼
    POST /api/admin/grant-entitlement
    Headers: { Authorization: Bearer <token> }
    Body: { target_email, product_key, expires_at }
          │
          ▼
┌─────────────────────────────────────────────────┐
│         API Endpoint Security Checks            │
│  1. Verify Bearer token is valid                │
│  2. Extract user ID from token                  │
│  3. Query profiles: role = ?                    │
│  4. If role !== 'admin': return 403 ✗           │
│  5. Validate product_key ∈ ALLOWED_KEYS         │
│  6. If valid: continue ✓                        │
└─────────────────────────────────────────────────┘
          │
          ▼
    Lookup target user (optional)
          │
          ▼
    Insert entitlements:
    {
      user_id: <target_id> or null,
      email: <target_email>,
      product_key: 'academy_pro',
      status: 'active',
      expires_at: '2026-12-31' or null,
      source: 'admin_grant'
    }
    (using service_role key)
          │
          ▼
    Insert audit_log:
    {
      actor_user_id: <admin_id>,
      actor_email: <admin_email>,
      action: 'entitlement_grant',
      target_email: <target_email>,
      metadata: {
        product_key: 'academy_pro',
        expires_at: '2026-12-31'
      }
    }
          │
          ▼
    Return success ✓
          │
          ▼
    Client shows success message
```

### 5. Audit Log View Flow

```
Admin clicks "Audit Log" tab
          │
          ▼
    Apply filters (optional):
    • action type
    • target email
    • date range
          │
          ▼
    Click "Load"
          │
          ▼
    loadAuditLog()
          │
          ▼
    Query: SELECT * FROM audit_log
           WHERE action = ? AND target_email = ?
           AND created_at >= ? AND created_at <= ?
           ORDER BY created_at DESC
           LIMIT 200
          │
          ├─► RLS Check: Is auth.uid() admin?
          │         │
          │         ├─► No: Return empty set ✗
          │         └─► Yes: Return records ✓
          │
          ▼
    Render table with:
    • Date (formatted)
    • Action
    • Actor (email)
    • Target (email)
    • Metadata (JSON)
```

## Security Layers

### Layer 1: Client-Side (UX Protection)

**Purpose:** Improve user experience by hiding UI from non-admins

**Location:** `admin.js`

**Checks:**
1. Supabase session exists
2. Profile role = 'admin'
3. Redirect if not admin

**Limitation:** Can be bypassed with browser tools

**Why it's not enough:** Never trust client-side checks for security

---

### Layer 2: Database RLS (Data Protection)

**Purpose:** Enforce access control at database level

**Location:** Supabase PostgreSQL

**Policies:**

```sql
-- Admins can read all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can read audit log
CREATE POLICY "Admins can read audit_log"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can write audit log
CREATE POLICY "Service role can insert audit_log"
  ON audit_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Service role can manage entitlements
CREATE POLICY "Service role can manage entitlements"
  ON entitlements FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
```

**Strength:** Cannot be bypassed from client

**Limitation:** Requires service_role for some operations

---

### Layer 3: API Verification (Mutation Protection)

**Purpose:** Verify admin role before allowing sensitive operations

**Location:** `/api/admin/*` serverless functions

**Process:**

1. Extract Bearer token from Authorization header
2. Verify token with Supabase (get user ID)
3. Query profiles table for user's role
4. If role !== 'admin': return 403 Forbidden
5. If admin: use service_role key to perform mutation
6. Write audit_log entry

**Code Example:**

```typescript
// Verify token and get user
const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
if (error || !user) {
  return res.status(401).json({ error: 'Invalid token' });
}

// Check admin role
const { data: adminProfile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single();

if (adminProfile?.role !== 'admin') {
  return res.status(403).json({ error: 'Admin only' });
}

// Admin verified - perform mutation with service_role
// ...
```

**Strength:** Server-side, cannot be bypassed

**Result:** True security enforced here

---

## Data Flow Summary

```
┌──────────────┐
│   Browser    │
│  (Untrusted) │
└──────┬───────┘
       │
       │ 1. Session token
       ▼
┌──────────────┐
│   RLS Layer  │    ← Can read if admin
│  (Supabase)  │    ← Cannot write directly
└──────┬───────┘
       │
       │ 2. API call with Bearer token
       ▼
┌──────────────┐
│  API Layer   │    ← Verifies admin role
│ (Serverless) │    ← Uses service_role key
└──────┬───────┘
       │
       │ 3. Privileged write
       ▼
┌──────────────┐
│   Database   │    ← Writes with service_role
│ (PostgreSQL) │    ← Logs audit entry
└──────────────┘
```

## Key Design Decisions

### 1. Why separate admin.js from admin.html?

**Decision:** Keep HTML structure and JavaScript logic in separate files

**Rationale:**
- Better maintainability
- Clear separation of concerns
- Easier to debug
- More professional structure

### 2. Why use API endpoints instead of direct RLS writes?

**Decision:** All mutations go through `/api/admin/*` endpoints

**Rationale:**
- Ensures audit logging (atomic with mutation)
- Allows server-side validation
- Prevents client from bypassing audit
- Enables additional business logic

### 3. Why store both user_id and email in audit_log?

**Decision:** Log both `actor_user_id` and `actor_email`

**Rationale:**
- User ID for referential integrity
- Email for human readability
- Works even if user is deleted
- Easier to search by email

### 4. Why limit audit log to 200 records?

**Decision:** Load last 200 records, not all

**Rationale:**
- Prevents slow page loads
- Sufficient for most audits
- Can use filters for specific searches
- Future: add pagination if needed

## File Structure

```
/admin/
├── admin.html              # UI (439 lines)
│   ├── Tab: User & Tier
│   ├── Tab: Audit Log
│   └── Tab: Grant Entitlement
│
├── admin.js                # Logic (541 lines)
│   ├── Configuration
│   ├── Utility functions
│   ├── User search
│   ├── Tier override
│   ├── Audit log viewer
│   ├── Grant entitlement
│   └── Access control
│
├── README.md               # Complete documentation
├── QUICK_START.md          # Getting started guide
├── IMPLEMENTATION_SUMMARY.md  # Technical details
├── FEATURES_CHECKLIST.md   # Verification
└── ARCHITECTURE.md         # This file
```

## Dependencies

### External Libraries

- **Supabase JS SDK** (v2)
  - Loaded from: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`
  - Purpose: Database client and authentication
  - Type: ES6 module

### Browser Requirements

- **ES6 Modules:** Chrome 61+, Firefox 60+, Safari 11+, Edge 79+
- **Fetch API:** All modern browsers
- **Async/Await:** All modern browsers
- **Top-level await:** Chrome 89+, Firefox 89+, Safari 15+

### API Requirements

- **Vercel Serverless Functions** (Node.js)
- **@vercel/node** package
- **@supabase/supabase-js** package

## Environment Variables

### Client-Side (Public)

```javascript
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### Server-Side (Secret)

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # SECRET!
```

## Deployment Checklist

- [ ] Upload `/admin.html` to hosting
- [ ] Upload `(admin.html)` to hosting  
- [ ] Deploy API endpoints to Vercel
- [ ] Set environment variables in Vercel
- [ ] Run database migrations
- [ ] Set first admin role in database
- [ ] Test access control
- [ ] Test tier override
- [ ] Test entitlement grant
- [ ] Test audit log viewer
- [ ] Verify RLS policies
- [ ] Check API authentication

## Monitoring & Maintenance

### What to Monitor

1. **Audit Log Growth**
   - Check table size monthly
   - Archive old records if needed

2. **Admin Actions**
   - Review audit log weekly
   - Investigate unusual patterns

3. **API Errors**
   - Check Vercel logs for 403/500 errors
   - Monitor failed admin requests

### Maintenance Tasks

1. **Weekly:** Review audit log
2. **Monthly:** Check for unauthorized admin access attempts
3. **Quarterly:** Audit list of admins, remove inactive
4. **Yearly:** Review and update documentation

---

**Architecture Status:** Complete and production-ready ✅
