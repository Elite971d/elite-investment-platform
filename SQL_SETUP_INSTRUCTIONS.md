# SQL Setup Instructions

## ⚠️ Important: Which File to Run

**DO NOT** run the README.md file as SQL. It's a markdown documentation file.

## ✅ Correct SQL Files

Run these SQL files in Supabase SQL Editor:

### Option 1: Complete Schema (Recommended)

Run **`supabase/complete-schema.sql`** - This is a single file with everything you need:
- Main tables (profiles, payments)
- Admin role support
- All RLS policies
- Functions and triggers
- Indexes

**Steps:**
1. Go to Supabase Dashboard → Your Project
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open `supabase/complete-schema.sql` in your code editor
5. Copy the **entire contents** (Ctrl+A, Ctrl+C)
6. Paste into Supabase SQL Editor
7. Click **Run** (or press Ctrl+Enter)

### Option 2: Run Files Separately

If you prefer to run files separately:

1. **First**: Run `supabase/schema.sql`
2. **Then**: Run `supabase/schema-admin.sql`

## 🔧 Setting Your First Admin

After running the schema, set yourself as admin:

```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

Replace `your-email@example.com` with your actual email address.

## ✅ Verify Setup

Check that tables were created:

```sql
-- Should return: profiles, payments
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'payments');
```

Check that your admin role was set:

```sql
-- Should return your email with role = 'admin'
SELECT email, role, tier 
FROM profiles 
WHERE email = 'your-email@example.com';
```

## 🐛 Common Errors

### "syntax error at or near #"
- **Cause**: You're trying to run a markdown file (README.md) as SQL
- **Solution**: Use `supabase/complete-schema.sql` instead

### "relation already exists"
- **Cause**: Tables already created from a previous run
- **Solution**: Either drop existing tables first, or use `CREATE TABLE IF NOT EXISTS` (already included)

### "permission denied"
- **Cause**: Not using the SQL Editor (which has admin privileges)
- **Solution**: Always run SQL in Supabase SQL Editor, not via API

## 📝 File Reference

| File | Purpose | When to Use |
|------|---------|-------------|
| `supabase/complete-schema.sql` | Complete schema (recommended) | First-time setup |
| `supabase/schema.sql` | Main schema only | If you want to run separately |
| `supabase/schema-admin.sql` | Admin role additions | After main schema |
| `README.md` | Documentation | **DO NOT RUN AS SQL** |
