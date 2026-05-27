// ── db.js — Toutes les requêtes Supabase (sans auth) ─────────
// Dépend de : config.js, supabase CDN (window.supabase)

const { createClient } = supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: false }
});

// ── SIGNALEMENTS ──────────────────────────────────────────────

async function dbSignalsGetAll(lat, lon, radiusKm = 50) {
  if (lat && lon) {
    const { data } = await db.rpc('signals_within_radius', {
      admin_lat:    lat,
      admin_lon:    lon,
      admin_radius: radiusKm * 1000,
    });
    return data || [];
  }
  const { data } = await db
    .from('chrono_frelon_geo')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(CONFIG.MAX_SIGNALS);
  return data || [];
}

async function dbSignalDelete(id) {
  return db.from('chrono_frelon_geo').delete().eq('id', id);
}

async function dbSignalsDeleteByPhone(phone_id) {
  return db.from('chrono_frelon_geo').delete().eq('phone_id', phone_id);
}

// ── PROFILS ───────────────────────────────────────────────────

async function dbAdminsGetAll() {
  const token = localStorage.getItem(CONFIG.SESSION_KEY);
  const { data } = await db.rpc('chassnid_get_admins', { p_token: token });
  const result = data ? (typeof data === 'string' ? JSON.parse(data) : data) : [];
  return Array.isArray(result) ? result : [];
}

async function dbPilotsGetByParent(parentId) {
  const token = localStorage.getItem(CONFIG.SESSION_KEY);
  const { data } = await db.rpc('chassnid_get_pilots', { p_token: token });
  const result = data ? (typeof data === 'string' ? JSON.parse(data) : data) : [];
  return Array.isArray(result) ? result : [];
}

async function dbProfileCreate({ id, email, nom, prenom, role, departement, secteur, parent_id }) {
  // Vérifie si l'email existe déjà
  const { data: existing } = await db
    .from('admin_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) return { error: { message: 'Cet email est déjà enregistré.' } };

  const { error } = await db.from('admin_profiles').insert({
    id,
    email, nom, prenom,
    role,
    departement,
    canton:    secteur,
    secteur,
    parent_id,
    pin_hash:  null, // sera défini par chassnid_reset_pin via RPC
  });
  return { error };
}

async function dbProfileUpdateRole(id, role) {
  return db.from('admin_profiles').update({ role }).eq('id', id);
}

async function dbProfileDelete(id) {
  return db.from('admin_profiles').delete().eq('id', id);
}

async function dbProfileUpdateParams(id, { trait_length_m, validity_days }) {
  return db.from('admin_profiles')
    .update({ trait_length_m, validity_days })
    .eq('id', id);
}

// ── UTILISATEURS BLOQUÉS ──────────────────────────────────────

async function dbBlockedGetAll() {
  const { data } = await db.from('blocked_phones').select('phone_id');
  return new Set((data || []).map(b => b.phone_id));
}

async function dbBlockedAdd(phone_id, blocked_by) {
  return db.from('blocked_phones').upsert({ phone_id, blocked_by });
}

async function dbBlockedRemove(phone_id) {
  return db.from('blocked_phones').delete().eq('phone_id', phone_id);
}

// ── UTILISATEURS PILOTE ───────────────────────────────────────

async function dbPilotUsersGet(pilotId) {
  const { data } = await db
    .from('pilot_user_stats')
    .select('*')
    .eq('pilot_id', pilotId)
    .order('rattachement_date', { ascending: false });
  return data || [];
}

async function dbPilotUserBlock(phone_id, pilotId) {
  return db.from('pilot_users')
    .update({ blocked: true })
    .eq('phone_id', phone_id)
    .eq('pilot_id', pilotId);
}

async function dbPilotUserUnblock(phone_id, pilotId) {
  return db.from('pilot_users')
    .update({ blocked: false })
    .eq('phone_id', phone_id)
    .eq('pilot_id', pilotId);
}

// ── DEMANDES EN ATTENTE ───────────────────────────────────────

async function dbPendingGetAll() {
  const { data } = await db
    .from('admin_profiles')
    .select('id, email, nom, prenom, role, departement, canton, secteur, created_at')
    .eq('role', 'pending')
    .order('created_at', { ascending: false });
  return data || [];
}

async function dbPendingValidate(id, role = 'admin_dept') {
  return db.from('admin_profiles').update({ role }).eq('id', id);
}

async function dbPendingReject(id) {
  return db.from('admin_profiles').delete().eq('id', id);
}

// ── QR CODE ───────────────────────────────────────────────────

function dbQrCodeBuildUrl(pilotId) {
  return `${CONFIG.CHRONO_FRELON_URL}?pilot=${pilotId}`;
}
