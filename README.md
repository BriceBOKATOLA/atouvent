# AtouVent

Se déplacer en Île-de-France malgré la chaleur, les orages, le froid, la neige, le vent et les crues.
Application web installable (PWA, APK Android) et écrans pour les décideurs, réalisés pour le
**Hackathon Mobilités 2026 « Spécial Dataviz' » (Île-de-France Mobilités), défi 1 : canicules**, avec un regard sur les inégalités.

- Code : licence MIT (`licence.MIT`) · contributions : `contributing.md` · données et logiciels réutilisés : `SOURCES.md`
- Accessibilité visée : RGAA 4.1 niveau AA (contrôles automatiques dans `frontend/scripts/a11y/`)

## Ce que fait l'application

**Pour les voyageurs**
- **Le climat d'abord** : température, ressenti, pluie, rafales, aléas à venir avec l'heure, vigilance officielle Météo-France, crue, air.
- **Itinéraires qui tiennent compte du climat** : métro, RER, train, tram, bus, Vélib' en direct, vélo, marche ; classement
  « recommandé », « le plus rapide », « écologique » (CO2 ADEME), « sans marche » (accessibilité vérifiée arrêt par arrêt).
- **Trajet à venir** : choisir une date et une heure de départ (jusqu'à 30 jours) ; la météo prévue à cette heure-là est
  récupérée automatiquement (jusqu'à 7 jours, sinon c'est dit clairement) et les aléas de ce moment changent le classement.
- **Air du quai** : niveau de pollution aux particules (évaluation Airparif, 665 quais) à chaque montée et descente, alerte
  « air très pollué » pour les personnes sensibles et les jours de pollution.
- **Lieux frais partout en Île-de-France** : îlots de fraîcheur de Paris et, hors Paris, 6 754 parcs, squares et bois ouverts
  au public (Institut Paris Region), avec la distance jusqu'à la lisière la plus proche.
- **Ascenseurs** : pannes réelles (arrêts de nuit à part) ; en « sans marche », un trajet qui évite la gare en panne est proposé.
- Fontaines, toilettes, parkings vélos, chantiers, signalements des voyageurs, suivi du trajet hors réseau (souterrain).
- Profils (fauteuil, marche difficile, malvoyant, malentendant, lecture difficile, sensible au climat), 5 langues (FR, EN, ES, IT, ZH),
  contraste renforcé, grand texte, voix, vibration.

**Pour les décideurs** (admins et super admin, `/donnees`)
- Analyse de l'année juillet 2025 à juin 2026 et de la canicule de juin 2026 : qui continue de prendre les transports, gare par gare.
- Temps réel : collecte, perturbations, ascenseurs, Vélib', état de chaque source de données.
- Prévision : 7 jours, fréquentation attendue, lignes à surveiller, et **chaleur à venir** (années types +2,7 °C et +4 °C, TRACC) :
  jours chauds par an et validations perdues gare par gare.

## Arborescence

```
├── analyse/                 préparation des données de l'analyse (Python, DuckDB)
│   ├── prepare.py               analyse complète → backend/data/chaleur.json
│   ├── projections.py           chaleur à venir (TRACC +2,7 °C et +4 °C) gare par gare
│   └── sources.py, social.py, accidents.py, air_quais.py, ascenseurs_chaleur.py
├── backend/                 API FastAPI + collecteur + MongoDB
│   ├── app/
│   │   ├── main.py              application, préfixe /api/v1, en-têtes de sécurité, compression
│   │   ├── core/                configuration (.env), MongoDB, sécurité (mots de passe, JWT, chiffrement du profil)
│   │   ├── routes/              un fichier par domaine (comptes, transport, environnement, ascenseurs, Vélib', admin)
│   │   ├── services/            une source ou un calcul par fichier (météo, air des quais, lieux, itinéraires, trafic…)
│   │   ├── router/              calculateur d'itinéraires sur le GTFS IDFM (Connection Scan) et sa préparation
│   │   ├── collectors/          collecte Vélib', ascenseurs, info trafic
│   │   └── worker.py            planificateur de collecte
│   └── tests/
└── frontend/                React 19 + Vite, PWA, Capacitor (Android)
    ├── scripts/a11y/            contrôles d'accessibilité (contrastes, audit, clavier) et captures d'écran
    └── src/
        ├── assets/scss/         styles SCSS (voir ci-dessous) · assets/fonts/ polices · assets/img/ logo
        ├── components/          composants réutilisables (components/data/ : graphiques et tableaux décideurs)
        ├── pages/               un dossier ou fichier par écran (trip/, settings/, auth/, data/)
        ├── features/            logique sans affichage (climat, lieux, trajet hors ligne, carte)
        ├── hooks/, context/     géolocalisation, réseau, flux en direct ; session, préférences, annonces
        ├── i18n/                textes en 5 langues (un test vérifie qu'aucune clé ne manque)
        └── api/client.js        client HTTP de l'API
```

### Styles (SCSS)

`frontend/src/assets/scss/main.scss` est le point d'entrée (importé par `src/main.jsx`) :

| Dossier | Contenu |
|---|---|
| `abstracts/` | points de rupture (`bp.up(lg)`, `bp.down(md)`) et mixins (bouton choisi, focus clavier, zone tactile, texte masqué) ; ne produisent aucune règle |
| `base/` | polices, **jetons de la charte** (`_tokens.scss` : couleurs des thèmes clair, sombre et contraste renforcé, en propriétés CSS pour changer de thème sans recompiler), remise à zéro, règles d'accessibilité |
| `layout/` | en-têtes, contenu, navigation basse (mobile) ou latérale (grand écran) |
| `components/` | un fichier par famille : boutons, cartes, formulaires, onglets, badges, bandeaux, retours d'état, liens, graphiques, contraste renforcé |
| `pages/` | règles propres à un écran |

Les couleurs ne s'écrivent qu'avec les jetons (`var(--…)`) : chaque couleur a été vérifiée à 4,5:1 pour le texte et 3:1 pour les contours, dans les trois thèmes.

## Lancer en local

Prérequis : Python 3.11, Node 22, MongoDB 8 (local ou `docker compose up -d` dans `backend/`), Google Chrome pour les contrôles d'accessibilité.

```bash
# API (port 8000)
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # Linux/macOS : .venv/bin/pip
cp .env.example .env              # remplir JWT_SECRET et PROFILE_ENCRYPTION_KEY (obligatoires), clés PRIM/IDFM/Météo-France, SMTP
.venv/Scripts/python -m uvicorn app.main:app --port 8000
.venv/Scripts/python -m app.worker   # collecteur (autre terminal)

# Application (port 5174 ; /api est relayé vers le port 8000)
cd frontend
npm install
npm run dev                       # http://localhost:5174
```

Données à préparer une fois (gros fichiers, non versionnés, régénérés depuis les sources ouvertes) :

```bash
cd backend
python -m app.router.refresh --force   # horaires IDFM → data/router.npz (puis vérifiés chaque nuit par le worker)
python -m app.router.amenities         # équipements des arrêts, entrées de gare, fiabilité des ascenseurs
python -m app.router.shade             # ombre des arbres (Paris)
python -m app.router.hotspots          # points noirs piétons et cyclistes (BAAC 2021-2024)
cd ../analyse && python prepare.py     # analyse complète, dont la chaleur à venir (python projections.py : seule)
```

Super admin : mettre son adresse dans `SUPERADMIN_EMAILS` puis
`python -m app.admin_cli create-superadmin adresse@exemple.fr` (lien pour choisir son mot de passe ; `--no-email` l'affiche).

## Tests et contrôles

```bash
cd backend && .venv/Scripts/python -m pytest      # API, calculateur, services, sécurité
cd frontend && npm test                           # logique de l'application, traductions complètes
# Accessibilité (application et API lancées ; TOKEN=jeton pour les pages connectées)
npm run a11y:contrast    # contrastes texte et contours, thèmes clair, sombre, contraste renforcé
npm run a11y:audit       # noms accessibles, images, titres, langue, cibles tactiles, erreurs, débordement
npm run a11y:keyboard    # tout est atteignable au clavier, focus toujours visible, pas de piège
```

Sous Git Bash (Windows), préfixer par `MSYS_NO_PATHCONV=1` les commandes qui reçoivent un chemin commençant par « / ».

## Accessibilité : check-list du hackathon

| Question | Réponse dans AtouVent |
|---|---|
| Informations indispensables faciles à repérer | climat en tête de l'accueil ; durée, horaires, aléas et accessibilité en haut de chaque trajet ; raisons de la recommandation écrites |
| Contraste texte / fond suffisant | ≥ 4,5:1 (3:1 grand texte) dans les 3 thèmes, contrôlé par `a11y:contrast` (0 défaut) |
| Contraste des pictogrammes et composants | contours et fonds des boutons, champs, puces ≥ 3:1 ; pictogrammes toujours accompagnés d'un texte |
| Compréhensible sans la couleur | chaque état est écrit (« Air du quai : pollution élevée », « Arrêt non accessible », « Vigilance orange ») ; barres de graphiques nommées une à une |
| Compréhensible si l'on ne voit pas certaines couleurs | palettes vérifiées pour le daltonisme ; scénarios de chaleur distingués par leur nom et leur valeur, pas seulement par la teinte |
| Alternative pertinente pour chaque image | pictogrammes décoratifs masqués (`aria-hidden`), logo avec `title`, cartes avec un titre et la liste des lieux en texte |
| Titre ou légende pour chaque graphique, carte, schéma | titres et légendes explicites ; chaque graphique a son tableau de valeurs (« Voir les valeurs en tableau ») et un export CSV |
| Utilisable au clavier seul | `a11y:keyboard` : 100 % des éléments atteints sur tous les écrans, focus visible, lien d'évitement en premier |

Déclaration d'accessibilité : `frontend/public/declaration-accessibilite.html`.

## Sécurité

- **Rôles vérifiés par le serveur** sur chaque route : compte connecté pour `/me…`, administrateur pour `/admin…` et
  `/collect/status`, super administrateur pour la gestion des comptes et la mise à jour des horaires. Les écrans protégés de
  l'application (`/compte`, `/admin`, `/donnees`) ne font que refléter ces règles : sans le bon rôle, l'API répond 401 ou 403.
- **Sessions** : jetons signés (HS256 imposé), durée limitée, révoqués tous ensemble au changement de mot de passe ;
  mots de passe hachés (scrypt) ; profil de déplacement (donnée de santé) chiffré en base et jamais exposé aux admins.
- **Anti-abus** : limite par adresse IP sur toute l'API (300 requêtes/min), plus stricte pour le compte, l'administration
  et le flux en direct, et par route (connexion, inscription, e-mails, itinéraires…) ; 20 essais de connexion par heure et
  par compte, quelle que soit l'adresse ; requêtes de plus de 1 Mo refusées.
- **En-têtes** : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cache-Control: no-store` sur les
  données personnelles, HSTS derrière HTTPS ; politique de sécurité du contenu (CSP) dans l'application construite
  (aucun script extérieur ni en ligne, seules les tuiles IGN et l'API sont joignables).
- **Configuration** : secrets uniquement dans `backend/.env` (jamais versionné) ; l'API refuse de démarrer sans
  `JWT_SECRET` et `PROFILE_ENCRYPTION_KEY` solides ; documentation `/docs` coupée par défaut (`ENABLE_DOCS=0`).

## Conception

Charte graphique, maquette des écrans et flyers : `design/README.md` (lien vers le fichier Figma et exports des planches).

## Données

Toutes les sources, leurs licences et leur fréquence de mise à jour : **`SOURCES.md`**. Points de méthode :

- **Analyse 2025-2026** : chaque jour est comparé aux jours ordinaires comparables (même jour de la semaine, même période scolaire,
  6 semaines au plus), grèves écartées. Méthode et limites en tête de `analyse/prepare.py` et affichées à l'écran.
- **Chaleur à venir** : années types TRACC à la station de référence de Trappes, comparées à l'année observée au même endroit ;
  validations perdues = validations d'un jour ordinaire × baisse mesurée à 33 °C et plus × jours ouvrés à 33 °C et plus.
  Gares écartées si leur fréquentation chute pour une autre raison (travaux, fin des cours universitaires). Un ordre de grandeur.
- **Air des quais** : évaluation Airparif publiée par IDFM, par quai et par ligne ; campagnes ponctuelles ou mesures permanentes.

## Routes de l'API (`/api/v1`)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health`, `/collect/status` | état du service et de la collecte |
| POST | `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` | compte (limité par IP) |
| GET, PUT, DELETE | `/me`, `/me/preferences`, `/me/export`, `/me/places…`, `/me/password` | profil, préférences, export et suppression (RGPD) |
| GET | `/geo/search?q=` | gares et stations du réseau d'abord, puis adresses et lieux (IGN) |
| POST | `/trips/plan` | itinéraires (`modes`, `accessible`, `walk`, `depart_at` pour un trajet à venir) |
| POST | `/trips/bundle`, `/trips/live` | paquet hors ligne avant le départ ; suivi en direct |
| GET | `/weather?lat=&lon=&at=` | prévision 7 jours, aléas, air ; `at` : conditions prévues au départ d'un trajet à venir |
| GET | `/stops/near`, `/places/near?group=`, `/cool/near` | arrêts (équipements, air du quai), lieux utiles, lieux frais |
| GET | `/departures/{ref}`, `/traffic`, `/stream` | prochains passages, info trafic, flux en direct (SSE) |
| GET | `/elevators`, `/elevators/summary`, `/velib/near`, `/velib/history` | ascenseurs, Vélib' |
| GET | `/flood`, `/rivers`, `/seine` | vigilance crues, hauteur des rivières |
| GET, POST | `/reports/near`, `/reports`, `/reports/{id}/vote` | signalements des voyageurs |
| GET, PUT, DELETE, POST | `/admin/…` | analyse, santé des données, synthèses, comptes et rôles (admins, super admin) |

## Application Android (APK)

1. Mettre l'adresse publique HTTPS de l'API dans `frontend/.env.android` (`VITE_API_URL=https://…/api/v1`).
2. `cd frontend && npm run build:android` puis `cd android && gradlew assembleDebug`
   → `android/app/build/outputs/apk/debug/app-debug.apk` (Java 21, celui d'Android Studio).
3. Version Play Store : `npm run android:open` puis Build > Generate Signed App Bundle.

## Avant la mise en ligne

- `APP_URL` public en HTTPS, `ENABLE_DOCS=0`, `TRUST_PROXY=1` derrière un proxy, origines `CORS_ORIGINS`.
- Compléter les mentions `[à compléter]` de `frontend/public/confidentialite.html` et `declaration-accessibilite.html`.
- Clé Airparif (pollution en temps réel par quartier) : à demander sur le portail Airparif.
