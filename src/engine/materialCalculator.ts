import type { PlacedPiece, PieceCategory } from '../catalog/types';
import { ALL_PIECES, PIECES_BY_CATEGORY } from '../catalog/definitions';

export interface BOMEntry {
  definitionId: string;
  name: string;
  category: PieceCategory;
  quantity: number;
  unitWeight: number;
  totalWeight: number;
}

export interface BOMSummary {
  entries: BOMEntry[];
  totalPieces: number;
  totalWeight: number;
}

export function calculateBOM(pieces: PlacedPiece[]): BOMSummary {
  const counts = new Map<string, number>();

  for (const piece of pieces) {
    counts.set(piece.definitionId, (counts.get(piece.definitionId) || 0) + 1);
  }

  const entries: BOMEntry[] = [];
  let totalPieces = 0;
  let totalWeight = 0;

  for (const [defId, qty] of counts) {
    const def = ALL_PIECES[defId];
    if (!def) continue;
    const tw = Math.round(def.weightKg * qty * 10) / 10;
    entries.push({
      definitionId: defId,
      name: def.name,
      category: def.category,
      quantity: qty,
      unitWeight: def.weightKg,
      totalWeight: tw,
    });
    totalPieces += qty;
    totalWeight += tw;
  }

  // Sort by category order, then name
  const catOrder = Object.keys(PIECES_BY_CATEGORY);
  entries.sort((a, b) => {
    const ci = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
    if (ci !== 0) return ci;
    return a.name.localeCompare(b.name);
  });

  return { entries, totalPieces, totalWeight: Math.round(totalWeight * 10) / 10 };
}

export function exportCSV(bom: BOMSummary): string {
  const lines = ['Pièce;Catégorie;Quantité;Poids unitaire (kg);Poids total (kg)'];
  for (const e of bom.entries) {
    lines.push(`${e.name};${e.category};${e.quantity};${e.unitWeight};${e.totalWeight}`);
  }
  lines.push(`;;${bom.totalPieces};;${bom.totalWeight}`);
  return lines.join('\n');
}
