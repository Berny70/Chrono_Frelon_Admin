const { createClient } = supabase;
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
    storageKey: 'sb-pqozgsgytzntrqscevrt-auth-token',
  }
});
window.sb = sb;

// ── AUTH ──────────────────────────────────────────────────────
async function authSignInWithPassword(email, password) {
  return sb.auth.signInWithPassword({ email, password });
}
async function authSignUp(email, password) {
  return sb.auth.signUp({ email, password });
}
async function authResetPassword(email) {
  return sb.auth.resetPasswordForEmail(email, { redirectTo: CONFIG.APP_URL });
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
async function signalsDeleteByPhoneId(phone_id) {
  return sb.from('chrono_frelon_geo').delete().eq('phone_id', phone_id);
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

// ── ADMINS DÉPARTEMENTAUX (gestion par superadmin) ────────────
async function adminsGetAll() {
  const { data } = await sb
    .from('admin_profiles')
    .select('*')
    .in('role', ['admin_dept', 'blocked'])
    .order('created_at', { ascending: false });
  return data || [];
}

async function adminCreate(superAdminId, { email, nom, prenom, secteur, departement }) {
  // Vérifie si le profil existe déjà
  const { data: existingProfile } = await sb
    .from('admin_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingProfile) {
    return { error: { message: 'Cet email est déjà enregistré dans la base.' } };
  }

  const { data, error } = await authSignUp(email, CONFIG.PILOT_DEFAULT_PIN);

  // Si "already registered" : le compte auth existe mais pas le profil
  if (error?.message?.includes('already registered') || error?.message?.includes('already been registered')) {
    // On récupère l'UUID via une requête directe
    const { data: userData } = await sb
      .from('admin_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    // Le profil n'existe pas mais auth oui — on insère avec l'UUID existant
    // Impossible sans droits admin — on retourne un message clair
    return { error: { message: 'Email déjà enregistré dans Supabase Auth. Demandez à Bernard de créer ce compte manuellement.' } };
  }

  if (error) return { error };
  const userId = data?.user?.id;
  if (!userId) return { error: { message: 'Création compte échouée' } };

  const { error: profileError } = await sb.from('admin_profiles').insert({
    id: userId,
    email, nom, prenom,
    secteur, departement,
    canton: secteur,
    role: 'admin_dept',
    parent_id: superAdminId,
  });
  return { error: profileError };
}

async function adminDelete(adminId) {
  return sb.from('admin_profiles').delete().eq('id', adminId);
}

// ── PILOTES (gestion par admin_dept) ─────────────────────────
async function pilotsGetByDept(adminDeptId) {
  const { data } = await sb
    .from('admin_profiles')
    .select('*')
    .eq('parent_id', adminDeptId)
    .in('role', ['pilot', 'blocked'])
    .order('created_at', { ascending: false });
  return data || [];
}

async function pilotCreate(adminDeptId, { email, nom, prenom, secteur, departement }) {
  // Vérifie si le profil existe déjà
  const { data: existingProfile } = await sb
    .from('admin_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingProfile) {
    return { error: { message: 'Cet email est déjà enregistré dans la base.' } };
  }

  const { data, error } = await authSignUp(email, CONFIG.PILOT_DEFAULT_PIN);

  // Si "already registered" : le compte auth existe mais pas le profil
  if (error?.message?.includes('already registered') || error?.message?.includes('already been registered')) {
    return { error: { message: 'Email déjà enregistré dans Supabase Auth. Demandez à Bernard de créer ce pilote manuellement.' } };
  }

  if (error) return { error };
  const userId = data?.user?.id;
  if (!userId) return { error: { message: 'Création compte échouée' } };

  const { error: profileError } = await sb.from('admin_profiles').insert({
    id: userId,
    email, nom, prenom,
    secteur, departement,
    canton: secteur,
    role: 'pilot',
    parent_id: adminDeptId,
  });
  return { error: profileError };
}

async function pilotDelete(pilotId) {
  return sb.from('admin_profiles').delete().eq('id', pilotId);
}
async function pilotUpdateRole(pilotId, role) {
  return sb.from('admin_profiles').update({ role }).eq('id', pilotId);
}

// ── UTILISATEURS PILOTE ───────────────────────────────────────
async function pilotUsersGet(pilotId) {
  const { data } = await sb
    .from('pilot_user_stats')
    .select('*')
    .eq('pilot_id', pilotId)
    .order('rattachement_date', { ascending: false });
  return data || [];
}
async function pilotUserBlock(phone_id, pilotId) {
  return sb.from('pilot_users')
    .update({ blocked: true })
    .eq('phone_id', phone_id)
    .eq('pilot_id', pilotId);
}
async function pilotUserUnblock(phone_id, pilotId) {
  return sb.from('pilot_users')
    .update({ blocked: false })
    .eq('phone_id', phone_id)
    .eq('pilot_id', pilotId);
}
async function pilotUserRegister(phone_id, pilotId) {
  const { data: existing } = await sb
    .from('pilot_users')
    .select('id')
    .eq('phone_id', phone_id)
    .maybeSingle();
  if (existing) return;
  return sb.from('pilot_users').insert({ phone_id, pilot_id: pilotId });
}

// ── QR CODE ───────────────────────────────────────────────────
function qrCodeBuildUrl(pilotId) {
  return `${CONFIG.CHRONO_FRELON_URL}?pilot=${pilotId}`;
}
