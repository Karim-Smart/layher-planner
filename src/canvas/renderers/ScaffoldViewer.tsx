import { Group, Line, Circle, Rect, Text, Shape } from 'react-konva';
import type { ScaffoldConfig } from '../../engine/scaffoldGenerator';
import { closestLedger } from '../../engine/scaffoldGenerator';

// ==========================================
// COULEURS LAYHER REALISTES
// ==========================================
const CLR = {
  steel: '#a8b4c0',
  steelDark: '#7a8a98',
  steelBack: '#8090a0',
  steelOutline: '#5a6a78',
  gold: '#e0b820',
  goldLight: '#f0d040',
  goldDark: '#b09010',
  goldBack: '#c0a018',
  platform: '#b8944c',
  platformDark: '#9a7838',
  platformSide: '#8a6828',
  platformEdge: '#706020',
  diagonal: '#90a0b0',
  diagonalDark: '#708090',
  jackPlate: '#6a7a8a',
  jackThread: '#8a9aaa',
  jackNut: '#5a6a7a',
  toeboard: '#c8a858',
  toeboardDark: '#a08838',
  toeboardSide: '#907828',
  rosette: '#d4a830',
  rosetteDark: '#b08820',
  groundLine: '#555566',
  ground: '#3a3a44',
  dimText: '#888899',
};

const TUBE_W = 5;
const PLATFORM_H = 8;
const GC_W = 3.5;
const DIAG_W = 3;
const PLINTHE_H = 10;
const JACK_W = 7;
const ROSETTE_R = 3.5;

// ==========================================
// PROJECTION CAVALIERE
// Angle 30deg, reduction 0.5 pour la profondeur
// ==========================================
const DEPTH_ANGLE = Math.PI / 6; // 30 degres
const DEPTH_RATIO = 0.5;
const DX = Math.cos(DEPTH_ANGLE) * DEPTH_RATIO; // ~0.433
const DY = Math.sin(DEPTH_ANGLE) * DEPTH_RATIO; // ~0.25

interface Props {
  config: ScaffoldConfig;
  width: number;
  height: number;
  view: 'face' | 'side' | 'top';
}

// Projeter un point 3D (x=droite, y=haut, z=profondeur) en 2D ecran
function project(
  x3d: number, y3d: number, z3d: number,
  scale: number, originX: number, originY: number,
): [number, number] {
  const sx = originX + (x3d + z3d * DX) * scale;
  const sy = originY - (y3d + z3d * DY) * scale;
  return [sx, sy];
}

export function ScaffoldViewer({ config, width, height, view }: Props) {
  if (width <= 0 || height <= 0) return null;
  // Toujours dessiner en perspective 3D
  return <PerspectiveView config={config} width={width} height={height} />;
}

function PerspectiveView({ config, width, height }: { config: ScaffoldConfig; width: number; height: number }) {
  const {
    maxHeight, levels, bayLength, bayCount, depth,
    guardrails, toeboards, diagonals, baseJackCm,
    consoleOffset, emptyBays, trapdoors,
  } = config;

  const ledgerLen = closestLedger(bayLength);
  const depthLedger = closestLedger(depth);
  const sortedLevels = [...levels].sort((a, b) => a - b);
  const topLevel = sortedLevels[sortedLevels.length - 1] || maxHeight;

  const jackH = baseJackCm / 100 + 0.15;
  const totalH = maxHeight + jackH;
  const totalW = bayCount * ledgerLen;
  const totalD = depthLedger;

  // Calculer bounding box projetee pour le scale
  const testPoints = [
    [0, 0, 0], [totalW, 0, 0], [0, totalH, 0], [totalW, totalH, 0],
    [0, 0, totalD], [totalW, 0, totalD], [0, totalH, totalD], [totalW, totalH, totalD],
  ];
  let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
  for (const [x, y, z] of testPoints) {
    const sx = x + z * DX;
    const sy = -(y + z * DY);
    minSx = Math.min(minSx, sx);
    maxSx = Math.max(maxSx, sx);
    minSy = Math.min(minSy, sy);
    maxSy = Math.max(maxSy, sy);
  }

  const padX = 70;
  const padY = 50;
  const padBottom = 50;
  const availW = width - padX * 2;
  const availH = height - padY - padBottom;
  const scaleX = availW / (maxSx - minSx);
  const scaleY = availH / (maxSy - minSy);
  const scale = Math.min(scaleX, scaleY, 150);

  // Origine = bas-gauche de la face avant
  const originX = padX - minSx * scale;
  const originY = height - padBottom + minSy * scale;

  const p = (x: number, y: number, z: number) => project(x, y + jackH, z, scale, originX, originY);
  const pGround = (x: number, z: number) => project(x, 0, z, scale, originX, originY);

  const elements: React.ReactElement[] = [];

  // ==========================================
  // SOL
  // ==========================================
  const [g0] = [pGround(0, 0)];
  const gPts = [
    ...pGround(-0.3, 0), ...pGround(totalW + 0.3, 0),
    ...pGround(totalW + 0.3, totalD), ...pGround(-0.3, totalD),
  ];
  elements.push(
    <Shape key="ground" sceneFunc={(ctx, shape) => {
      ctx.beginPath();
      ctx.moveTo(gPts[0], gPts[1]);
      ctx.lineTo(gPts[2], gPts[3]);
      ctx.lineTo(gPts[4], gPts[5]);
      ctx.lineTo(gPts[6], gPts[7]);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    }} fill={CLR.ground} opacity={0.25} />,
  );
  // Ground line front
  elements.push(
    <Line key="ground-line" points={[...pGround(-0.5, 0), ...pGround(totalW + 0.5, 0)]}
      stroke={CLR.groundLine} strokeWidth={1.5} />,
  );

  // ==========================================
  // ARRIERE (z=depthLedger) - dessine en premier (derriere)
  // ==========================================
  const montantCount = bayCount + 1;

  // Montants arriere
  for (let col = 0; col < montantCount; col++) {
    const x = col * ledgerLen;
    elements.push(
      <Line key={`std-back-${col}`}
        points={[...p(x, 0, totalD), ...p(x, maxHeight, totalD)]}
        stroke={CLR.steelBack} strokeWidth={TUBE_W * 0.8} lineCap="round" opacity={0.6}
      />,
    );
  }

  // Longerons arriere (au sol + paliers)
  for (let bay = 0; bay < bayCount; bay++) {
    const x1 = bay * ledgerLen;
    const x2 = (bay + 1) * ledgerLen;
    elements.push(
      <Line key={`ledger-back-base-${bay}`}
        points={[...p(x1, 0, totalD), ...p(x2, 0, totalD)]}
        stroke={CLR.steelBack} strokeWidth={TUBE_W * 0.7} lineCap="round" opacity={0.5}
      />,
    );
    for (const lh of sortedLevels) {
      elements.push(
        <Line key={`ledger-back-${lh}-${bay}`}
          points={[...p(x1, lh, totalD), ...p(x2, lh, totalD)]}
          stroke={CLR.steelBack} strokeWidth={TUBE_W * 0.7} lineCap="round" opacity={0.5}
        />,
      );
    }
  }

  // Garde-corps arriere
  if (guardrails) {
    for (const levelH of sortedLevels) {
      for (let bay = 0; bay < bayCount; bay++) {
        if (emptyBays.includes(bay)) continue;
        const x1 = bay * ledgerLen;
        const x2 = (bay + 1) * ledgerLen;
        for (const gcH of [0.5, 1.0]) {
          elements.push(
            <Line key={`gc-back-${levelH}-${bay}-${gcH}`}
              points={[...p(x1, levelH + gcH, totalD), ...p(x2, levelH + gcH, totalD)]}
              stroke={CLR.goldBack} strokeWidth={GC_W * 0.8} lineCap="round" opacity={0.4}
            />,
          );
        }
      }
    }
  }

  // ==========================================
  // LONGERONS DE PROFONDEUR (cote, z=0 -> z=depth)
  // ==========================================
  for (let col = 0; col < montantCount; col++) {
    const x = col * ledgerLen;
    // Au sol
    elements.push(
      <Line key={`depth-ledger-base-${col}`}
        points={[...p(x, 0, 0), ...p(x, 0, totalD)]}
        stroke={CLR.steelDark} strokeWidth={TUBE_W * 0.7} lineCap="round" opacity={0.7}
      />,
    );
    // Aux paliers
    for (const lh of sortedLevels) {
      elements.push(
        <Line key={`depth-ledger-${lh}-${col}`}
          points={[...p(x, lh, 0), ...p(x, lh, totalD)]}
          stroke={CLR.steelDark} strokeWidth={TUBE_W * 0.7} lineCap="round" opacity={0.7}
        />,
      );
    }
  }

  // Garde-corps cote (sur les 2 extremites)
  if (guardrails) {
    for (const levelH of sortedLevels) {
      for (const col of [0, bayCount]) {
        const x = col * ledgerLen;
        for (const gcH of [0.5, 1.0]) {
          elements.push(
            <Line key={`gc-side-${levelH}-${col}-${gcH}`}
              points={[...p(x, levelH + gcH, 0), ...p(x, levelH + gcH, totalD)]}
              stroke={CLR.goldDark} strokeWidth={GC_W * 0.7} lineCap="round" opacity={0.5}
            />,
          );
        }
      }
    }
  }

  // ==========================================
  // PLATEFORMES (parallelogrammes 3D)
  // ==========================================
  for (const levelH of sortedLevels) {
    for (let bay = 0; bay < bayCount; bay++) {
      if (emptyBays.includes(bay)) continue;
      const x1 = bay * ledgerLen;
      const x2 = (bay + 1) * ledgerLen;
      const platH = 0.05; // epaisseur plateforme en m

      // Face superieure (parallelogramme)
      const pts = [
        ...p(x1, levelH, 0),
        ...p(x2, levelH, 0),
        ...p(x2, levelH, totalD),
        ...p(x1, levelH, totalD),
      ];
      elements.push(
        <Shape key={`plat-top-${levelH}-${bay}`} sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]);
          ctx.lineTo(pts[2], pts[3]);
          ctx.lineTo(pts[4], pts[5]);
          ctx.lineTo(pts[6], pts[7]);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }} fill={CLR.platform} stroke={CLR.platformEdge} strokeWidth={1} />,
      );

      // Face avant (tranche)
      const frontPts = [
        ...p(x1, levelH, 0),
        ...p(x2, levelH, 0),
        ...p(x2, levelH - platH, 0),
        ...p(x1, levelH - platH, 0),
      ];
      elements.push(
        <Shape key={`plat-front-${levelH}-${bay}`} sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(frontPts[0], frontPts[1]);
          ctx.lineTo(frontPts[2], frontPts[3]);
          ctx.lineTo(frontPts[4], frontPts[5]);
          ctx.lineTo(frontPts[6], frontPts[7]);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }} fill={CLR.platformDark} stroke={CLR.platformEdge} strokeWidth={0.5} />,
      );

      // Marque trappe
      if (trapdoors && bay === 0 && levelH === topLevel) {
        const cx1 = x1 + ledgerLen * 0.3;
        const cx2 = x1 + ledgerLen * 0.7;
        const cz1 = totalD * 0.2;
        const cz2 = totalD * 0.8;
        elements.push(
          <Line key={`trap-${levelH}-${bay}`}
            points={[
              ...p(cx1, levelH + 0.01, cz1), ...p(cx2, levelH + 0.01, cz1),
              ...p(cx2, levelH + 0.01, cz2), ...p(cx1, levelH + 0.01, cz2),
              ...p(cx1, levelH + 0.01, cz1),
            ]}
            stroke={CLR.goldDark} strokeWidth={1} dash={[4, 3]}
            closed
          />,
        );
      }

      // Plinthes (face avant)
      if (toeboards) {
        const tbH = 0.15;
        const tbPts = [
          ...p(x1, levelH, 0),
          ...p(x2, levelH, 0),
          ...p(x2, levelH + tbH, 0),
          ...p(x1, levelH + tbH, 0),
        ];
        elements.push(
          <Shape key={`toe-${levelH}-${bay}`} sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.moveTo(tbPts[0], tbPts[1]);
            ctx.lineTo(tbPts[2], tbPts[3]);
            ctx.lineTo(tbPts[4], tbPts[5]);
            ctx.lineTo(tbPts[6], tbPts[7]);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }} fill={CLR.toeboard} stroke={CLR.toeboardDark} strokeWidth={0.5} opacity={0.7} />,
        );
      }
    }
  }

  // ==========================================
  // VERINS AVANT (z=0)
  // ==========================================
  for (let col = 0; col < montantCount; col++) {
    const x = col * ledgerLen;
    const [bx, by] = p(x, 0, 0);
    const [gx, gy] = pGround(x, 0);

    // Plaque
    elements.push(
      <Rect key={`jack-plate-${col}`}
        x={gx - JACK_W} y={gy - 3} width={JACK_W * 2} height={3}
        fill={CLR.jackPlate} stroke={CLR.steelOutline} strokeWidth={0.5}
      />,
    );
    // Tige
    elements.push(
      <Line key={`jack-${col}`}
        points={[gx, gy - 3, bx, by]}
        stroke={CLR.jackThread} strokeWidth={TUBE_W * 0.6}
      />,
    );
    // Ecrou
    elements.push(
      <Rect key={`jack-nut-${col}`}
        x={bx - 4} y={by - 2} width={8} height={4}
        fill={CLR.jackNut} stroke={CLR.steelOutline} strokeWidth={0.5}
      />,
    );
  }

  // ==========================================
  // MONTANTS AVANT (z=0)
  // ==========================================
  for (let col = 0; col < montantCount; col++) {
    const x = col * ledgerLen;
    elements.push(
      <Line key={`std-front-${col}`}
        points={[...p(x, 0, 0), ...p(x, maxHeight, 0)]}
        stroke={CLR.steel} strokeWidth={TUBE_W} lineCap="round"
      />,
    );
    // Contour montant
    elements.push(
      <Line key={`std-outline-${col}`}
        points={[...p(x, 0, 0), ...p(x, maxHeight, 0)]}
        stroke={CLR.steelOutline} strokeWidth={0.5}
      />,
    );
    // Rosettes
    for (let rh = 0.5; rh <= maxHeight; rh += 0.5) {
      const [rx, ry] = p(x, rh, 0);
      elements.push(
        <Circle key={`ros-${col}-${rh}`} x={rx} y={ry} radius={ROSETTE_R}
          fill={CLR.rosette} stroke={CLR.rosetteDark} strokeWidth={0.8} />,
      );
    }
  }

  // ==========================================
  // LONGERONS AVANT (z=0)
  // ==========================================
  for (let bay = 0; bay < bayCount; bay++) {
    const x1 = bay * ledgerLen;
    const x2 = (bay + 1) * ledgerLen;
    // Au sol
    elements.push(
      <Line key={`ledger-front-base-${bay}`}
        points={[...p(x1, 0, 0), ...p(x2, 0, 0)]}
        stroke={CLR.steel} strokeWidth={TUBE_W * 0.85} lineCap="round"
      />,
    );
    // Intermediaires et paliers
    const allH = new Set<number>();
    for (let h = 2; h < maxHeight; h += 2) allH.add(h);
    sortedLevels.forEach((l) => allH.add(l));
    for (const lh of allH) {
      elements.push(
        <Line key={`ledger-front-${lh}-${bay}`}
          points={[...p(x1, lh, 0), ...p(x2, lh, 0)]}
          stroke={CLR.steel} strokeWidth={TUBE_W * 0.85} lineCap="round"
        />,
      );
    }
  }

  // ==========================================
  // DIAGONALES AVANT
  // ==========================================
  if (diagonals) {
    for (let bay = 0; bay < bayCount; bay++) {
      const x1 = bay * ledgerLen;
      const x2 = (bay + 1) * ledgerLen;
      const diagTop = sortedLevels[0] || 2;
      elements.push(
        <Line key={`diag-front-${bay}`}
          points={[...p(x1, 0, 0), ...p(x2, diagTop, 0)]}
          stroke={CLR.diagonal} strokeWidth={DIAG_W} lineCap="round"
        />,
      );
    }
  }

  // ==========================================
  // GARDE-CORPS AVANT
  // ==========================================
  if (guardrails) {
    for (const levelH of sortedLevels) {
      for (let bay = 0; bay < bayCount; bay++) {
        if (emptyBays.includes(bay)) continue;
        const x1 = bay * ledgerLen;
        const x2 = (bay + 1) * ledgerLen;
        for (const gcH of [0.5, 1.0]) {
          elements.push(
            <Line key={`gc-front-${levelH}-${bay}-${gcH}`}
              points={[...p(x1, levelH + gcH, 0), ...p(x2, levelH + gcH, 0)]}
              stroke={CLR.gold} strokeWidth={GC_W} lineCap="round"
            />,
          );
        }
      }
    }
  }

  // ==========================================
  // CONSOLES
  // ==========================================
  if (consoleOffset > 0) {
    const cy = topLevel;
    // Console gauche
    elements.push(
      <Line key="console-l" points={[...p(0, cy, 0), ...p(-consoleOffset, cy, 0)]}
        stroke={CLR.steel} strokeWidth={TUBE_W * 0.8} lineCap="round" />,
      <Line key="console-l-diag" points={[...p(0, cy - 0.5, 0), ...p(-consoleOffset, cy, 0)]}
        stroke={CLR.diagonal} strokeWidth={DIAG_W * 0.8} lineCap="round" />,
    );
    // Console droite
    elements.push(
      <Line key="console-r" points={[...p(totalW, cy, 0), ...p(totalW + consoleOffset, cy, 0)]}
        stroke={CLR.steel} strokeWidth={TUBE_W * 0.8} lineCap="round" />,
      <Line key="console-r-diag" points={[...p(totalW, cy - 0.5, 0), ...p(totalW + consoleOffset, cy, 0)]}
        stroke={CLR.diagonal} strokeWidth={DIAG_W * 0.8} lineCap="round" />,
    );
  }

  // ==========================================
  // COTES (dimensions)
  // ==========================================
  // Hauteur (a droite)
  const dimOffset = 35;
  const [dhBotX, dhBotY] = p(totalW, 0, 0);
  const [dhTopX, dhTopY] = p(totalW, topLevel, 0);
  elements.push(
    <Line key="dim-h" points={[dhBotX + dimOffset, dhBotY, dhTopX + dimOffset, dhTopY]}
      stroke={CLR.dimText} strokeWidth={0.8} />,
    <Line key="dim-h-bot" points={[dhBotX + dimOffset - 4, dhBotY, dhBotX + dimOffset + 4, dhBotY]}
      stroke={CLR.dimText} strokeWidth={0.8} />,
    <Line key="dim-h-top" points={[dhTopX + dimOffset - 4, dhTopY, dhTopX + dimOffset + 4, dhTopY]}
      stroke={CLR.dimText} strokeWidth={0.8} />,
    <Text key="dim-h-txt" x={dhBotX + dimOffset + 8} y={(dhBotY + dhTopY) / 2 - 5}
      text={`H ${topLevel}m`} fontSize={11} fill={CLR.dimText} />,
  );

  // Largeur (en bas face avant)
  const [dwLeftX, dwLeftY] = pGround(0, 0);
  const [dwRightX, dwRightY] = pGround(totalW, 0);
  const dimYoff = 25;
  elements.push(
    <Line key="dim-w" points={[dwLeftX, dwLeftY + dimYoff, dwRightX, dwRightY + dimYoff]}
      stroke={CLR.dimText} strokeWidth={0.8} />,
    <Line key="dim-w-l" points={[dwLeftX, dwLeftY + dimYoff - 4, dwLeftX, dwLeftY + dimYoff + 4]}
      stroke={CLR.dimText} strokeWidth={0.8} />,
    <Line key="dim-w-r" points={[dwRightX, dwRightY + dimYoff - 4, dwRightX, dwRightY + dimYoff + 4]}
      stroke={CLR.dimText} strokeWidth={0.8} />,
    <Text key="dim-w-txt" x={(dwLeftX + dwRightX) / 2 - 15} y={dwLeftY + dimYoff + 6}
      text={`L ${Math.round(totalW * 100) / 100}m`} fontSize={11} fill={CLR.dimText} />,
  );

  // Profondeur (en bas cote)
  const [ddFrontX, ddFrontY] = pGround(totalW, 0);
  const [ddBackX, ddBackY] = pGround(totalW, totalD);
  elements.push(
    <Line key="dim-d" points={[ddFrontX + 10, ddFrontY + 10, ddBackX + 10, ddBackY + 10]}
      stroke={CLR.dimText} strokeWidth={0.8} />,
    <Text key="dim-d-txt" x={(ddFrontX + ddBackX) / 2 + 14} y={(ddFrontY + ddBackY) / 2 + 10}
      text={`P ${depthLedger}m`} fontSize={11} fill={CLR.dimText} />,
  );

  return <Group>{elements}</Group>;
}
