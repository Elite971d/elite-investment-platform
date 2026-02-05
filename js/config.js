// ============================================
// Elite Investor Academy - Configuration
// ============================================
// Replace these with your actual Supabase project credentials
// Get them from: https://app.supabase.com/project/YOUR_PROJECT/settings/api

const CONFIG = {
  supabase: {
    url: (typeof window !== 'undefined' && window.__SUPABASE_URL__) || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || 'https://YOUR_PROJECT_ID.supabase.co',
    anonKey: (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY__) || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || 'YOUR_PUBLIC_ANON_KEY'
  },
  
  // Square Payment Link IDs → Tier mapping
  // These are the IDs from your Square Payment Links
  tierMap: {
    '5L6KRBG7XEBJWAM3QQTKTQRM': 'starter',
    '7YCAILWUHUOSLA4AB4FDON63': 'serious',
    'YY2K4SD2IEAQT7WT633D4ARV': 'elite',
    'TKG3QM5DHNVMYVO7D54YUS7G': 'academy_starter',
    'EZ5TGODGBBAHDZP6WY7JCFW7': 'academy_pro',
    'OYTJWURAXGUWHPHPPMNOYYKI': 'academy_premium'
  },
  
  // Tier hierarchy for access control (admin = logic override, highest rank)
  tierRank: {
    guest: 0,
    starter: 1,
    serious: 2,
    elite: 3,
    academy_starter: 1,
    academy_pro: 2,
    academy_premium: 3,
    admin: 999  // Role override: bypasses tier gating; not stored in DB
  },
  
  // Square Payment Links (for upgrade CTAs)
  squareLinks: {
    starter: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/5L6KRBG7XEBJWAM3QQTKTQRM',
    serious: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/7YCAILWUHUOSLA4AB4FDON63',
    elite: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/YY2K4SD2IEAQT7WT633D4ARV',
    academy_starter: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/TKG3QM5DHNVMYVO7D54YUS7G',
    academy_pro: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/EZ5TGODGBBAHDZP6WY7JCFW7',
    academy_premium: 'https://checkout.square.site/merchant/MLVT882SAC2R4/checkout/OYTJWURAXGUWHPHPPMNOYYKI'
  },
  
  // Tool definitions with tier requirements (tier matrix only; no internal tools)
  // starter: offer, brrrr | serious: + dealcheck, rehab, pwt, wholesale | elite: + commercial
  tools: [
    { id: 'offer', name: 'Property Offer Calculator', href: 'offer.html', minTier: 'starter', pills: ['Offer', 'MAO', 'Comps'] },
    { id: 'brrrr', name: 'BRRRR Analyzer', href: 'brrrr.html', minTier: 'starter', pills: ['BRRRR', 'Refi', 'ROI'] },
    { id: 'dealcheck', name: 'DealCheck Analyzer', href: 'dealcheck.html', minTier: 'serious', pills: ['Deal', 'Analysis'] },
    { id: 'rehab', name: 'Rehab Tracker', href: 'rehabtracker.html', minTier: 'serious', pills: ['Budget', 'Receipts', 'Export'] },
    { id: 'pwt', name: 'Property Walkthrough Tool', href: 'pwt.html', minTier: 'serious', pills: ['Scope', 'Rooms', 'Photos'] },
    { id: 'wholesale', name: 'Wholesale Analyzer', href: 'wholesale.html', minTier: 'serious', pills: ['Wholesale'] },
    { id: 'commercial', name: 'Commercial Analyzer', href: 'commercial.html', minTier: 'elite', pills: ['Commercial', 'Cap Rate'] }
  ]
};

// Helper to format tier names
function prettyTier(tier) {
  const names = {
    guest: 'Guest',
    starter: 'Starter Investor',
    serious: 'Serious Investor',
    elite: 'Elite / Pro',
    academy_starter: 'Academy Starter',
    academy_pro: 'Academy Pro',
    academy_premium: 'Academy Premium',
    admin: 'Admin'
  };
  return names[tier] || tier;
}

export { CONFIG, prettyTier };
