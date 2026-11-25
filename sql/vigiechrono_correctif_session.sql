-- VigieChrono — correctif du 25/11/2026 : « Session invalide ou expirée »
-- La vérification du jeton utilisait validity_days (validité des
-- signalements) comme durée de session. On reprend le contrôle de
-- chassnid_verify2 : jeton connu et compte actif.
-- À exécuter une fois dans l'éditeur SQL de Supabase.

CREATE OR REPLACE FUNCTION public._vc_caller(p_token text)
RETURNS public.admin_profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT * FROM public.admin_profiles
  WHERE session_token::text = p_token
    AND role IN ('superadmin', 'admin_dept', 'pilot')
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public._vc_caller(text) FROM PUBLIC, anon, authenticated;
