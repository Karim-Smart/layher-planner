import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  X, Download, Package, Ruler, Plus, Minus,
  ChevronDown, ChevronRight, RotateCw, Trash2, Move,
  Share2, AlertTriangle, CheckCircle2, Copy, FileText,
} from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { closestLedger } from '../engine/scaffoldGenerator';
import { ScaffoldViewer3D } from '../canvas/renderers/ScaffoldViewer3D';


// ==========================================
// CONSTANTES METIER
// ==========================================
const HAUTEURS_PLANCHER = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const MOISE_LENGTHS = [0.73, 1.09, 1.40, 1.57, 2.07, 2.57, 3.07];

const CATEGORY_ORDER = [
  'Poteaux', 'Moises', 'U (traverses)', 'Diagonales', 'Sapine',
  'Plateformes', 'Plinthes', 'Consoles', 'Echelles', 'Acces exterieur',
  'Colliers', 'Tubes', 'Verins', 'Verins de base',
];

// ==========================================
// AUTO-SAVE
// ==========================================
const AUTOSAVE_KEY = 'echaf3d-autosave';

function autoSave(config: PlannerConfig, chantierName: string) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ config, chantierName, savedAt: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

function autoLoad(): { config: PlannerConfig; chantierName: string } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.config?.mailles?.length > 0) return data;
  } catch { /* corrupted — ignore */ }
  return null;
}

// ==========================================
// ALERTES SECURITE
// ==========================================
interface SafetyAlert {
  level: 'warning' | 'danger';
  message: string;
}

function computeSafetyAlerts(pc: PlannerConfig): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const maxH = Math.max(...pc.mailles.map(m => m.hauteurPlancher));
  const minDim = Math.min(
    ...pc.mailles.map(m => Math.min(closestLedger(m.longueur), closestLedger(m.largeur)))
  );
  const ratio = maxH / minDim;

  // H/L ratio — norme NF EN 12811
  if (ratio > 4 && !needsSapine(pc)) {
    alerts.push({ level: 'danger', message: `Ratio H/L = ${ratio.toFixed(1)} > 4 — amarrage ou sapine obligatoire` });
  }

  // Poids total
  const totalWeight = pc.mailles.length > 0 ? computeFullBOM(pc).reduce((s, it) => s + it.count * it.unitWeight, 0) : 0;
  if (totalWeight > 5000) {
    alerts.push({ level: 'warning', message: `Poids total ${Math.round(totalWeight)} kg — prevoir grutage ou manutention` });
  }

  // Hauteur > 8m sans acces
  if (maxH > 8 && !pc.mailles.some(m => m.accesExterieur) && !pc.echelle) {
    alerts.push({ level: 'danger', message: `Hauteur ${maxH}m sans echelle ni acces exterieur` });
  }

  return alerts;
}

// ==========================================
// RESUME CHANTIER (pour partage)
// ==========================================
function generateShareText(pc: PlannerConfig, chantierName: string, bomItems: BOMItem[]): string {
  const maxH = Math.max(...pc.mailles.map(m => m.hauteurPlancher));
  const totalPieces = bomItems.reduce((s, it) => s + it.count, 0);
  const totalWeight = Math.round(bomItems.reduce((s, it) => s + it.count * it.unitWeight, 0) * 10) / 10;
  const nbLevels = computeLevelsFor(maxH).length;
  const surface = pc.mailles.reduce((s, m) => s + closestLedger(m.longueur) * closestLedger(m.largeur), 0);

  let text = `ECHAF' 3D — ${chantierName || 'Sans nom'}\n`;
  text += `${'—'.repeat(30)}\n`;
  text += `${pc.mailles.length} maille${pc.mailles.length > 1 ? 's' : ''}\n`;
  text += `Hauteur: ${maxH}m | ${nbLevels} niveau${nbLevels > 1 ? 'x' : ''}\n`;
  text += `Surface: ${Math.round(surface * 100) / 100} m2\n`;
  text += `Total: ${totalPieces} pieces | ${totalWeight} kg\n`;
  text += `${'—'.repeat(30)}\n`;

  // Top categories
  const catMap: Record<string, { count: number; weight: number }> = {};
  for (const it of bomItems) {
    if (!catMap[it.category]) catMap[it.category] = { count: 0, weight: 0 };
    catMap[it.category].count += it.count;
    catMap[it.category].weight += it.count * it.unitWeight;
  }
  for (const [cat, { count, weight }] of Object.entries(catMap)) {
    text += `${cat}: ${count} pcs (${Math.round(weight)} kg)\n`;
  }
  text += `\nGenere par Echaf' 3D`;
  return text;
}

// ==========================================
// TYPES
// ==========================================
export type AccesSide = 'xmin' | 'xmax' | 'zmin' | 'zmax';

export type PlancherSens = 'longueur' | 'largeur'; // sens de pose des plateaux

export interface MailleConfig {
  id: string;
  longueur: number;
  largeur: number;  // profondeur de cette maille (m)
  x: number;        // position X en metres
  z: number;        // position Z en metres
  rotation: 0 | 90; // 0 = longueur sur X, 90 = longueur sur Z
  hauteurPlancher: number; // hauteur max du plancher pour cette maille
  aVide: boolean;   // maille a vide = pas de plateforme/GC/plinthes
  plancherSens: PlancherSens; // sens de pose des plateaux/trappes
  accesExterieur: boolean;       // acces depuis l'exterieur avec crinoline
  accesExterieurSide: AccesSide; // cote de l'acces
  accesExterieurPremierPalier: boolean; // acces uniquement au premier palier
  deport: boolean;
  deportLongueur: number;
  deportSides: DeportSides;
  deportTousEtages: boolean;
  deportPlancherSens: PlancherSens; // sens de pose des plateaux du deport
}

export interface DeportSides {
  zmin: boolean; // largeur avant
  zmax: boolean; // largeur arriere
  xmin: boolean; // longueur gauche
  xmax: boolean; // longueur droite
}

export function maxScaffoldHeight(): number {
  return 22;
}

export interface PlannerConfig {
  hauteurPlancher: number;
  mailles: MailleConfig[];
  verinage: boolean;
  echelle: boolean;
}

// Hauteur max globale (= max des mailles)
function globalMaxH(pc: PlannerConfig): number {
  return Math.max(...pc.mailles.map(m => m.hauteurPlancher), pc.hauteurPlancher);
}

// Niveaux (paliers) pour une hauteur donnee
function computeLevelsFor(h: number): number[] {
  const l: number[] = [];
  for (let y = 2; y <= h; y += 2) l.push(y);
  if (!l.includes(h)) l.push(h);
  return l.sort((a, b) => a - b);
}

// Sapine (contreventement) necessaire quand : H/L > 4
// Nombre de niveaux de diagonales de sapine = ceil(hauteur / 4)
export function needsSapine(pc: PlannerConfig): boolean {
  const minDim = Math.min(...pc.mailles.map(m => closestLedger(m.largeur)), ...pc.mailles.map(m => closestLedger(m.longueur)));
  const maxH = globalMaxH(pc);
  return maxH / minDim > 4;
}

export function sapineLevels(pc: PlannerConfig): number {
  return Math.ceil(globalMaxH(pc) / 4);
}

// ==========================================
// GEOMETRIE — rectangle de chaque maille
// ==========================================
export interface MailleRect {
  id: string;
  x1: number; z1: number;
  x2: number; z2: number;
}

export function getMailleRect(m: MailleConfig): MailleRect {
  const l = closestLedger(m.longueur);
  const w = closestLedger(m.largeur);
  if (m.rotation === 0) {
    return { id: m.id, x1: m.x, z1: m.z, x2: m.x + l, z2: m.z + w };
  }
  return { id: m.id, x1: m.x, z1: m.z, x2: m.x + w, z2: m.z + l };
}

// ==========================================
// ADJACENCE — segments ouverts par cote
// ==========================================
type Edge = 'xmin' | 'xmax' | 'zmin' | 'zmax';

export interface EdgeSegments {
  xmin: [number, number][]; // segments le long de Z (z1..z2)
  xmax: [number, number][];
  zmin: [number, number][]; // segments le long de X (x1..x2)
  zmax: [number, number][];
}

function subtractRange(segments: [number, number][], cover: [number, number]): [number, number][] {
  const eps = 0.02;
  const result: [number, number][] = [];
  for (const [s, e] of segments) {
    if (cover[1] <= s + eps || cover[0] >= e - eps) {
      result.push([s, e]); // pas de chevauchement
    } else {
      if (cover[0] > s + eps) result.push([s, cover[0]]);
      if (cover[1] < e - eps) result.push([cover[1], e]);
    }
  }
  return result;
}

export function getOpenSegments(rect: MailleRect, allRects: MailleRect[]): EdgeSegments {
  const eps = 0.02;
  let xmin: [number, number][] = [[rect.z1, rect.z2]];
  let xmax: [number, number][] = [[rect.z1, rect.z2]];
  let zmin: [number, number][] = [[rect.x1, rect.x2]];
  let zmax: [number, number][] = [[rect.x1, rect.x2]];

  for (const o of allRects) {
    if (o.id === rect.id) continue;
    if (Math.abs(o.x2 - rect.x1) < eps) xmin = subtractRange(xmin, [o.z1, o.z2]);
    if (Math.abs(o.x1 - rect.x2) < eps) xmax = subtractRange(xmax, [o.z1, o.z2]);
    if (Math.abs(o.z2 - rect.z1) < eps) zmin = subtractRange(zmin, [o.x1, o.x2]);
    if (Math.abs(o.z1 - rect.z2) < eps) zmax = subtractRange(zmax, [o.x1, o.x2]);
  }

  return { xmin, xmax, zmin, zmax };
}

// Compat : retourne les cotes qui ont au moins 1 segment ouvert
export function getOpenEdges(rect: MailleRect, allRects: MailleRect[]): Set<Edge> {
  const segs = getOpenSegments(rect, allRects);
  const open = new Set<Edge>();
  if (segs.xmin.length > 0) open.add('xmin');
  if (segs.xmax.length > 0) open.add('xmax');
  if (segs.zmin.length > 0) open.add('zmin');
  if (segs.zmax.length > 0) open.add('zmax');
  return open;
}

// ==========================================
// NIVEAUX
// ==========================================
// ==========================================
// BOM — calcul direct depuis PlannerConfig
// ==========================================
interface BOMItem {
  name: string;
  category: string;
  count: number;
  unitWeight: number;
}

function computeFullBOM(pc: PlannerConfig): BOMItem[] {
  const items: BOMItem[] = [];
  const rects = pc.mailles.map(m => getMailleRect(m));

  // --- POTEAUX (dedupliques par position, hauteur = max des mailles adjacentes) ---
  const poteauMaxH: Record<string, number> = {};
  for (let i = 0; i < pc.mailles.length; i++) {
    const m = pc.mailles[i];
    const r = rects[i];
    const mH = m.hauteurPlancher + 1; // poteaux depassent de 1m
    for (const corner of [`${r.x1.toFixed(3)},${r.z1.toFixed(3)}`, `${r.x2.toFixed(3)},${r.z1.toFixed(3)}`, `${r.x1.toFixed(3)},${r.z2.toFixed(3)}`, `${r.x2.toFixed(3)},${r.z2.toFixed(3)}`]) {
      poteauMaxH[corner] = Math.max(poteauMaxH[corner] || 0, mH);
    }
  }
  const nbPoteaux = Object.keys(poteauMaxH).length;

  // Comptage segments par hauteur
  const poteauByH: Record<string, number> = {};
  for (const h of Object.values(poteauMaxH)) {
    const nbFull2m = Math.floor(h / 2);
    const reste = h - nbFull2m * 2;
    poteauByH['2'] = (poteauByH['2'] || 0) + nbFull2m;
    if (reste > 0.01) {
      const rk = `${Math.round(reste * 100) / 100}`;
      poteauByH[rk] = (poteauByH[rk] || 0) + 1;
    }
  }
  for (const [len, count] of Object.entries(poteauByH)) {
    items.push({ name: `Poteau ${len}m`, category: 'Poteaux', count, unitWeight: Math.round(Number(len) * 3.65 * 10) / 10 });
  }

  // Verins de base
  items.push({ name: 'Verin de base 40cm', category: 'Verins de base', count: nbPoteaux, unitWeight: 4.0 });

  // --- MOISES + U (dedupliques par position, per-maille hauteurs) ---
  const moiseSet = new Set<string>();
  const uSet = new Set<string>();

  for (let i = 0; i < pc.mailles.length; i++) {
    const m = pc.mailles[i];
    const r = rects[i];
    const mLevels = computeLevelsFor(m.hauteurPlancher);
    const mMaxH = m.hauteurPlancher + 1;
    const intermH: number[] = [];
    for (let h = 2; h < mMaxH - 0.1; h += 2) {
      if (!mLevels.includes(h)) intermH.push(h);
    }
    const moiseHeights = [0, ...intermH, ...mLevels];
    for (const mh of moiseHeights) {
      moiseSet.add(`${r.x1.toFixed(3)},${r.x2.toFixed(3)},${r.z1.toFixed(3)},${mh.toFixed(3)}`);
      moiseSet.add(`${r.x1.toFixed(3)},${r.x2.toFixed(3)},${r.z2.toFixed(3)},${mh.toFixed(3)}`);
      uSet.add(`${r.z1.toFixed(3)},${r.z2.toFixed(3)},${r.x1.toFixed(3)},${mh.toFixed(3)}`);
      uSet.add(`${r.z1.toFixed(3)},${r.z2.toFixed(3)},${r.x2.toFixed(3)},${mh.toFixed(3)}`);
    }
  }

  // Compter par longueur
  const moiseByLen: Record<string, number> = {};
  for (const mk of moiseSet) {
    const [x1s, x2s] = mk.split(',');
    const len = closestLedger(Math.abs(Number(x2s) - Number(x1s)));
    const k = `${len}`;
    moiseByLen[k] = (moiseByLen[k] || 0) + 1;
  }
  const uByLen: Record<string, number> = {};
  for (const uk of uSet) {
    const [z1s, z2s] = uk.split(',');
    const len = closestLedger(Math.abs(Number(z2s) - Number(z1s)));
    const k = `${len}`;
    uByLen[k] = (uByLen[k] || 0) + 1;
  }

  for (const [len, count] of Object.entries(moiseByLen)) {
    items.push({ name: `Moise ${len}m`, category: 'Moises', count, unitWeight: Math.round(Number(len) * 3.5 * 10) / 10 });
  }
  for (const [len, count] of Object.entries(uByLen)) {
    items.push({ name: `U ${len}m`, category: 'U (traverses)', count, unitWeight: Math.round(Number(len) * 3.5 * 10) / 10 });
  }

  // --- PLATEFORMES (plateau 0.32m + trappe 0.64m) ---
  // Layher : plateaux (0.32m) + demi-plateaux (0.19m, pour largeurs 1.57 et 2.57) + trappes (0.64m)
  const PLATEAU_W = 0.32;
  const DEMI_W = 0.19;
  const TRAPPE_W = 0.64;
  // Largeurs qui necessitent un demi-plateau au milieu
  const NEEDS_DEMI = [1.57, 2.57];

  for (const m of pc.mailles) {
    const r = getMailleRect(m);
    const dimX = closestLedger(r.x2 - r.x1);
    const dimZ = closestLedger(r.z2 - r.z1);
    const plankLen = m.plancherSens === 'longueur' ? dimX : dimZ;
    const coverDim = m.plancherSens === 'longueur' ? dimZ : dimX;
    const mLevels = computeLevelsFor(m.hauteurPlancher);
    const nbNiveaux = m.aVide ? 1 : mLevels.length;
    const needsDemi = NEEDS_DEMI.includes(coverDim);

    if (pc.echelle && !m.aVide) {
      const remaining = coverDim - TRAPPE_W - (needsDemi ? DEMI_W : 0);
      const nbPlateaux = Math.max(0, Math.round(remaining / PLATEAU_W));
      items.push({ name: `Trappe ${plankLen}×0.64m`, category: 'Plateformes', count: nbNiveaux, unitWeight: Math.round(plankLen * 4.5 * 10) / 10 });
      if (needsDemi) {
        items.push({ name: `Demi-plateau ${plankLen}×0.19m`, category: 'Plateformes', count: nbNiveaux, unitWeight: Math.round(plankLen * 0.9 * 10) / 10 });
      }
      if (nbPlateaux > 0) {
        items.push({ name: `Plateau ${plankLen}×0.32m`, category: 'Plateformes', count: nbPlateaux * nbNiveaux, unitWeight: Math.round(plankLen * 1.5 * 10) / 10 });
      }
    } else {
      const coverForPlateaux = coverDim - (needsDemi ? DEMI_W : 0);
      const nbPlateaux = Math.round(coverForPlateaux / PLATEAU_W);
      if (needsDemi) {
        items.push({ name: `Demi-plateau ${plankLen}×0.19m`, category: 'Plateformes', count: nbNiveaux, unitWeight: Math.round(plankLen * 0.9 * 10) / 10 });
      }
      if (nbPlateaux > 0) {
        items.push({ name: `Plateau ${plankLen}×0.32m`, category: 'Plateformes', count: nbPlateaux * nbNiveaux, unitWeight: Math.round(plankLen * 1.5 * 10) / 10 });
      }
    }
  }

  // Diagonales : mailles pleines = 2 au 1er niveau, mailles a vide = 2 par niveau (per-maille levels)
  const maillesPleines = pc.mailles.filter(m => !m.aVide);
  const maillesVides = pc.mailles.filter(m => m.aVide);
  const diagPleines = maillesPleines.length * 2;
  const diagVides = maillesVides.reduce((s, m) => s + computeLevelsFor(m.hauteurPlancher).length * 4, 0);
  const totalDiag = diagPleines + diagVides;
  if (totalDiag > 0) {
    items.push({ name: 'Diagonale', category: 'Diagonales', count: totalDiag, unitWeight: 5.5 });
  }

  // --- GC (= moises) et plinthes ---
  // Mailles pleines : GC a tous les niveaux sur cotes ouverts
  // Mailles a vide : GC uniquement au top (1 niveau) sur cotes ouverts
  const eps = 0.02;

  const gcByLen: Record<string, number> = {};
  const toeByLen: Record<string, number> = {};
  let portillonCount = 0;
  let crinolineEchelles = 0;
  let crinolineArceaux = 0;
  let crinolinePoteaux = 0;
  let crinolineMoises = 0;
  for (const m of pc.mailles) {
    const r = getMailleRect(m);
    const segs = getOpenSegments(r, rects);
    // Retirer les segments ouverts couverts par un deport (le deport a ses propres GC)
    // On ne retire que les segments ouverts — les segments adjacents a d'autres mailles gardent leur GC
    if (m.deport && m.deportLongueur > 0) {
      if (m.deportSides.zmin && segs.zmin.length > 0) segs.zmin = [];
      if (m.deportSides.zmax && segs.zmax.length > 0) segs.zmax = [];
      if (m.deportSides.xmin && segs.xmin.length > 0) segs.xmin = [];
      if (m.deportSides.xmax && segs.xmax.length > 0) segs.xmax = [];
    }
    const accesSide = m.accesExterieur ? m.accesExterieurSide : null;
    const mLevels2 = computeLevelsFor(m.hauteurPlancher);
    const nbNiveaux = m.aVide ? 1 : mLevels2.length;
    const accesNiveaux = m.accesExterieur && m.accesExterieurPremierPalier ? 1 : nbNiveaux;
    // GC/plinthes par segment ouvert
    for (const edge of ['zmin', 'zmax', 'xmin', 'xmax'] as Edge[]) {
      const edgeSegs = segs[edge];
      if (edgeSegs.length === 0) continue;
      for (const [s, e] of edgeSegs) {
        const segLen = closestLedger(e - s);
        if (edge === accesSide) {
          portillonCount += accesNiveaux;
          const gcNiveaux = nbNiveaux - accesNiveaux;
          if (gcNiveaux > 0) {
            const k = `${segLen}`;
            gcByLen[k] = (gcByLen[k] || 0) + gcNiveaux * 2;
            toeByLen[k] = (toeByLen[k] || 0) + gcNiveaux;
          }
        } else {
          const k = `${segLen}`;
          gcByLen[k] = (gcByLen[k] || 0) + nbNiveaux * 2;
          toeByLen[k] = (toeByLen[k] || 0) + nbNiveaux;
        }
      }
    }
    // Crinoline
    if (m.accesExterieur) {
      const crinoH = m.accesExterieurPremierPalier ? (mLevels2[0] || 2) : m.hauteurPlancher;
      const nbSections = Math.ceil(crinoH / 2);
      crinolineEchelles += nbSections;
      crinolineArceaux += nbSections * 3;
      crinolinePoteaux += 2;
      crinolineMoises += nbSections + 1;
    }
  }
  for (const [len, count] of Object.entries(gcByLen)) {
    items.push({ name: `Moise GC ${len}m`, category: 'Moises', count, unitWeight: Math.round(Number(len) * 3.5 * 10) / 10 });
  }
  for (const [len, count] of Object.entries(toeByLen)) {
    items.push({ name: `Plinthe ${len}m`, category: 'Plinthes', count, unitWeight: Math.round(Number(len) * 1.5 * 10) / 10 });
  }
  // Acces exterieur BOM
  if (portillonCount > 0) items.push({ name: 'Portillon acces', category: 'Acces exterieur', count: portillonCount, unitWeight: 8.5 });
  if (crinolineEchelles > 0) {
    items.push({ name: 'Echelle crinoline 2m', category: 'Acces exterieur', count: crinolineEchelles, unitWeight: 12.0 });
    items.push({ name: 'Arceau crinoline', category: 'Acces exterieur', count: crinolineArceaux, unitWeight: 3.2 });
    items.push({ name: 'Poteau crinoline 2m', category: 'Acces exterieur', count: crinolinePoteaux, unitWeight: 7.3 });
    items.push({ name: 'Moise crinoline', category: 'Acces exterieur', count: crinolineMoises, unitWeight: 3.5 });
  }
  // Colliers plinthe : 3 par niveau ou il y a un acces
  const accesMailleCount = pc.mailles.filter(m => m.accesExterieur).length;
  if (accesMailleCount > 0) {
    const accesNiveauxTotal = pc.mailles.reduce((sum, m) => {
      if (!m.accesExterieur) return sum;
      return sum + (m.accesExterieurPremierPalier ? 1 : computeLevelsFor(m.hauteurPlancher).length);
    }, 0);
    items.push({ name: 'Collier plinthe', category: 'Acces exterieur', count: accesNiveauxTotal * 3, unitWeight: 0.8 });
  }
  // Cales : 1 par verin (= 1 par poteau)
  items.push({ name: 'Cale bois', category: 'Verins de base', count: nbPoteaux, unitWeight: 0.5 });

  // --- SAPINE (contreventement au pied : poteaux + moises + diag + verins) ---
  if (needsSapine(pc)) {
    // 2 poteaux de sapine
    const sapLevels0 = computeLevelsFor(pc.mailles[0]?.hauteurPlancher || 6);
    const sapPoteauH = (sapLevels0[0] || 2) + 1;
    const nbSegSap = Math.ceil(sapPoteauH / 2);
    items.push({ name: 'Poteau 2m (sapine)', category: 'Sapine', count: 2 * nbSegSap, unitWeight: 7.3 });
    items.push({ name: 'Verin de base (sapine)', category: 'Sapine', count: 2, unitWeight: 4.0 });
    // Moises : 2 niveaux (base + 1er plancher) x 3 moises (2 en Z + 1 en X)
    const sapLargeur = pc.mailles[0]?.largeur || 0.73;
    items.push({ name: 'Moise sapine', category: 'Sapine', count: 2 * 3, unitWeight: Math.round(closestLedger(sapLargeur) * 3.5 * 10) / 10 });
    // Diagonales : 2 en X (face avant) + 4 en Z (2 faces laterales) = 6
    items.push({ name: 'Diagonale sapine', category: 'Sapine', count: 6, unitWeight: 5.5 });
  }

  // --- DEPORT (per maille) ---
  // Dedupliquer les poteaux 1m du deport par position
  const deportPoteauSet = new Set<string>();
  for (const m of pc.mailles) {
    if (!m.deport || m.deportLongueur <= 0) continue;
    const r = getMailleRect(m);
    const dL = closestLedger(m.deportLongueur);
    const depLevels = computeLevelsFor(m.hauteurPlancher);
    const nbEtages = m.deportTousEtages ? depLevels.length : 1;

    const addDeportForSide = (mLen: number, isXaxis: boolean, p1x: number, p1z: number, p2x: number, p2z: number) => {
      const ml = closestLedger(mLen);
      items.push({ name: `Equerre ${dL}m`, category: 'Consoles', count: 2 * nbEtages, unitWeight: Math.round(dL * 5 * 10) / 10 });
      deportPoteauSet.add(`${p1x.toFixed(3)},${p1z.toFixed(3)}`);
      deportPoteauSet.add(`${p2x.toFixed(3)},${p2z.toFixed(3)}`);
      items.push({ name: `${isXaxis ? 'Moise' : 'U'} bout ${ml}m (deport)`, category: 'Consoles', count: nbEtages, unitWeight: Math.round(ml * 3.5 * 10) / 10 });
      // Plateaux du deport selon le sens choisi
      const depPlankLen = m.deportPlancherSens === 'longueur' ? ml : dL;
      const depCoverDim = m.deportPlancherSens === 'longueur' ? dL : ml;
      const depNeedsDemi = NEEDS_DEMI.includes(depCoverDim);
      const depCoverForPlateaux = depCoverDim - (depNeedsDemi ? DEMI_W : 0);
      const nbDepPlateaux = Math.round(depCoverForPlateaux / PLATEAU_W);
      if (depNeedsDemi) {
        items.push({ name: `Demi-plateau ${depPlankLen}×0.19m (deport)`, category: 'Consoles', count: nbEtages, unitWeight: Math.round(depPlankLen * 0.9 * 10) / 10 });
      }
      if (nbDepPlateaux > 0) {
        items.push({ name: `Plateau ${depPlankLen}×0.32m (deport)`, category: 'Consoles', count: nbDepPlateaux * nbEtages, unitWeight: Math.round(depPlankLen * 1.5 * 10) / 10 });
      }
      items.push({ name: `Moise GC ${ml}m (deport bout)`, category: 'Moises', count: nbEtages * 2, unitWeight: Math.round(ml * 3.5 * 10) / 10 });
      items.push({ name: `Moise GC ${dL}m (deport retour)`, category: 'Moises', count: 2 * nbEtages * 2, unitWeight: Math.round(dL * 3.5 * 10) / 10 });
      items.push({ name: `Plinthe ${ml}m (deport)`, category: 'Consoles', count: nbEtages, unitWeight: Math.round(ml * 1.5 * 10) / 10 });
      items.push({ name: `Plinthe ${dL}m (deport)`, category: 'Consoles', count: 2 * nbEtages, unitWeight: Math.round(dL * 1.5 * 10) / 10 });
    };
    const mLen_x = r.x2 - r.x1;
    const mLen_z = r.z2 - r.z1;
    if (m.deportSides.zmin) addDeportForSide(mLen_x, true, r.x1, r.z1 - dL, r.x2, r.z1 - dL);
    if (m.deportSides.zmax) addDeportForSide(mLen_x, true, r.x1, r.z2 + dL, r.x2, r.z2 + dL);
    if (m.deportSides.xmin) addDeportForSide(mLen_z, false, r.x1 - dL, r.z1, r.x1 - dL, r.z2);
    if (m.deportSides.xmax) addDeportForSide(mLen_z, false, r.x2 + dL, r.z1, r.x2 + dL, r.z2);
  }
  if (deportPoteauSet.size > 0) {
    items.push({ name: 'Poteau 1m (deport)', category: 'Consoles', count: deportPoteauSet.size, unitWeight: 3.7 });
  }

  // --- Extras ---
  if (pc.verinage) {
    items.push({ name: 'Collier fixe (verinage)', category: 'Colliers', count: nbPoteaux * 2, unitWeight: 1.1 });
    items.push({ name: 'Tube 1.5m (verinage)', category: 'Tubes', count: nbPoteaux, unitWeight: 5.4 });
    items.push({ name: 'Verin tete (inverse)', category: 'Verins', count: nbPoteaux, unitWeight: 3.2 });
  }

  if (pc.echelle) {
    const maxLevelsCount = Math.max(...pc.mailles.map(m => computeLevelsFor(m.hauteurPlancher).length));
    items.push({ name: 'Echelle 2.15m', category: 'Echelles', count: maxLevelsCount, unitWeight: 9.7 });
    items.push({ name: 'Collier fixe (echelle)', category: 'Colliers', count: maxLevelsCount * 2, unitWeight: 1.1 });
  }

  return items;
}

// ==========================================
// TOGGLE
// ==========================================
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-[22px] rounded-full transition-all duration-200 relative flex-shrink-0 ${
        checked ? 'bg-[#F2A900]/15 border border-[#F2A900]/30' : 'bg-black/[0.04] border border-black/[0.1]'
      }`}
    >
      <span className={`absolute top-[3px] w-4 h-4 rounded-full transition-all duration-200 ${
        checked ? 'left-[21px] bg-[#F2A900] shadow-[0_0_6px_rgba(242,169,0,0.3)]' : 'left-[3px] bg-[#c7c7cc]'
      }`} />
    </button>
  );
}

// ==========================================
// 2D LAYOUT EDITOR (vue du dessus)
// ==========================================
function LayoutEditor({
  config, setConfig, selected, setSelected,
}: {
  config: PlannerConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlannerConfig>>;
  selected: string | null;
  setSelected: (id: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Pinch-to-zoom state
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  // Drag state : on gèle le système de coordonnées au début du drag
  const [dragging, setDragging] = useState<{
    id: string;
    startClientX: number;
    startClientY: number;
    startMailleX: number;
    startMailleZ: number;
    pxPerMeter: number; // pixels écran par mètre monde (gelé)
  } | null>(null);

  const SNAP = 0.01; // snap 1cm
  const PAD = 40; // padding en px

  const rects = useMemo(
    () => config.mailles.map(m => ({ m, r: getMailleRect(m) })),
    [config.mailles],
  );

  const bounds = useMemo(() => {
    if (rects.length === 0) return { minX: -5, minZ: -5, maxX: 5, maxZ: 5 };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const { r } of rects) {
      minX = Math.min(minX, r.x1); minZ = Math.min(minZ, r.z1);
      maxX = Math.max(maxX, r.x2); maxZ = Math.max(maxZ, r.z2);
    }
    const margin = Math.max((maxX - minX), (maxZ - minZ), 3) * 0.5;
    return { minX: minX - margin, minZ: minZ - margin, maxX: maxX + margin, maxZ: maxZ + margin };
  }, [rects]);

  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxZ - bounds.minZ;

  const containerW = 320;
  const containerH = 300;
  const baseScale = Math.max(Math.min((containerW - PAD) / worldW, (containerH - PAD) / worldH, 100), 30);
  const sc = baseScale * zoomLevel;

  const svgW = worldW * sc + PAD * 2;
  const svgH = worldH * sc + PAD * 2;

  const toSvgX = (wx: number) => (wx - bounds.minX) * sc + PAD;
  const toSvgY = (wz: number) => (wz - bounds.minZ) * sc + PAD;

  const snapVal = (v: number) => Math.round(v / SNAP) * SNAP;

  // Snap aux bords des autres mailles
  const snapToEdges = useCallback((mx: number, mz: number, dragId: string, maille: MailleConfig) => {
    const l = closestLedger(maille.longueur);
    const w = closestLedger(maille.largeur);
    const mw = maille.rotation === 0 ? l : w;
    const md = maille.rotation === 0 ? w : l;
    let bestX = snapVal(mx);
    let bestZ = snapVal(mz);
    const threshold = 0.08; // seuil de snap en metres

    for (const { m, r } of rects) {
      if (m.id === dragId) continue;
      // Snap X edges
      for (const edge of [r.x1, r.x2]) {
        if (Math.abs(mx - edge) < threshold) bestX = edge;
        if (Math.abs(mx + mw - edge) < threshold) bestX = edge - mw;
      }
      // Snap Z edges
      for (const edge of [r.z1, r.z2]) {
        if (Math.abs(mz - edge) < threshold) bestZ = edge;
        if (Math.abs(mz + md - edge) < threshold) bestZ = edge - md;
      }
    }
    return { x: bestX, z: bestZ };
  }, [rects]);

  // Calcule le ratio pixels-écran / mètres-monde à l'instant T
  const getPxPerMeter = () => {
    const svg = svgRef.current;
    if (!svg) return sc;
    const ctm = svg.getScreenCTM();
    if (!ctm) return sc;
    // ctm.a = scale X du SVG user units → screen pixels
    // sc = SVG user units par mètre monde
    return ctm.a * sc;
  };

  const startDrag = (clientX: number, clientY: number, id: string) => {
    setSelected(id);
    const maille = config.mailles.find(m => m.id === id)!;
    setDragging({
      id,
      startClientX: clientX,
      startClientY: clientY,
      startMailleX: maille.x,
      startMailleZ: maille.z,
      pxPerMeter: getPxPerMeter(),
    });
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragging) return;
    // Delta en pixels écran → delta en mètres monde (ratio gelé)
    const dxPx = clientX - dragging.startClientX;
    const dyPx = clientY - dragging.startClientY;
    const rawX = dragging.startMailleX + dxPx / dragging.pxPerMeter;
    const rawZ = dragging.startMailleZ + dyPx / dragging.pxPerMeter;
    const maille = config.mailles.find(m => m.id === dragging.id)!;
    const snapped = snapToEdges(rawX, rawZ, dragging.id, maille);
    setConfig(prev => ({
      ...prev,
      mailles: prev.mailles.map(m => m.id === dragging.id ? { ...m, x: snapped.x, z: snapped.z } : m),
    }));
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.detail === 2) {
      setConfig(prev => ({
        ...prev,
        mailles: prev.mailles.map(m => m.id === id ? { ...m, rotation: m.rotation === 0 ? 90 : 0 as 0 | 90 } : m),
      }));
      return;
    }
    startDrag(e.clientX, e.clientY, id);
  };

  const handleMouseMove = (e: React.MouseEvent) => moveDrag(e.clientX, e.clientY);
  const handleMouseUp = () => setDragging(null);

  // --- Touch events pour mobile (drag + pinch-to-zoom unifié) ---
  const lastTap = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    // Ne pas stopper la propagation pour que le pinch fonctionne
    // Double-tap pour tourner
    const now = Date.now();
    if (lastTap.current.id === id && now - lastTap.current.time < 350) {
      setConfig(prev => ({
        ...prev,
        mailles: prev.mailles.map(m => m.id === id ? { ...m, rotation: m.rotation === 0 ? 90 : 0 as 0 | 90 } : m),
      }));
      lastTap.current = { id: '', time: 0 };
      return;
    }
    lastTap.current = { id, time: now };
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY, id);
    }
  };

  // Gestion unifiée au niveau wrapper : pinch (2 doigts) + drag (1 doigt)
  const wrapperTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setDragging(null);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { startDist: Math.sqrt(dx * dx + dy * dy), startZoom: zoomLevel };
    }
  };

  const wrapperTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      if (!pinchRef.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { startDist: Math.sqrt(dx * dx + dy * dy), startZoom: zoomLevel };
      }
      e.preventDefault();
      setDragging(null);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinchRef.current.startDist;
      setZoomLevel(Math.max(0.2, Math.min(12, pinchRef.current.startZoom * scale)));
    } else if (e.touches.length === 1 && dragging) {
      e.preventDefault();
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const wrapperTouchEnd = () => { setDragging(null); pinchRef.current = null; };

  // Grille
  const gridLines: React.ReactElement[] = [];
  const gStep = 0.5;
  for (let gx = Math.floor(bounds.minX); gx <= Math.ceil(bounds.maxX); gx += gStep) {
    gridLines.push(<line key={`gx-${gx}`} x1={toSvgX(gx)} y1={toSvgY(bounds.minZ)} x2={toSvgX(gx)} y2={toSvgY(bounds.maxZ)}
      stroke="rgba(0,0,0,0.06)" strokeWidth={gx % 1 === 0 ? 1 : 0.5} />);
  }
  for (let gz = Math.floor(bounds.minZ); gz <= Math.ceil(bounds.maxZ); gz += gStep) {
    gridLines.push(<line key={`gz-${gz}`} x1={toSvgX(bounds.minX)} y1={toSvgY(gz)} x2={toSvgX(bounds.maxX)} y2={toSvgY(gz)}
      stroke="rgba(0,0,0,0.06)" strokeWidth={gz % 1 === 0 ? 1 : 0.5} />);
  }

  return (
    <div className="relative"
      style={{ touchAction: 'none' }}
      onTouchStart={wrapperTouchStart}
      onTouchMove={wrapperTouchMove}
      onTouchEnd={wrapperTouchEnd}
      onTouchCancel={wrapperTouchEnd}
    >
    <svg
      ref={svgRef}
      width={svgW} height={svgH}
      className="bg-[#f0f0f4] rounded-lg border border-black/[0.06]"
      style={{ maxWidth: '100%', maxHeight: `${containerH}px`, touchAction: 'none' }}
      viewBox={`0 0 ${svgW} ${svgH}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => { if (!dragging) setSelected(null); }}
    >
      {gridLines}
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
        </pattern>
      </defs>
      {rects.map(({ m, r }) => {
        const isSel = m.id === selected;
        const edgeSegs = getOpenSegments(r, rects.map(rr => rr.r));
        const w = (r.x2 - r.x1) * sc;
        const h = (r.z2 - r.z1) * sc;
        const acCol = (side: string) => m.accesExterieur && m.accesExterieurSide === side ? '#22c55e' : '#F2A900';
        const fillColor = m.aVide ? 'url(#hatch)' : isSel ? 'rgba(242,169,0,0.12)' : 'rgba(0,0,0,0.04)';
        const strokeColor = isSel ? '#F2A900' : m.aVide ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.15)';
        return (
          <g key={m.id} onMouseDown={(e) => handleMouseDown(e, m.id)} onTouchStart={(e) => handleTouchStart(e, m.id)}>
            <rect
              x={toSvgX(r.x1)} y={toSvgY(r.z1)} width={w} height={h}
              rx={3}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={isSel ? 2 : 1}
              className="cursor-move"
            />
            {/* Indicateurs segments ouverts — traits or / vert si acces */}
            {edgeSegs.xmin.map(([s, e], i) => <line key={`xmin-${i}`} x1={toSvgX(r.x1)} y1={toSvgY(s) + 2} x2={toSvgX(r.x1)} y2={toSvgY(e) - 2} stroke={acCol('xmin')} strokeWidth={3} opacity={0.5} />)}
            {edgeSegs.xmax.map(([s, e], i) => <line key={`xmax-${i}`} x1={toSvgX(r.x2)} y1={toSvgY(s) + 2} x2={toSvgX(r.x2)} y2={toSvgY(e) - 2} stroke={acCol('xmax')} strokeWidth={3} opacity={0.5} />)}
            {edgeSegs.zmin.map(([s, e], i) => <line key={`zmin-${i}`} x1={toSvgX(s) + 2} y1={toSvgY(r.z1)} x2={toSvgX(e) - 2} y2={toSvgY(r.z1)} stroke={acCol('zmin')} strokeWidth={3} opacity={0.5} />)}
            {edgeSegs.zmax.map(([s, e], i) => <line key={`zmax-${i}`} x1={toSvgX(s) + 2} y1={toSvgY(r.z2)} x2={toSvgX(e) - 2} y2={toSvgY(r.z2)} stroke={acCol('zmax')} strokeWidth={3} opacity={0.5} />)}
            {/* Label */}
            <text
              x={toSvgX(r.x1) + w / 2} y={toSvgY(r.z1) + h / 2}
              textAnchor="middle" dominantBaseline="central"
              fill={isSel ? '#c88800' : '#86868b'}
              fontSize={10} fontWeight={600}
            >
              {closestLedger(m.longueur)}×{closestLedger(m.largeur)}{m.aVide ? ' ∅' : ''}{m.accesExterieur ? ' ⇄' : ''}{m.deport ? ' ⌐' : ''}
            </text>
          </g>
        );
      })}
    </svg>
    {/* Boutons zoom +/- (gros pour tactile) */}
    <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
      <button
        onClick={() => setZoomLevel(z => Math.min(z * 2, 12))}
        className="w-10 h-10 rounded-lg bg-white/90 border border-black/10 text-lg font-bold text-[#1d1d1f] active:bg-[#F2A900]/10 shadow-sm flex items-center justify-center select-none"
      >+</button>
      <button
        onClick={() => setZoomLevel(z => Math.max(z / 2, 0.2))}
        className="w-10 h-10 rounded-lg bg-white/90 border border-black/10 text-lg font-bold text-[#1d1d1f] active:bg-[#F2A900]/10 shadow-sm flex items-center justify-center select-none"
      >−</button>
    </div>
    </div>
  );
}

// ==========================================
// CONFIG PANEL (LEFT)
// ==========================================
function ConfigPanel({
  config, setConfig, bomItems, selected, setSelected,
}: {
  config: PlannerConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlannerConfig>>;
  bomItems: BOMItem[];
  selected: string | null;
  setSelected: (id: string | null) => void;
}) {

  const totalPieces = bomItems.reduce((s, it) => s + it.count, 0);
  const totalWeight = Math.round(bomItems.reduce((s, it) => s + it.count * it.unitWeight, 0) * 10) / 10;

  let nextId = useRef(Date.now());

  const addMaille = () => {
    const last = config.mailles[config.mailles.length - 1];
    const lastRect = last ? getMailleRect(last) : null;
    let newX = lastRect ? lastRect.x2 : 0;
    let newZ = lastRect ? lastRect.z1 : 0;
    const id = String(nextId.current++);
    const longueur = last?.longueur || 2.07;
    const largeur = last?.largeur || 0.73;

    // Verifier si la nouvelle maille chevauche une tour et decaler si besoin
    const testRect = (): MailleRect => {
      const l = closestLedger(longueur);
      const w = closestLedger(largeur);
      return { id, x1: newX, z1: newZ, x2: newX + l, z2: newZ + w };
    };
    // Pas de blocage — placement libre partout

    setConfig(prev => ({
      ...prev,
      mailles: [...prev.mailles, { id, longueur, largeur, x: newX, z: newZ, rotation: 0, hauteurPlancher: last?.hauteurPlancher || 2, aVide: false, accesExterieur: false, accesExterieurSide: 'zmin' as AccesSide, accesExterieurPremierPalier: false, plancherSens: 'longueur' as PlancherSens, deport: false, deportLongueur: 0.73, deportSides: { zmin: false, zmax: false, xmin: false, xmax: false }, deportTousEtages: false, deportPlancherSens: 'longueur' as PlancherSens}],
    }));
    setSelected(id);
  };

  const removeMaille = () => {
    if (!selected || config.mailles.length <= 1) return;
    setConfig(prev => ({ ...prev, mailles: prev.mailles.filter(m => m.id !== selected) }));
    setSelected(null);
  };

  const rotateMaille = () => {
    if (!selected) return;
    setConfig(prev => ({
      ...prev,
      mailles: prev.mailles.map(m => m.id === selected ? { ...m, rotation: m.rotation === 0 ? 90 : 0 as 0 | 90 } : m),
    }));
  };

  const updateMaille = (patch: Partial<MailleConfig>) => {
    if (!selected) return;
    setConfig(prev => ({
      ...prev,
      mailles: prev.mailles.map(m => m.id === selected ? { ...m, ...patch } : m),
    }));
  };

  const sm = selected ? config.mailles.find(m => m.id === selected) : null;

  return (
    <div className="w-full sm:w-[300px] sm:min-w-[300px] glass-panel sm:border-r border-black/[0.06] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <Ruler size={14} className="text-[#F2A900]" />
          <span className="text-xs font-semibold text-[#1d1d1f]">Configuration</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Layout editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-[#86868b]">
              Mailles ({config.mailles.length})
            </label>
            <div className="flex gap-1.5">
              <button onClick={rotateMaille} disabled={!selected}
                className="w-11 h-11 rounded-xl flex items-center justify-center bg-black/[0.03] border border-black/[0.1] text-[#86868b] active:bg-black/[0.08] disabled:opacity-30" title="Tourner">
                <RotateCw size={18} />
              </button>
              <button onClick={removeMaille} disabled={!selected || config.mailles.length <= 1}
                className="w-11 h-11 rounded-xl flex items-center justify-center bg-red-500/5 border border-red-500/20 text-red-400 active:bg-red-500/10 disabled:opacity-30" title="Supprimer">
                <Trash2 size={18} />
              </button>
              <button onClick={addMaille}
                className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#F2A900]/10 border border-[#F2A900]/30 text-[#c88800] active:bg-[#F2A900]/20" title="Ajouter">
                <Plus size={18} />
              </button>
            </div>
          </div>

          <LayoutEditor config={config} setConfig={setConfig} selected={selected} setSelected={setSelected} />

          <p className="text-[9px] text-[#aeaeb2] mt-1">
            <Move size={9} className="inline mr-0.5" /> Appuyer pour selectionner &bull; Glisser pour deplacer &bull; Double-tap pour tourner
          </p>
        </div>

        {/* Options maille selectionnee */}
        {sm && (
          <div className="space-y-2 p-3 bg-[#f8f8fa] rounded-lg border border-black/[0.08]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[#c88800] uppercase tracking-wider font-semibold">Maille {closestLedger(sm.longueur)}×{closestLedger(sm.largeur)}</label>
              <div className="flex gap-1.5">
                <button onClick={() => updateMaille({ rotation: sm.rotation === 0 ? 90 : 0 as 0 | 90 })}
                  className="p-1 rounded bg-black/[0.03] border border-black/[0.1] text-[#86868b] hover:text-[#1d1d1f] active:scale-90" title="Tourner">
                  <RotateCw size={11} />
                </button>
                <button onClick={() => { if (config.mailles.length <= 1) return; setConfig(prev => ({ ...prev, mailles: prev.mailles.filter(m => m.id !== selected) })); setSelected(null); }}
                  disabled={config.mailles.length <= 1}
                  className="p-1 rounded bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 active:scale-90 disabled:opacity-30" title="Supprimer">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#86868b] block mb-1.5">Longueur</label>
              <div className="flex flex-wrap gap-1.5">
                {MOISE_LENGTHS.map((l) => (
                  <button key={`l-${l}`} onClick={() => updateMaille({ longueur: l })}
                    className={`min-w-[44px] px-2.5 py-2 text-[12px] rounded-lg transition-all ${sm.longueur === l ? 'bg-[#F2A900]/10 border-2 border-[#F2A900]/40 text-[#c88800] font-semibold' : 'bg-black/[0.03] border border-black/[0.1] text-[#86868b] active:bg-black/[0.06]'}`}>
                    {l}m
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#86868b] block mb-1.5">Profondeur</label>
              <div className="flex flex-wrap gap-1.5">
                {MOISE_LENGTHS.map((l) => (
                  <button key={`w-${l}`} onClick={() => updateMaille({ largeur: l })}
                    className={`min-w-[44px] px-2.5 py-2 text-[12px] rounded-lg transition-all ${sm.largeur === l ? 'bg-[#3b82f6]/10 border-2 border-[#3b82f6]/40 text-[#3b82f6] font-semibold' : 'bg-black/[0.03] border border-black/[0.1] text-[#86868b] active:bg-black/[0.06]'}`}>
                    {l}m
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#86868b] block mb-1.5">Hauteur plancher</label>
              <div className="flex flex-wrap gap-1">
                {HAUTEURS_PLANCHER.map((h) => (
                  <button key={`h-${h}`} onClick={() => updateMaille({ hauteurPlancher: h })}
                    className={`min-w-[40px] px-2 py-2 text-[12px] rounded-lg transition-all ${sm.hauteurPlancher === h ? 'bg-[#ef4444]/10 border-2 border-[#ef4444]/40 text-[#ef4444] font-semibold' : 'bg-black/[0.03] border border-black/[0.1] text-[#86868b] active:bg-black/[0.06]'}`}>
                    {h}m
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-[10px] text-[#86868b] cursor-pointer">
                <input type="checkbox" checked={sm.aVide} onChange={(e) => updateMaille({ aVide: e.target.checked })}
                  className="w-3.5 h-3.5 rounded accent-[#F2A900]" />
                Vide
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-[#22c55e] cursor-pointer">
                <input type="checkbox" checked={sm.accesExterieur} onChange={(e) => updateMaille({ accesExterieur: e.target.checked })}
                  className="w-3.5 h-3.5 rounded accent-[#22c55e]" />
                Acces ext.
              </label>
            </div>
            {!sm.aVide && (
              <div>
                <label className="text-[9px] text-[#86868b] block mb-1">Sens plancher</label>
                <div className="flex gap-1">
                  {([['longueur', 'En longueur'], ['largeur', 'En largeur']] as [PlancherSens, string][]).map(([s, label]) => (
                    <button key={s} onClick={() => updateMaille({ plancherSens: s })}
                      className={`flex-1 py-1 text-[9px] rounded transition-all ${sm.plancherSens === s ? 'bg-[#F2A900]/10 border border-[#F2A900]/30 text-[#c88800]' : 'bg-black/[0.03] border border-black/[0.1] text-[#86868b]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {sm.accesExterieur && (
              <div className="space-y-1.5 pt-1 border-t border-black/[0.05]">
                <label className="text-[9px] text-[#22c55e] block">Cote acces (crinoline + portillon)</label>
                <div className="flex gap-1">
                  {([['zmin', 'Avant'], ['zmax', 'Arriere'], ['xmin', 'Gauche'], ['xmax', 'Droite']] as [AccesSide, string][]).map(([side, label]) => (
                    <button key={side} onClick={() => updateMaille({ accesExterieurSide: side })}
                      className={`flex-1 py-1 text-[9px] rounded transition-all ${sm.accesExterieurSide === side ? 'bg-[#22c55e]/20 border border-[#22c55e]/50 text-[#22c55e]' : 'bg-black/[0.03] border border-black/[0.1] text-[#86868b]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-[10px] text-[#86868b] cursor-pointer">
                  <input type="checkbox" checked={sm.accesExterieurPremierPalier} onChange={(e) => updateMaille({ accesExterieurPremierPalier: e.target.checked })}
                    className="w-3.5 h-3.5 rounded accent-[#22c55e]" />
                  Premier palier uniquement
                </label>
              </div>
            )}
            {/* Deport per maille */}
            <div className="pt-1 border-t border-black/[0.05]">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[#3b82f6]">Deport (console)</label>
                <Toggle checked={sm.deport} onChange={(v) => updateMaille({ deport: v })} />
              </div>
              {sm.deport && (
                <div className="mt-1.5 space-y-1.5">
                  <label className="text-[9px] text-[#86868b] block">Longueur deport</label>
                  <div className="flex flex-wrap gap-1">
                    {MOISE_LENGTHS.map((l) => (
                      <button key={`d-${l}`} onClick={() => updateMaille({ deportLongueur: l })}
                        className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${sm.deportLongueur === l ? 'bg-[#3b82f6]/10 border border-[#3b82f6]/30 text-[#3b82f6]' : 'bg-black/[0.03] border border-black/[0.1] text-[#86868b]'}`}>
                        {l}m
                      </button>
                    ))}
                  </div>
                  <label className="text-[9px] text-[#86868b] block">Cotes</label>
                  <div className="grid grid-cols-2 gap-1">
                    {([['zmin', 'Avant'], ['zmax', 'Arriere'], ['xmin', 'Gauche'], ['xmax', 'Droite']] as [keyof DeportSides, string][]).map(([side, label]) => (
                      <label key={side} className="flex items-center gap-1.5 text-[9px] text-[#86868b] cursor-pointer">
                        <input type="checkbox" checked={sm.deportSides[side]}
                          onChange={(e) => updateMaille({ deportSides: { ...sm.deportSides, [side]: e.target.checked } })}
                          className="w-3 h-3 rounded accent-[#3b82f6]" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-[9px] text-[#86868b] cursor-pointer">
                    <input type="checkbox" checked={sm.deportTousEtages} onChange={(e) => updateMaille({ deportTousEtages: e.target.checked })}
                      className="w-3 h-3 rounded accent-[#3b82f6]" />
                    Tous les etages
                  </label>
                  <label className="text-[9px] text-[#86868b] block">Sens plancher deport</label>
                  <div className="flex gap-1">
                    {([['longueur', 'En longueur'], ['largeur', 'En largeur']] as [PlancherSens, string][]).map(([s, label]) => (
                      <button key={s} onClick={() => updateMaille({ deportPlancherSens: s })}
                        className={`flex-1 py-1 text-[9px] rounded transition-all ${sm.deportPlancherSens === s ? 'bg-[#3b82f6]/10 border border-[#3b82f6]/30 text-[#3b82f6]' : 'bg-black/[0.03] border border-black/[0.1] text-[#86868b]'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {!sm && (
          <p className="text-[9px] text-[#aeaeb2] text-center py-2">Selectionnez une maille pour voir ses options</p>
        )}

        <div className="w-full h-px bg-black/[0.05]" />

        {/* Options globales */}
        <div className="space-y-3">
          <label className="text-[10px] text-[#aeaeb2] uppercase tracking-wider font-semibold block">Options generales</label>

          {needsSapine(config) && (
            <p className="text-[9px] text-[#c88800]/70 mt-1">
              Sapine (contreventement) ajoutee automatiquement — {sapineLevels(config)} niveau{sapineLevels(config) > 1 ? 'x' : ''} de diagonales
            </p>
          )}

          {/* Verinage */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-[12px] text-[#86868b] block">Verinage</label>
              <span className="text-[9px] text-[#aeaeb2]">tube + 2 colliers + verin inverse</span>
            </div>
            <Toggle checked={config.verinage} onChange={(v) => setConfig(p => ({ ...p, verinage: v }))} />
          </div>

          {/* Echelle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-[12px] text-[#86868b] block">Echelle interieure</label>
              <span className="text-[9px] text-[#aeaeb2]">2.15m par trappe, alternance</span>
            </div>
            <Toggle checked={config.echelle} onChange={(v) => setConfig(p => ({ ...p, echelle: v }))} />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-t border-black/[0.06] bg-black/[0.01]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#86868b]">Pieces</span>
            <span className="font-semibold text-[#c88800]">{totalPieces}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#86868b]">Poids</span>
            <span className="font-semibold text-[#c88800]">{totalWeight} kg</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#86868b]">Surface</span>
            <span className="font-medium text-[#6e6e73]">{Math.round(config.mailles.reduce((s, m) => s + closestLedger(m.longueur) * closestLedger(m.largeur), 0) * 100) / 100} m2</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#86868b]">Niveaux</span>
            <span className="font-medium text-[#6e6e73]">{computeLevelsFor(Math.max(...config.mailles.map(m => m.hauteurPlancher))).length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// CANVAS PANEL (CENTER) - 3D
// ==========================================
function CanvasPanel({ plannerConfig }: { plannerConfig: PlannerConfig }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full">
      <div className="flex-1 relative">
        <ScaffoldViewer3D plannerConfig={plannerConfig} />
      </div>
    </div>
  );
}

// ==========================================
// BOM PANEL (RIGHT)
// ==========================================
function BOMPanel({ bomItems, chantierName }: { bomItems: BOMItem[]; chantierName: string }) {
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  // Ajustements manuels par nom de piece (key = item.name)
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  // Cases cochees (elements rayes)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const toggleChecked = (name: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const adjustCount = (name: string, delta: number) => {
    setAdjustments(prev => {
      const cur = prev[name] || 0;
      const next = cur + delta;
      if (next === 0) {
        const { [name]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: next };
    });
  };

  // Appliquer les ajustements aux items
  const adjustedItems = useMemo(() =>
    bomItems.map(it => ({
      ...it,
      count: Math.max(0, it.count + (adjustments[it.name] || 0)),
    })),
    [bomItems, adjustments],
  );

  const toggleCat = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const map: Record<string, BOMItem[]> = {};
    for (const item of adjustedItems) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return Object.entries(map).sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib);
    });
  }, [adjustedItems]);

  const totalPieces = adjustedItems.reduce((s, it) => s + it.count, 0);
  const totalWeight = Math.round(adjustedItems.reduce((s, it) => s + it.count * it.unitWeight, 0) * 10) / 10;

  const handleExportCSV = () => {
    const name = chantierName || 'echafaudage';
    const lines = [`Chantier: ${name}`, '', 'Categorie;Piece;Quantite;Poids unitaire (kg);Poids total (kg)'];
    for (const [cat, items] of grouped) {
      for (const item of items) {
        lines.push(`${cat};${item.name};${item.count};${item.unitWeight};${Math.round(item.count * item.unitWeight * 10) / 10}`);
      }
    }
    lines.push(`;;${totalPieces};;${totalWeight}`);
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `appro-${name.replace(/\s+/g, '-')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full sm:w-[340px] sm:min-w-[340px] glass-panel sm:border-l border-black/[0.06] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-black/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Package size={14} className="text-[#3b82f6]" />
            <span className="text-xs font-semibold">Approvisionnement</span>
          </div>
          <div className="flex items-center gap-1.5">
            {(Object.keys(adjustments).length > 0 || checkedItems.size > 0) && (
              <button onClick={() => { setAdjustments({}); setCheckedItems(new Set()); }} className="glass-button text-[10px] py-1 px-2 text-orange-400">
                Reset
              </button>
            )}
            <button onClick={handleExportCSV} className="glass-button text-[10px] py-1.5 px-2.5">
              <Download size={12} /> CSV
            </button>
          </div>
        </div>
        {/* Barre de progression checklist */}
        {checkedItems.size > 0 && (() => {
          const totalTypes = adjustedItems.filter(it => it.count > 0).length;
          const checkedCount = adjustedItems.filter(it => it.count > 0 && checkedItems.has(it.name)).length;
          const pct = totalTypes > 0 ? Math.round(checkedCount / totalTypes * 100) : 0;
          return (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-black/[0.05] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#F2A900' }}
                />
              </div>
              <span className="text-[10px] tabular-nums font-medium" style={{ color: pct === 100 ? '#22c55e' : '#c88800' }}>
                {checkedCount}/{totalTypes} {pct === 100 ? 'Complet' : `${pct}%`}
              </span>
            </div>
          );
        })()}
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-white z-10">
              <th className="text-left px-4 py-2 text-[#86868b] font-medium">Piece</th>
              <th className="text-center px-1 py-2 text-[#86868b] font-medium w-20">Qte</th>
              <th className="text-right px-2 py-2 text-[#86868b] font-medium w-14">kg/u</th>
              <th className="text-right px-4 py-2 text-[#86868b] font-medium w-14">kg</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([cat, items]) => {
              const isCollapsed = collapsedCats.has(cat);
              const catWeight = Math.round(items.reduce((s, it) => s + it.count * it.unitWeight, 0) * 10) / 10;
              const catCount = items.reduce((s, it) => s + it.count, 0);
              return (
                <CatGroup key={cat} cat={cat} items={items}
                  isCollapsed={isCollapsed} onToggle={() => toggleCat(cat)}
                  catWeight={catWeight} catCount={catCount}
                  adjustments={adjustments} onAdjust={adjustCount}
                  checkedItems={checkedItems} onToggleChecked={toggleChecked} />
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/[0.08]">
              <td className="px-4 py-2.5 font-semibold text-[12px]">Total</td>
              <td className="text-center px-1 py-2.5 font-semibold text-[12px]">{totalPieces}</td>
              <td />
              <td className="text-right px-4 py-2.5 font-semibold text-[12px] text-[#c88800]">{totalWeight} kg</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CatGroup({ cat, items, isCollapsed, onToggle, catWeight, catCount, adjustments, onAdjust, checkedItems, onToggleChecked }: {
  cat: string; items: BOMItem[]; isCollapsed: boolean; onToggle: () => void;
  catWeight: number; catCount: number;
  adjustments: Record<string, number>; onAdjust: (name: string, delta: number) => void;
  checkedItems: Set<string>; onToggleChecked: (name: string) => void;
}) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-black/[0.02] transition-colors" onClick={onToggle}>
        <td className="px-4 py-1.5 text-[10px] font-semibold text-[#c88800]/80 uppercase tracking-wider" colSpan={2}>
          <span className="inline-flex items-center gap-1">
            {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
            {cat} <span className="text-[#86868b] font-normal ml-1">({catCount})</span>
          </span>
        </td>
        <td />
        <td className="text-right px-4 py-1.5 text-[10px] text-[#86868b] font-medium">{catWeight}</td>
      </tr>
      {!isCollapsed && items.map((it, i) => {
        const adj = adjustments[it.name] || 0;
        const isChecked = checkedItems.has(it.name);
        return (
          <tr key={`${it.name}-${i}`} className={`hover:bg-black/[0.02] transition-colors group ${isChecked ? 'opacity-40' : ''}`}>
            <td className="pl-6 pr-1 py-1 truncate max-w-[180px]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleChecked(it.name)}
                  className="w-3 h-3 rounded border-black/[0.1] bg-black/[0.02] accent-green-500 cursor-pointer"
                />
                <span className={`text-[#6e6e73] ${isChecked ? 'line-through' : ''}`}>{it.name}</span>
              </label>
            </td>
            <td className="text-center px-1 py-1">
              <span className="inline-flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onAdjust(it.name, -1); }}
                  className="w-4 h-4 rounded text-[10px] leading-none bg-black/[0.03] hover:bg-red-500/10 text-[#aeaeb2] hover:text-red-500 transition-colors flex items-center justify-center"
                  disabled={it.count <= 0}
                >−</button>
                <span className={`tabular-nums font-medium w-6 text-center text-[11px] ${adj !== 0 ? 'text-orange-400' : ''}`}>{it.count}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onAdjust(it.name, 1); }}
                  className="w-4 h-4 rounded text-[10px] leading-none bg-black/[0.03] hover:bg-green-500/10 text-[#aeaeb2] hover:text-green-500 transition-colors flex items-center justify-center"
                >+</button>
              </span>
            </td>
            <td className={`text-right px-2 py-1 tabular-nums text-[#aeaeb2] ${isChecked ? 'line-through' : ''}`}>{it.unitWeight}</td>
            <td className={`text-right px-4 py-1 tabular-nums ${isChecked ? 'line-through' : ''}`}>{Math.round(it.count * it.unitWeight * 10) / 10}</td>
          </tr>
        );
      })}
    </>
  );
}

// ==========================================
// MAIN PLANNER VIEW
// ==========================================
type MobileTab = 'config' | '3d' | 'bom';

export function PlannerView() {
  const { showPlanner, setShowPlanner } = useEditorStore();
  const [mobileTab, setMobileTab] = useState<MobileTab>('config');
  const [selected, setSelected] = useState<string | null>(null);
  const [chantierName, setChantierName] = useState('');
  const [showShareToast, setShowShareToast] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const defaultConfig: PlannerConfig = {
    hauteurPlancher: 4,
    mailles: [
      { id: 'a', longueur: 3.07, largeur: 3.07, x: 0, z: 0, rotation: 0, hauteurPlancher: 4, aVide: false, accesExterieur: false, accesExterieurSide: 'zmin', accesExterieurPremierPalier: false, plancherSens: 'longueur' as PlancherSens, deport: false, deportLongueur: 0.73, deportSides: { zmin: false, zmax: false, xmin: false, xmax: false }, deportTousEtages: false, deportPlancherSens: 'longueur' as PlancherSens},
    ],
    verinage: false,
    echelle: true,
  };

  // Restauration auto-save au premier rendu
  const [config, setConfig] = useState<PlannerConfig>(() => {
    const saved = autoLoad();
    if (saved) return saved.config;
    return defaultConfig;
  });

  // Restaurer le nom du chantier
  useEffect(() => {
    const saved = autoLoad();
    if (saved?.chantierName) setChantierName(saved.chantierName);
  }, []);

  // Auto-save a chaque modification
  useEffect(() => {
    autoSave(config, chantierName);
  }, [config, chantierName]);

  const bomItems = useMemo(() => computeFullBOM(config), [config]);
  const safetyAlerts = useMemo(() => computeSafetyAlerts(config), [config]);

  if (!showPlanner) return null;

  const totalPieces = bomItems.reduce((s, it) => s + it.count, 0);
  const totalWeight = Math.round(bomItems.reduce((s, it) => s + it.count * it.unitWeight, 0) * 10) / 10;
  const maxH = Math.max(...config.mailles.map(m => m.hauteurPlancher));
  const nbLevels = computeLevelsFor(maxH).length;
  const surface = Math.round(config.mailles.reduce((s, m) => s + closestLedger(m.longueur) * closestLedger(m.largeur), 0) * 100) / 100;

  const handleShare = async () => {
    const text = generateShareText(config, chantierName, bomItems);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Echaf' 3D — ${chantierName || 'Mon echaf'}`, text });
        return;
      } catch { /* user cancelled or not supported */ }
    }
    // Fallback : copier dans le presse-papier
    try {
      await navigator.clipboard.writeText(text);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const handleReset = () => {
    if (!confirm('Nouveau chantier ? La configuration actuelle sera effacee.')) return;
    setConfig(defaultConfig);
    setChantierName('');
    setSelected(null);
  };

  const tabs: { id: MobileTab; label: string }[] = [
    { id: 'config', label: "Config" },
    { id: '3d', label: 'Vue 3D' },
    { id: 'bom', label: `Appro (${totalPieces})` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f5f7] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {editingName ? (
                <input
                  autoFocus
                  value={chantierName}
                  onChange={e => setChantierName(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); }}
                  placeholder="Nom du chantier..."
                  className="text-xs sm:text-sm font-semibold text-[#1d1d1f] bg-[#F2A900]/5 border border-[#F2A900]/30 rounded-md px-2 py-0.5 w-full outline-none"
                />
              ) : (
                <button onClick={() => setEditingName(true)} className="text-left min-w-0 group">
                  <h1 className="text-xs sm:text-sm font-semibold text-[#1d1d1f] truncate tracking-tight">
                    {chantierName || <span className="text-[#aeaeb2] italic">Nom du chantier...</span>}
                  </h1>
                </button>
              )}
            </div>
            <p className="text-[8px] sm:text-[9px] text-[#86868b] truncate">
              {config.mailles.length} maille{config.mailles.length > 1 ? 's' : ''}
              &bull; H{maxH}m &bull; {nbLevels} niv.
              &bull; {surface} m2
              &bull; {totalWeight} kg
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleShare}
            className="p-2 rounded-lg bg-[#F2A900]/10 text-[#c88800] active:bg-[#F2A900]/20 transition-colors"
            title="Partager"
          >
            <Share2 size={16} />
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg hover:bg-black/[0.04] text-[#86868b] active:bg-black/[0.08] transition-colors"
            title="Nouveau"
          >
            <FileText size={16} />
          </button>
          <button
            onClick={() => setShowPlanner(false)}
            className="p-2 rounded-lg hover:bg-black/[0.04] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Alertes securite */}
      {safetyAlerts.length > 0 && (
        <div className="px-3 py-1.5 bg-gradient-to-r from-amber-50 to-red-50 border-b border-amber-200/50 flex items-start gap-2 overflow-x-auto">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex gap-2 text-[10px]">
            {safetyAlerts.map((a, i) => (
              <span key={i} className={`whitespace-nowrap px-2 py-0.5 rounded-full ${
                a.level === 'danger' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {a.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toast partage */}
      {showShareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-[#1d1d1f] text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={14} className="text-green-400" /> Copie dans le presse-papier
        </div>
      )}

      {/* Mobile tabs */}
      <div className="flex sm:hidden border-b border-black/[0.06] bg-white">
        {tabs.map((t) => (
          <button key={t.id}
            onClick={() => setMobileTab(t.id)}
            className={`flex-1 py-3 text-[12px] font-medium transition-all ${
              mobileTab === t.id
                ? 'text-[#F2A900] border-b-2 border-[#F2A900] bg-[#F2A900]/5'
                : 'text-[#86868b]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Desktop: 3 colonnes | Mobile: tab active */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`${mobileTab === 'config' ? 'flex' : 'hidden'} sm:flex w-full sm:w-auto`}>
          <ConfigPanel config={config} setConfig={setConfig} bomItems={bomItems} selected={selected} setSelected={setSelected} />
        </div>
        <div className={`${mobileTab === '3d' ? 'flex' : 'hidden'} sm:flex flex-1`}>
          <CanvasPanel plannerConfig={config} />
        </div>
        <div className={`${mobileTab === 'bom' ? 'flex' : 'hidden'} sm:flex w-full sm:w-auto`}>
          <BOMPanel bomItems={bomItems} chantierName={chantierName} />
        </div>
      </div>

    </div>
  );
}
