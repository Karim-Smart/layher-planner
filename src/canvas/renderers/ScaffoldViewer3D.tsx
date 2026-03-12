import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { closestLedger } from '../../engine/scaffoldGenerator';
import type { PlannerConfig } from '../../panels/PlannerView';
import { getMailleRect, getOpenSegments, needsSapine } from '../../panels/PlannerView';


// ==========================================
// MATERIAUX — couleurs Layher Allround réalistes
// Acier galvanisé à chaud = argent brillant bleuté
// Garde-corps = jaune RAL 1003 laqué
// Plateaux = aluminium brossé / bois multiplex
// ==========================================
const STEEL_COLOR = '#b8c4d0';      // galva zinc clair
const STEEL_DARK = '#8a9aac';       // galva patiné (vérins, tubes secondaires)
const GOLD_COLOR = '#e8b800';       // jaune RAL 1003 — garde-corps laqué
const DIAGONAL_COLOR = '#a0b0c0';   // galva clair — diagonales
const JACK_COLOR = '#6a7580';       // acier brut vérins
const TOEBOARD_COLOR = '#c8a030';   // plinthe bois/aluminium laqué jaune
const ROSETTE_COLOR = '#d8b020';    // rosette — zinc doré
const LADDER_COLOR = '#c8d0d8';     // échelle aluminium
const CLAMP_COLOR = '#505a64';      // collier acier brut
const CONSOLE_COLOR = '#a8b4c0';    // console galva
const CALE_COLOR = '#F5B800';       // cale bois jaune

const TUBE_RADIUS = 0.024;
const GC_RADIUS = 0.020;
const DIAG_RADIUS = 0.018;
const POTEAU_MAX = 2.0;

// Geometries réutilisables pour edgesGeometry (évite recréation par render)
const _edgeGeoCache = new Map<string, THREE.BoxGeometry>();
function getCachedBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  let g = _edgeGeoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _edgeGeoCache.set(k, g); }
  return g;
}

// ==========================================
// TUBE — meshPhysicalMaterial avec clearcoat pour l'aspect galva zinc
// ==========================================
function Tube({ start, end, radius, color, metalness = 0.6, roughness = 0.35, clearcoat = 0.3 }: {
  start: [number, number, number]; end: [number, number, number];
  radius: number; color: string; metalness?: number; roughness?: number; clearcoat?: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const mid = s.clone().add(e).multiplyScalar(0.5);
    const dir = e.clone().sub(s);
    const len = dir.length(); dir.normalize();
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { position: [mid.x, mid.y, mid.z] as [number, number, number], quaternion: quat, length: len };
  }, [start, end]);
  if (length < 0.001) return null;
  return (
    <mesh position={position} quaternion={quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, length, 12]} />
      <meshPhysicalMaterial
        color={color} metalness={metalness} roughness={roughness}
        envMapIntensity={0.8}
        clearcoat={clearcoat} clearcoatRoughness={0.4}
      />
    </mesh>
  );
}

// 3 teintes alternées pour simuler les lots différents de plateaux aluminium
const PLANK_SHADES = ['#7a8a9a', '#8494a4', '#8c9cac'];
const TRAP_BROWN = '#9B6E4C';       // bois multiplex trappe
const TRAP_HOLE_COLOR = '#2a2a2a';

// Layher Allround : plateau 0.32m, demi-plateau 0.19m, trappe 0.64m
// Les plateaux couvrent tout l'espace (crochets sur moises), gaps visuels seulement
const PLANK_NOMINAL = 0.32;
const DEMI_NOMINAL = 0.19;
const TRAP_NOMINAL = 0.64;
const VIS_GAP = 0.01;
const DEMI_COLOR = '#606870'; // gris légèrement plus foncé pour le demi
// Largeurs qui nécessitent un demi-plateau au milieu
const NEEDS_DEMI = [1.57, 2.57];

function Platform({ x, y, z, width, depth, plankAxis, hasTrap, trapSide = 'start' }: {
  x: number; y: number; z: number; width: number; depth: number;
  plankAxis: 'x' | 'z'; hasTrap?: boolean; trapSide?: 'start' | 'end';
}) {
  const t = 0.04;
  const planks: React.ReactElement[] = [];
  let idx = 0;

  const coverDim = plankAxis === 'x' ? depth : width;
  const plankLen = plankAxis === 'x' ? width : depth;

  // Déterminer si on a besoin d'un demi-plateau (largeurs 1.57m et 2.57m)
  const closestCover = closestLedger(coverDim);
  const needsDemi = NEEDS_DEMI.some(d => Math.abs(closestCover - d) < 0.05);

  // Layout : trappe + N plateaux d'un côté + demi au milieu + N plateaux de l'autre
  const trapW = hasTrap ? TRAP_NOMINAL : 0;
  const demiW = needsDemi ? DEMI_NOMINAL : 0;
  const remainingForPlateaux = coverDim - trapW - demiW;
  const nbPlateaux = Math.max(0, Math.round(remainingForPlateaux / PLANK_NOMINAL));

  // Scale pour couvrir exactement
  const totalNominal = trapW + demiW + nbPlateaux * PLANK_NOMINAL;
  const scale = totalNominal > 0 ? coverDim / totalNominal : 1;
  const aTrap = trapW * scale;
  const aDemi = demiW * scale;
  const aPlank = PLANK_NOMINAL * scale;

  // Répartir : plateaux avant le milieu, demi au milieu, plateaux après
  const halfPlateaux = Math.floor(nbPlateaux / 2);
  const otherHalf = nbPlateaux - halfPlateaux;

  // Helper pour ajouter une planche
  const addPlank = (off: number, w: number, color: string) => {
    const visW = w - VIS_GAP;
    const cx = plankAxis === 'x' ? x + plankLen / 2 : x + off + w / 2;
    const cz = plankAxis === 'x' ? z + off + w / 2 : z + plankLen / 2;
    const geoW = plankAxis === 'x' ? plankLen - 0.02 : visW;
    const geoD = plankAxis === 'x' ? visW : plankLen - 0.02;
    planks.push(
      <mesh key={idx++} position={[cx, y - t / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[geoW, t, geoD]} />
        <meshPhysicalMaterial color={color} metalness={0.55} roughness={0.4} envMapIntensity={0.6} clearcoat={0.15} clearcoatRoughness={0.6} />
      </mesh>
    );
  };

  let off = 0;

  // Fonction pour poser la trappe à la position courante
  const addTrap = () => {
    if (!hasTrap || aTrap <= 0) return;
    addPlank(off, aTrap, TRAP_BROWN);
    // Carré d'ouverture
    const holeSize = Math.min(aTrap * 0.7, plankLen * 0.3);
    const hcx = plankAxis === 'x' ? x + plankLen / 2 : x + off + aTrap / 2;
    const hcz = plankAxis === 'x' ? z + off + aTrap / 2 : z + plankLen / 2;
    planks.push(
      <mesh key={idx++} position={[hcx, y - t / 2 + 0.005, hcz]}>
        <boxGeometry args={[plankAxis === 'x' ? holeSize : holeSize * 0.9, 0.006, plankAxis === 'x' ? holeSize * 0.9 : holeSize]} />
        <meshStandardMaterial color={TRAP_HOLE_COLOR} metalness={0.1} roughness={0.9} />
      </mesh>
    );
    off += aTrap;
  };

  // Trappe au début (côté z1 / x1)
  if (trapSide === 'start') addTrap();

  // Première moitié de plateaux (teinte alternée par planche)
  for (let i = 0; i < halfPlateaux; i++) {
    addPlank(off, aPlank, PLANK_SHADES[(idx + i) % 3]);
    off += aPlank;
  }

  // Demi-plateau au milieu
  if (needsDemi && aDemi > 0) {
    addPlank(off, aDemi, DEMI_COLOR);
    off += aDemi;
  }

  // Deuxième moitié de plateaux
  for (let i = 0; i < otherHalf; i++) {
    addPlank(off, aPlank, PLANK_SHADES[(idx + halfPlateaux + i) % 3]);
    off += aPlank;
  }

  // Trappe à la fin (côté z2 / x2)
  if (trapSide === 'end') addTrap();

  return <group>{planks}</group>;
}

function ToeboardH({ x1, x2, y, z }: { x1: number; x2: number; y: number; z: number }) {
  return (
    <mesh position={[(x1 + x2) / 2, y + 0.075, z]} castShadow receiveShadow>
      <boxGeometry args={[x2 - x1, 0.15, 0.004]} />
      <meshStandardMaterial color={TOEBOARD_COLOR} metalness={0.3} roughness={0.5} envMapIntensity={0.5} />
    </mesh>
  );
}

function ToeboardV({ x, y, z1, z2 }: { x: number; y: number; z1: number; z2: number }) {
  return (
    <mesh position={[x, y + 0.075, (z1 + z2) / 2]} castShadow receiveShadow>
      <boxGeometry args={[0.004, 0.15, z2 - z1]} />
      <meshStandardMaterial color={TOEBOARD_COLOR} metalness={0.3} roughness={0.5} envMapIntensity={0.5} />
    </mesh>
  );
}

function Rosette({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <mesh position={[x, y, z]} castShadow>
      <sphereGeometry args={[0.015, 8, 8]} />
      <meshPhysicalMaterial color={ROSETTE_COLOR} metalness={0.8} roughness={0.15} envMapIntensity={0.9} clearcoat={0.5} clearcoatRoughness={0.25} />
    </mesh>
  );
}

function BaseJack({ x, z, heightM, inverted }: {
  x: number; z: number; heightM: number; inverted?: boolean;
}) {
  const plateSize = 0.15; const plateH = 0.008; const tR = 0.012;
  const caleSize = 0.17; const caleH = 0.012;
  if (inverted) {
    const topY = heightM; const botY = heightM - 0.40;
    return (<group>
      {/* Cale jaune sur le vérin inversé (en haut) */}
      <mesh position={[x, topY + caleH / 2, z]} castShadow receiveShadow><boxGeometry args={[caleSize, caleH, caleSize]} /><meshStandardMaterial color={CALE_COLOR} metalness={0.3} roughness={0.5} envMapIntensity={0.4} /></mesh>
      <mesh position={[x, topY - plateH / 2, z]} castShadow receiveShadow><boxGeometry args={[plateSize, plateH, plateSize]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.7} roughness={0.3} envMapIntensity={0.6} /></mesh>
      <Tube start={[x, botY, z]} end={[x, topY - plateH, z]} radius={tR} color={STEEL_DARK} metalness={0.7} roughness={0.25} />
      <mesh position={[x, botY + 0.02, z]} castShadow><cylinderGeometry args={[0.022, 0.022, 0.02, 6]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.6} roughness={0.3} envMapIntensity={0.6} /></mesh>
    </group>);
  }
  return (<group>
    {/* Cale jaune sous le vérin (au sol) */}
    <mesh position={[x, -caleH / 2, z]} castShadow receiveShadow><boxGeometry args={[caleSize, caleH, caleSize]} /><meshStandardMaterial color={CALE_COLOR} metalness={0.3} roughness={0.5} envMapIntensity={0.4} /></mesh>
    <mesh position={[x, plateH / 2, z]} castShadow receiveShadow><boxGeometry args={[plateSize, plateH, plateSize]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.7} roughness={0.3} envMapIntensity={0.6} /></mesh>
    <Tube start={[x, plateH, z]} end={[x, heightM, z]} radius={tR} color={STEEL_DARK} metalness={0.7} roughness={0.25} />
    <mesh position={[x, heightM - 0.02, z]} castShadow><cylinderGeometry args={[0.022, 0.022, 0.02, 6]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.6} roughness={0.3} envMapIntensity={0.6} /></mesh>
  </group>);
}

function Clamp({ x, y, z }: { x: number; y: number; z: number }) {
  return (<mesh position={[x, y, z]} castShadow><torusGeometry args={[0.03, 0.008, 12, 24]} /><meshStandardMaterial color={CLAMP_COLOR} metalness={0.7} roughness={0.3} envMapIntensity={0.8} /></mesh>);
}

// ==========================================
// SCENE
// ==========================================
function computeLevelsFor3D(h: number): number[] {
  const l: number[] = [];
  for (let y = 2; y <= h; y += 2) l.push(y);
  if (!l.includes(h)) l.push(h);
  return l.sort((a, b) => a - b);
}

function ScaffoldScene({ pc }: { pc: PlannerConfig }) {
  const { mailles, verinage, echelle } = pc;
  const jackH = 0.40 + 0.15; // base jack 40cm + plate

  const rects = useMemo(
    () => mailles.map(m => getMailleRect(m)),
    [mailles],
  );

  const elements = useMemo(() => {
    const els: React.ReactElement[] = [];
    let k = 0;
    const key = () => `e-${k++}`;

    // Poteaux : hauteur = max des mailles adjacentes
    const poteauMaxH: Record<string, number> = {};
    for (let i = 0; i < mailles.length; i++) {
      const m = mailles[i]; const r = rects[i];
      const mH = m.hauteurPlancher + 1;
      for (const corner of [`${r.x1.toFixed(3)},${r.z1.toFixed(3)}`, `${r.x2.toFixed(3)},${r.z1.toFixed(3)}`, `${r.x1.toFixed(3)},${r.z2.toFixed(3)}`, `${r.x2.toFixed(3)},${r.z2.toFixed(3)}`]) {
        poteauMaxH[corner] = Math.max(poteauMaxH[corner] || 0, mH);
      }
    }

    const poteauDone = new Set<string>();
    const addPoteau = (x: number, z: number) => {
      const pk = `${x.toFixed(3)},${z.toFixed(3)}`;
      if (poteauDone.has(pk)) return;
      poteauDone.add(pk);
      const pH = poteauMaxH[pk] || 7;

      els.push(<BaseJack key={key()} x={x} z={z} heightM={jackH} />);
      let rem = pH; let cy = jackH;
      while (rem > 0.01) {
        const segH = Math.min(POTEAU_MAX, rem);
        els.push(<Tube key={key()} start={[x, cy, z]} end={[x, cy + segH, z]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
        for (let rh = 0.5; rh <= segH; rh += 0.5) {
          els.push(<Rosette key={key()} x={x} y={cy + rh} z={z} />);
        }
        cy += segH; rem -= segH;
      }
    };

    // Deduplication moises/U par position
    const moiseDone = new Set<string>();
    const uDone = new Set<string>();

    // Pour chaque maille
    for (let mi = 0; mi < mailles.length; mi++) {
      const m = mailles[mi];
      const r = rects[mi];
      const segs = getOpenSegments(r, rects);

      // Retirer les cotes couverts par un deport (per maille)
      if (m.deport && m.deportLongueur > 0) {
        if (m.deportSides.zmin) segs.zmin = [];
        if (m.deportSides.zmax) segs.zmax = [];
        if (m.deportSides.xmin) segs.xmin = [];
        if (m.deportSides.xmax) segs.xmax = [];
      }

      const accesSide = m.accesExterieur ? m.accesExterieurSide : null;

      // Levels per maille
      const mLevels = computeLevelsFor3D(m.hauteurPlancher);
      const mMaxH = m.hauteurPlancher + 1;
      const mMoiseHeights: number[] = [0];
      for (let h = 2; h < mMaxH - 0.1; h += 2) {
        if (!mLevels.includes(h)) mMoiseHeights.push(h);
      }
      for (const lh of mLevels) mMoiseHeights.push(lh);

      // 4 poteaux (dedupliques)
      addPoteau(r.x1, r.z1); addPoteau(r.x2, r.z1);
      addPoteau(r.x1, r.z2); addPoteau(r.x2, r.z2);

      // Moises/U a chaque hauteur (dedupliques)
      for (const mh of mMoiseHeights) {
        const y = jackH + mh;
        const mk1 = `${r.x1.toFixed(3)},${r.x2.toFixed(3)},${r.z1.toFixed(3)},${mh.toFixed(3)}`;
        const mk2 = `${r.x1.toFixed(3)},${r.x2.toFixed(3)},${r.z2.toFixed(3)},${mh.toFixed(3)}`;
        if (!moiseDone.has(mk1)) { moiseDone.add(mk1); els.push(<Tube key={key()} start={[r.x1, y, r.z1]} end={[r.x2, y, r.z1]} radius={TUBE_RADIUS} color={STEEL_COLOR} />); }
        if (!moiseDone.has(mk2)) { moiseDone.add(mk2); els.push(<Tube key={key()} start={[r.x1, y, r.z2]} end={[r.x2, y, r.z2]} radius={TUBE_RADIUS} color={STEEL_COLOR} />); }
        const uk1 = `${r.z1.toFixed(3)},${r.z2.toFixed(3)},${r.x1.toFixed(3)},${mh.toFixed(3)}`;
        const uk2 = `${r.z1.toFixed(3)},${r.z2.toFixed(3)},${r.x2.toFixed(3)},${mh.toFixed(3)}`;
        if (!uDone.has(uk1)) { uDone.add(uk1); els.push(<Tube key={key()} start={[r.x1, y, r.z1]} end={[r.x1, y, r.z2]} radius={TUBE_RADIUS} color={STEEL_COLOR} />); }
        if (!uDone.has(uk2)) { uDone.add(uk2); els.push(<Tube key={key()} start={[r.x2, y, r.z1]} end={[r.x2, y, r.z2]} radius={TUBE_RADIUS} color={STEEL_COLOR} />); }
      }

      // Diagonales
      if (m.aVide) {
        let prevY = jackH;
        for (const lh of mLevels) {
          const topY = jackH + lh;
          els.push(<Tube key={key()} start={[r.x1, prevY, r.z1]} end={[r.x2, topY, r.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          els.push(<Tube key={key()} start={[r.x2, prevY, r.z2]} end={[r.x1, topY, r.z2]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          els.push(<Tube key={key()} start={[r.x1, prevY, r.z1]} end={[r.x1, topY, r.z2]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          els.push(<Tube key={key()} start={[r.x2, prevY, r.z2]} end={[r.x2, topY, r.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          prevY = topY;
        }
      } else {
        const diagTop = mLevels[0] || 2;
        els.push(<Tube key={key()} start={[r.x1, jackH, r.z1]} end={[r.x2, jackH + diagTop, r.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
        els.push(<Tube key={key()} start={[r.x2, jackH, r.z2]} end={[r.x1, jackH + diagTop, r.z2]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
      }

      // A chaque palier : plateforme + GC/plinthes par segment ouvert
      const mTopLevel = mLevels[mLevels.length - 1] || m.hauteurPlancher;
      for (let li = 0; li < mLevels.length; li++) {
        const lh = mLevels[li];
        const py = jackH + lh;
        const showFull = !m.aVide || lh === mTopLevel;
        if (!showFull) continue;

        // plankAxis selon rotation et plancherSens
        const pAxis: 'x' | 'z' = (m.plancherSens === 'longueur')
          ? (m.rotation === 0 ? 'x' : 'z')
          : (m.rotation === 0 ? 'z' : 'x');
        // Trappe alterne front/back à chaque niveau (comme les échelles)
        const tSide: 'start' | 'end' = li % 2 === 0 ? 'start' : 'end';
        els.push(<Platform key={key()} x={r.x1} y={py} z={r.z1} width={r.x2 - r.x1} depth={r.z2 - r.z1} plankAxis={pAxis} hasTrap={echelle && !m.aVide} trapSide={tSide} />);

        const accesMaxLevel = m.accesExterieur && m.accesExterieurPremierPalier ? (mLevels[0] || 2) : Infinity;
        const isAccesLevel = accesSide && lh <= accesMaxLevel;

        // GC + plinthes par segment ouvert — clearcoat plus fort pour le jaune laqué
        const gcCC = 0.5; // clearcoat laqué
        // zmin : segments le long de X
        for (const [s, e] of segs.zmin) {
          const isAcces = accesSide === 'zmin' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          const cc = isAcces ? 0.3 : gcCC;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[s, py + gcH, r.z1]} end={[e, py + gcH, r.z1]} radius={rad} color={col} metalness={0.5} roughness={0.3} clearcoat={cc} />);
          if (!isAcces) els.push(<ToeboardH key={key()} x1={s} x2={e} y={py} z={r.z1} />);
        }
        // zmax
        for (const [s, e] of segs.zmax) {
          const isAcces = accesSide === 'zmax' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          const cc = isAcces ? 0.3 : gcCC;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[s, py + gcH, r.z2]} end={[e, py + gcH, r.z2]} radius={rad} color={col} metalness={0.5} roughness={0.3} clearcoat={cc} />);
          if (!isAcces) els.push(<ToeboardH key={key()} x1={s} x2={e} y={py} z={r.z2} />);
        }
        // xmin : segments le long de Z
        for (const [s, e] of segs.xmin) {
          const isAcces = accesSide === 'xmin' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          const cc = isAcces ? 0.3 : gcCC;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[r.x1, py + gcH, s]} end={[r.x1, py + gcH, e]} radius={rad} color={col} metalness={0.5} roughness={0.3} clearcoat={cc} />);
          if (!isAcces) els.push(<ToeboardV key={key()} x={r.x1} y={py} z1={s} z2={e} />);
        }
        // xmax
        for (const [s, e] of segs.xmax) {
          const isAcces = accesSide === 'xmax' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          const cc = isAcces ? 0.3 : gcCC;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[r.x2, py + gcH, s]} end={[r.x2, py + gcH, e]} radius={rad} color={col} metalness={0.5} roughness={0.3} clearcoat={cc} />);
          if (!isAcces) els.push(<ToeboardV key={key()} x={r.x2} y={py} z1={s} z2={e} />);
        }
      }
    }

    // --- CRINOLINE (echelle exterieure + arceaux + poteaux) ---
    const CRINOLINE_COLOR = '#40a060';
    const ARCEAU_COLOR = '#309050';
    for (let mi = 0; mi < mailles.length; mi++) {
      const m = mailles[mi];
      if (!m.accesExterieur) continue;
      const r = rects[mi];
      const side = m.accesExterieurSide;
      const cLevels = computeLevelsFor3D(m.hauteurPlancher);
      const crinoH = m.accesExterieurPremierPalier ? (cLevels[0] || 2) : m.hauteurPlancher;
      const crinoTopY = jackH + crinoH;

      // Position de la crinoline : au centre du cote, decalee vers l'exterieur
      const offset = 0.45; // distance hors echaff
      const ladderW = 0.40;
      let cx: number, cz: number;
      if (side === 'zmin') { cx = (r.x1 + r.x2) / 2; cz = r.z1 - offset; }
      else if (side === 'zmax') { cx = (r.x1 + r.x2) / 2; cz = r.z2 + offset; }
      else if (side === 'xmin') { cx = r.x1 - offset; cz = (r.z1 + r.z2) / 2; }
      else { cx = r.x2 + offset; cz = (r.z1 + r.z2) / 2; }

      const halfW = ladderW / 2;
      const isXside = side === 'xmin' || side === 'xmax';

      // 2 montants echelle
      if (isXside) {
        els.push(<Tube key={key()} start={[cx, 0, cz - halfW]} end={[cx, crinoTopY + 1, cz - halfW]} radius={0.018} color={CRINOLINE_COLOR} />);
        els.push(<Tube key={key()} start={[cx, 0, cz + halfW]} end={[cx, crinoTopY + 1, cz + halfW]} radius={0.018} color={CRINOLINE_COLOR} />);
      } else {
        els.push(<Tube key={key()} start={[cx - halfW, 0, cz]} end={[cx - halfW, crinoTopY + 1, cz]} radius={0.018} color={CRINOLINE_COLOR} />);
        els.push(<Tube key={key()} start={[cx + halfW, 0, cz]} end={[cx + halfW, crinoTopY + 1, cz]} radius={0.018} color={CRINOLINE_COLOR} />);
      }

      // Barreaux echelle
      const rungSpacing = 0.28;
      const nRungs = Math.floor((crinoTopY + 1) / rungSpacing);
      for (let ri = 1; ri <= nRungs; ri++) {
        const ry = ri * rungSpacing;
        if (isXside) {
          els.push(<Tube key={key()} start={[cx, ry, cz - halfW]} end={[cx, ry, cz + halfW]} radius={0.012} color={CRINOLINE_COLOR} />);
        } else {
          els.push(<Tube key={key()} start={[cx - halfW, ry, cz]} end={[cx + halfW, ry, cz]} radius={0.012} color={CRINOLINE_COLOR} />);
        }
      }

      // Arceaux (demi-cercles de securite) tous les 0.70m a partir de 2.5m
      const arceauR = 0.35;
      for (let ay = 2.5; ay <= crinoTopY + 1; ay += 0.70) {
        const nSeg = 8;
        for (let si = 0; si < nSeg; si++) {
          const a1 = (Math.PI * si) / nSeg;
          const a2 = (Math.PI * (si + 1)) / nSeg;
          if (isXside) {
            const dx = side === 'xmin' ? -1 : 1;
            const z1a = cz + Math.cos(a1) * arceauR;
            const y1a = ay + Math.sin(a1) * arceauR;
            const z2a = cz + Math.cos(a2) * arceauR;
            const y2a = ay + Math.sin(a2) * arceauR;
            els.push(<Tube key={key()} start={[cx + dx * 0.05, y1a, z1a]} end={[cx + dx * 0.05, y2a, z2a]} radius={0.010} color={ARCEAU_COLOR} />);
          } else {
            const dz = side === 'zmin' ? -1 : 1;
            const x1a = cx + Math.cos(a1) * arceauR;
            const y1a = ay + Math.sin(a1) * arceauR;
            const x2a = cx + Math.cos(a2) * arceauR;
            const y2a = ay + Math.sin(a2) * arceauR;
            els.push(<Tube key={key()} start={[x1a, y1a, cz + dz * 0.05]} end={[x2a, y2a, cz + dz * 0.05]} radius={0.010} color={ARCEAU_COLOR} />);
          }
        }
      }

      // Moises de liaison crinoline → echaff (a chaque palier acces)
      for (const lh of cLevels) {
        if (lh > crinoH) break;
        const my = jackH + lh;
        if (isXside) {
          const ex = side === 'xmin' ? r.x1 : r.x2;
          els.push(<Tube key={key()} start={[ex, my, cz - halfW]} end={[cx, my, cz - halfW]} radius={TUBE_RADIUS} color={CRINOLINE_COLOR} />);
          els.push(<Tube key={key()} start={[ex, my, cz + halfW]} end={[cx, my, cz + halfW]} radius={TUBE_RADIUS} color={CRINOLINE_COLOR} />);
        } else {
          const ez = side === 'zmin' ? r.z1 : r.z2;
          els.push(<Tube key={key()} start={[cx - halfW, my, ez]} end={[cx - halfW, my, cz]} radius={TUBE_RADIUS} color={CRINOLINE_COLOR} />);
          els.push(<Tube key={key()} start={[cx + halfW, my, ez]} end={[cx + halfW, my, cz]} radius={TUBE_RADIUS} color={CRINOLINE_COLOR} />);
        }
      }
    }

    // --- ECHELLES (dans premiere maille pleine, cote trappe alterne) ---
    if (echelle && rects.length > 0) {
      const pleineIdx = mailles.findIndex(m => !m.aVide);
      if (pleineIdx < 0) { /* pas de maille pleine, pas d'echelle */ }
      const r0 = pleineIdx >= 0 ? rects[pleineIdx] : rects[0];
      const echMaille = pleineIdx >= 0 ? mailles[pleineIdx] : mailles[0];
      const echLevels = computeLevelsFor3D(echMaille.hauteurPlancher);
      const cx = (r0.x1 + r0.x2) / 2;
      const ladderW = 0.40; const halfW = ladderW / 2;
      const rungSpacing = 0.28;

      let prevTop = jackH;
      for (let li = 0; li < echLevels.length; li++) {
        const lh = echLevels[li];
        const baseY = prevTop;
        const topY = jackH + lh;
        const ladH = topY - baseY;
        if (ladH < 0.5) { prevTop = topY; continue; }
        if (pleineIdx < 0) { prevTop = topY; continue; }

        // Echelle du cote de la trappe (alterne front/back)
        const side = li % 2 === 0 ? 'front' : 'back';
        const zPos = side === 'front' ? r0.z1 + 0.08 : r0.z2 - 0.08;

        els.push(<Tube key={key()} start={[cx - halfW, baseY, zPos]} end={[cx - halfW, topY, zPos]} radius={0.016} color={LADDER_COLOR} />);
        els.push(<Tube key={key()} start={[cx + halfW, baseY, zPos]} end={[cx + halfW, topY, zPos]} radius={0.016} color={LADDER_COLOR} />);
        const nRungs = Math.floor(ladH / rungSpacing);
        for (let ri = 1; ri <= nRungs; ri++) {
          const ry = baseY + ri * rungSpacing;
          els.push(<Tube key={key()} start={[cx - halfW, ry, zPos]} end={[cx + halfW, ry, zPos]} radius={0.012} color={LADDER_COLOR} />);
        }
        els.push(<Clamp key={key()} x={cx} y={baseY + ladH * 0.3} z={zPos} />);
        els.push(<Clamp key={key()} x={cx} y={baseY + ladH * 0.8} z={zPos} />);
        prevTop = topY;
      }
    }

    // --- VERINAGE ---
    if (verinage) {
      const tubeH = 1.5;
      const done = new Set<string>();
      for (let vi = 0; vi < mailles.length; vi++) {
        const vm = mailles[vi]; const r = rects[vi];
        const vLevels = computeLevelsFor3D(vm.hauteurPlancher);
        const moiseY = jackH + (vLevels[vLevels.length - 1] || vm.hauteurPlancher);
        for (const [px, pz] of [[r.x1, r.z1], [r.x2, r.z1], [r.x1, r.z2], [r.x2, r.z2]]) {
          const pk = `${px.toFixed(3)},${pz.toFixed(3)}`;
          if (done.has(pk)) continue;
          done.add(pk);
          const topY = moiseY + tubeH;
          els.push(<Tube key={key()} start={[px, moiseY, pz]} end={[px, topY, pz]} radius={TUBE_RADIUS} color={STEEL_DARK} />);
          els.push(<Clamp key={key()} x={px} y={moiseY + 0.05} z={pz} />);
          els.push(<Clamp key={key()} x={px} y={moiseY + 0.15} z={pz} />);
          els.push(<BaseJack key={key()} x={px} z={pz} heightM={topY + 0.40} inverted />);
        }
      }
    }

    // --- SAPINE (contreventement au pied de l'echaff) ---
    // Structure : poteaux au sol devant l'echaff, relies par moises a la base et au 1er plancher,
    // diagonales qui montent du pied jusqu'au 2eme plancher
    if (needsSapine(pc) && rects.length > 0) {
      const r0 = rects[0];
      const sapD = closestLedger(mailles[0]?.largeur || 0.73); // profondeur sapine = largeur 1ere maille
      const sapLevels = computeLevelsFor3D(mailles[0]?.hauteurPlancher || 6);
      const level1 = sapLevels[0] || 2; // 1er plancher
      const level2 = sapLevels[1] || sapLevels[0] + 2 || 4; // 2eme plancher
      const sapPoteauH = level1 + 1; // poteau sapine monte au 1er plancher + 1m

      // 2 poteaux de sapine devant (cote zmin, meme X que les poteaux du 1er rect)
      const sapZ = r0.z1 - sapD;
      for (const px of [r0.x1, r0.x2]) {
        // Verin de base
        els.push(<BaseJack key={key()} x={px} z={sapZ} heightM={jackH} />);
        // Poteau
        let rem = sapPoteauH; let cy = jackH;
        while (rem > 0.01) {
          const segH = Math.min(POTEAU_MAX, rem);
          els.push(<Tube key={key()} start={[px, cy, sapZ]} end={[px, cy + segH, sapZ]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
          for (let rh = 0.5; rh <= segH; rh += 0.5) {
            els.push(<Rosette key={key()} x={px} y={cy + rh} z={sapZ} />);
          }
          cy += segH; rem -= segH;
        }
      }

      // Moises horizontales reliant sapine a l'echaff : base (h=0) et 1er plancher
      for (const mh of [0, level1]) {
        const y = jackH + mh;
        // Moises en Z (relient poteau sapine au poteau echaff)
        els.push(<Tube key={key()} start={[r0.x1, y, sapZ]} end={[r0.x1, y, r0.z1]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
        els.push(<Tube key={key()} start={[r0.x2, y, sapZ]} end={[r0.x2, y, r0.z1]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
        // Moise en X (entre les 2 poteaux sapine)
        els.push(<Tube key={key()} start={[r0.x1, y, sapZ]} end={[r0.x2, y, sapZ]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
      }

      const y1 = jackH + level1; // 1er plancher
      const y2 = jackH + level2; // 2eme plancher

      // Diagonales entre 1er et 2eme plancher — tour complet de la sapine
      // Face avant (entre les 2 poteaux sapine, z = sapZ)
      els.push(<Tube key={key()} start={[r0.x1, y1, sapZ]} end={[r0.x2, y2, sapZ]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
      els.push(<Tube key={key()} start={[r0.x2, y1, sapZ]} end={[r0.x1, y2, sapZ]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
      // Cote gauche (x = r0.x1, entre sapZ et r0.z1)
      els.push(<Tube key={key()} start={[r0.x1, y1, sapZ]} end={[r0.x1, y2, r0.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
      els.push(<Tube key={key()} start={[r0.x1, y1, r0.z1]} end={[r0.x1, y2, sapZ]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
      // Cote droit (x = r0.x2, entre sapZ et r0.z1)
      els.push(<Tube key={key()} start={[r0.x2, y1, sapZ]} end={[r0.x2, y2, r0.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
      els.push(<Tube key={key()} start={[r0.x2, y1, r0.z1]} end={[r0.x2, y2, sapZ]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
    }

    // --- DEPORT (consoles) per maille ---
    for (let mi = 0; mi < mailles.length; mi++) {
      const dm = mailles[mi];
      if (!dm.deport || dm.deportLongueur <= 0) continue;
      const dr = rects[mi];
      const offset = closestLedger(dm.deportLongueur);
      const dmLevels = computeLevelsFor3D(dm.hauteurPlancher);
      const dmTopLevel = dmLevels[dmLevels.length - 1] || dm.hauteurPlancher;
      const deportLevels = dm.deportTousEtages ? dmLevels : [dmTopLevel];

      const renderConsole = (xBase: number, zBase: number, dx: number, dz: number, lenX: number, lenZ: number) => {
        for (const lh of deportLevels) {
          const cy = jackH + lh;
          const xEnd = xBase + dx * offset;
          const zEnd = zBase + dz * offset;
          const xMin = Math.min(xBase, xEnd);
          const zMin = Math.min(zBase, zEnd);
          const isX = Math.abs(dx) > 0;

          if (isX) {
            els.push(<Tube key={key()} start={[xBase, cy, zBase]} end={[xEnd, cy, zBase]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase]} end={[xBase, cy - 0.5, zBase]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zBase + lenZ]} end={[xEnd, cy, zBase + lenZ]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase + lenZ]} end={[xBase, cy - 0.5, zBase + lenZ]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase]} end={[xEnd, cy + 1, zBase]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase + lenZ]} end={[xEnd, cy + 1, zBase + lenZ]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase]} end={[xEnd, cy, zBase + lenZ]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Platform key={key()} x={xMin} y={cy} z={zBase} width={offset} depth={lenZ} plankAxis={dm.deportPlancherSens === 'longueur' ? 'z' : 'x'} />);
            for (const gcH of [0.5, 1.0]) {
              els.push(<Tube key={key()} start={[xMin, cy + gcH, zBase]} end={[xMin + offset, cy + gcH, zBase]} radius={GC_RADIUS} color={GOLD_COLOR} metalness={0.5} roughness={0.3} clearcoat={0.5} />);
              els.push(<Tube key={key()} start={[xMin, cy + gcH, zBase + lenZ]} end={[xMin + offset, cy + gcH, zBase + lenZ]} radius={GC_RADIUS} color={GOLD_COLOR} metalness={0.5} roughness={0.3} clearcoat={0.5} />);
              els.push(<Tube key={key()} start={[xEnd, cy + gcH, zBase]} end={[xEnd, cy + gcH, zBase + lenZ]} radius={GC_RADIUS} color={GOLD_COLOR} metalness={0.5} roughness={0.3} clearcoat={0.5} />);
            }
            els.push(<ToeboardH key={key()} x1={xMin} x2={xMin + offset} y={cy} z={zBase} />);
            els.push(<ToeboardH key={key()} x1={xMin} x2={xMin + offset} y={cy} z={zBase + lenZ} />);
            els.push(<ToeboardV key={key()} x={xEnd} y={cy} z1={zBase} z2={zBase + lenZ} />);
          } else {
            els.push(<Tube key={key()} start={[xBase, cy, zBase]} end={[xBase, cy, zEnd]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zEnd]} end={[xBase, cy - 0.5, zBase]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase + lenX, cy, zBase]} end={[xBase + lenX, cy, zEnd]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Tube key={key()} start={[xBase + lenX, cy, zEnd]} end={[xBase + lenX, cy - 0.5, zBase]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zEnd]} end={[xBase, cy + 1, zEnd]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase + lenX, cy, zEnd]} end={[xBase + lenX, cy + 1, zEnd]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zEnd]} end={[xBase + lenX, cy, zEnd]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Platform key={key()} x={xBase} y={cy} z={zMin} width={lenX} depth={offset} plankAxis={dm.deportPlancherSens === 'longueur' ? 'x' : 'z'} />);
            for (const gcH of [0.5, 1.0]) {
              els.push(<Tube key={key()} start={[xBase, cy + gcH, zMin]} end={[xBase, cy + gcH, zMin + offset]} radius={GC_RADIUS} color={GOLD_COLOR} metalness={0.5} roughness={0.3} clearcoat={0.5} />);
              els.push(<Tube key={key()} start={[xBase + lenX, cy + gcH, zMin]} end={[xBase + lenX, cy + gcH, zMin + offset]} radius={GC_RADIUS} color={GOLD_COLOR} metalness={0.5} roughness={0.3} clearcoat={0.5} />);
              els.push(<Tube key={key()} start={[xBase, cy + gcH, zEnd]} end={[xBase + lenX, cy + gcH, zEnd]} radius={GC_RADIUS} color={GOLD_COLOR} metalness={0.5} roughness={0.3} clearcoat={0.5} />);
            }
            els.push(<ToeboardV key={key()} x={xBase} y={cy} z1={zMin} z2={zMin + offset} />);
            els.push(<ToeboardV key={key()} x={xBase + lenX} y={cy} z1={zMin} z2={zMin + offset} />);
            els.push(<ToeboardH key={key()} x1={xBase} x2={xBase + lenX} y={cy} z={zEnd} />);
          }
        }
      };

      if (dm.deportSides.zmin) renderConsole(dr.x1, dr.z1, 0, -1, dr.x2 - dr.x1, 0);
      if (dm.deportSides.zmax) renderConsole(dr.x1, dr.z2, 0, 1, dr.x2 - dr.x1, 0);
      if (dm.deportSides.xmin) renderConsole(dr.x1, dr.z1, -1, 0, 0, dr.z2 - dr.z1);
      if (dm.deportSides.xmax) renderConsole(dr.x2, dr.z1, 1, 0, 0, dr.z2 - dr.z1);
    }

    return els;
  }, [pc, rects]);

  return (
    <group>
      {elements}
    </group>
  );
}

// PRNG déterministe (mulberry32) — texture identique à chaque rendu
function seededRandom(seed: number) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ==========================================
// SOL
// ==========================================
function Ground() {
  const groundTex = useMemo(() => {
    const rng = seededRandom(7);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#161620';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      const v = 16 + rng() * 22;
      ctx.fillStyle = `rgba(${v},${v},${v + 3},0.25)`;
      ctx.fillRect(x, y, 2, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 20);
    tex.anisotropy = 4;
    return tex;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial map={groundTex} metalness={0} roughness={0.95} />
      </mesh>
      <Grid
        position={[0, -0.01, 0]}
        args={[500, 500]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#303040"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#404055"
        fadeDistance={200}
        fadeStrength={1}
        infiniteGrid
      />
    </group>
  );
}


// ==========================================
// EXPORT
// ==========================================
export function ScaffoldViewer3D({ plannerConfig }: { plannerConfig: PlannerConfig }) {
  const totalH = Math.max(...plannerConfig.mailles.map(m => m.hauteurPlancher), plannerConfig.hauteurPlancher) + 1.55;
  const rects = plannerConfig.mailles.map(m => getMailleRect(m));

  let gx1 = Infinity, gz1 = Infinity, gx2 = -Infinity, gz2 = -Infinity;
  for (const r of rects) { gx1 = Math.min(gx1, r.x1); gz1 = Math.min(gz1, r.z1); gx2 = Math.max(gx2, r.x2); gz2 = Math.max(gz2, r.z2); }
  const globalSpan = Math.max(gx2 - gx1, gz2 - gz1, 3);

  const cameraD = Math.max(totalH, globalSpan) * 1.5;
  const fogFar = 60;
  const shadowScale = 40;

  const cx = (gx1 + gx2) / 2 || 0;
  const cz = (gz1 + gz2) / 2 || 0;

  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      onCreated={({ gl }) => { gl.shadowMap.type = THREE.PCFSoftShadowMap; }}
      dpr={[1, 2]}
      style={{ background: '#0e0e14' }}
    >
      <PerspectiveCamera makeDefault position={[cx + cameraD * 0.6, cameraD * 0.55, cz + cameraD * 0.6]} fov={45} near={0.1} far={1200} />
      <OrbitControls
        target={[cx, totalH * 0.3, cz]}
        enableDamping dampingFactor={0.08}
        minDistance={0.5} maxDistance={500}
        maxPolarAngle={Math.PI / 2 + 0.05}
        rotateSpeed={0.7}
      />
      <ambientLight intensity={0.18} color="#e8eaf0" />
      <directionalLight
        position={[50, 80, 40]} intensity={2.2} castShadow
        shadow-mapSize={4096} shadow-bias={-0.0001}
        shadow-camera-left={-shadowScale} shadow-camera-right={shadowScale}
        shadow-camera-top={shadowScale} shadow-camera-bottom={-shadowScale}
        shadow-normalBias={0.04}
        color="#ffffff"
      />
      <directionalLight position={[-30, 60, -20]} intensity={0.6} color="#a0b8d8" />
      <directionalLight position={[20, 40, -50]} intensity={0.3} color="#d0c8b0" />
      <pointLight position={[0, totalH + 2, 0]} intensity={0.3} distance={totalH * 3} color="#ffffff" decay={2} />
      <hemisphereLight args={['#c0d0e8', '#0a0a14', 0.65]} />
      <Environment preset="warehouse" backgroundIntensity={0} environmentIntensity={0.4} />
      <fog attach="fog" args={['#0e0e14', fogFar * 0.55, fogFar * 1.1]} />
      <Ground />
      <ScaffoldScene pc={plannerConfig} />
      <EffectComposer multisampling={4}>
        <N8AO
          aoRadius={0.8}
          intensity={4.0}
          /* @ts-expect-error aoTones exists at runtime */
          aoTones={0.35}
          halfRes
        />
        <Bloom
          intensity={0.18}
          luminanceThreshold={0.75}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
        <Vignette
          offset={0.25}
          darkness={0.55}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>
    </Canvas>
  );
}
