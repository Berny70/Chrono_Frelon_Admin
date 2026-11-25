-- ════════════════════════════════════════════════════════════
--  VigieChrono — module de ChassNid : tables et fonctions
-- ════════════════════════════════════════════════════════════
--  À exécuter UNE FOIS dans l'éditeur SQL de Supabase (rôle postgres).
--  Le script peut être relancé : il ne recrée pas ce qui existe déjà.
--
--  Principe (comme les autres fonctions chassnid_*) :
--   - les tables ne sont lisibles ni modifiables directement avec la
--     clé publique (RLS activée, aucune règle) ;
--   - tout passe par des fonctions SECURITY DEFINER qui vérifient le
--     jeton de session du pilote (admin_profiles.session_token).
--
--  Droits :
--   - lecture : tout pilote, admin départemental ou superadmin connecté
--     voit tous les lieux VigieChrono (même transparence que VigieNid) ;
--   - import d'un relevé : le pilote du lieu, son admin départemental,
--     ou un superadmin ;
--   - suppression d'un lieu : idem (règle des nids de ChassNid).
-- ════════════════════════════════════════════════════════════

-- ── TABLES ───────────────────────────────────────────────────

-- Un lieu d'observation = une borne posée à un endroit, pour une année
CREATE TABLE IF NOT EXISTS public.vc_sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id    uuid NOT NULL REFERENCES public.admin_profiles(id),
  pilot_nom   text,
  borne       text NOT NULL,              -- numéro de la borne, ex. VC-0001
  nom         text,                       -- nom du lieu, ex. Rucher Chenebier
  lat         double precision,
  lon         double precision,
  annee       integer NOT NULL,
  cap_deg     integer,                    -- cap boussole de l'avant (micro A)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Une ligne de resultats.csv de la borne
CREATE TABLE IF NOT EXISTS public.vc_events (
  id             bigserial PRIMARY KEY,
  site_id        uuid NOT NULL REFERENCES public.vc_sites(id) ON DELETE CASCADE,
  numero         integer,
  heure          timestamptz,             -- NULL si la borne n'était pas à l'heure
  heure_brute    text NOT NULL,           -- texte du CSV, ex. « 2026-10-02 14:07:31 » ou « J2 14:05:31 »
  evenement      text NOT NULL,           -- arrivee, depart, retour, abandon, nuit, jour, position, bilan…
  couleur        text,
  absence_min_s  integer,
  absence_max_s  integer,
  detail         text,
  lat            double precision,
  lon            double precision,
  imported_at    timestamptz NOT NULL DEFAULT now(),
  -- un même relevé importé deux fois ne crée pas de doublon
  CONSTRAINT vc_events_unique UNIQUE (site_id, numero, heure_brute, evenement)
);

CREATE INDEX IF NOT EXISTS vc_events_site_idx ON public.vc_events (site_id, evenement);

ALTER TABLE public.vc_sites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_events ENABLE ROW LEVEL SECURITY;


-- ── OUTIL : pilote connecté d'après son jeton ────────────────

CREATE OR REPLACE FUNCTION public._vc_caller(p_token text)
RETURNS public.admin_profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT * FROM public.admin_profiles
  WHERE session_token = p_token::uuid
    AND session_created_at + (validity_days || ' days')::interval > now()
    AND role IN ('superadmin', 'admin_dept', 'pilot')
  LIMIT 1;
$function$;

-- Le pilote connecté peut-il modifier ce lieu ?
CREATE OR REPLACE FUNCTION public._vc_can_edit(p_caller public.admin_profiles, p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT p_caller.role = 'superadmin'
      OR EXISTS (
           SELECT 1 FROM public.vc_sites s
           LEFT JOIN public.admin_profiles owner ON owner.id = s.pilot_id
           WHERE s.id = p_site_id
             AND (s.pilot_id = p_caller.id
                  OR (p_caller.role = 'admin_dept' AND owner.parent_id = p_caller.id))
         );
$function$;


-- ── LIEUX ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.chassnid_vc_site_create(
  p_token text, p_borne text, p_nom text,
  p_lat double precision, p_lon double precision,
  p_annee integer, p_cap integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller public.admin_profiles%ROWTYPE;
  v_id uuid;
BEGIN
  v_caller := public._vc_caller(p_token);
  IF v_caller.id IS NULL THEN RETURN jsonb_build_object('error', 'Session invalide ou expirée'); END IF;
  IF coalesce(trim(p_borne), '') = '' THEN RETURN jsonb_build_object('error', 'Numéro de borne manquant'); END IF;
  INSERT INTO public.vc_sites (pilot_id, pilot_nom, borne, nom, lat, lon, annee, cap_deg)
  VALUES (v_caller.id, v_caller.prenom || ' ' || v_caller.nom, trim(p_borne), nullif(trim(p_nom), ''),
          p_lat, p_lon, p_annee, p_cap)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

-- Tous les lieux, avec quelques chiffres (transparence entre pilotes)
CREATE OR REPLACE FUNCTION public.chassnid_vc_sites(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller public.admin_profiles%ROWTYPE;
BEGIN
  v_caller := public._vc_caller(p_token);
  IF v_caller.id IS NULL THEN RETURN jsonb_build_object('error', 'Session invalide ou expirée'); END IF;
  RETURN jsonb_build_object('sites', coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.annee DESC, t.nom)
    FROM (
      SELECT s.id, s.pilot_id, s.pilot_nom, s.borne, s.nom, s.lat, s.lon, s.annee, s.cap_deg, s.created_at,
             public._vc_can_edit(v_caller, s.id) AS editable,
             count(e.id)                                           AS nb_lignes,
             count(e.id) FILTER (WHERE e.evenement = 'retour')     AS nb_retours,
             count(e.id) FILTER (WHERE e.evenement = 'arrivee')    AS nb_arrivees,
             min(e.heure) AS premiere, max(e.heure) AS derniere,
             max(e.imported_at) AS dernier_releve
      FROM public.vc_sites s
      LEFT JOIN public.vc_events e ON e.site_id = s.id
      GROUP BY s.id
    ) t), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.chassnid_vc_site_delete(p_token text, p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller public.admin_profiles%ROWTYPE;
BEGIN
  v_caller := public._vc_caller(p_token);
  IF v_caller.id IS NULL THEN RETURN jsonb_build_object('error', 'Session invalide ou expirée'); END IF;
  IF NOT public._vc_can_edit(v_caller, p_site_id) THEN RETURN jsonb_build_object('error', 'Accès refusé'); END IF;
  DELETE FROM public.vc_sites WHERE id = p_site_id;   -- les lignes suivent (ON DELETE CASCADE)
  RETURN jsonb_build_object('ok', true);
END;
$function$;


-- ── RELEVÉS ──────────────────────────────────────────────────

-- p_rows : tableau JSON de lignes du CSV, déjà lues par l'appli :
--   [{numero, heure (ISO ou null), heure_brute, evenement, couleur,
--     absence_min_s, absence_max_s, detail, lat, lon}, …]
CREATE OR REPLACE FUNCTION public.chassnid_vc_import(p_token text, p_site_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller public.admin_profiles%ROWTYPE;
  v_n integer;
BEGIN
  v_caller := public._vc_caller(p_token);
  IF v_caller.id IS NULL THEN RETURN jsonb_build_object('error', 'Session invalide ou expirée'); END IF;
  IF NOT public._vc_can_edit(v_caller, p_site_id) THEN RETURN jsonb_build_object('error', 'Accès refusé'); END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 20000 THEN
    RETURN jsonb_build_object('error', 'Relevé invalide ou trop gros (20 000 lignes au plus)');
  END IF;

  INSERT INTO public.vc_events (site_id, numero, heure, heure_brute, evenement, couleur,
                                absence_min_s, absence_max_s, detail, lat, lon)
  SELECT p_site_id,
         (r->>'numero')::integer,
         nullif(r->>'heure', '')::timestamptz,
         coalesce(r->>'heure_brute', ''),
         r->>'evenement',
         nullif(r->>'couleur', ''),
         (r->>'absence_min_s')::integer,
         (r->>'absence_max_s')::integer,
         nullif(r->>'detail', ''),
         (r->>'lat')::double precision,
         (r->>'lon')::double precision
  FROM jsonb_array_elements(p_rows) r
  WHERE coalesce(r->>'evenement', '') <> ''
  ON CONFLICT ON CONSTRAINT vc_events_unique DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'ajoutees', v_n, 'recues', jsonb_array_length(p_rows));
END;
$function$;

-- Toutes les lignes d'un lieu (lecture : tout pilote connecté)
CREATE OR REPLACE FUNCTION public.chassnid_vc_events(p_token text, p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller public.admin_profiles%ROWTYPE;
BEGIN
  v_caller := public._vc_caller(p_token);
  IF v_caller.id IS NULL THEN RETURN jsonb_build_object('error', 'Session invalide ou expirée'); END IF;
  RETURN jsonb_build_object('events', coalesce((
    SELECT jsonb_agg(row_to_json(e) ORDER BY e.heure NULLS LAST, e.numero)
    FROM (
      SELECT id, numero, heure, heure_brute, evenement, couleur,
             absence_min_s, absence_max_s, detail, lat, lon
      FROM public.vc_events WHERE site_id = p_site_id
    ) e), '[]'::jsonb));
END;
$function$;

-- Les fonctions sont appelées avec la clé publique (rôle anon)
GRANT EXECUTE ON FUNCTION public.chassnid_vc_site_create(text, text, text, double precision, double precision, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.chassnid_vc_sites(text)                     TO anon;
GRANT EXECUTE ON FUNCTION public.chassnid_vc_site_delete(text, uuid)         TO anon;
GRANT EXECUTE ON FUNCTION public.chassnid_vc_import(text, uuid, jsonb)       TO anon;
GRANT EXECUTE ON FUNCTION public.chassnid_vc_events(text, uuid)              TO anon;
-- Les deux outils internes ne doivent pas être appelables de l'extérieur
REVOKE EXECUTE ON FUNCTION public._vc_caller(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._vc_can_edit(public.admin_profiles, uuid) FROM PUBLIC, anon, authenticated;
