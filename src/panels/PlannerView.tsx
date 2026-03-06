import { useState, useMemo, useRef, useCallback } from 'react';
import {
  X, Download, Package, Ruler, Plus, Minus,
  ChevronDown, ChevronRight, RotateCw, Trash2, Move,
} from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { closestLedger } from '../engine/scaffoldGenerator';
import { ScaffoldViewer3D } from '../canvas/renderers/ScaffoldViewer3D';

// ==========================================
// CONSTANTES METIER
// ==========================================
const HAUTEURS_PLANCHER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22];
const MOISE_LENGTHS = [0.73, 1.09, 1.40, 1.57, 2.07, 2.57, 3.07];

const CATEGORY_ORDER = [
  'Poteaux', 'Moises', 'U (traverses)', 'Diagonales', 'Sapine',
  'Plateformes', 'Plinthes', 'Consoles', 'Echelles', 'Acces exterieur',
  'Colliers', 'Tubes', 'Verins', 'Verins de base',
];

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

export interface PlannerConfig {
  hauteurPlancher: number;
  mailles: MailleConfig[];
  type: 'interieur' | 'exterieur';
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

// Sapine (contreventement) necessaire quand : exterieur + H/L > 4
// Nombre de niveaux de diagonales de sapine = ceil(hauteur / 4)
export function needsSapine(pc: PlannerConfig): boolean {
  const minDim = Math.min(...pc.mailles.map(m => closestLedger(m.largeur)), ...pc.mailles.map(m => closestLedger(m.longueur)));
  const maxH = globalMaxH(pc);
  return pc.type === 'exterieur' && maxH / minDim > 4;
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
        checked ? 'bg-[#e8c840]/25 border border-[#e8c840]/40' : 'bg-white/[0.04] border border-white/10'
      }`}
    >
      <span className={`absolute top-[3px] w-4 h-4 rounded-full transition-all duration-200 ${
        checked ? 'left-[21px] bg-[#e8c840] shadow-[0_0_6px_rgba(232,200,64,0.4)]' : 'left-[3px] bg-[#555566]'
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
  const [dragging, setDragging] = useState<{ id: string; startMx: number; startMz: number; origX: number; origZ: number } | null>(null);

  const SCALE = 100; // px par metre
  const SNAP = 0.01; // snap 1cm
  const PAD = 40; // padding en px

  const rects = useMemo(
    () => config.mailles.map(m => ({ m, r: getMailleRect(m) })),
    [config.mailles],
  );

  // Bornes pour auto-scale
  const bounds = useMemo(() => {
    if (rects.length === 0) return { minX: 0, minZ: 0, maxX: 3, maxZ: 2 };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const { r } of rects) {
      minX = Math.min(minX, r.x1); minZ = Math.min(minZ, r.z1);
      maxX = Math.max(maxX, r.x2); maxZ = Math.max(maxZ, r.z2);
    }
    return { minX: minX - 0.5, minZ: minZ - 0.5, maxX: maxX + 0.5, maxZ: maxZ + 0.5 };
  }, [rects]);

  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxZ - bounds.minZ;

  // Adapter le scale pour tenir dans la zone
  const containerW = 252; // largeur du panneau config - padding
  const containerH = 200;
  const fitScale = Math.min((containerW - PAD) / worldW, (containerH - PAD) / worldH, SCALE);
  const sc = Math.max(fitScale, 30);

  const svgW = worldW * sc + PAD * 2;
  const svgH = worldH * sc + PAD * 2;

  const toSvgX = (wx: number) => (wx - bounds.minX) * sc + PAD;
  const toSvgY = (wz: number) => (wz - bounds.minZ) * sc + PAD;
  const toWorldX = (sx: number) => (sx - PAD) / sc + bounds.minX;
  const toWorldZ = (sy: number) => (sy - PAD) / sc + bounds.minZ;

  const snapVal = (v: number) => Math.round(v / SNAP) * SNAP;

  // Snap aux bords des autres mailles
  const snapToEdges = useCallback((mx: number, mz: number, dragId: string, maille: MailleConfig) => {
    const l = closestLedger(maille.longueur);
    const w = closestLedger(maille.largeur);
    const mw = maille.rotation === 0 ? l : w;
    const md = maille.rotation === 0 ? w : l;
    let bestX = snapVal(mx);
    let bestZ = snapVal(mz);
    const threshold = 0.15; // seuil de snap en metres

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

  // --- Helpers pour convertir client coords en SVG coords ---
  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const startDrag = (clientX: number, clientY: number, id: string) => {
    setSelected(id);
    const svgPt = clientToSvg(clientX, clientY);
    const maille = config.mailles.find(m => m.id === id)!;
    setDragging({ id, startMx: toWorldX(svgPt.x), startMz: toWorldZ(svgPt.y), origX: maille.x, origZ: maille.z });
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragging) return;
    const svgPt = clientToSvg(clientX, clientY);
    const wx = toWorldX(svgPt.x);
    const wz = toWorldZ(svgPt.y);
    const dx = (wx - dragging.startMx) * 0.5;
    const dz = (wz - dragging.startMz) * 0.5;
    const maille = config.mailles.find(m => m.id === dragging.id)!;
    const snapped = snapToEdges(dragging.origX + dx, dragging.origZ + dz, dragging.id, maille);
    setConfig(prev => ({
      ...prev,
      mailles: prev.mailles.map(m => m.id === dragging.id ? { ...m, x: snapped.x, z: snapped.z } : m),
    }));
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
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

  // --- Touch events pour mobile ---
  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    e.stopPropagation();
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY, id);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    e.preventDefault(); // empeche le scroll pendant le drag
    const touch = e.touches[0];
    moveDrag(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => setDragging(null);

  // Grille
  const gridLines: React.ReactElement[] = [];
  const gStep = 0.5;
  for (let gx = Math.floor(bounds.minX); gx <= Math.ceil(bounds.maxX); gx += gStep) {
    gridLines.push(<line key={`gx-${gx}`} x1={toSvgX(gx)} y1={toSvgY(bounds.minZ)} x2={toSvgX(gx)} y2={toSvgY(bounds.maxZ)}
      stroke="rgba(255,255,255,0.04)" strokeWidth={gx % 1 === 0 ? 1 : 0.5} />);
  }
  for (let gz = Math.floor(bounds.minZ); gz <= Math.ceil(bounds.maxZ); gz += gStep) {
    gridLines.push(<line key={`gz-${gz}`} x1={toSvgX(bounds.minX)} y1={toSvgY(gz)} x2={toSvgX(bounds.maxX)} y2={toSvgY(gz)}
      stroke="rgba(255,255,255,0.04)" strokeWidth={gz % 1 === 0 ? 1 : 0.5} />);
  }

  return (
    <svg
      ref={svgRef}
      width={svgW} height={svgH}
      className="bg-[#0c0c12] rounded-lg border border-white/6 cursor-crosshair"
      style={{ maxWidth: '100%', maxHeight: `${containerH}px` }}
      viewBox={`0 0 ${svgW} ${svgH}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={() => { if (!dragging) setSelected(null); }}
    >
      {gridLines}
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        </pattern>
      </defs>
      {rects.map(({ m, r }) => {
        const isSel = m.id === selected;
        const edgeSegs = getOpenSegments(r, rects.map(rr => rr.r));
        const w = (r.x2 - r.x1) * sc;
        const h = (r.z2 - r.z1) * sc;
        const acCol = (side: string) => m.accesExterieur && m.accesExterieurSide === side ? '#22c55e' : '#e8c840';
        return (
          <g key={m.id} onMouseDown={(e) => handleMouseDown(e, m.id)} onTouchStart={(e) => handleTouchStart(e, m.id)}>
            <rect
              x={toSvgX(r.x1)} y={toSvgY(r.z1)} width={w} height={h}
              rx={3}
              fill={m.aVide ? 'url(#hatch)' : isSel ? 'rgba(232,200,64,0.15)' : 'rgba(160,170,180,0.1)'}
              stroke={isSel ? '#e8c840' : m.aVide ? 'rgba(255,100,100,0.3)' : 'rgba(160,170,180,0.3)'}
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
              fill={isSel ? '#e8c840' : '#888899'}
              fontSize={10} fontWeight={600}
            >
              {closestLedger(m.longueur)}×{closestLedger(m.largeur)}{m.aVide ? ' ∅' : ''}{m.accesExterieur ? ' ⇄' : ''}{m.deport ? ' ⌐' : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ==========================================
// CONFIG PANEL (LEFT)
// ==========================================
function ConfigPanel({
  config, setConfig, bomItems,
}: {
  config: PlannerConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlannerConfig>>;
  bomItems: BOMItem[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const totalPieces = bomItems.reduce((s, it) => s + it.count, 0);
  const totalWeight = Math.round(bomItems.reduce((s, it) => s + it.count * it.unitWeight, 0) * 10) / 10;

  let nextId = useRef(Date.now());

  const addMaille = () => {
    const last = config.mailles[config.mailles.length - 1];
    const lastRect = last ? getMailleRect(last) : null;
    const newX = lastRect ? lastRect.x2 : 0;
    const newZ = lastRect ? lastRect.z1 : 0;
    const id = String(nextId.current++);
    setConfig(prev => ({
      ...prev,
      mailles: [...prev.mailles, { id, longueur: last?.longueur || 2.07, largeur: last?.largeur || 0.73, x: newX, z: newZ, rotation: 0, hauteurPlancher: last?.hauteurPlancher || 6, aVide: false, accesExterieur: false, accesExterieurSide: 'zmin' as AccesSide, accesExterieurPremierPalier: false, plancherSens: 'longueur' as PlancherSens, deport: false, deportLongueur: 0.73, deportSides: { zmin: false, zmax: false, xmin: false, xmax: false }, deportTousEtages: false, deportPlancherSens: 'longueur' as PlancherSens}],
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
    <div className="w-full sm:w-[300px] sm:min-w-[300px] glass-panel sm:border-r border-white/6 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-white/6">
        <div className="flex items-center gap-2">
          <Ruler size={14} className="text-[#e8c840]" />
          <span className="text-xs font-semibold">Configuration</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Layout editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] text-[#888899]">
              Mailles ({config.mailles.length})
            </label>
            <div className="flex gap-1">
              <button onClick={rotateMaille} disabled={!selected}
                className="w-6 h-6 rounded flex items-center justify-center bg-white/5 border border-white/10 text-[#888899] hover:border-white/20 disabled:opacity-30" title="Tourner">
                <RotateCw size={11} />
              </button>
              <button onClick={removeMaille} disabled={!selected || config.mailles.length <= 1}
                className="w-6 h-6 rounded flex items-center justify-center bg-white/5 border border-white/10 text-[#888899] hover:border-white/20 disabled:opacity-30" title="Supprimer">
                <Trash2 size={11} />
              </button>
              <button onClick={addMaille}
                className="w-6 h-6 rounded flex items-center justify-center bg-white/5 border border-white/10 text-[#888899] hover:border-white/20" title="Ajouter">
                <Plus size={11} />
              </button>
            </div>
          </div>

          <LayoutEditor config={config} setConfig={setConfig} selected={selected} setSelected={setSelected} />

          <p className="text-[9px] text-[#555566] mt-1">
            <Move size={9} className="inline mr-0.5" /> Clic pour selectionner &bull; Glisser pour deplacer &bull; Double-clic pour tourner
          </p>
        </div>

        {/* Options maille selectionnee */}
        {sm && (
          <div className="space-y-2 p-3 bg-[#16161e] rounded-lg border border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[#e8c840] uppercase tracking-wider font-semibold">Maille {closestLedger(sm.longueur)}×{closestLedger(sm.largeur)}</label>
              <div className="flex gap-1.5">
                <button onClick={() => updateMaille({ rotation: sm.rotation === 0 ? 90 : 0 as 0 | 90 })}
                  className="p-1 rounded bg-white/5 border border-white/10 text-[#888899] hover:text-white/80 active:scale-90" title="Tourner">
                  <RotateCw size={11} />
                </button>
                <button onClick={() => { if (config.mailles.length <= 1) return; setConfig(prev => ({ ...prev, mailles: prev.mailles.filter(m => m.id !== selected) })); setSelected(null); }}
                  disabled={config.mailles.length <= 1}
                  className="p-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 active:scale-90 disabled:opacity-30" title="Supprimer">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-[9px] text-[#888899] block mb-1">Longueur</label>
              <div className="flex flex-wrap gap-1">
                {MOISE_LENGTHS.map((l) => (
                  <button key={`l-${l}`} onClick={() => updateMaille({ longueur: l })}
                    className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${sm.longueur === l ? 'bg-[#e8c840]/20 border border-[#e8c840]/50 text-[#e8c840]' : 'bg-white/5 border border-white/10 text-[#888899]'}`}>
                    {l}m
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[9px] text-[#888899] block mb-1">Profondeur</label>
              <div className="flex flex-wrap gap-1">
                {MOISE_LENGTHS.map((l) => (
                  <button key={`w-${l}`} onClick={() => updateMaille({ largeur: l })}
                    className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${sm.largeur === l ? 'bg-[#3b82f6]/20 border border-[#3b82f6]/50 text-[#60a5fa]' : 'bg-white/5 border border-white/10 text-[#888899]'}`}>
                    {l}m
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[9px] text-[#888899] block mb-1">Hauteur plancher</label>
              <div className="flex flex-wrap gap-1">
                {HAUTEURS_PLANCHER.map((h) => (
                  <button key={`h-${h}`} onClick={() => updateMaille({ hauteurPlancher: h })}
                    className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${sm.hauteurPlancher === h ? 'bg-[#ef4444]/20 border border-[#ef4444]/50 text-[#f87171]' : 'bg-white/5 border border-white/10 text-[#888899]'}`}>
                    {h}m
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-[10px] text-[#888899] cursor-pointer">
                <input type="checkbox" checked={sm.aVide} onChange={(e) => updateMaille({ aVide: e.target.checked })}
                  className="w-3.5 h-3.5 rounded accent-[#e8c840]" />
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
                <label className="text-[9px] text-[#888899] block mb-1">Sens plancher</label>
                <div className="flex gap-1">
                  {([['longueur', 'En longueur'], ['largeur', 'En largeur']] as [PlancherSens, string][]).map(([s, label]) => (
                    <button key={s} onClick={() => updateMaille({ plancherSens: s })}
                      className={`flex-1 py-1 text-[9px] rounded transition-all ${sm.plancherSens === s ? 'bg-[#e8c840]/20 border border-[#e8c840]/50 text-[#e8c840]' : 'bg-white/5 border border-white/10 text-[#888899]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {sm.accesExterieur && (
              <div className="space-y-1.5 pt-1 border-t border-white/5">
                <label className="text-[9px] text-[#22c55e] block">Cote acces (crinoline + portillon)</label>
                <div className="flex gap-1">
                  {([['zmin', 'Avant'], ['zmax', 'Arriere'], ['xmin', 'Gauche'], ['xmax', 'Droite']] as [AccesSide, string][]).map(([side, label]) => (
                    <button key={side} onClick={() => updateMaille({ accesExterieurSide: side })}
                      className={`flex-1 py-1 text-[9px] rounded transition-all ${sm.accesExterieurSide === side ? 'bg-[#22c55e]/20 border border-[#22c55e]/50 text-[#22c55e]' : 'bg-white/5 border border-white/10 text-[#888899]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-[10px] text-[#888899] cursor-pointer">
                  <input type="checkbox" checked={sm.accesExterieurPremierPalier} onChange={(e) => updateMaille({ accesExterieurPremierPalier: e.target.checked })}
                    className="w-3.5 h-3.5 rounded accent-[#22c55e]" />
                  Premier palier uniquement
                </label>
              </div>
            )}
            {/* Deport per maille */}
            <div className="pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-[#3b82f6]">Deport (console)</label>
                <Toggle checked={sm.deport} onChange={(v) => updateMaille({ deport: v })} />
              </div>
              {sm.deport && (
                <div className="mt-1.5 space-y-1.5">
                  <label className="text-[9px] text-[#888899] block">Longueur deport</label>
                  <div className="flex flex-wrap gap-1">
                    {MOISE_LENGTHS.map((l) => (
                      <button key={`d-${l}`} onClick={() => updateMaille({ deportLongueur: l })}
                        className={`px-1.5 py-0.5 text-[9px] rounded transition-all ${sm.deportLongueur === l ? 'bg-[#3b82f6]/20 border border-[#3b82f6]/50 text-[#60a5fa]' : 'bg-white/5 border border-white/10 text-[#888899]'}`}>
                        {l}m
                      </button>
                    ))}
                  </div>
                  <label className="text-[9px] text-[#888899] block">Cotes</label>
                  <div className="grid grid-cols-2 gap-1">
                    {([['zmin', 'Avant'], ['zmax', 'Arriere'], ['xmin', 'Gauche'], ['xmax', 'Droite']] as [keyof DeportSides, string][]).map(([side, label]) => (
                      <label key={side} className="flex items-center gap-1.5 text-[9px] text-[#888899] cursor-pointer">
                        <input type="checkbox" checked={sm.deportSides[side]}
                          onChange={(e) => updateMaille({ deportSides: { ...sm.deportSides, [side]: e.target.checked } })}
                          className="w-3 h-3 rounded accent-[#3b82f6]" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-[9px] text-[#888899] cursor-pointer">
                    <input type="checkbox" checked={sm.deportTousEtages} onChange={(e) => updateMaille({ deportTousEtages: e.target.checked })}
                      className="w-3 h-3 rounded accent-[#3b82f6]" />
                    Tous les etages
                  </label>
                  <label className="text-[9px] text-[#888899] block">Sens plancher deport</label>
                  <div className="flex gap-1">
                    {([['longueur', 'En longueur'], ['largeur', 'En largeur']] as [PlancherSens, string][]).map(([s, label]) => (
                      <button key={s} onClick={() => updateMaille({ deportPlancherSens: s })}
                        className={`flex-1 py-1 text-[9px] rounded transition-all ${sm.deportPlancherSens === s ? 'bg-[#3b82f6]/20 border border-[#3b82f6]/50 text-[#60a5fa]' : 'bg-white/5 border border-white/10 text-[#888899]'}`}>
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
          <p className="text-[9px] text-[#555566] text-center py-2">Selectionnez une maille pour voir ses options</p>
        )}

        <div className="w-full h-px bg-white/5" />

        {/* Options globales */}
        <div className="space-y-3">
          <label className="text-[10px] text-[#555566] uppercase tracking-wider font-semibold block">Options generales</label>

          {/* Type interieur/exterieur */}
          <div>
            <label className="text-[12px] text-[#888899] block mb-1.5">Type d'echafaudage</label>
            <div className="flex gap-1.5">
              {(['interieur', 'exterieur'] as const).map((t) => (
                <button key={t}
                  onClick={() => setConfig(p => ({ ...p, type: t }))}
                  className={`flex-1 py-1.5 text-[11px] rounded-lg transition-all font-medium text-center ${
                    config.type === t
                      ? 'bg-[#e8c840]/20 border border-[#e8c840]/50 text-[#e8c840]'
                      : 'bg-white/5 border border-white/10 text-[#888899] hover:border-white/20'
                  }`}>
                  {t === 'interieur' ? 'Interieur' : 'Exterieur'}
                </button>
              ))}
            </div>
            {needsSapine(config) && (
              <p className="text-[9px] text-[#e8c840]/70 mt-1">
                Sapine (contreventement) ajoutee automatiquement — {sapineLevels(config)} niveau{sapineLevels(config) > 1 ? 'x' : ''} de diagonales
              </p>
            )}
          </div>

          {/* Verinage */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-[12px] text-[#888899] block">Verinage</label>
              <span className="text-[9px] text-[#555566]">tube + 2 colliers + verin inverse</span>
            </div>
            <Toggle checked={config.verinage} onChange={(v) => setConfig(p => ({ ...p, verinage: v }))} />
          </div>

          {/* Echelle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-[12px] text-[#888899] block">Echelle interieure</label>
              <span className="text-[9px] text-[#555566]">2.15m par trappe, alternance</span>
            </div>
            <Toggle checked={config.echelle} onChange={(v) => setConfig(p => ({ ...p, echelle: v }))} />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-t border-white/6 bg-white/[0.01] space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#888899]">Pieces</span>
          <span className="font-semibold text-[#e8c840]">{totalPieces}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#888899]">Poids total</span>
          <span className="font-semibold text-[#e8c840]">{totalWeight} kg</span>
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
      <div className="hidden sm:flex items-center gap-2 px-4 py-2 border-b border-white/6 bg-white/[0.01]">
        <span className="text-[10px] text-[#555566]">Clic gauche : tourner &bull; Molette : zoom &bull; Clic droit : deplacer</span>
      </div>
      <div className="flex-1 relative">
        <ScaffoldViewer3D plannerConfig={plannerConfig} />
      </div>
    </div>
  );
}

// ==========================================
// BOM PANEL (RIGHT)
// ==========================================
function BOMPanel({ bomItems }: { bomItems: BOMItem[] }) {
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
    const lines = ['Categorie;Piece;Quantite;Poids unitaire (kg);Poids total (kg)'];
    for (const [cat, items] of grouped) {
      for (const item of items) {
        lines.push(`${cat};${item.name};${item.count};${item.unitWeight};${Math.round(item.count * item.unitWeight * 10) / 10}`);
      }
    }
    lines.push(`;;${totalPieces};;${totalWeight}`);
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'approvisionnement-echafaudage.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full sm:w-[340px] sm:min-w-[340px] glass-panel sm:border-l border-white/6 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={14} className="text-[#3b82f6]" />
          <span className="text-xs font-semibold">Feuille de calcul</span>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(adjustments).length > 0 || checkedItems.size > 0) && (
            <button onClick={() => { setAdjustments({}); setCheckedItems(new Set()); }} className="glass-button text-[10px] py-1 px-2 text-orange-400">
              Reset
            </button>
          )}
          <button onClick={handleExportCSV} className="glass-button text-[10px] py-1 px-2">
            <Download size={11} /> CSV
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-[#0a0a0f] z-10">
              <th className="text-left px-4 py-2 text-[#888899] font-medium">Piece</th>
              <th className="text-center px-1 py-2 text-[#888899] font-medium w-20">Qte</th>
              <th className="text-right px-2 py-2 text-[#888899] font-medium w-14">kg/u</th>
              <th className="text-right px-4 py-2 text-[#888899] font-medium w-14">kg</th>
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
            <tr className="border-t border-white/8">
              <td className="px-4 py-2.5 font-semibold text-[12px]">Total</td>
              <td className="text-center px-1 py-2.5 font-semibold text-[12px]">{totalPieces}</td>
              <td />
              <td className="text-right px-4 py-2.5 font-semibold text-[12px] text-[#e8c840]">{totalWeight} kg</td>
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
      <tr className="cursor-pointer hover:bg-white/[0.03] transition-colors" onClick={onToggle}>
        <td className="px-4 py-1.5 text-[10px] font-semibold text-[#e8c840]/80 uppercase tracking-wider" colSpan={2}>
          <span className="inline-flex items-center gap-1">
            {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
            {cat} <span className="text-[#888899] font-normal ml-1">({catCount})</span>
          </span>
        </td>
        <td />
        <td className="text-right px-4 py-1.5 text-[10px] text-[#888899] font-medium">{catWeight}</td>
      </tr>
      {!isCollapsed && items.map((it, i) => {
        const adj = adjustments[it.name] || 0;
        const isChecked = checkedItems.has(it.name);
        return (
          <tr key={`${it.name}-${i}`} className={`hover:bg-white/[0.02] transition-colors group ${isChecked ? 'opacity-40' : ''}`}>
            <td className="pl-6 pr-1 py-1 truncate max-w-[180px]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleChecked(it.name)}
                  className="w-3 h-3 rounded border-white/20 bg-white/5 accent-green-500 cursor-pointer"
                />
                <span className={`text-white/60 ${isChecked ? 'line-through' : ''}`}>{it.name}</span>
              </label>
            </td>
            <td className="text-center px-1 py-1">
              <span className="inline-flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onAdjust(it.name, -1); }}
                  className="w-4 h-4 rounded text-[10px] leading-none bg-white/5 hover:bg-red-500/30 text-white/40 hover:text-red-300 transition-colors flex items-center justify-center"
                  disabled={it.count <= 0}
                >−</button>
                <span className={`tabular-nums font-medium w-6 text-center text-[11px] ${adj !== 0 ? 'text-orange-400' : ''}`}>{it.count}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onAdjust(it.name, 1); }}
                  className="w-4 h-4 rounded text-[10px] leading-none bg-white/5 hover:bg-green-500/30 text-white/40 hover:text-green-300 transition-colors flex items-center justify-center"
                >+</button>
              </span>
            </td>
            <td className={`text-right px-2 py-1 tabular-nums text-[#666677] ${isChecked ? 'line-through' : ''}`}>{it.unitWeight}</td>
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

  const [config, setConfig] = useState<PlannerConfig>({
    hauteurPlancher: 6,
    mailles: [
      { id: 'a', longueur: 2.07, largeur: 0.73, x: 0, z: 0, rotation: 0, hauteurPlancher: 6, aVide: false, accesExterieur: false, accesExterieurSide: 'zmin', accesExterieurPremierPalier: false, plancherSens: 'longueur' as PlancherSens, deport: false, deportLongueur: 0.73, deportSides: { zmin: false, zmax: false, xmin: false, xmax: false }, deportTousEtages: false, deportPlancherSens: 'longueur' as PlancherSens},
      { id: 'b', longueur: 2.07, largeur: 0.73, x: closestLedger(2.07), z: 0, rotation: 0, hauteurPlancher: 6, aVide: false, accesExterieur: false, accesExterieurSide: 'zmin', accesExterieurPremierPalier: false, plancherSens: 'longueur' as PlancherSens, deport: false, deportLongueur: 0.73, deportSides: { zmin: false, zmax: false, xmin: false, xmax: false }, deportTousEtages: false, deportPlancherSens: 'longueur' as PlancherSens},
    ],
    type: 'interieur',
    verinage: false,
    echelle: true,
  });

  const bomItems = useMemo(() => computeFullBOM(config), [config]);

  if (!showPlanner) return null;

  const totalPieces = bomItems.reduce((s, it) => s + it.count, 0);
  const totalWeight = Math.round(bomItems.reduce((s, it) => s + it.count * it.unitWeight, 0) * 10) / 10;

  const tabs: { id: MobileTab; label: string }[] = [
    { id: 'config', label: "Crée ton echaf'" },
    { id: '3d', label: '3D' },
    { id: 'bom', label: 'Appro' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0f] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-white/6 glass-panel">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#e8c840]/10 border border-[#e8c840]/20 flex items-center justify-center shrink-0">
            <Ruler size={14} className="text-[#e8c840]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-semibold truncate">Orano echaf' belleville</h1>
            <p className="text-[8px] sm:text-[9px] text-[#555566] truncate">
              {config.mailles.length} maille{config.mailles.length > 1 ? 's' : ''}
              &bull; H{Math.max(...config.mailles.map(m => m.hauteurPlancher))}m
              &bull; {totalPieces} pcs / {totalWeight} kg
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowPlanner(false)}
          className="p-1.5 rounded-md hover:bg-white/[0.06] text-[#888899] hover:text-white/80 transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Mobile tabs — visible uniquement < 768px */}
      <div className="flex sm:hidden border-b border-white/6">
        {tabs.map((t) => (
          <button key={t.id}
            onClick={() => setMobileTab(t.id)}
            className={`flex-1 py-2.5 text-[11px] font-medium transition-all ${
              mobileTab === t.id
                ? 'text-[#e8c840] border-b-2 border-[#e8c840] bg-[#e8c840]/5'
                : 'text-[#666677]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Desktop: 3 colonnes | Mobile: tab active */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`${mobileTab === 'config' ? 'flex' : 'hidden'} sm:flex w-full sm:w-auto`}>
          <ConfigPanel config={config} setConfig={setConfig} bomItems={bomItems} />
        </div>
        <div className={`${mobileTab === '3d' ? 'flex' : 'hidden'} sm:flex flex-1`}>
          <CanvasPanel plannerConfig={config} />
        </div>
        <div className={`${mobileTab === 'bom' ? 'flex' : 'hidden'} sm:flex w-full sm:w-auto`}>
          <BOMPanel bomItems={bomItems} />
        </div>
      </div>
    </div>
  );
}
