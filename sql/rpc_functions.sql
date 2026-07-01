-- ============================================================
-- ChassNid / VigieNid — RPC métier Supabase
-- Projet : pqozgsgytzntrqscevrt
-- Exporté le : 1er juillet 2026
-- ============================================================
-- Ce fichier contient toutes les fonctions SQL du projet
-- (hors fonctions PostGIS système).
-- Pour restaurer : exécuter ce script dans l'éditeur SQL Supabase.
-- ⚠️  Certaines fonctions utilisent SECURITY DEFINER — les exécuter
--     avec un rôle ayant les droits suffisants (postgres ou service_role).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- AUTHENTIFICATION & SESSION
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chassnid_login(p_email text, p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_profile admin_profiles%ROWTYPE;
  v_token UUID;
BEGIN
  SELECT * INTO v_profile
  FROM admin_profiles
  WHERE email = p_email
    AND role NOT IN ('pending', 'blocked');

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Email ou PIN incorrect');
  END IF;

  IF v_profile.pin_hash IS NULL OR v_profile.pin_hash != crypt(p_pin, v_profile.pin_hash) THEN
    RETURN json_build_object('error', 'Email ou PIN incorrect');
  END IF;

  v_token := gen_random_uuid();

  UPDATE admin_profiles
  SET session_token = v_token,
      session_created_at = now()
  WHERE id = v_profile.id;

  RETURN json_build_object(
    'token', v_token,
    'profile', json_build_object(
      'id',             v_profile.id,
      'email',          v_profile.email,
      'nom',            v_profile.nom,
      'prenom',         v_profile.prenom,
      'role',           v_profile.role,
      'departement',    v_profile.departement,
      'canton',         v_profile.canton,
      'secteur',        v_profile.secteur,
      'lat',            v_profile.lat,
      'lon',            v_profile.lon,
      'parent_id',      v_profile.parent_id,
      'trait_length_m', v_profile.trait_length_m,
      'validity_days',  v_profile.validity_days,
      'phone_id',       v_profile.phone_id,
      'created_at',     v_profile.created_at
    )
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_logout(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE admin_profiles
  SET session_token = NULL,
      session_created_at = NULL
  WHERE session_token = p_token;
END;
$function$;


-- Note : chassnid_verify retournait 404 via PostgREST (cache bloqué).
-- Contourné côté client en session 3. Conservé ici pour référence.
CREATE OR REPLACE FUNCTION public.chassnid_verify(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_profile admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM admin_profiles
  WHERE session_token = p_token
    AND role NOT IN ('pending', 'blocked');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN json_build_object(
    'id',             v_profile.id,
    'email',          v_profile.email,
    'nom',            v_profile.nom,
    'prenom',         v_profile.prenom,
    'role',           v_profile.role,
    'departement',    v_profile.departement,
    'canton',         v_profile.canton,
    'secteur',        v_profile.secteur,
    'lat',            v_profile.lat,
    'lon',            v_profile.lon,
    'parent_id',      v_profile.parent_id,
    'trait_length_m', v_profile.trait_length_m,
    'validity_days',  v_profile.validity_days,
    'phone_id',       v_profile.phone_id,
    'created_at',     v_profile.created_at
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_verify2(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_profile admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM admin_profiles
  WHERE session_token = p_token
    AND role NOT IN ('pending', 'blocked');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN json_build_object(
    'id',             v_profile.id,
    'email',          v_profile.email,
    'nom',            v_profile.nom,
    'prenom',         v_profile.prenom,
    'role',           v_profile.role,
    'departement',    v_profile.departement,
    'canton',         v_profile.canton,
    'secteur',        v_profile.secteur,
    'lat',            v_profile.lat,
    'lon',            v_profile.lon,
    'parent_id',      v_profile.parent_id,
    'trait_length_m', v_profile.trait_length_m,
    'validity_days',  v_profile.validity_days,
    'phone_id',       v_profile.phone_id,
    'created_at',     v_profile.created_at
  );
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- PIN
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chassnid_set_pin(p_token uuid, p_new_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM admin_profiles
  WHERE session_token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Session invalide');
  END IF;

  IF length(p_new_pin) != 6 THEN
    RETURN json_build_object('error', 'Le PIN doit contenir 6 chiffres');
  END IF;

  UPDATE admin_profiles
  SET pin_hash = crypt(p_new_pin, gen_salt('bf'))
  WHERE id = v_id;

  RETURN json_build_object('ok', true);
END;
$function$;


-- Deux signatures coexistent (uuid et text) — les deux sont nécessaires
CREATE OR REPLACE FUNCTION public.chassnid_reset_pin(p_admin_token uuid, p_target_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_admin admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_admin
  FROM admin_profiles
  WHERE session_token = p_admin_token
    AND role IN ('superadmin', 'admin_dept');

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Non autorisé');
  END IF;

  UPDATE admin_profiles
  SET pin_hash = crypt('000000', gen_salt('bf')),
      session_token = NULL
  WHERE email = p_target_email
    AND (
      v_admin.role = 'superadmin'
      OR (v_admin.role = 'admin_dept' AND parent_id = v_admin.id)
    );

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Utilisateur introuvable ou non autorisé');
  END IF;

  RETURN json_build_object('ok', true);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_reset_pin(p_admin_token text, p_target_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_admin admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_admin
  FROM admin_profiles
  WHERE session_token = p_admin_token
    AND role IN ('superadmin', 'admin_dept');
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Non autorisé');
  END IF;
  UPDATE admin_profiles
  SET pin_hash = crypt('000000', gen_salt('bf'))
  WHERE email = p_target_email
    AND (
      v_admin.role = 'superadmin'
      OR (v_admin.role = 'admin_dept' AND parent_id = v_admin.id)
    );
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Utilisateur introuvable ou non autorisé');
  END IF;
  RETURN json_build_object('ok', true);
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- PROFILS (CRUD)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chassnid_create_profile(
  p_token text, p_id uuid, p_email text, p_nom text, p_prenom text,
  p_role text, p_departement text DEFAULT '—', p_secteur text DEFAULT '—',
  p_parent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_caller FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at > now() - interval '30 days';
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Session invalide ou expirée.'); END IF;
  IF v_caller.role NOT IN ('superadmin', 'admin_dept') THEN RETURN jsonb_build_object('error', 'Droits insuffisants.'); END IF;
  BEGIN
    SELECT id INTO v_new_id FROM auth.users WHERE email = p_email LIMIT 1;
    IF v_new_id IS NULL THEN
      INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
      VALUES (p_id, '00000000-0000-0000-0000-000000000000', p_email, crypt('chassnid-tmp-' || p_id::text, gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('nom', p_nom, 'prenom', p_prenom), false, 'authenticated');
      v_new_id := p_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_new_id FROM auth.users WHERE email = p_email;
    IF v_new_id IS NULL THEN RETURN jsonb_build_object('error', 'Email déjà utilisé.'); END IF;
  END;
  IF EXISTS (SELECT 1 FROM admin_profiles WHERE id = v_new_id) THEN RETURN jsonb_build_object('error', 'Un profil existe déjà pour cet email.'); END IF;
  INSERT INTO admin_profiles (id, email, nom, prenom, role, departement, canton, secteur, parent_id, pin_hash, created_at)
  VALUES (v_new_id, p_email, p_nom, p_prenom, p_role, p_departement, p_secteur, p_secteur, p_parent_id, crypt('000000', gen_salt('bf')), now());
  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_delete_profile(p_token uuid, p_target_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
  v_target admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM admin_profiles WHERE session_token = p_token;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Session invalide');
  END IF;

  SELECT * INTO v_target FROM admin_profiles WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Profil introuvable');
  END IF;

  IF v_caller.role = 'superadmin' THEN
    NULL;
  ELSIF v_caller.role = 'admin_dept' AND v_target.parent_id = v_caller.id THEN
    NULL;
  ELSE
    RETURN json_build_object('error', 'Non autorisé');
  END IF;

  DELETE FROM admin_profiles WHERE id = p_target_id;
  RETURN json_build_object('ok', true);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_migrate_profile(p_token text, p_old_id uuid, p_new_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller   admin_profiles%ROWTYPE;
  v_old      admin_profiles%ROWTYPE;
  v_new      admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller
  FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at > now() - interval '30 days';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Session invalide ou expirée.');
  END IF;

  IF v_caller.role NOT IN ('superadmin', 'admin_dept') THEN
    RETURN jsonb_build_object('error', 'Droits insuffisants.');
  END IF;

  SELECT * INTO v_old FROM admin_profiles WHERE id = p_old_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profil source introuvable.');
  END IF;

  SELECT * INTO v_new FROM admin_profiles WHERE id = p_new_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profil destinataire introuvable.');
  END IF;

  IF v_caller.role = 'admin_dept' THEN
    IF v_old.role NOT IN ('pilot', 'blocked') OR v_old.parent_id != v_caller.id THEN
      RETURN jsonb_build_object('error', 'Vous ne pouvez migrer que vos propres pilotes.');
    END IF;
  END IF;

  UPDATE admin_profiles SET parent_id = p_new_id WHERE parent_id = p_old_id;

  IF v_old.role IN ('pilot', 'blocked') THEN
    UPDATE pilot_users SET pilot_id = p_new_id WHERE pilot_id = p_old_id;
  END IF;

  UPDATE admin_profiles
     SET session_token = NULL, session_created_at = NULL
   WHERE id = p_old_id;

  DELETE FROM admin_profiles WHERE id = p_old_id;
  DELETE FROM auth.users WHERE id = p_old_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_update_role(p_token uuid, p_target_id uuid, p_role text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
  v_target admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM admin_profiles WHERE session_token = p_token;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Session invalide');
  END IF;

  SELECT * INTO v_target FROM admin_profiles WHERE id = p_target_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Profil introuvable');
  END IF;

  IF v_caller.role = 'superadmin' THEN
    NULL;
  ELSIF v_caller.role = 'admin_dept' AND v_target.parent_id = v_caller.id THEN
    NULL;
  ELSE
    RETURN json_build_object('error', 'Non autorisé');
  END IF;

  UPDATE admin_profiles SET role = p_role WHERE id = p_target_id;
  RETURN json_build_object('ok', true);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_update_params(p_token text, p_pilot_id uuid, p_trait_length integer, p_validity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
  v_count  INT;
BEGIN
  SELECT * INTO v_caller
  FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at > now() - interval '30 days';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Session invalide ou expirée.');
  END IF;

  IF v_caller.role NOT IN ('superadmin', 'admin_dept') THEN
    RETURN jsonb_build_object('error', 'Droits insuffisants.');
  END IF;

  UPDATE admin_profiles
     SET trait_length_m = p_trait_length,
         validity_days  = p_validity
   WHERE id = p_pilot_id
     AND (v_caller.role = 'superadmin' OR parent_id = v_caller.id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('error', 'Pilote introuvable ou non autorisé.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- LECTURE DES PROFILS
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chassnid_get_admins(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_id   UUID;
  v_role TEXT;
BEGIN
  SELECT id, role INTO v_id, v_role
  FROM admin_profiles
  WHERE session_token = p_token::uuid;
  RETURN (
    SELECT json_agg(row_to_json(t)) FROM (
      SELECT id, email, nom, prenom, role, departement, canton, secteur,
             lat, lon, parent_id, trait_length_m, validity_days, phone_id, created_at
      FROM admin_profiles
      WHERE role IN ('admin_dept', 'superadmin', 'blocked')
        AND (
          v_role = 'superadmin'
          OR id = v_id
        )
      ORDER BY created_at DESC
    ) t
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_get_pilots(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_id   UUID;
  v_role TEXT;
BEGIN
  SELECT id, role INTO v_id, v_role
  FROM admin_profiles
  WHERE session_token = p_token::uuid;
  RETURN (
    SELECT json_agg(row_to_json(t)) FROM (
      SELECT id, email, nom, prenom, role, departement, canton, secteur,
             lat, lon, parent_id, trait_length_m, validity_days, phone_id, created_at
      FROM admin_profiles
      WHERE role IN ('pilot', 'blocked')
        AND (
          v_role = 'superadmin'
          OR parent_id = v_id
        )
      ORDER BY created_at DESC
    ) t
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_get_sentinels_by_admin(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_caller FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at + (validity_days || ' days')::interval > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Session invalide ou expirée'); END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'pilot', jsonb_build_object('id',p.id,'prenom',p.prenom,'nom',p.nom,'email',p.email,'secteur',p.secteur,'departement',p.departement,'role',p.role),
    'users', COALESCE((SELECT jsonb_agg(jsonb_build_object('phone_id',u.phone_id,'pilot_id',u.pilot_id,'pseudo',u.pseudo,'blocked',u.blocked,'rattachement_date',u.rattachement_date,'nb_observations',u.nb_observations) ORDER BY u.rattachement_date DESC) FROM pilot_user_stats u WHERE u.pilot_id = p.id),'[]'::jsonb)
  ) ORDER BY p.nom, p.prenom) INTO v_result
  FROM admin_profiles p
  WHERE p.parent_id = v_caller.id AND p.role IN ('pilot','blocked');
  RETURN COALESCE(v_result,'[]'::jsonb);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_is_admin(p_pilot_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE id = p_pilot_id
      AND role IN ('superadmin', 'admin_dept', 'pilot')
  );
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- SENTINELLES
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chassnid_sentinel_set_pseudo(p_phone_id text, p_pilot_id uuid, p_pseudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE pilot_users
     SET pseudo = NULLIF(trim(p_pseudo), '')
   WHERE phone_id = p_phone_id
     AND pilot_id = p_pilot_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    UPDATE pilot_users
       SET pseudo = NULLIF(trim(p_pseudo), '')
     WHERE phone_id = p_phone_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('error', 'Rattachement introuvable.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_update_pseudo(p_token text, p_phone_id text, p_pilot_id uuid, p_pseudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller
  FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at > now() - interval '30 days';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Session invalide ou expirée.');
  END IF;

  IF v_caller.role NOT IN ('superadmin', 'admin_dept', 'pilot') THEN
    RETURN jsonb_build_object('error', 'Droits insuffisants.');
  END IF;

  UPDATE pilot_users
     SET pseudo = NULLIF(trim(p_pseudo), '')
   WHERE phone_id = p_phone_id
     AND pilot_id = p_pilot_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_set_sentinel_blocked(p_token text, p_phone_id text, p_pilot_id uuid, p_blocked boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at + (validity_days || ' days')::interval > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Session invalide ou expirée'); END IF;
  IF v_caller.role != 'superadmin' THEN
    IF NOT EXISTS (SELECT 1 FROM admin_profiles WHERE id = p_pilot_id AND parent_id = v_caller.id) THEN
      RETURN jsonb_build_object('error','Accès refusé');
    END IF;
  END IF;
  UPDATE pilot_users SET blocked = p_blocked WHERE phone_id = p_phone_id AND pilot_id = p_pilot_id;
  RETURN jsonb_build_object('ok',true);
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- PHONE ID (lien téléphone ↔ compte pilote/admin)
-- ────────────────────────────────────────────────────────────

-- Utilisée par Pot à Mèche
CREATE OR REPLACE FUNCTION public.chassnid_register_phone_id(p_pilot_id uuid, p_phone_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE admin_profiles
     SET phone_id = p_phone_id
   WHERE id = p_pilot_id
     AND role IN ('superadmin', 'admin_dept', 'pilot');

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- Note : VigieNid utilise vigienid_set_phone_id (même logique, nom différent)
-- Cette RPC n'est pas dans l'export car elle n'a pas été retournée par la requête.
-- À versionner manuellement si modifiée.


-- ────────────────────────────────────────────────────────────
-- NIDS
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chassnid_nest_add(p_token text, p_lat double precision, p_lon double precision, p_found_at text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO v_caller FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at + (validity_days || ' days')::interval > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Session invalide ou expirée'); END IF;
  IF v_caller.role NOT IN ('pilot','admin_dept','superadmin') THEN
    RETURN jsonb_build_object('error','Accès refusé');
  END IF;
  INSERT INTO nests (lat, lon, found_at, pilot_id, pilot_nom)
  VALUES (p_lat, p_lon, p_found_at::date, v_caller.id, v_caller.prenom||' '||v_caller.nom)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'id',v_id);
END;
$function$;


CREATE OR REPLACE FUNCTION public.chassnid_nest_delete(p_token text, p_nest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller admin_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_caller FROM admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at + (validity_days || ' days')::interval > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Session invalide ou expirée'); END IF;
  IF v_caller.role = 'pilot' THEN
    DELETE FROM nests WHERE id = p_nest_id AND pilot_id = v_caller.id;
  ELSE
    DELETE FROM nests WHERE id = p_nest_id;
  END IF;
  RETURN jsonb_build_object('ok',true);
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- SIGNALEMENTS
-- ────────────────────────────────────────────────────────────
-- ⚠️  Avant d'exécuter : DROP FUNCTION d'abord si elle existe,
--     car le type de retour a été modifié (ajout de pseudo).
--
-- DROP FUNCTION public.signals_within_radius(double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.signals_within_radius(
  admin_lat double precision,
  admin_lon double precision,
  admin_radius double precision
)
RETURNS TABLE(
  id bigint,
  created_at timestamp with time zone,
  phone_id text,
  direction integer,
  distance integer,
  lat double precision,
  lon double precision,
  trait_length_m integer,
  destination text,
  frequentation text,
  pseudo text
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT g.id, g.created_at, g.phone_id, g.direction, g.distance, g.lat, g.lon,
         COALESCE(ap.trait_length_m, 1000) AS trait_length_m,
         g.destination,
         g.frequentation,
         COALESCE(pu.pseudo, '') AS pseudo
  FROM chrono_frelon_geo g
  LEFT JOIN pilot_users pu ON pu.phone_id = g.phone_id
  LEFT JOIN admin_profiles ap ON ap.id = pu.pilot_id
  WHERE ST_DWithin(
    g.geom,
    ST_MakePoint(admin_lon, admin_lat)::geography,
    admin_radius
  )
  ORDER BY g.created_at DESC
  LIMIT 500;
END;
$function$;
