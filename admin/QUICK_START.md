# Admin Panel - Quick Start Guide

## 🚀 Getting Started

### Step 1: Set Your First Admin

Run this SQL in Supabase SQL Editor:

```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

Replace `your-email@example.com` with your actual email address.

### Step 2: Access the Admin Panel

1. Go to: `https://invest.elitesolutionsnetwork.com/admin/admin.html`
2. Log in with your admin account
3. Admin panel will load automatically

### Step 3: Verify Access

You should see:
- ✅ Admin Panel header
- ✅ Three tabs: User & Tier, Audit Log, Grant Entitlement
- ✅ Your email in top right corner

## 📋 Common Tasks

### Change a User's Tier

1. Click **"User & Tier"** tab
2. Enter user email
3. Click **"Search"**
4. Select new tier from dropdown
5. Add reason (optional but recommended)
6. Click **"Save Tier"**

**Example:**
- Search: `john@example.com`
- New Tier: `elite`
- Reason: `Support ticket #456 - upgrade request`

### Grant Product Access

1. Click **"Grant Entitlement"** tab
2. Enter target email
3. Select product (e.g., `academy_pro`)
4. Set expiration date (or leave empty)
5. Click **"Grant Entitlement"**

**Example:**
- Email: `jane@example.com`
- Product: `academy_pro`
- Expires: `2026-12-31` (or empty for permanent)

### View Audit History

1. Click **"Audit Log"** tab
2. Apply filters (optional):
   - Action type
   - Target email
   - Date range
3. Click **"Load"**
4. Review actions

## 🔐 Security

### What's Protected

✅ Session authentication required  
✅ Admin role verified on load  
✅ API endpoints verify admin server-side  
✅ All actions logged to audit_log  
✅ RLS policies enforce database security  

### What to Avoid

❌ Don't share admin credentials  
❌ Don't skip the "reason" field for tier changes  
❌ Don't delete audit logs (not possible anyway)  
❌ Don't give admin role to untrusted users  

## ⚠️ Important Notes

1. **Always add a reason** when changing tiers (for accountability)

2. **Check audit log regularly** to monitor admin actions

3. **Tier changes are immediate** - user access updates instantly

4. **Entitlements are additive** - granting doesn't remove existing ones

5. **Audit logs are permanent** - cannot be edited or deleted

## 🛠️ Troubleshooting

### "Access Denied"

**Problem:** You see "Access Denied" screen

**Solution:** Your account doesn't have admin role. Run the SQL to set it:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

### "User not found"

**Problem:** Search returns "User not found"

**Solutions:**
- Check email spelling (search is case-insensitive)
- Verify user has signed up and has a profile
- Check if email exists in Supabase Auth dashboard

### "Failed to update tier"

**Problem:** Tier save fails

**Solutions:**
1. Check browser console for errors
2. Verify API endpoint is deployed
3. Check Supabase connection
4. Try refreshing page and logging in again

### Audit log is empty

**Problem:** No records show in audit log

**Solutions:**
- Remove all filters and click "Load"
- Verify you have admin role
- Check if any admin actions have occurred
- Check browser console for RLS errors

## 📊 What Gets Logged

### Tier Override
```json
{
  "action": "tier_override",
  "actor_email": "admin@example.com",
  "target_email": "user@example.com",
  "metadata": {
    "old_tier": "starter",
    "new_tier": "elite",
    "reason": "Support ticket #123"
  }
}
```

### Entitlement Grant
```json
{
  "action": "entitlement_grant",
  "actor_email": "admin@example.com",
  "target_email": "user@example.com",
  "metadata": {
    "product_key": "academy_pro",
    "expires_at": "2026-12-31T23:59:59Z"
  }
}
```

## 🎯 Best Practices

### For Tier Changes

✅ **DO:** Add descriptive reasons  
✅ **DO:** Verify user email before saving  
✅ **DO:** Check current tier first  
✅ **DO:** Review audit log after changes  

❌ **DON'T:** Change tiers without documentation  
❌ **DON'T:** Skip verification step  
❌ **DON'T:** Make bulk changes without notes  

### For Entitlements

✅ **DO:** Set expiration for trial access  
✅ **DO:** Leave expiration empty for purchases  
✅ **DO:** Document reason in support ticket  
✅ **DO:** Verify product key is correct  

❌ **DON'T:** Grant permanent access for trials  
❌ **DON'T:** Forget to set expiration dates  
❌ **DON'T:** Use wrong product keys  

## 📞 Support

Need help?

- **Email:** support@elitesolutionsnetwork.com
- **Phone:** 214-800-9779
- **Docs:** See README.md in `/admin` folder

## 🔗 Related Files

- **admin.html** - Admin panel UI
- **admin.js** - Admin panel logic
- **README.md** - Complete documentation
- **IMPLEMENTATION_SUMMARY.md** - Technical details

## ✨ Tips & Tricks

1. **Keyboard shortcuts:**
   - `Tab` - Navigate between fields
   - `Enter` - Submit search/grant forms

2. **Audit log tips:**
   - Use date filters to find recent changes
   - Export records by copy/paste from table
   - Filter by email to track specific user

3. **Workflow optimization:**
   - Keep admin panel open in separate tab
   - Bookmark `/admin/admin.html` for quick access
   - Review audit log at end of each day

## 📝 Checklist for New Admins

- [ ] Admin role set in database
- [ ] Can access `/admin/admin.html`
- [ ] Can search for users
- [ ] Can change a test user's tier
- [ ] Can view audit log
- [ ] Can grant entitlement
- [ ] Understand security implications
- [ ] Know when to use each feature

---

**Ready to go!** You're all set to manage users and tiers. Remember: with great power comes great responsibility. All actions are logged. 🛡️
