# CLAUDE.md — Echaf-belleville.fr

## Description
Application web de planification d'échafaudages Layher en 2D/3D + module calorifugeage. Éditeur canvas avec catalogue de 40+ pièces réelles, snap/aimantation, calcul BOM automatique, et outil de découpe/calcul calorifuge pour lignes de tuyauterie.

## Stack
Vite 7 + React 19 + TypeScript + Tailwind CSS 4 + Zustand 5 + Konva.js (react-konva) + React Three Fiber

## Hébergement
- **VPS OVH** — IP : `51.91.236.255`
- **Compte OVH** : `vl427256-ovh`
- **Nom de domaine** : echaf-belleville.fr
- **CI/CD** : GitHub Actions (`.github/workflows/deploy.yml`) — build + deploy sur push `main`
- **API** : accessible sur le VPS pour corrections à distance

## Commandes
```bash
npm run dev      # Serveur de développement (HMR)
npm run build    # Build production → dist/
npm run lint     # ESLint
npm run preview  # Preview du build local
```

## Architecture
```
src/
  App.tsx         → Composant racine, routing entre éditeur échafaudage et module calo
  main.tsx        → Point d'entrée React
  index.css       → Styles globaux Tailwind

  catalog/        → types.ts, constants.ts, definitions.ts (40 pièces Layher)
  canvas/         → EditorCanvas.tsx, layers/ (GridLayer), renderers/ (PieceRenderer, ScaffoldViewer, ScaffoldViewer3D)
  panels/         → PiecePalette, PropertiesPanel, MaterialList, ProjectToolbar, StatusBar, PlannerView, GeneratorModal
  engine/         → snapEngine.ts, materialCalculator.ts, serializer.ts, scaffoldGenerator.ts
  stores/         → editorStore.ts (Zustand)
  theme/          → colors.ts

  calo/           → Module calorifugeage (section dédiée ci-dessous)
  data/           → edfEnvironments.ts (référentiel environnements EDF)
  assets/         → Ressources statiques (images, etc.)
```

## Module Calorifugeage (`src/calo/`)
Outil de calcul et visualisation pour le calorifugeage de lignes de tuyauterie industrielle.

```
calo/
  components/
    LigneComplete/
      index.jsx         → Composant principal, orchestration de la ligne
      PieceEditor.jsx   → Éditeur de pièces individuelles (coudes, réductions, etc.)
      PatronsDecoupe.jsx → Génération des patrons de découpe
      Vue3D.jsx         → Visualisation 3D de la ligne
      VueSchema.jsx     → Schéma 2D de la ligne
      RecapLigne.jsx    → Récapitulatif matériaux et mesures
  utils/
    calculs.js          → Calculs géométriques généraux
    calculs-ligne.js    → Calculs spécifiques aux lignes droites
    calculs-coude.js    → Calculs spécifiques aux coudes
```

## Design
Light Apple-style : fond `#f5f5f7`, panneaux glass blancs `backdrop-blur-xl`, accent jaune Orano `#F2A900`, texte sombre `#1d1d1f`. Police SF Pro / Inter.

## Catalogue Layher
Porté depuis `layher-game/`. 8 catégories : montants, longerons, diagonales, plateformes, vérins, garde-corps, consoles, roues. Dimensions et poids réels du catalogue Layher Allround 2019.
