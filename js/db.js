// ── db.js — Toutes les requêtes Supabase (sans auth) ─────────
// Dépend de : config.js, supabase CDN (window.supabase)

const { createClient } = supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: false }
});

// ── HELPER TOKEN ──────────────────────────────────────────────

function _token() {
  return localStorage.getItem(CONFIG.SESSION_KEY);
}

function _parse(data) {
  return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
}

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

// ── PROFILS — LECTURE ─────────────────────────────────────────

async function dbAdminsGetAll() {
  const { data } = await db.rpc('chassnid_get_admins', { p_token: _token() });
  const result = _parse(data);
  return Array.isArray(result) ? result : [];
}

async function dbPilotsGetByParent() {
  const { data } = await db.rpc('chassnid_get_pilots', { p_token: _token() });
  const result = _parse(data);
  return Array.isArray(result) ? result : [];
}

// ── PROFILS — CRÉATION ────────────────────────────────────────

async function dbProfileCreate({ id, email, nom, prenom, role, departement, secteur, parent_id }) {
  const { data, error } = await db.rpc('chassnid_create_profile', {
    p_token:       _token(),
    p_id:          id,
    p_email:       email,
    p_nom:         nom,
    p_prenom:      prenom,
    p_role:        role,
    p_departement: departement || '—',
    p_secteur:     secteur || '—',
    p_parent_id:   parent_id,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}

// ── PROFILS — MIGRATION ───────────────────────────────────────

async function dbProfileMigrate(oldId, newId) {
  const { data, error } = await db.rpc('chassnid_migrate_profile', {
    p_token:  _token(),
    p_old_id: oldId,
    p_new_id: newId,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}

// ── PROFILS — MODIFICATION ────────────────────────────────────

async function dbProfileUpdateRole(id, role) {
  const { data, error } = await db.rpc('chassnid_update_role', {
    p_token:     _token(),
    p_target_id: id,
    p_role:      role,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}

async function dbProfileDelete(id) {
  const { data, error } = await db.rpc('chassnid_delete_profile', {
    p_token:     _token(),
    p_target_id: id,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
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
