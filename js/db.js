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
  const { data, error } = await db.rpc('chassnid_signal_delete', {
    p_token:     _token(),
    p_signal_id: id,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}

async function dbSignalsDeleteByPhone(phone_id) {
  const { data, error } = await db.rpc('chassnid_signals_delete_by_phone', {
    p_token:    _token(),
    p_phone_id: phone_id,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
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
  const { data, error, status } = await db.rpc('chassnid_update_params', {
    p_token:        _token(),
    p_pilot_id:     id,
    p_trait_length: trait_length_m,
    p_validity:     validity_days,
  });
  if (error) return { error };
  if (status === 204 || data === null) return { ok: true };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
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

// ── SENTINELLES ───────────────────────────────────────────────

async function dbPilotUsersGet(pilotId) {
  const { data } = await db
    .from('pilot_user_stats')
    .select('*')
    .eq('pilot_id', pilotId)
    .order('rattachement_date', { ascending: false });
  return data || [];
}

// Toutes les sentinelles (pour superadmin)
async function dbAllSentinelsGet() {
  const { data } = await db
    .from('pilot_user_stats')
    .select('*')
    .order('rattachement_date', { ascending: false });
  return data || [];
}

// Sentinelles de tous les pilotes d'un admin — 1 seule RPC SQL
// Retourne : [{ pilot: {...}, users: [...] }, ...]
async function dbPilotUsersGetByAdmin() {
  const { data, error } = await db.rpc('chassnid_get_sentinels_by_admin', {
    p_token: _token(),
  });
  if (error) return [];
  const result = _parse(data);
  return Array.isArray(result) ? result : [];
}

// Bloquer / débloquer une sentinelle via RPC (contourne RLS)
async function dbPilotUserBlock(phone_id, pilotId) {
  const { data, error } = await db.rpc('chassnid_set_sentinel_blocked', {
    p_token:    _token(),
    p_phone_id: phone_id,
    p_pilot_id: pilotId,
    p_blocked:  true,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}

async function dbPilotUserUnblock(phone_id, pilotId) {
  const { data, error } = await db.rpc('chassnid_set_sentinel_blocked', {
    p_token:    _token(),
    p_phone_id: phone_id,
    p_pilot_id: pilotId,
    p_blocked:  false,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}

async function dbSentinelDelete(phone_id, pilotId) {
  const { data, error } = await db.rpc('chassnid_sentinel_delete', {
    p_token:    _token(),
    p_phone_id: phone_id,
    p_pilot_id: pilotId,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}

async function dbUpdatePseudo(phone_id, pilotId, pseudo) {
  const { data, error } = await db.rpc('chassnid_update_pseudo', {
    p_token:    _token(),
    p_phone_id: phone_id,
    p_pilot_id: pilotId,
    p_pseudo:   pseudo,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
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

// ── NIDS TROUVÉS ──────────────────────────────────────────────

async function dbNestsGetAll() {
  const { data } = await db
    .from('nests')
    .select('*')
    .order('found_at', { ascending: false });
  return data || [];
}

async function dbNestAdd(lat, lon, foundAt, type = 'secondaire') {
  const { data, error } = await db.rpc('chassnid_nest_add', {
    p_token:    _token(),
    p_lat:      lat,
    p_lon:      lon,
    p_found_at: foundAt,
    p_type:     type,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true, id: result.id };
}

async function dbNestDelete(nestId) {
  const { data, error } = await db.rpc('chassnid_nest_delete', {
    p_token:   _token(),
    p_nest_id: nestId,
  });
  if (error) return { error };
  const result = _parse(data);
  return result?.error ? { error: { message: result.error } } : { ok: true };
}
