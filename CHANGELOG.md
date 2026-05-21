# Changelog — Chrono-Frelon Admin

Toutes les modifications notables sont documentées ici.
Format : Semantic Versioning — MAJEUR.MINEUR.PATCH

---

## [2.0.0] — 2026-05

### Ajouté — Architecture Piste-Frelon

Refonte majeure introduisant le réseau humain à 4 niveaux pour la distribution
de Chrono-Frelon à grande échelle (concept Piste-Frelon).

**Rôles**
- Nouveau rôle `admin_dept` — administrateur départemental, gère les pilotes de son territoire
- Nouveau rôle `pilot` — pilote local, gère son secteur et ses utilisateurs rattachés
- Authentification par code PIN 6 chiffres (remplacement du lien magique)

**QR Code de parrainage**
- Génération d'un QR Code personnalisé par pilote/admin depuis la topbar
- Rattachement automatique des utilisateurs Chrono-Frelon à un pilote via QR Code
- URL encodée : `CHRONO_FRELON_URL?pilot=UUID`

**Onglet Mes pilotes** (visible admin_dept et superadmin)
- Création d'un pilote (prénom, nom, email, secteur) avec PIN provisoire
- Blocage / déblocage / suppression d'un pilote
- Avatar initiales coloré selon le statut

**Carte Piste-Frelon**
- Remplacement des points par des **traits directionnels** (azimut + longueur configurable `TRAIT_LENGTH_M`)
- Calcul automatique de la **zone de convergence** des traits (cercle orange dégradé)
- Label permanent sur le cercle : "Zone probable du nid · rayon ~Xm"
- Fonction `mapClearConvergence()` pour nettoyer la carte après destruction d'un nid

**Base de données**
- Nouvelle table `pilot_users` : rattachement `phone_id` → `pilot_id`
- Nouvelle vue `pilot_user_stats` : statistiques agrégées par utilisateur et par pilote
- Colonnes `parent_id` et `secteur` ajoutées à `admin_profiles`
- RLS renforcé sur `chrono_frelon_geo` (filtrage par secteur pilote) et `pilot_users`

**Technique**
- Ajout librairie QRCode.js (cdnjs)
- `config.js` : ajout `PILOT_DEFAULT_PIN`, `CHRONO_FRELON_URL`, `TRAIT_LENGTH_M`
- Architecture modulaire conservée : config / i18n / ui / map / supabase / app

### Modifié
- `map.js` : `circleMarker` remplacés par polylines directionnelles + calcul de convergence
- `app.js` : gestion des rôles `pilot` et `admin_dept`, UI conditionnelle selon le rôle
- `ui.js` : ajout `renderPilots()`, adaptation `renderPending()` et `renderUsers()`
- `index.html` : onglet "Mes pilotes", panneau création pilote, panneau QR Code, bouton topbar

---

## [1.0.0] — 2026-04

### Ajouté
- Portail administrateur PWA installable sur smartphone
- Authentification par lien magique (email, sans mot de passe)
- Inscription nominative avec canton et département
- Système de rôles : `pending` → `admin` → `superadmin` / `blocked`
- Validation manuelle des nouveaux admins via Supabase
- Tableau de bord avec 3 onglets : Carte, Signalements, Utilisateurs
- Carte Leaflet/OpenStreetMap des signalements du canton
- Statistiques : total signalements, aujourd'hui, utilisateurs, bloqués
- Liste des signalements avec date, coordonnées, phone_id
- Suppression de signalements avec confirmation
- Liste des utilisateurs avec compteur de signalements
- Blocage/déblocage d'utilisateurs abusifs
- Signalements des utilisateurs bloqués marqués en rouge sur la carte
- Recherche/filtre dans les listes signalements et utilisateurs
- Interface bilingue FR / DE
- Service Worker pour utilisation offline partielle
- Connexion à la base Supabase existante `chrono_frelon_geo`

---

## [À venir]

### [2.1.0] — Filtres et export
- [ ] Filtre par plage de dates sur les signalements
- [ ] Export CSV des signalements du secteur
- [ ] Tri des colonnes (date, distance, direction)
- [ ] Pagination pour les grands volumes de données
- [ ] Paramétrage de `TRAIT_LENGTH_M` depuis l'interface (curseur pilote)

### [2.2.0] — Notifications
- [ ] Notification email lors d'un nouveau signalement
- [ ] Résumé hebdomadaire automatique par secteur
- [ ] Alerte si un utilisateur soumet un volume anormal

### [2.3.0] — Vue superadmin
- [ ] Accès à tous les départements (vue nationale)
- [ ] Statistiques croisées multi-départements
- [ ] Carte nationale agrégée
- [ ] Gestion des admins départementaux (valider, bloquer)

### [3.0.0] — Intégration temps réel
- [ ] Synchronisation Supabase Realtime (traits en direct sur la carte)
- [ ] Gestion des interventions (statut nid : signalé / localisé / détruit)
- [ ] Intégration API avec Chrono-Frelon (appli terrain)
- [ ] Rapport PDF exportable par secteur
- [ ] Application mobile native (PWA avancée)

---

## Conventions de versionnement

| Type de changement                      | Version     |
|-----------------------------------------|-------------|
| Correction de bug                       | PATCH x.x.1 |
| Nouvelle fonctionnalité rétrocompatible | MINOR x.1.0 |
| Changement incompatible / refonte       | MAJOR 2.0.0 |

## Convention des commits GitHub

```
feat:     ajout export CSV
fix:      correction filtre date
style:    amélioration topbar mobile
refactor: restructuration auth flow
docs:     mise à jour README
```
