import type { ViewMode } from '../stores/editorStore';
import { ALL_PIECES } from '../catalog/definitions';
import { STANDARD_HEIGHTS, LEDGER_LENGTHS, ROSETTE_INTERVAL } from '../catalog/constants';

// ==========================================
// TYPES
// ==========================================

export interface ScaffoldConfig {
  maxHeight: number;         // Hauteur max des montants (m) : 2, 3, 4, 5, 6, 8, 10
  levels: number[];          // Paliers cochés (m) — chaque palier a plateforme+GC+plinthes
  bayLength: number;         // Longueur travée (m) : 0.73..3.07
  bayCount: number;          // Nombre de travées : 1-5
  depth: number;             // Profondeur (m) : 0.73, 1.09, 1.40
  trapdoors: boolean;        // Accès trappes
  consoleOffset: number;     // Déport console : 0, 0.36, 0.73
  guardrails: boolean;       // Garde-corps
  toeboards: boolean;        // Plinthes
  diagonals: boolean;        // Diagonales
  baseJackCm: number;        // Vérin de base : 20, 40, 60
  emptyBays: number[];       // Indices travées "maille à vide" (0-based)
}

export interface GeneratedPiece {
  definitionId: string;
  x: number;
  y: number;
}

export interface GenerationResult {
  pieces: Record<ViewMode, GeneratedPiece[]>;
  summary: {
    totalPieces: number;
    totalWeight: number;
    breakdown: Record<string, { count: number; weight: number }>;
  };
}

// ==========================================
// HELPERS
// ==========================================

/** Trouve la meilleure combinaison de montants standard pour atteindre une hauteur */
export function bestStandardCombo(targetHeight: number): number[] {
  const available = [...STANDARD_HEIGHTS].sort((a, b) => b - a);
  const result: number[] = [];
  let remaining = targetHeight;

  while (remaining > 0.01) {
    const best = available.find((h) => h <= remaining + 0.01);
    if (!best) break;
    result.push(best);
    remaining -= best;
  }

  return result;
}

/** Trouve le longeron le plus proche d'une longueur cible */
export function closestLedger(targetLength: number): number {
  const ledgerLengths = LEDGER_LENGTHS.filter((l) => l >= 0.73);
  let closest = ledgerLengths[0];
  let minDiff = Math.abs(targetLength - closest);

  for (const l of ledgerLengths) {
    const diff = Math.abs(targetLength - l);
    if (diff < minDiff) {
      minDiff = diff;
      closest = l;
    }
  }
  return closest;
}

/** Trouve la diagonale la plus adaptée pour une travée */
function bestDiagonal(bayLength: number, height: number): string | null {
  const diags: [string, number, number][] = [
    ['diagonal-0.73x2.0', 0.73, 2.0],
    ['diagonal-1.09x2.0', 1.09, 2.0],
    ['diagonal-2.07x2.0', 2.07, 2.0],
    ['diagonal-2.57x2.0', 2.57, 2.0],
    ['diagonal-0.73x1.0', 0.73, 1.0],
    ['diagonal-1.09x1.0', 1.09, 1.0],
  ];

  for (const [id, w] of diags) {
    if (Math.abs(w - bayLength) < 0.05) return id;
  }
  const h2 = diags.filter(([, , h]) => h === 2.0);
  return h2.length > 0 ? h2[0][0] : diags[0][0];
}

/** Vérifie si une hauteur est un palier avec plateforme (pas juste un longeron intermédiaire) */
function isLevel(height: number, levels: number[]): boolean {
  return levels.some((l) => Math.abs(l - height) < 0.01);
}

/** Vérifie si une travée est une maille à vide */
function isEmptyBay(bayIndex: number, emptyBays: number[]): boolean {
  return emptyBays.includes(bayIndex);
}

// ==========================================
// GÉNÉRATION
// ==========================================

export function generateScaffold(config: ScaffoldConfig): GenerationResult {
  const face: GeneratedPiece[] = [];
  const side: GeneratedPiece[] = [];
  const top: GeneratedPiece[] = [];

  const {
    maxHeight, levels, bayLength, bayCount, depth,
    trapdoors, consoleOffset, guardrails,
    toeboards, diagonals, baseJackCm, emptyBays,
  } = config;

  const ledgerLength = closestLedger(bayLength);
  const depthLedger = closestLedger(depth);
  const baseJackId = `baseJack-${baseJackCm}`;
  const baseJackDef = ALL_PIECES[baseJackId];
  const baseJackHeight = baseJackDef ? baseJackDef.heightM : 0.55;
  const standardCombo = bestStandardCombo(maxHeight);
  const totalStandardHeight = standardCombo.reduce((a, b) => a + b, 0);

  const montantCount = bayCount + 1;

  // Y inversé : y=0 en haut, sol = valeur haute
  const yGround = totalStandardHeight + baseJackHeight + 2;
  const yBase = yGround;
  const yStandardBottom = yGround - baseJackHeight;

  // Trier les paliers pour un traitement ordonné
  const sortedLevels = [...levels].sort((a, b) => a - b);

  // Calculer les hauteurs où placer des longerons intermédiaires (tous les 2m, hors paliers)
  const intermediateLedgerHeights: number[] = [];
  for (let h = 2.0; h < maxHeight - 0.1; h += 2.0) {
    if (!isLevel(h, sortedLevels)) {
      intermediateLedgerHeights.push(h);
    }
  }

  // ==========================================
  // VUE FACE
  // ==========================================

  // Montants et vérins pour chaque colonne
  for (let col = 0; col < montantCount; col++) {
    const xPos = 1 + col * ledgerLength;

    // Vérin de base
    face.push({ definitionId: baseJackId, x: xPos, y: yBase - baseJackHeight });

    // Montants empilés
    let yAccum = yStandardBottom;
    for (const stdH of standardCombo) {
      const stdId = `standard-${stdH}`;
      face.push({ definitionId: stdId, x: xPos, y: yAccum - stdH });
      yAccum -= stdH;
    }
  }

  // Pour chaque travée
  for (let bay = 0; bay < bayCount; bay++) {
    const xLeft = 1 + bay * ledgerLength;
    const ledgerId = `ledger-${ledgerLength}`;
    const isEmpty = isEmptyBay(bay, emptyBays);

    // Longeron au sol
    face.push({ definitionId: ledgerId, x: xLeft, y: yStandardBottom });

    // Longerons intermédiaires (stabilité, hors paliers)
    for (const h of intermediateLedgerHeights) {
      face.push({ definitionId: ledgerId, x: xLeft, y: yStandardBottom - h });
    }

    // Pour chaque palier : longeron + plateforme + GC + plinthes
    for (const levelH of sortedLevels) {
      const yLevel = yStandardBottom - levelH;

      // Longeron au niveau du palier
      face.push({ definitionId: ledgerId, x: xLeft, y: yLevel });

      // Maille à vide → pas de plateforme, GC, plinthes
      if (isEmpty) continue;

      // Plateforme ou trappe
      if (trapdoors && bay === 0 && levelH === sortedLevels[sortedLevels.length - 1]) {
        // Trappe uniquement sur la première travée au palier le plus haut
        const trapId = `trapdoor-${ledgerLength}`;
        if (ALL_PIECES[trapId]) {
          face.push({ definitionId: trapId, x: xLeft, y: yLevel });
        } else {
          face.push({ definitionId: `platform-${ledgerLength}`, x: xLeft, y: yLevel });
        }
      } else {
        const platId = `platform-${ledgerLength}`;
        if (ALL_PIECES[platId]) {
          face.push({ definitionId: platId, x: xLeft, y: yLevel });
        }
      }

      // Garde-corps (2 niveaux : +0.5m et +1.0m au-dessus du palier)
      if (guardrails) {
        const gcId = `guardrail-${ledgerLength}`;
        if (ALL_PIECES[gcId]) {
          face.push({ definitionId: gcId, x: xLeft, y: yLevel - 0.5 });
          face.push({ definitionId: gcId, x: xLeft, y: yLevel - 1.0 });
        }
      }

      // Plinthes (au niveau du palier)
      if (toeboards) {
        const tbId = `toeboard-${ledgerLength}`;
        if (ALL_PIECES[tbId]) {
          face.push({ definitionId: tbId, x: xLeft, y: yLevel });
        }
      }
    }

    // Diagonales au premier niveau (sol → 2m)
    if (diagonals) {
      const diagId = bestDiagonal(ledgerLength, 2.0);
      if (diagId && ALL_PIECES[diagId]) {
        face.push({ definitionId: diagId, x: xLeft, y: yStandardBottom - ALL_PIECES[diagId].heightM });
      }
    }
  }

  // Console (déport)
  if (consoleOffset > 0) {
    const consoleId = `console-${consoleOffset}`;
    if (ALL_PIECES[consoleId]) {
      // Console à chaque palier (pas sur les mailles à vide → on met sur les bords)
      const topLevel = sortedLevels[sortedLevels.length - 1] || maxHeight;
      const yFloor = yStandardBottom - topLevel;
      face.push({ definitionId: consoleId, x: 1 - consoleOffset, y: yFloor });
      face.push({ definitionId: consoleId, x: 1 + bayCount * ledgerLength, y: yFloor });
    }
  }

  // ==========================================
  // VUE CÔTÉ (profondeur)
  // ==========================================

  for (let row = 0; row < 2; row++) {
    const xPos = 1 + row * depthLedger;

    // Vérin
    side.push({ definitionId: baseJackId, x: xPos, y: yBase - baseJackHeight });

    // Montants
    let yAccum = yStandardBottom;
    for (const stdH of standardCombo) {
      side.push({ definitionId: `standard-${stdH}`, x: xPos, y: yAccum - stdH });
      yAccum -= stdH;
    }
  }

  // Longerons de profondeur
  const depthLedgerId = `ledger-${depthLedger}`;
  if (ALL_PIECES[depthLedgerId]) {
    // Au sol
    side.push({ definitionId: depthLedgerId, x: 1, y: yStandardBottom });

    // Intermédiaires
    for (const h of intermediateLedgerHeights) {
      side.push({ definitionId: depthLedgerId, x: 1, y: yStandardBottom - h });
    }

    // À chaque palier
    for (const levelH of sortedLevels) {
      side.push({ definitionId: depthLedgerId, x: 1, y: yStandardBottom - levelH });
    }
  }

  // Garde-corps côté à chaque palier
  if (guardrails) {
    const gcSideId = `guardrail-${depthLedger}`;
    if (ALL_PIECES[gcSideId]) {
      for (const levelH of sortedLevels) {
        const yLevel = yStandardBottom - levelH;
        side.push({ definitionId: gcSideId, x: 1, y: yLevel - 0.5 });
        side.push({ definitionId: gcSideId, x: 1, y: yLevel - 1.0 });
      }
    }
  }

  // Diagonale côté
  if (diagonals) {
    const diagSide = bestDiagonal(depthLedger, 2.0);
    if (diagSide && ALL_PIECES[diagSide]) {
      side.push({ definitionId: diagSide, x: 1, y: yStandardBottom - ALL_PIECES[diagSide].heightM });
    }
  }

  // ==========================================
  // VUE DESSUS (plan)
  // ==========================================

  const stdId05 = 'standard-0.5';
  for (let col = 0; col < montantCount; col++) {
    for (let row = 0; row < 2; row++) {
      top.push({ definitionId: stdId05, x: 1 + col * ledgerLength, y: 1 + row * depthLedger });
    }
  }

  // Longerons de longueur (avant et arrière)
  const topLedgerId = `ledger-${ledgerLength}`;
  if (ALL_PIECES[topLedgerId]) {
    for (let bay = 0; bay < bayCount; bay++) {
      for (let row = 0; row < 2; row++) {
        top.push({ definitionId: topLedgerId, x: 1 + bay * ledgerLength, y: 1 + row * depthLedger });
      }
    }
  }

  // Longerons de profondeur
  if (ALL_PIECES[depthLedgerId]) {
    for (let col = 0; col < montantCount; col++) {
      top.push({ definitionId: depthLedgerId, x: 1 + col * ledgerLength, y: 1 });
    }
  }

  // Plateformes en vue dessus (seulement travées pleines)
  for (let bay = 0; bay < bayCount; bay++) {
    if (isEmptyBay(bay, emptyBays)) continue;
    const platId = `platform-${ledgerLength}`;
    if (ALL_PIECES[platId]) {
      top.push({ definitionId: platId, x: 1 + bay * ledgerLength, y: 1 });
    }
  }

  // Console vue dessus
  if (consoleOffset > 0) {
    const consoleId = `console-${consoleOffset}`;
    if (ALL_PIECES[consoleId]) {
      for (let row = 0; row < 2; row++) {
        top.push({ definitionId: consoleId, x: 1 - consoleOffset, y: 1 + row * depthLedger });
        top.push({ definitionId: consoleId, x: 1 + bayCount * ledgerLength, y: 1 + row * depthLedger });
      }
    }
  }

  // ==========================================
  // RÉSUMÉ
  // ==========================================

  const allGenerated = [...face, ...side, ...top];
  const breakdown: Record<string, { count: number; weight: number }> = {};
  let totalWeight = 0;

  for (const piece of allGenerated) {
    const def = ALL_PIECES[piece.definitionId];
    if (!def) continue;
    if (!breakdown[piece.definitionId]) {
      breakdown[piece.definitionId] = { count: 0, weight: 0 };
    }
    breakdown[piece.definitionId].count += 1;
    breakdown[piece.definitionId].weight += def.weightKg;
    totalWeight += def.weightKg;
  }

  return {
    pieces: { face, side, top },
    summary: {
      totalPieces: allGenerated.length,
      totalWeight: Math.round(totalWeight * 10) / 10,
      breakdown,
    },
  };
}
