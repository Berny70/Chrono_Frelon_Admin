# Chrono-Frelon Admin — PWA

Portail administrateur pour la gestion territoriale des signalements Vespa velutina.

## Configuration

### 1. Clé Supabase
Dans `index.html`, remplace :
```
const SUPABASE_ANON_KEY = 'REMPLACE_PAR_TA_CLE_ANON_SUPABASE';
```
Par ta clé anon trouvée dans Supabase → Settings → API → `anon public`.

### 2. Déploiement GitHub Pages
1. Crée un dépôt GitHub (ex: `chrono-frelon-admin`)
2. Upload les 4 fichiers : `index.html`, `manifest.json`, `sw.js`, `README.md`
3. GitHub → Settings → Pages → Source: `main` / `root`
4. L'appli est accessible sur `https://TON-USER.github.io/chrono-frelon-admin/`

### 3. URL de redirection Supabase
Dans Supabase → Authentication → URL Configuration :
- **Site URL** : `https://TON-USER.github.io/chrono-frelon-admin/`
- **Redirect URLs** : idem

### 4. Valider un admin (super-admin)
Dans Supabase → Table Editor → `admin_profiles` :
- Trouve l'entrée avec `role = pending`
- Change `role` → `admin`
- L'utilisateur aura accès au dashboard dès sa prochaine connexion

### 5. RLS Supabase — politiques à ajouter
Dans Supabase → Authentication → Policies, pour la table `chrono_frelon_geo` :
```sql
-- Permettre la lecture aux admins authentifiés
CREATE POLICY "admins_read" ON chrono_frelon_geo
  FOR SELECT TO authenticated USING (true);

-- Permettre la suppression aux admins
CREATE POLICY "admins_delete" ON chrono_frelon_geo
  FOR DELETE TO authenticated USING (true);
```

## Rôles
| Rôle | Accès |
|------|-------|
| `pending` | Écran d'attente uniquement |
| `admin` | Dashboard complet (canton) |
| `superadmin` | Tous cantons (à implémenter) |
| `blocked` | Déconnecté automatiquement |

## Stack
- HTML/CSS/JS vanilla — aucune dépendance à compiler
- Supabase (auth + base de données)
- Leaflet.js (carte OpenStreetMap)
- PWA (installable sur smartphone)
- Bilingue FR / DE
