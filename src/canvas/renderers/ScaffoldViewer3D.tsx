import { useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { closestLedger } from '../../engine/scaffoldGenerator';
import type { PlannerConfig, MailleRect, EdgeSegments } from '../../panels/PlannerView';
import { getMailleRect, getOpenSegments, needsSapine } from '../../panels/PlannerView';

// ==========================================
// MATERIAUX
// ==========================================
const STEEL_COLOR = '#a0aab4';
const STEEL_DARK = '#8090a0';
const GOLD_COLOR = '#dab020';
const PLATFORM_COLOR = '#a08040';
const DIAGONAL_COLOR = '#90a0b0';
const JACK_COLOR = '#707a84';
const TOEBOARD_COLOR = '#b89848';
const ROSETTE_COLOR = '#d0a028';
const LADDER_COLOR = '#c0c8d0';
const CLAMP_COLOR = '#606870';
const CONSOLE_COLOR = '#95a0aa';

const TUBE_RADIUS = 0.024;
const GC_RADIUS = 0.020;
const DIAG_RADIUS = 0.018;
const POTEAU_MAX = 2.0;

// ==========================================
// TUBE
// ==========================================
function Tube({ start, end, radius, color, metalness = 0.6, roughness = 0.35 }: {
  start: [number, number, number]; end: [number, number, number];
  radius: number; color: string; metalness?: number; roughness?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
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
    <mesh ref={ref} position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

const PLATFORM_GREY = '#707880';
const PLATFORM_ORANGE = '#d08030';

function Platform({ x, y, z, width, depth, isAccess, trapSide }: {
  x: number; y: number; z: number; width: number; depth: number;
  isAccess?: boolean; trapSide?: 'front' | 'back';
}) {
  const t = 0.04;
  // Maille a vide : tout gris
  if (isAccess) {
    return (
      <mesh position={[x + width / 2, y - t / 2, z + depth / 2]}>
        <boxGeometry args={[width - 0.02, t, depth - 0.02]} />
        <meshStandardMaterial color={PLATFORM_GREY} metalness={0.3} roughness={0.7} />
      </mesh>
    );
  }
  // Largeur >= 1m : split trappe orange (0.70m) alternee + zone grise
  if (depth >= 0.98 && trapSide) {
    const orangeD = 0.70;
    const greyD = depth - orangeD;
    const orangeZ = trapSide === 'front' ? z : z + greyD;
    const greyZ = trapSide === 'front' ? z + orangeD : z;
    return (
      <group>
        <mesh position={[x + width / 2, y - t / 2, orangeZ + orangeD / 2]}>
          <boxGeometry args={[width - 0.02, t, orangeD - 0.01]} />
          <meshStandardMaterial color={PLATFORM_ORANGE} metalness={0.3} roughness={0.7} />
        </mesh>
        <mesh position={[x + width / 2, y - t / 2, greyZ + greyD / 2]}>
          <boxGeometry args={[width - 0.02, t, greyD - 0.01]} />
          <meshStandardMaterial color={PLATFORM_GREY} metalness={0.3} roughness={0.7} />
        </mesh>
      </group>
    );
  }
  // Largeur < 1m : tout orange
  return (
    <mesh position={[x + width / 2, y - t / 2, z + depth / 2]}>
      <boxGeometry args={[width - 0.02, t, depth - 0.02]} />
      <meshStandardMaterial color={PLATFORM_ORANGE} metalness={0.3} roughness={0.7} />
    </mesh>
  );
}

function ToeboardH({ x1, x2, y, z }: { x1: number; x2: number; y: number; z: number }) {
  return (
    <mesh position={[(x1 + x2) / 2, y + 0.075, z]}>
      <boxGeometry args={[x2 - x1, 0.15, 0.003]} />
      <meshStandardMaterial color={TOEBOARD_COLOR} metalness={0.2} roughness={0.6} />
    </mesh>
  );
}

function ToeboardV({ x, y, z1, z2 }: { x: number; y: number; z1: number; z2: number }) {
  return (
    <mesh position={[x, y + 0.075, (z1 + z2) / 2]}>
      <boxGeometry args={[0.003, 0.15, z2 - z1]} />
      <meshStandardMaterial color={TOEBOARD_COLOR} metalness={0.2} roughness={0.6} />
    </mesh>
  );
}

function Rosette({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <mesh position={[x, y, z]}>
      <sphereGeometry args={[0.015, 8, 8]} />
      <meshStandardMaterial color={ROSETTE_COLOR} metalness={0.7} roughness={0.3} />
    </mesh>
  );
}

function BaseJack({ x, z, heightM, inverted }: {
  x: number; z: number; heightM: number; inverted?: boolean;
}) {
  const plateSize = 0.15; const plateH = 0.008; const tR = 0.012;
  if (inverted) {
    const topY = heightM; const botY = heightM - 0.40;
    return (<group>
      <mesh position={[x, topY - plateH / 2, z]}><boxGeometry args={[plateSize, plateH, plateSize]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.7} roughness={0.3} /></mesh>
      <Tube start={[x, botY, z]} end={[x, topY - plateH, z]} radius={tR} color={STEEL_DARK} metalness={0.7} roughness={0.25} />
      <mesh position={[x, botY + 0.02, z]}><cylinderGeometry args={[0.022, 0.022, 0.02, 6]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.6} roughness={0.3} /></mesh>
    </group>);
  }
  return (<group>
    <mesh position={[x, plateH / 2, z]}><boxGeometry args={[plateSize, plateH, plateSize]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.7} roughness={0.3} /></mesh>
    <Tube start={[x, plateH, z]} end={[x, heightM, z]} radius={tR} color={STEEL_DARK} metalness={0.7} roughness={0.25} />
    <mesh position={[x, heightM - 0.02, z]}><cylinderGeometry args={[0.022, 0.022, 0.02, 6]} /><meshStandardMaterial color={JACK_COLOR} metalness={0.6} roughness={0.3} /></mesh>
  </group>);
}

function Clamp({ x, y, z }: { x: number; y: number; z: number }) {
  return (<mesh position={[x, y, z]}><torusGeometry args={[0.03, 0.008, 8, 12]} /><meshStandardMaterial color={CLAMP_COLOR} metalness={0.7} roughness={0.3} /></mesh>);
}

// ==========================================
// SCENE
// ==========================================
function ScaffoldScene({ pc }: { pc: PlannerConfig }) {
  const { hauteurPlancher, mailles, verinage, echelle } = pc;
  const maxH = hauteurPlancher + 1;
  const jackH = 0.40 + 0.15; // base jack 40cm + plate

  const levels = useMemo(() => {
    const l: number[] = [];
    for (let h = 2; h <= hauteurPlancher; h += 2) l.push(h);
    if (!l.includes(hauteurPlancher)) l.push(hauteurPlancher);
    return l.sort((a, b) => a - b);
  }, [hauteurPlancher]);

  const topLevel = levels[levels.length - 1] || hauteurPlancher;

  const rects = useMemo(
    () => mailles.map(m => getMailleRect(m)),
    [mailles],
  );

  // Centre de la scene
  const bounds = useMemo(() => {
    let x1 = Infinity, z1 = Infinity, x2 = -Infinity, z2 = -Infinity;
    for (const r of rects) {
      x1 = Math.min(x1, r.x1); z1 = Math.min(z1, r.z1);
      x2 = Math.max(x2, r.x2); z2 = Math.max(z2, r.z2);
    }
    return { cx: (x1 + x2) / 2, cz: (z1 + z2) / 2, w: x2 - x1, d: z2 - z1 };
  }, [rects]);

  const elements = useMemo(() => {
    const els: React.ReactElement[] = [];
    let k = 0;
    const key = () => `e-${k++}`;

    // Unique poteau positions
    const poteauKeys = new Set<string>();
    const addPoteau = (x: number, z: number) => {
      const pk = `${x.toFixed(3)},${z.toFixed(3)}`;
      if (poteauKeys.has(pk)) return;
      poteauKeys.add(pk);

      // Verin
      els.push(<BaseJack key={key()} x={x} z={z} heightM={jackH} />);

      // Poteaux empiles 2m
      let rem = maxH; let cy = jackH; let seg = 0;
      while (rem > 0.01) {
        const segH = Math.min(POTEAU_MAX, rem);
        els.push(<Tube key={key()} start={[x, cy, z]} end={[x, cy + segH, z]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
        for (let rh = 0.5; rh <= segH; rh += 0.5) {
          els.push(<Rosette key={key()} x={x} y={cy + rh} z={z} />);
        }
        cy += segH; rem -= segH; seg++;
      }
    };

    // Hauteurs des moises : base + intermediaires + paliers
    const moiseHeights = [0];
    for (let h = 2; h < maxH - 0.1; h += 2) {
      if (!levels.includes(h)) moiseHeights.push(h);
    }
    for (const lh of levels) moiseHeights.push(lh);

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

      // 4 poteaux (dedupliques)
      addPoteau(r.x1, r.z1); addPoteau(r.x2, r.z1);
      addPoteau(r.x1, r.z2); addPoteau(r.x2, r.z2);

      // Moises/U a chaque hauteur (dedupliques)
      for (const mh of moiseHeights) {
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
        for (const lh of levels) {
          const topY = jackH + lh;
          els.push(<Tube key={key()} start={[r.x1, prevY, r.z1]} end={[r.x2, topY, r.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          els.push(<Tube key={key()} start={[r.x2, prevY, r.z2]} end={[r.x1, topY, r.z2]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          els.push(<Tube key={key()} start={[r.x1, prevY, r.z1]} end={[r.x1, topY, r.z2]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          els.push(<Tube key={key()} start={[r.x2, prevY, r.z2]} end={[r.x2, topY, r.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
          prevY = topY;
        }
      } else {
        const diagTop = levels[0] || 2;
        els.push(<Tube key={key()} start={[r.x1, jackH, r.z1]} end={[r.x2, jackH + diagTop, r.z1]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
        els.push(<Tube key={key()} start={[r.x2, jackH, r.z2]} end={[r.x1, jackH + diagTop, r.z2]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
      }

      // A chaque palier : plateforme + GC/plinthes par segment ouvert
      const isTopLevel = (lh: number) => lh === levels[levels.length - 1];
      for (let li = 0; li < levels.length; li++) {
        const lh = levels[li];
        const py = jackH + lh;
        const showFull = !m.aVide || isTopLevel(lh);
        if (!showFull) continue;

        els.push(<Platform key={key()} x={r.x1} y={py} z={r.z1} width={r.x2 - r.x1} depth={r.z2 - r.z1} isAccess={m.aVide} trapSide={m.aVide ? undefined : (li % 2 === 0 ? 'front' : 'back')} />);

        const accesMaxLevel = m.accesExterieur && m.accesExterieurPremierPalier ? (levels[0] || 2) : Infinity;
        const isAccesLevel = accesSide && lh <= accesMaxLevel;

        // GC + plinthes par segment ouvert (pas par cote entier)
        // zmin : segments le long de X
        for (const [s, e] of segs.zmin) {
          const isAcces = accesSide === 'zmin' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[s, py + gcH, r.z1]} end={[e, py + gcH, r.z1]} radius={rad} color={col} />);
          if (!isAcces) els.push(<ToeboardH key={key()} x1={s} x2={e} y={py} z={r.z1} />);
        }
        // zmax
        for (const [s, e] of segs.zmax) {
          const isAcces = accesSide === 'zmax' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[s, py + gcH, r.z2]} end={[e, py + gcH, r.z2]} radius={rad} color={col} />);
          if (!isAcces) els.push(<ToeboardH key={key()} x1={s} x2={e} y={py} z={r.z2} />);
        }
        // xmin : segments le long de Z
        for (const [s, e] of segs.xmin) {
          const isAcces = accesSide === 'xmin' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[r.x1, py + gcH, s]} end={[r.x1, py + gcH, e]} radius={rad} color={col} />);
          if (!isAcces) els.push(<ToeboardV key={key()} x={r.x1} y={py} z1={s} z2={e} />);
        }
        // xmax
        for (const [s, e] of segs.xmax) {
          const isAcces = accesSide === 'xmax' && isAccesLevel;
          const col = isAcces ? '#22aa44' : GOLD_COLOR;
          const rad = isAcces ? GC_RADIUS * 1.2 : GC_RADIUS;
          for (const gcH of [0.5, 1.0]) els.push(<Tube key={key()} start={[r.x2, py + gcH, s]} end={[r.x2, py + gcH, e]} radius={rad} color={col} />);
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
      const crinoH = m.accesExterieurPremierPalier ? (levels[0] || 2) : topLevel;
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
      for (const lh of levels) {
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
      const cx = (r0.x1 + r0.x2) / 2;
      const ladderW = 0.40; const halfW = ladderW / 2;
      const rungSpacing = 0.28;

      let prevTop = jackH;
      for (let li = 0; li < levels.length; li++) {
        const lh = levels[li];
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
      const moiseY = jackH + topLevel;
      const tubeH = 1.5;
      const done = new Set<string>();
      for (const r of rects) {
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
      const level1 = levels[0] || 2; // 1er plancher
      const level2 = levels[1] || levels[0] + 2 || 4; // 2eme plancher
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
      const deportLevels = dm.deportTousEtages ? levels : [topLevel];

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
            els.push(<Tube key={key()} start={[xBase, cy, zBase]} end={[xEnd, cy - 0.5, zBase]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zBase + lenZ]} end={[xEnd, cy, zBase + lenZ]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zBase + lenZ]} end={[xEnd, cy - 0.5, zBase + lenZ]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase]} end={[xEnd, cy + 1, zBase]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase + lenZ]} end={[xEnd, cy + 1, zBase + lenZ]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xEnd, cy, zBase]} end={[xEnd, cy, zBase + lenZ]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Platform key={key()} x={xMin} y={cy} z={zBase} width={offset} depth={lenZ} />);
            for (const gcH of [0.5, 1.0]) {
              els.push(<Tube key={key()} start={[xMin, cy + gcH, zBase]} end={[xMin + offset, cy + gcH, zBase]} radius={GC_RADIUS} color={GOLD_COLOR} />);
              els.push(<Tube key={key()} start={[xMin, cy + gcH, zBase + lenZ]} end={[xMin + offset, cy + gcH, zBase + lenZ]} radius={GC_RADIUS} color={GOLD_COLOR} />);
              els.push(<Tube key={key()} start={[xEnd, cy + gcH, zBase]} end={[xEnd, cy + gcH, zBase + lenZ]} radius={GC_RADIUS} color={GOLD_COLOR} />);
            }
            els.push(<ToeboardH key={key()} x1={xMin} x2={xMin + offset} y={cy} z={zBase} />);
            els.push(<ToeboardH key={key()} x1={xMin} x2={xMin + offset} y={cy} z={zBase + lenZ} />);
            els.push(<ToeboardV key={key()} x={xEnd} y={cy} z1={zBase} z2={zBase + lenZ} />);
          } else {
            els.push(<Tube key={key()} start={[xBase, cy, zBase]} end={[xBase, cy, zEnd]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zBase]} end={[xBase, cy - 0.5, zEnd]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase + lenX, cy, zBase]} end={[xBase + lenX, cy, zEnd]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Tube key={key()} start={[xBase + lenX, cy, zBase]} end={[xBase + lenX, cy - 0.5, zEnd]} radius={DIAG_RADIUS} color={DIAGONAL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zEnd]} end={[xBase, cy + 1, zEnd]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase + lenX, cy, zEnd]} end={[xBase + lenX, cy + 1, zEnd]} radius={TUBE_RADIUS} color={STEEL_COLOR} />);
            els.push(<Tube key={key()} start={[xBase, cy, zEnd]} end={[xBase + lenX, cy, zEnd]} radius={TUBE_RADIUS} color={CONSOLE_COLOR} />);
            els.push(<Platform key={key()} x={xBase} y={cy} z={zMin} width={lenX} depth={offset} />);
            for (const gcH of [0.5, 1.0]) {
              els.push(<Tube key={key()} start={[xBase, cy + gcH, zMin]} end={[xBase, cy + gcH, zMin + offset]} radius={GC_RADIUS} color={GOLD_COLOR} />);
              els.push(<Tube key={key()} start={[xBase + lenX, cy + gcH, zMin]} end={[xBase + lenX, cy + gcH, zMin + offset]} radius={GC_RADIUS} color={GOLD_COLOR} />);
              els.push(<Tube key={key()} start={[xBase, cy + gcH, zEnd]} end={[xBase + lenX, cy + gcH, zEnd]} radius={GC_RADIUS} color={GOLD_COLOR} />);
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
  }, [pc, rects, levels]);

  return (
    <group position={[-bounds.cx, 0, -bounds.cz]}>
      {elements}
    </group>
  );
}

// ==========================================
// SOL
// ==========================================
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#2a2a30" metalness={0} roughness={0.9} />
    </mesh>
  );
}

// ==========================================
// EXPORT
// ==========================================
export function ScaffoldViewer3D({ plannerConfig }: { plannerConfig: PlannerConfig }) {
  const totalH = plannerConfig.hauteurPlancher + 1.55;
  const rects = plannerConfig.mailles.map(m => getMailleRect(m));
  let maxSpan = 3;
  for (const r of rects) {
    maxSpan = Math.max(maxSpan, r.x2 - r.x1, r.z2 - r.z1);
  }
  // Taille globale
  let gx1 = Infinity, gz1 = Infinity, gx2 = -Infinity, gz2 = -Infinity;
  for (const r of rects) { gx1 = Math.min(gx1, r.x1); gz1 = Math.min(gz1, r.z1); gx2 = Math.max(gx2, r.x2); gz2 = Math.max(gz2, r.z2); }
  const globalSpan = Math.max(gx2 - gx1, gz2 - gz1, 3);
  const cameraD = Math.max(totalH, globalSpan) * 1.3;
  const cameraY = totalH * 0.6;

  return (
    <Canvas shadows gl={{ antialias: true, alpha: false }} style={{ background: '#0e0e14' }}>
      <PerspectiveCamera makeDefault position={[cameraD * 0.8, cameraY + 1, cameraD * 0.6]} fov={45} />
      <OrbitControls target={[0, totalH * 0.4, 0]} enableDamping dampingFactor={0.1} minDistance={1} maxDistance={40} maxPolarAngle={Math.PI / 2 + 0.1} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[8, 12, 6]} intensity={1.2} castShadow shadow-mapSize={1024} />
      <directionalLight position={[-4, 8, -3]} intensity={0.3} />
      <hemisphereLight args={['#b0c4de', '#2a2a30', 0.5]} />
      <Ground />
      <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={30} blur={2} far={10} />
      <ScaffoldScene pc={plannerConfig} />
    </Canvas>
  );
}
