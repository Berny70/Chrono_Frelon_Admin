const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// ── AUTH ──────────────────────────────────────────────────────

async function authSignInWithPassword(email, password) {
  return sb.auth.signInWithPassword({ email, password });
}

async function authSignUp(email, password) {
  return sb.auth.signUp({ email, password });
}

async function authResetPassword(email) {
  return sb.auth.resetPasswordForEmail(email, {
    redirectTo: CONFIG.APP_URL
  });
}

async function authUpdatePassword(newPassword) {
  return sb.auth.updateUser({ password: newPassword });
}

async function authSignOut() {
  return sb.auth.signOut();
}

function authOnChange(callback) {
  sb.auth.onAuthStateChange(callback);
}

// ── PROFILS ADMIN ─────────────────────────────────────────────

async function profileGet(userId) {
  const { data } = await sb
    .from('admin_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

async function profileCreate(userId, { email, nom, prenom, canton, departement }) {
  const { data: existing } = await sb
    .from('admin_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (existing) return;
  return sb.from('admin_profiles').insert({
    id: userId, email, nom, prenom, canton, departement, role: 'pending'
  });
}

// ── SIGNALEMENTS ──────────────────────────────────────────────

async function signalsGetAll(lat, lon, radiusKm = 50) {
  if (lat && lon) {
    const { data } = await sb.rpc('signals_within_radius', {
      admin_lat: lat,
      admin_lon: lon,
      admin_radius: radiusKm * 1000
    });
    return data || [];
  }
  const { data } = await sb
    .from('chrono_frelon_geo')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(CONFIG.MAX_SIGNALS);
  return data || [];
}

async function signalDelete(id) {
  return sb.from('chrono_frelon_geo').delete().eq('id', id);
}

// ── UTILISATEURS BLOQUÉS ──────────────────────────────────────

async function blockedGetAll() {
  const { data } = await sb.from('blocked_phones').select('phone_id');
  return new Set((data || []).map(b => b.phone_id));
}

async function blockedAdd(phone_id, blocked_by) {
  return sb.from('blocked_phones').upsert({ phone_id, blocked_by });
}

async function blockedRemove(phone_id) {
  return sb.from('blocked_phones').delete().eq('phone_id', phone_id);
}

// ── ADMINS EN ATTENTE ─────────────────────────────────────────

async function pendingGetAll() {
  const { data } = await sb
    .from('admin_profiles')
    .select('*')
    .eq('role', 'pending')
    .order('created_at', { ascending: false });
  return data || [];
}

async function pendingValidate(id) {
  return sb.from('admin_profiles').update({ role: 'admin' }).eq('id', id);
}

async function pendingReject(id) {
  return sb.from('admin_profiles').delete().eq('id', id);
}
