# CLAUDE.md — Layher Planner

## Description
Application web de planification d'échafaudages Layher en 2D. Éditeur canvas avec catalogue de 40+ pièces réelles, snap/aimantation, et calcul BOM automatique.

## Stack
Vite 6 + React 19 + TypeScript + Tailwind CSS 4 + Zustand 5 + Konva.js (react-konva)

## Commandes
```bash
npm run dev      # Serveur de développement (HMR)
npm run build    # Build production → dist/
```

## Architecture
```
src/
  catalog/      → types.ts, constants.ts, definitions.ts (40 pièces Layher)
  canvas/       → EditorCanvas.tsx, layers/ (GridLayer), renderers/ (PieceRenderer)
  panels/       → PiecePalette, PropertiesPanel, MaterialList, ProjectToolbar, StatusBar
  engine/       → snapEngine.ts, materialCalculator.ts, serializer.ts
  stores/       → editorStore.ts (Zustand)
  theme/        → colors.ts
```

## Design
Dark glassmorphism : fond `#0a0a0f`, panneaux glass `bg-white/3 backdrop-blur-xl`, accent bleu `#3b82f6` + or Layher `#e8c840`. Police Inter.

## Catalogue Layher
Porté depuis `layher-game/`. 8 catégories : montants, longerons, diagonales, plateformes, vérins, garde-corps, consoles, roues. Dimensions et poids réels du catalogue Layher Allround 2019.
