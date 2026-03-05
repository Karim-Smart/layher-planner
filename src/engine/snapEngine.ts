import type { PlacedPiece, ConnectionPoint, ConnectionType } from '../catalog/types';
import { ALL_PIECES } from '../catalog/definitions';
import { ROSETTE_INTERVAL, MAX_ROSETTE_CONNECTIONS } from '../catalog/constants';

export interface SnapResult {
  snapped: boolean;
  x: number;
  y: number;
  connections: SnapConnection[];
}

export interface SnapConnection {
  sourcePieceId: string;
  sourcePointId: string;
  targetPieceId: string;
  targetPointId: string;
}

// Distance d'aimantation aux connexions — assez large pour capter les rosettes proches
const SNAP_DISTANCE = ROSETTE_INTERVAL * 0.5; // 25cm
const TOLERANCE = 0.05;

// Alignement souple : snap à l'axe X ou Y d'une pièce voisine même sans connexion
const ALIGN_DISTANCE = ROSETTE_INTERVAL * 0.3; // 15cm

const COMPATIBLE_PAIRS: ReadonlySet<string> = new Set([
  'spigot:socket', 'socket:spigot',
  'spigot:base', 'base:spigot',
  'wedge:rosette', 'rosette:wedge',
  'clamp:tube', 'tube:clamp',
]);

function areTypesCompatible(a: ConnectionType, b: ConnectionType): boolean {
  return COMPATIBLE_PAIRS.has(`${a}:${b}`);
}

function areConnectionsCompatible(source: ConnectionPoint, target: ConnectionPoint): boolean {
  if (!areTypesCompatible(source.type, target.type)) return false;
  return source.accepts.includes(target.type) || target.accepts.includes(source.type);
}

function hasAvailableSlot(point: ConnectionPoint): boolean {
  if (point.type === 'rosette') return point.connectedTo.length < MAX_ROSETTE_CONNECTIONS;
  return point.connectedTo.length < point.maxConnections;
}

function getWorldPos(piece: PlacedPiece, cp: { relativeX: number; relativeY: number }) {
  return { x: piece.x + cp.relativeX, y: piece.y + cp.relativeY };
}

function findAllConnectionsAtPosition(
  piece: PlacedPiece,
  x: number,
  y: number,
  placedPieces: PlacedPiece[],
): SnapConnection[] {
  const connections: SnapConnection[] = [];
  for (const sourceCP of piece.connectionPoints) {
    const sx = x + sourceCP.relativeX;
    const sy = y + sourceCP.relativeY;
    for (const target of placedPieces) {
      if (target.id === piece.id) continue;
      for (const targetCP of target.connectionPoints) {
        if (!areConnectionsCompatible(sourceCP, targetCP)) continue;
        if (!hasAvailableSlot(targetCP)) continue;
        const tx = target.x + targetCP.relativeX;
        const ty = target.y + targetCP.relativeY;
        const dist = Math.sqrt((sx - tx) ** 2 + (sy - ty) ** 2);
        if (dist <= TOLERANCE) {
          connections.push({
            sourcePieceId: piece.id,
            sourcePointId: sourceCP.id,
            targetPieceId: target.id,
            targetPointId: targetCP.id,
          });
        }
      }
    }
  }
  return connections;
}

export function calculateSnap(
  draggingPiece: PlacedPiece,
  placedPieces: PlacedPiece[],
  snapToGridEnabled: boolean,
): SnapResult {
  const def = ALL_PIECES[draggingPiece.definitionId];
  if (!def) {
    return { snapped: false, x: draggingPiece.x, y: draggingPiece.y, connections: [] };
  }

  // ========================================
  // 1. PRIORITÉ : snap aux connexions compatibles
  // ========================================
  let bestSnap: SnapResult | null = null;
  let bestDistance = Infinity;

  for (const sourceCP of draggingPiece.connectionPoints) {
    const sourceWorld = getWorldPos(draggingPiece, sourceCP);

    for (const target of placedPieces) {
      if (target.id === draggingPiece.id) continue;

      for (const targetCP of target.connectionPoints) {
        if (!areConnectionsCompatible(sourceCP, targetCP)) continue;
        if (!hasAvailableSlot(sourceCP)) continue;
        if (!hasAvailableSlot(targetCP)) continue;

        const targetWorld = getWorldPos(target, targetCP);
        const dx = sourceWorld.x - targetWorld.x;
        const dy = sourceWorld.y - targetWorld.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SNAP_DISTANCE && dist < bestDistance) {
          bestDistance = dist;
          const snappedX = targetWorld.x - sourceCP.relativeX;
          const snappedY = targetWorld.y - sourceCP.relativeY;
          const allConnections = findAllConnectionsAtPosition(
            draggingPiece, snappedX, snappedY, placedPieces,
          );
          bestSnap = { snapped: true, x: snappedX, y: snappedY, connections: allConnections };
        }
      }
    }
  }

  if (bestSnap) return bestSnap;

  // ========================================
  // 2. ALIGNEMENT sur les axes des pièces existantes (même sans connexion)
  //    Permet d'aligner un montant sur un longeron ou vice versa
  // ========================================
  let alignedX = draggingPiece.x;
  let alignedY = draggingPiece.y;
  let didAlign = false;

  for (const target of placedPieces) {
    if (target.id === draggingPiece.id) continue;
    const targetDef = ALL_PIECES[target.definitionId];
    if (!targetDef) continue;

    // Aligner l'axe X (verticalement) — position X du montant/pièce cible
    const dxCenter = Math.abs(draggingPiece.x - target.x);
    if (dxCenter < ALIGN_DISTANCE) {
      alignedX = target.x;
      didAlign = true;
    }

    // Aligner l'axe Y (horizontalement) — position Y du montant/pièce cible
    const dyCenter = Math.abs(draggingPiece.y - target.y);
    if (dyCenter < ALIGN_DISTANCE) {
      alignedY = target.y;
      didAlign = true;
    }

    // Aligner sur les points de connexion de la cible (snap aux rosettes)
    for (const cp of target.connectionPoints) {
      const cpWorld = getWorldPos(target, cp);
      const dxCP = Math.abs(draggingPiece.x - cpWorld.x);
      const dyCP = Math.abs(draggingPiece.y - cpWorld.y);
      if (dxCP < ALIGN_DISTANCE && dxCP < Math.abs(draggingPiece.x - alignedX)) {
        alignedX = cpWorld.x;
        didAlign = true;
      }
      if (dyCP < ALIGN_DISTANCE && dyCP < Math.abs(draggingPiece.y - alignedY)) {
        alignedY = cpWorld.y;
        didAlign = true;
      }
    }
  }

  if (didAlign) {
    return { snapped: true, x: alignedX, y: alignedY, connections: [] };
  }

  // ========================================
  // 3. FALLBACK : grille optionnelle (si activé) ou placement libre
  // ========================================
  if (snapToGridEnabled) {
    const FINE_GRID = 0.05; // grille fine 5cm
    const snappedX = Math.round(draggingPiece.x / FINE_GRID) * FINE_GRID;
    const snappedY = Math.round(draggingPiece.y / FINE_GRID) * FINE_GRID;
    return { snapped: true, x: snappedX, y: snappedY, connections: [] };
  }

  // Placement totalement libre
  return { snapped: false, x: draggingPiece.x, y: draggingPiece.y, connections: [] };
}

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  const FINE_GRID = 0.05;
  return {
    x: Math.round(x / FINE_GRID) * FINE_GRID,
    y: Math.round(y / FINE_GRID) * FINE_GRID,
  };
}
