// ============================================
// Elite Investor Academy - Admin Panel Logic
// ============================================
// SECURITY ARCHITECTURE:
// 
// 1. CLIENT-SIDE PROTECTION (this file):
//    - Verifies user has active Supabase session
//    - Checks profile.role = 'admin' before showing UI
//    - Redirects non-admins to dashboard
//
// 2. DATABASE PROTECTION (Supabase RLS):
//    - audit_log table: only admins can SELECT
//    - profiles table: admins can UPDATE any row
//    - entitlements table: only service_role can INSERT/UPDATE
//
// 3. API PROTECTION (serverless functions):
//    - /api/admin/tier-override: verifies admin role server-side
//    - /api/admin/grant-entitlement: verifies admin role server-side
//    - All mutations write to audit_log automatically
//
// 4. AUDIT TRAIL:
//    - Every admin action logged with actor, target, and metadata
//    - Includes before/after values for tier changes
//    - Cannot be deleted (RLS prevents DELETE on audit_log)
//
// ============================================

// Load Supabase from CDN
const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');

// ============================================
// CONFIGURATION
// ============================================
// SECURITY NOTE: These are PUBLIC keys and safe to expose.
// The anon key has limited permissions via RLS policies.
// Sensitive operations require the service_role key which
// is NEVER exposed to the client - only used server-side.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'YOUR_PUBLIC_ANON_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format tier name for display
 * @param {string} tier - Tier key (e.g., 'starter', 'elite')
 * @returns {string} Pretty tier name
 */
function prettyTier(tier) {
  const names = {
    guest: 'Guest',
    starter: 'Starter Investor',
    serious: 'Serious Investor',
    elite: 'Elite / Pro',
    academy_starter: 'Academy Starter',
    academy_pro: 'Academy Pro',
    academy_premium: 'Academy Premium'
  };
  return names[tier] || tier;
}

/**
 * Check if a user has admin role
 * SECURITY: This check uses RLS policies. Non-admins cannot
 * read other users' profiles, so this will return false for them.
 * 
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>}
 */
async function isAdmin(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
  
  return profile?.role === 'admin';
}

/**
 * Show message to user
 * @param {string} text - Message text
 * @param {string} type - Message type ('success' or 'error')
 */
function showMessage(text, type = 'success') {
  const message = document.getElementById('message');
  message.textContent = text;
  message.className = `message ${type} show`;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    message.classList.remove('show');
  }, 5000);
}

/**
 * Get current session with error handling
 * @returns {Promise<{session: object|null, error: Error|null}>}
 */
async function getCurrentSession() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    return { session, error: sessionError };
  } catch (err) {
    console.error('Session error:', err);
    return { session: null, error: err };
  }
}

// ============================================
// USER SEARCH & DISPLAY
// ============================================

/**
 * Search for user by email
 * SECURITY: RLS policies ensure only admins can read other profiles
 * 
 * @param {string} email - User email to search
 */
async function searchUser(email) {
  // Normalize email to lowercase
  const emailLower = email.trim().toLowerCase();
  
  if (!emailLower) {
    showMessage('Please enter an email address.', 'error');
    return;
  }
  
  // Query profiles table
  // SECURITY: RLS policy "Admins can view all profiles" allows this
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', emailLower)
    .single();
  
  if (error || !profile) {
    showMessage('User not found. Please check the email address.', 'error');
    document.getElementById('userCard').classList.remove('show');
    return;
  }
  
  // Display user information
  displayUserCard(profile);
}

/**
 * Display user details in the card
 * @param {object} profile - User profile data
 */
function displayUserCard(profile) {
  // Populate user info
  document.getElementById('userEmail').textContent = profile.email;
  document.getElementById('currentTier').textContent = prettyTier(profile.tier || 'guest');
  document.getElementById('userRole').textContent = profile.role || 'user';
  
  // Format and display member since date
  if (profile.created_at) {
    const date = new Date(profile.created_at);
    document.getElementById('memberSince').textContent = date.toLocaleDateString();
  } else {
    document.getElementById('memberSince').textContent = '-';
  }
  
  // Set tier selector to current tier
  document.getElementById('tierSelect').value = profile.tier || 'guest';
  
  // Show the card
  document.getElementById('userCard').classList.add('show');
  showMessage('User found!');
}

// ============================================
// TIER OVERRIDE
// ============================================

/**
 * Update user tier via API endpoint
 * SECURITY: The API endpoint verifies:
 * 1. Bearer token is valid
 * 2. Token owner has admin role
 * 3. Target user exists
 * 
 * The API also writes an audit_log entry with before/after values.
 */
async function saveTierOverride() {
  const email = document.getElementById('emailInput').value.trim().toLowerCase();
  const newTier = document.getElementById('tierSelect').value;
  const reason = document.getElementById('reasonInput').value.trim() || null;
  
  if (!email) {
    showMessage('Please search for a user first.', 'error');
    return;
  }
  
  // Get current session for auth token
  const { session } = await getCurrentSession();
  if (!session) {
    showMessage('Session expired. Please log in again.', 'error');
    window.location.href = '/login.html';
    return;
  }
  
  try {
    // Call admin API endpoint
    // SECURITY: Endpoint verifies admin role server-side
    const res = await fetch('/api/admin/tier-override', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token 
      },
      body: JSON.stringify({ 
        target_email: email, 
        new_tier: newTier, 
        reason 
      })
    });
    
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      showMessage(data.error || 'Failed to update tier', 'error');
      return;
    }
    
    // Update display
    document.getElementById('currentTier').textContent = prettyTier(newTier);
    showMessage('Tier updated and audit log written.', 'success');
    
    // Clear reason input
    document.getElementById('reasonInput').value = '';
    
  } catch (err) {
    console.error('Tier update error:', err);
    showMessage('Request failed. Please check your connection.', 'error');
  }
}

// ============================================
// AUDIT LOG VIEWER
// ============================================

/**
 * Load audit log with filters
 * SECURITY: The audit_log table has RLS policy that only allows
 * admins to read. Non-admins will get an empty result set.
 */
async function loadAuditLog() {
  const action = document.getElementById('auditActionFilter').value;
  const targetEmail = document.getElementById('auditTargetEmail').value.trim();
  const dateFrom = document.getElementById('auditDateFrom').value;
  const dateTo = document.getElementById('auditDateTo').value;
  
  const tbody = document.getElementById('auditTableBody');
  const loadingEl = document.getElementById('auditLoading');
  
  // Clear existing rows and show loading
  tbody.innerHTML = '';
  loadingEl.style.display = 'block';
  
  // Build query with filters
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  
  if (action) {
    query = query.eq('action', action);
  }
  
  if (targetEmail) {
    query = query.eq('target_email', targetEmail);
  }
  
  if (dateFrom) {
    query = query.gte('created_at', dateFrom + 'T00:00:00Z');
  }
  
  if (dateTo) {
    query = query.lte('created_at', dateTo + 'T23:59:59Z');
  }
  
  // Execute query
  // SECURITY: RLS policy "Admins can read audit_log" allows this
  const { data: rows, error } = await query;
  
  loadingEl.style.display = 'none';
  
  if (error) {
    console.error('Audit log error:', error);
    showMessage('Failed to load audit log: ' + error.message, 'error');
    return;
  }
  
  // Render rows
  if (!rows || rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" style="padding:20px;text-align:center;color:rgba(255,255,255,.5)">No audit records found</td>';
    tbody.appendChild(tr);
    return;
  }
  
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,.08)';
    
    // Format metadata for display
    let metadataDisplay = '-';
    if (r.metadata && Object.keys(r.metadata).length > 0) {
      metadataDisplay = JSON.stringify(r.metadata);
    }
    
    tr.innerHTML = `
      <td style="padding:10px;">${new Date(r.created_at).toLocaleString()}</td>
      <td style="padding:10px;">${r.action || '-'}</td>
      <td style="padding:10px;">${r.actor_email || r.actor_user_id || '-'}</td>
      <td style="padding:10px;">${r.target_email || r.target_user_id || '-'}</td>
      <td style="padding:10px;max-width:280px;overflow:hidden;text-overflow:ellipsis;" title="${metadataDisplay}">${metadataDisplay}</td>
    `;
    
    tbody.appendChild(tr);
  });
}

// ============================================
// GRANT ENTITLEMENT
// ============================================

/**
 * Grant entitlement to user
 * SECURITY: The API endpoint verifies:
 * 1. Bearer token is valid
 * 2. Token owner has admin role
 * 3. Product key is valid
 * 
 * The API also writes an audit_log entry.
 */
async function grantEntitlement(event) {
  event.preventDefault();
  
  const email = document.getElementById('grantEmail').value.trim().toLowerCase();
  const product_key = document.getElementById('grantProductKey').value;
  const expiresVal = document.getElementById('grantExpiresAt').value;
  const expires_at = expiresVal ? new Date(expiresVal).toISOString() : null;
  
  if (!email) {
    showMessage('Please enter a target email.', 'error');
    return;
  }
  
  // Get current session for auth token
  const { session } = await getCurrentSession();
  if (!session) {
    showMessage('Session expired. Please log in again.', 'error');
    window.location.href = '/login.html';
    return;
  }
  
  try {
    // Call admin API endpoint
    // SECURITY: Endpoint verifies admin role server-side
    const res = await fetch('/api/admin/grant-entitlement', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token 
      },
      body: JSON.stringify({ 
        target_email: email, 
        product_key, 
        expires_at 
      })
    });
    
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      showMessage(data.error || 'Failed to grant entitlement', 'error');
      return;
    }
    
    showMessage('Entitlement granted and audit log written.', 'success');
    
    // Clear form
    document.getElementById('grantEmail').value = '';
    document.getElementById('grantExpiresAt').value = '';
    
  } catch (err) {
    console.error('Grant entitlement error:', err);
    showMessage('Request failed. Please check your connection.', 'error');
  }
}

// ============================================
// TAB SWITCHING
// ============================================

/**
 * Switch between tabs in the admin panel
 * @param {string} tabId - Tab to switch to ('search', 'audit', 'grant')
 */
function switchTab(tabId) {
  // Remove active class from all tabs and content
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  
  // Add active class to selected tab
  const selectedBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  
  // Show selected content
  const selectedContent = document.getElementById(`tab-${tabId}`);
  if (selectedContent) {
    selectedContent.classList.add('active');
    selectedContent.style.display = 'block';
  }
}

// ============================================
// AUTHENTICATION & ACCESS CONTROL
// ============================================

/**
 * Main initialization function
 * SECURITY FLOW:
 * 1. Check for valid Supabase session
 * 2. If no session, redirect to login
 * 3. If session exists, check profile.role
 * 4. If role !== 'admin', show access denied
 * 5. If admin, show admin panel
 */
async function initializeAdminPanel() {
  const loading = document.getElementById('loading');
  const accessDenied = document.getElementById('accessDenied');
  const adminPanel = document.getElementById('adminPanel');
  
  // Check authentication
  // SECURITY: Supabase verifies the JWT token automatically
  const { session, error: sessionError } = await getCurrentSession();
  
  if (!session) {
    loading.style.display = 'none';
    // Redirect to login with return URL
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.href);
    return;
  }
  
  // Check admin role
  // SECURITY: isAdmin() uses RLS policies to verify role
  const userIsAdmin = await isAdmin(session.user.id);
  
  if (!userIsAdmin) {
    // User is authenticated but not an admin
    // SECURITY: We don't show sensitive UI to non-admins
    loading.style.display = 'none';
    accessDenied.style.display = 'block';
    return;
  }
  
  // User is admin - show panel
  loading.style.display = 'none';
  adminPanel.style.display = 'block';
  document.getElementById('adminEmail').textContent = session.user.email;
  
  // Setup event listeners
  setupEventListeners();
}

/**
 * Setup all event listeners for the admin panel
 */
function setupEventListeners() {
  // Search form
  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('emailInput').value;
    await searchUser(email);
  });
  
  // Save tier button
  document.getElementById('saveBtn').addEventListener('click', async () => {
    await saveTierOverride();
  });
  
  // Cancel button
  document.getElementById('cancelBtn').addEventListener('click', () => {
    document.getElementById('userCard').classList.remove('show');
    document.getElementById('emailInput').value = '';
    document.getElementById('reasonInput').value = '';
  });
  
  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
  
  // Audit log load button
  document.getElementById('auditLoadBtn').addEventListener('click', async () => {
    await loadAuditLog();
  });
  
  // Grant entitlement form
  document.getElementById('grantForm').addEventListener('submit', async (e) => {
    await grantEntitlement(e);
  });
  
  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  });
}

// ============================================
// INITIALIZATION
// ============================================
// Start the admin panel when DOM is ready
// SECURITY: All checks happen before showing any admin UI
initializeAdminPanel();
