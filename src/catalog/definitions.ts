import type { PieceDefinition, ConnectionPoint } from './types';
import {
  ROSETTE_INTERVAL,
  TUBE_DIAMETER,
  STANDARD_HEIGHTS,
  LEDGER_LENGTHS,
  PLATFORM_LENGTHS,
  PLATFORM_HEIGHT,
  TUBE_LENGTHS,
  LADDER_HEIGHTS,
  TOEBOARD_LENGTHS,
  TOEBOARD_HEIGHT,
} from './constants';

// ==========================================
// COULEURS
// ==========================================
const COLORS = {
  steel: '#8899aa',
  steelLight: '#a0b0c0',
  steelDark: '#667788',
  wood: '#c8a060',
  secondaryDark: '#556677',
  guardrail: '#e8c840',
  toeboard: '#c0a060',
  ladder: '#8899aa',
  clamp: '#708090',
  tube: '#7a8a9a',
};

// ==========================================
// HELPERS
// ==========================================
function generateRosettes(heightM: number): Omit<ConnectionPoint, 'connectedTo'>[] {
  const points: Omit<ConnectionPoint, 'connectedTo'>[] = [];
  const rosetteCount = Math.floor(heightM / ROSETTE_INTERVAL) + 1;
  for (let i = 0; i < rosetteCount; i++) {
    points.push({
      id: `rosette-${i}`,
      type: 'rosette',
      direction: 'any',
      relativeX: 0,
      relativeY: i * ROSETTE_INTERVAL,
      accepts: ['wedge'],
      maxConnections: 8,
    });
  }
  return points;
}

// ==========================================
// MONTANTS (Standards)
// ==========================================
function createStandard(heightM: number): PieceDefinition {
  return {
    category: 'standard',
    name: `Montant ${heightM}m`,
    description: `Montant vertical de ${heightM}m avec rosettes tous les 50cm`,
    widthM: TUBE_DIAMETER,
    heightM,
    weightKg: Math.round(heightM * 4.0 * 10) / 10,
    connectionPoints: [
      { id: 'top-spigot', type: 'spigot', direction: 'up', relativeX: 0, relativeY: heightM, accepts: ['socket'], maxConnections: 1 },
      { id: 'bottom-socket', type: 'socket', direction: 'down', relativeX: 0, relativeY: 0, accepts: ['spigot', 'base'], maxConnections: 1 },
      ...generateRosettes(heightM),
    ],
    constraints: { requiresGround: false, requiresSupport: true, minConnections: 1, allowedRotations: [0] },
    color: COLORS.steel,
  };
}

// ==========================================
// LONGERONS / MOISES (Ledgers) — inclut moises 10cm et 30cm
// ==========================================
function createLedger(lengthM: number): PieceDefinition {
  const label = lengthM <= 0.30 ? `Moise ${Math.round(lengthM * 100)}cm` : `Longeron ${lengthM}m`;
  const desc = lengthM <= 0.30
    ? `Moise courte de ${Math.round(lengthM * 100)}cm. Entretoise entre montants proches`
    : `Barre horizontale de ${lengthM}m. Se fixe aux rosettes des montants`;
  return {
    category: 'ledger',
    name: label,
    description: desc,
    widthM: lengthM,
    heightM: TUBE_DIAMETER,
    weightKg: Math.round(lengthM * 3.5 * 10) / 10,
    connectionPoints: [
      { id: 'left-wedge', type: 'wedge', direction: 'left', relativeX: 0, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
      { id: 'right-wedge', type: 'wedge', direction: 'right', relativeX: lengthM, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0] },
    color: COLORS.steel,
  };
}

// ==========================================
// DIAGONALES
// ==========================================
function createDiagonal(widthM: number, heightM: number): PieceDefinition {
  const diagonalLength = Math.sqrt(widthM * widthM + heightM * heightM);
  return {
    category: 'diagonal',
    name: `Diagonale ${widthM}×${heightM}m`,
    description: `Barre diagonale reliant deux rosettes en oblique`,
    widthM,
    heightM,
    weightKg: Math.round(diagonalLength * 3.2 * 10) / 10,
    connectionPoints: [
      { id: 'bottom-wedge', type: 'wedge', direction: 'any', relativeX: 0, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
      { id: 'top-wedge', type: 'wedge', direction: 'any', relativeX: widthM, relativeY: heightM, accepts: ['rosette'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0, 180] },
    color: COLORS.steelLight,
  };
}

// ==========================================
// PLATEFORMES
// ==========================================
function createPlatform(lengthM: number): PieceDefinition {
  const weightTable: Record<number, number> = {
    0.73: 8.0, 1.09: 10.5, 1.40: 12.6, 1.57: 13.8, 2.07: 17.3, 2.57: 20.8, 3.07: 24.3,
  };
  return {
    category: 'platform',
    name: `Plateforme ${lengthM}m`,
    description: `Plancher métallique de ${lengthM}m × 32cm`,
    widthM: lengthM,
    heightM: PLATFORM_HEIGHT,
    weightKg: weightTable[lengthM] || lengthM * 7,
    connectionPoints: [
      { id: 'support-left', type: 'platform', direction: 'down', relativeX: 0, relativeY: 0, accepts: ['wedge'], maxConnections: 1 },
      { id: 'support-right', type: 'platform', direction: 'down', relativeX: lengthM, relativeY: 0, accepts: ['wedge'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: true, minConnections: 2, allowedRotations: [0] },
    color: COLORS.wood,
  };
}

// ==========================================
// TRAPPE (plateforme avec ouverture)
// ==========================================
function createTrapdoor(lengthM: number): PieceDefinition {
  const weightTable: Record<number, number> = {
    0.73: 10.5, 1.09: 13.0, 1.57: 16.5, 2.07: 20.0, 2.57: 24.0, 3.07: 28.0,
  };
  return {
    category: 'platform',
    name: `Trappe ${lengthM}m`,
    description: `Plateforme avec trappe d'accès de ${lengthM}m × 32cm`,
    widthM: lengthM,
    heightM: PLATFORM_HEIGHT,
    weightKg: weightTable[lengthM] || lengthM * 8.5,
    connectionPoints: [
      { id: 'support-left', type: 'platform', direction: 'down', relativeX: 0, relativeY: 0, accepts: ['wedge'], maxConnections: 1 },
      { id: 'support-right', type: 'platform', direction: 'down', relativeX: lengthM, relativeY: 0, accepts: ['wedge'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: true, minConnections: 2, allowedRotations: [0] },
    color: '#b09050',
  };
}

// ==========================================
// VÉRINS DE PIED (Base Jacks)
// ==========================================
function createBaseJack(travelCm: number): PieceDefinition {
  const heightM = travelCm / 100 + 0.15;
  return {
    category: 'baseJack',
    name: `Vérin ${travelCm}cm`,
    description: `Vérin de pied avec ${travelCm}cm de course réglable`,
    widthM: 0.15,
    heightM,
    weightKg: 2.5 + travelCm * 0.03,
    connectionPoints: [
      { id: 'base-plate', type: 'base', direction: 'down', relativeX: 0, relativeY: 0, accepts: [], maxConnections: 0 },
      { id: 'top-spigot', type: 'spigot', direction: 'up', relativeX: 0, relativeY: heightM, accepts: ['socket'], maxConnections: 1 },
    ],
    constraints: { requiresGround: true, requiresSupport: false, minConnections: 0, allowedRotations: [0] },
    color: COLORS.secondaryDark,
  };
}

// ==========================================
// GARDE-CORPS (Guardrails)
// ==========================================
function createGuardrail(lengthM: number): PieceDefinition {
  return {
    category: 'guardrail',
    name: `Garde-corps ${lengthM}m`,
    description: `Garde-corps de sécurité de ${lengthM}m`,
    widthM: lengthM,
    heightM: TUBE_DIAMETER,
    weightKg: Math.round(lengthM * 3.0 * 10) / 10,
    connectionPoints: [
      { id: 'left-wedge', type: 'wedge', direction: 'left', relativeX: 0, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
      { id: 'right-wedge', type: 'wedge', direction: 'right', relativeX: lengthM, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0] },
    color: COLORS.guardrail,
  };
}

// ==========================================
// PLINTHES (Toeboards) — planches de pied 15cm
// ==========================================
function createToeboard(lengthM: number): PieceDefinition {
  return {
    category: 'toeboard',
    name: `Plinthe ${lengthM}m`,
    description: `Plinthe de sécurité ${lengthM}m × 15cm. Empêche la chute d'objets`,
    widthM: lengthM,
    heightM: TOEBOARD_HEIGHT,
    weightKg: Math.round(lengthM * 2.8 * 10) / 10,
    connectionPoints: [
      { id: 'left-clip', type: 'wedge', direction: 'left', relativeX: 0, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
      { id: 'right-clip', type: 'wedge', direction: 'right', relativeX: lengthM, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0] },
    color: COLORS.toeboard,
  };
}

// ==========================================
// ÉCHELLES (Ladders)
// ==========================================
function createLadder(heightM: number): PieceDefinition {
  const widthM = 0.40;
  return {
    category: 'ladder',
    name: `Échelle ${heightM}m`,
    description: `Échelle d'accès Layher ${heightM}m avec crochets d'accroche`,
    widthM,
    heightM,
    weightKg: Math.round(heightM * 4.5 * 10) / 10,
    connectionPoints: [
      { id: 'top-hook', type: 'wedge', direction: 'up', relativeX: widthM / 2, relativeY: heightM, accepts: ['rosette'], maxConnections: 1 },
      { id: 'bottom-rest', type: 'base', direction: 'down', relativeX: widthM / 2, relativeY: 0, accepts: [], maxConnections: 0 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 1, allowedRotations: [0] },
    color: COLORS.ladder,
  };
}

// ==========================================
// COLLIERS (Clamps) — fixe, crapaud, plinthe, équerre
// ==========================================
const CLAMPS: Record<string, PieceDefinition> = {
  'clamp-fixe': {
    category: 'clamp',
    name: 'Collier fixe',
    description: 'Collier fixe (right-angle coupler). Relie 2 tubes à 90° de façon rigide',
    widthM: 0.12,
    heightM: 0.08,
    weightKg: 1.1,
    connectionPoints: [
      { id: 'tube-a', type: 'clamp', direction: 'any', relativeX: 0, relativeY: 0, accepts: ['tube'], maxConnections: 1 },
      { id: 'tube-b', type: 'clamp', direction: 'any', relativeX: 0.12, relativeY: 0, accepts: ['tube'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0, 90] },
    color: COLORS.clamp,
  },
  'clamp-crapaud': {
    category: 'clamp',
    name: 'Collier crapaud',
    description: 'Collier crapaud (swivel coupler). Relie 2 tubes à angle libre, pivotant',
    widthM: 0.12,
    heightM: 0.10,
    weightKg: 1.3,
    connectionPoints: [
      { id: 'tube-a', type: 'clamp', direction: 'any', relativeX: 0, relativeY: 0, accepts: ['tube'], maxConnections: 1 },
      { id: 'tube-b', type: 'clamp', direction: 'any', relativeX: 0.12, relativeY: 0, accepts: ['tube'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0, 90, 180, 270] },
    color: COLORS.clamp,
  },
  'clamp-plinthe': {
    category: 'clamp',
    name: 'Collier plinthe',
    description: 'Collier porte-plinthe. Fixe une plinthe bois au montant',
    widthM: 0.08,
    heightM: 0.06,
    weightKg: 0.5,
    connectionPoints: [
      { id: 'tube-attach', type: 'clamp', direction: 'any', relativeX: 0, relativeY: 0, accepts: ['tube'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 1, allowedRotations: [0, 90] },
    color: COLORS.clamp,
  },
  'clamp-equerre': {
    category: 'clamp',
    name: 'Équerre',
    description: "Équerre de renfort à angle droit. Renforce la jonction montant/longeron",
    widthM: 0.15,
    heightM: 0.15,
    weightKg: 1.5,
    connectionPoints: [
      { id: 'side-a', type: 'clamp', direction: 'any', relativeX: 0, relativeY: 0, accepts: ['tube'], maxConnections: 1 },
      { id: 'side-b', type: 'clamp', direction: 'any', relativeX: 0.15, relativeY: 0, accepts: ['tube'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0, 90, 180, 270] },
    color: COLORS.clamp,
  },
};

// ==========================================
// TUBES LIBRES (scaffold tubes)
// ==========================================
function createTube(lengthM: number): PieceDefinition {
  return {
    category: 'tube',
    name: `Tube ${lengthM}m`,
    description: `Tube acier Ø48.3mm de ${lengthM}m. Se fixe avec des colliers`,
    widthM: lengthM,
    heightM: TUBE_DIAMETER,
    weightKg: Math.round(lengthM * 3.6 * 10) / 10,
    connectionPoints: [
      { id: 'left-end', type: 'tube', direction: 'left', relativeX: 0, relativeY: 0, accepts: ['clamp'], maxConnections: 4 },
      { id: 'right-end', type: 'tube', direction: 'right', relativeX: lengthM, relativeY: 0, accepts: ['clamp'], maxConnections: 4 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 1, allowedRotations: [0, 90] },
    color: COLORS.tube,
  };
}

// ==========================================
// ACCESSOIRES — couvre-joint, embase, cale
// ==========================================
const ACCESSORIES: Record<string, PieceDefinition> = {
  'couvre-joint': {
    category: 'accessory',
    name: 'Couvre-joint',
    description: 'Manchon de raccordement (spigot). Relie 2 montants bout à bout',
    widthM: TUBE_DIAMETER,
    heightM: 0.30,
    weightKg: 0.8,
    connectionPoints: [
      { id: 'bottom-socket', type: 'socket', direction: 'down', relativeX: 0, relativeY: 0, accepts: ['spigot'], maxConnections: 1 },
      { id: 'top-socket', type: 'socket', direction: 'up', relativeX: 0, relativeY: 0.30, accepts: ['spigot'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 2, allowedRotations: [0] },
    color: COLORS.steel,
  },
  'embase': {
    category: 'accessory',
    name: 'Embase',
    description: "Embase (base collar). Se place sur le vérin pour recevoir le 1er montant",
    widthM: 0.10,
    heightM: 0.08,
    weightKg: 0.9,
    connectionPoints: [
      { id: 'bottom-socket', type: 'socket', direction: 'down', relativeX: 0, relativeY: 0, accepts: ['spigot', 'base'], maxConnections: 1 },
      { id: 'top-spigot', type: 'spigot', direction: 'up', relativeX: 0, relativeY: 0.08, accepts: ['socket'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: true, minConnections: 1, allowedRotations: [0] },
    color: COLORS.steelDark,
  },
  'cale-5': {
    category: 'accessory',
    name: 'Cale 5mm',
    description: 'Cale acier 5mm pour rattraper le niveau sous les vérins',
    widthM: 0.15,
    heightM: 0.005,
    weightKg: 0.3,
    connectionPoints: [],
    constraints: { requiresGround: true, requiresSupport: false, minConnections: 0, allowedRotations: [0] },
    color: '#6a7a8a',
  },
  'cale-10': {
    category: 'accessory',
    name: 'Cale 10mm',
    description: 'Cale acier 10mm pour rattraper le niveau sous les vérins',
    widthM: 0.15,
    heightM: 0.010,
    weightKg: 0.5,
    connectionPoints: [],
    constraints: { requiresGround: true, requiresSupport: false, minConnections: 0, allowedRotations: [0] },
    color: '#6a7a8a',
  },
  'cale-20': {
    category: 'accessory',
    name: 'Cale 20mm',
    description: 'Cale acier 20mm pour rattraper le niveau sous les vérins',
    widthM: 0.15,
    heightM: 0.020,
    weightKg: 0.9,
    connectionPoints: [],
    constraints: { requiresGround: true, requiresSupport: false, minConnections: 0, allowedRotations: [0] },
    color: '#6a7a8a',
  },
};

// ==========================================
// BUILD ALL CATALOGS
// ==========================================

export const STANDARDS: Record<string, PieceDefinition> = {};
for (const height of STANDARD_HEIGHTS) {
  STANDARDS[`standard-${height}`] = createStandard(height);
}

export const LEDGERS: Record<string, PieceDefinition> = {};
for (const length of LEDGER_LENGTHS) {
  LEDGERS[`ledger-${length}`] = createLedger(length);
}

export const DIAGONALS: Record<string, PieceDefinition> = {
  'diagonal-0.73x1.0': createDiagonal(0.73, 1.0),
  'diagonal-0.73x2.0': createDiagonal(0.73, 2.0),
  'diagonal-1.09x1.0': createDiagonal(1.09, 1.0),
  'diagonal-1.09x2.0': createDiagonal(1.09, 2.0),
  'diagonal-2.07x2.0': createDiagonal(2.07, 2.0),
  'diagonal-2.57x2.0': createDiagonal(2.57, 2.0),
};

export const PLATFORMS: Record<string, PieceDefinition> = {};
for (const length of PLATFORM_LENGTHS) {
  PLATFORMS[`platform-${length}`] = createPlatform(length);
}
// Trappes
PLATFORMS['trapdoor-2.07'] = createTrapdoor(2.07);
PLATFORMS['trapdoor-2.57'] = createTrapdoor(2.57);
PLATFORMS['trapdoor-3.07'] = createTrapdoor(3.07);

export const BASE_JACKS: Record<string, PieceDefinition> = {
  'baseJack-20': createBaseJack(20),
  'baseJack-40': createBaseJack(40),
  'baseJack-60': createBaseJack(60),
  'baseJack-80': createBaseJack(80),
};

export const GUARDRAILS: Record<string, PieceDefinition> = {};
for (const length of LEDGER_LENGTHS.filter((l) => l >= 0.73)) {
  GUARDRAILS[`guardrail-${length}`] = createGuardrail(length);
}

export const TOEBOARDS: Record<string, PieceDefinition> = {};
for (const length of TOEBOARD_LENGTHS) {
  TOEBOARDS[`toeboard-${length}`] = createToeboard(length);
}

export const LADDERS: Record<string, PieceDefinition> = {};
for (const height of LADDER_HEIGHTS) {
  LADDERS[`ladder-${height}`] = createLadder(height);
}

export const TUBES: Record<string, PieceDefinition> = {};
for (const length of TUBE_LENGTHS) {
  TUBES[`tube-${length}`] = createTube(length);
}

export const CASTORS: Record<string, PieceDefinition> = {
  castor: {
    category: 'castor',
    name: 'Roue avec frein',
    description: 'Roue mobile avec frein intégré',
    widthM: 0.15,
    heightM: 0.20,
    weightKg: 4.5,
    connectionPoints: [
      { id: 'wheel-base', type: 'base', direction: 'down', relativeX: 0, relativeY: 0, accepts: [], maxConnections: 0 },
      { id: 'top-spigot', type: 'spigot', direction: 'up', relativeX: 0, relativeY: 0.20, accepts: ['socket'], maxConnections: 1 },
    ],
    constraints: { requiresGround: true, requiresSupport: false, minConnections: 0, allowedRotations: [0] },
    color: COLORS.secondaryDark,
  },
};

export const CONSOLES: Record<string, PieceDefinition> = {
  'console-0.36': {
    category: 'console',
    name: 'Console 0.36m',
    description: "Console d'élargissement 0.36m",
    widthM: 0.36,
    heightM: TUBE_DIAMETER,
    weightKg: 3.8,
    connectionPoints: [
      { id: 'attach-wedge', type: 'wedge', direction: 'left', relativeX: 0, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 1, allowedRotations: [0, 180] },
    color: COLORS.steel,
  },
  'console-0.73': {
    category: 'console',
    name: 'Console 0.73m',
    description: "Grande console d'élargissement 0.73m",
    widthM: 0.73,
    heightM: TUBE_DIAMETER,
    weightKg: 5.2,
    connectionPoints: [
      { id: 'attach-wedge', type: 'wedge', direction: 'left', relativeX: 0, relativeY: 0, accepts: ['rosette'], maxConnections: 1 },
    ],
    constraints: { requiresGround: false, requiresSupport: false, minConnections: 1, allowedRotations: [0, 180] },
    color: COLORS.steel,
  },
};

// ==========================================
// CATALOGUE COMPLET
// ==========================================
export const ALL_PIECES: Record<string, PieceDefinition> = {
  ...STANDARDS,
  ...LEDGERS,
  ...DIAGONALS,
  ...PLATFORMS,
  ...BASE_JACKS,
  ...GUARDRAILS,
  ...TOEBOARDS,
  ...LADDERS,
  ...TUBES,
  ...CLAMPS,
  ...CASTORS,
  ...CONSOLES,
  ...ACCESSORIES,
};

// Groupés par catégorie pour la palette
export const PIECES_BY_CATEGORY: Record<string, { label: string; pieces: [string, PieceDefinition][] }> = {
  standard: { label: 'Montants', pieces: Object.entries(STANDARDS) },
  ledger: { label: 'Longerons / Moises', pieces: Object.entries(LEDGERS) },
  diagonal: { label: 'Diagonales', pieces: Object.entries(DIAGONALS) },
  platform: { label: 'Plateformes / Trappes', pieces: Object.entries(PLATFORMS) },
  baseJack: { label: 'Vérins', pieces: Object.entries(BASE_JACKS) },
  guardrail: { label: 'Garde-corps', pieces: Object.entries(GUARDRAILS) },
  toeboard: { label: 'Plinthes', pieces: Object.entries(TOEBOARDS) },
  ladder: { label: 'Échelles', pieces: Object.entries(LADDERS) },
  tube: { label: 'Tubes', pieces: Object.entries(TUBES) },
  clamp: { label: 'Colliers / Équerres', pieces: Object.entries(CLAMPS) },
  console: { label: 'Consoles', pieces: Object.entries(CONSOLES) },
  castor: { label: 'Roues', pieces: Object.entries(CASTORS) },
  accessory: { label: 'Accessoires', pieces: Object.entries(ACCESSORIES) },
};
