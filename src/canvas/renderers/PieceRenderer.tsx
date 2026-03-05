import { Group, Rect, Line, Circle, Arc, Shape, Ellipse, Ring } from 'react-konva';
import type { PlacedPiece, PieceDefinition } from '../../catalog/types';
import { ALL_PIECES } from '../../catalog/definitions';
import { THEME } from '../../theme/colors';

// ==========================================
// Couleurs réalistes acier galvanisé Layher
// ==========================================
const STEEL = {
  base: '#9eaab8',
  light: '#bcc8d4',
  highlight: '#d6dfe8',
  dark: '#6b7a8a',
  shadow: '#4a5968',
  outline: '#5a6a7a',
};
const ROSETTE_GOLD = {
  base: '#d4a830',
  light: '#ecc850',
  rim: '#b08820',
  center: '#a07818',
  hole: '#3a3520',
};
const WEDGE = {
  base: '#8090a0',
  light: '#a0b0c0',
  dark: '#607080',
  bolt: '#505a64',
};
const PLATFORM_CLR = {
  surface: '#a08050',
  surfaceLight: '#c0a070',
  edge: '#806030',
  grip: '#907040',
  hook: '#7a8a9a',
  shadow: 'rgba(0,0,0,0.25)',
};
const GUARDRAIL_CLR = {
  base: '#e0b820',
  light: '#f0d040',
  dark: '#b89810',
  outline: '#a08008',
};
const JACK_CLR = {
  plate: '#7a8a9a',
  plateDark: '#5a6a7a',
  thread: '#8a9aaa',
  threadDark: '#6a7a8a',
  nut: '#607080',
  nutLight: '#8090a0',
};

// ==========================================
// PROPS
// ==========================================
interface PieceRendererProps {
  piece: PlacedPiece;
  ppm: number;
  isSelected: boolean;
  isDragging?: boolean;
  readOnly?: boolean;
  onSelect: (id: string, e: { evt: { shiftKey: boolean } }) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string) => void;
  onContextMenu?: (id: string, e: { evt: MouseEvent }) => void;
}

export function PieceRenderer({
  piece, ppm, isSelected, isDragging, readOnly, onSelect, onDragStart, onDragMove, onDragEnd, onContextMenu,
}: PieceRendererProps) {
  const def = ALL_PIECES[piece.definitionId];
  if (!def) return null;

  const w = def.widthM * ppm;
  const h = def.heightM * ppm;
  const x = piece.x * ppm;
  const y = piece.y * ppm;

  const isTrapdoor = piece.definitionId.startsWith('trapdoor');

  const renderBody = () => {
    switch (def.category) {
      case 'standard':
        return <StandardRenderer w={w} h={h} ppm={ppm} def={def} />;
      case 'ledger':
        return <LedgerRenderer w={w} h={h} ppm={ppm} def={def} isGuardrail={false} />;
      case 'guardrail':
        return <LedgerRenderer w={w} h={h} ppm={ppm} def={def} isGuardrail={true} />;
      case 'diagonal':
        return <DiagonalRenderer w={w} h={h} ppm={ppm} def={def} />;
      case 'platform':
        return isTrapdoor
          ? <TrapdoorRenderer w={w} h={h} ppm={ppm} />
          : <PlatformRenderer w={w} h={h} ppm={ppm} def={def} />;
      case 'baseJack':
        return <BaseJackRenderer w={w} h={h} ppm={ppm} def={def} />;
      case 'console':
        return <ConsoleRenderer w={w} h={h} ppm={ppm} def={def} />;
      case 'castor':
        return <CastorRenderer w={w} h={h} ppm={ppm} />;
      case 'ladder':
        return <LadderRenderer w={w} h={h} ppm={ppm} />;
      case 'toeboard':
        return <ToeboardRenderer w={w} h={h} ppm={ppm} />;
      case 'tube':
        return <TubeRenderer w={w} h={h} ppm={ppm} />;
      case 'clamp':
        return <ClampRenderer w={w} h={h} ppm={ppm} def={def} />;
      case 'accessory':
        return <AccessoryRenderer w={w} h={h} ppm={ppm} def={def} defId={piece.definitionId} />;
      default:
        return <Rect width={Math.max(w, 8)} height={Math.max(h, 8)} fill={def.color} opacity={0.8} />;
    }
  };

  // Compute bounding box for selection
  const bbox = getBBox(def, w, h, ppm);

  return (
    <Group
      x={x}
      y={y}
      rotation={piece.rotation}
      draggable={!readOnly}
      listening={!readOnly}
      opacity={isDragging ? 0.7 : 1}
      onClick={(e) => onSelect(piece.id, { evt: { shiftKey: e.evt.shiftKey } })}
      onTap={() => onSelect(piece.id, { evt: { shiftKey: false } })}
      onDragStart={() => onDragStart(piece.id)}
      onDragMove={(e) => {
        const node = e.target;
        onDragMove(piece.id, node.x() / ppm, node.y() / ppm);
      }}
      onDragEnd={() => onDragEnd(piece.id)}
      onContextMenu={(e) => onContextMenu?.(piece.id, { evt: e.evt as MouseEvent })}
      onMouseEnter={(e) => {
        if (readOnly) return;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        if (readOnly) return;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
    >
      {renderBody()}
      {isSelected && (
        <Rect
          x={bbox.x - 4}
          y={bbox.y - 4}
          width={bbox.w + 8}
          height={bbox.h + 8}
          stroke={THEME.selection}
          strokeWidth={2}
          dash={[8, 4]}
          fill="rgba(96, 165, 250, 0.06)"
          cornerRadius={3}
          listening={false}
        />
      )}
    </Group>
  );
}

function getBBox(def: PieceDefinition, w: number, h: number, ppm: number) {
  const tubeW = Math.max(ppm * 0.05, 8);
  switch (def.category) {
    case 'standard':
      return { x: -tubeW / 2 - 2, y: -h - 2, w: tubeW + 4, h: h + 4 };
    case 'ledger':
    case 'guardrail':
      return { x: -6, y: -tubeW / 2 - 6, w: w + 12, h: tubeW + 12 };
    case 'diagonal':
      return { x: -6, y: -h - 6, w: w + 12, h: h + 12 };
    case 'platform': {
      const pH = Math.max(h, ppm * 0.06);
      return { x: -4, y: -pH - 4, w: w + 8, h: pH + 8 };
    }
    case 'baseJack': {
      const plateW = Math.max(ppm * 0.14, 18);
      return { x: -plateW / 2 - 2, y: -h - 4, w: plateW + 4, h: h + 8 };
    }
    case 'castor':
      return { x: -ppm * 0.08 - 4, y: -h - 4, w: ppm * 0.16 + 8, h: h + 8 };
    case 'ladder':
      return { x: -4, y: -h - 4, w: w + 8, h: h + 8 };
    case 'toeboard':
      return { x: -4, y: -Math.max(h, ppm * 0.12) - 4, w: w + 8, h: Math.max(h, ppm * 0.12) + 8 };
    case 'tube':
      return { x: -4, y: -Math.max(ppm * 0.04, 5) - 4, w: w + 8, h: Math.max(ppm * 0.04, 5) * 2 + 8 };
    case 'clamp':
      return { x: -4, y: -Math.max(h, ppm * 0.08) / 2 - 4, w: Math.max(w, ppm * 0.1) + 8, h: Math.max(h, ppm * 0.08) + 8 };
    case 'accessory': {
      const aw = Math.max(w, ppm * 0.1);
      return { x: -aw / 2 - 4, y: -h - 4, w: aw + 8, h: h + 8 };
    }
    default:
      return { x: -4, y: -h - 4, w: Math.max(w, 8) + 8, h: Math.max(h, 8) + 8 };
  }
}

// ==========================================
// MONTANT (Standard) — tube acier galvanisé + rosettes
// ==========================================
function StandardRenderer({ w, h, ppm, def }: { w: number; h: number; ppm: number; def: PieceDefinition }) {
  const tubeW = Math.max(ppm * 0.05, 8);
  const rosettes = def.connectionPoints.filter((cp) => cp.type === 'rosette');
  const rosetteR = Math.max(ppm * 0.04, 5);

  return (
    <>
      {/* Shadow */}
      <Rect
        x={-tubeW / 2 + 2}
        y={-h + 2}
        width={tubeW}
        height={h}
        fill="rgba(0,0,0,0.2)"
        cornerRadius={tubeW / 4}
        listening={false}
      />
      {/* Main tube — gradient métallique via shapes superposées */}
      <Rect
        x={-tubeW / 2}
        y={-h}
        width={tubeW}
        height={h}
        fill={STEEL.base}
        cornerRadius={tubeW / 4}
      />
      {/* Highlight gauche (reflet métallique) */}
      <Rect
        x={-tubeW / 2}
        y={-h}
        width={tubeW * 0.35}
        height={h}
        fill={STEEL.highlight}
        opacity={0.5}
        cornerRadius={[tubeW / 4, 0, 0, tubeW / 4]}
        listening={false}
      />
      {/* Ombre droite */}
      <Rect
        x={tubeW * 0.15}
        y={-h}
        width={tubeW * 0.35}
        height={h}
        fill={STEEL.dark}
        opacity={0.4}
        cornerRadius={[0, tubeW / 4, tubeW / 4, 0]}
        listening={false}
      />
      {/* Spigot en haut (emboîtement mâle) — bague plus étroite */}
      <Rect
        x={-tubeW * 0.35}
        y={-h - tubeW * 0.3}
        width={tubeW * 0.7}
        height={tubeW * 0.5}
        fill={STEEL.light}
        cornerRadius={tubeW / 6}
        listening={false}
      />
      {/* Socket en bas (emboîtement femelle) — bague plus large */}
      <Rect
        x={-tubeW * 0.6}
        y={-tubeW * 0.15}
        width={tubeW * 1.2}
        height={tubeW * 0.3}
        fill={STEEL.dark}
        cornerRadius={tubeW / 8}
        listening={false}
      />
      {/* Rosettes */}
      {rosettes.map((r, i) => (
        <RosetteShape
          key={i}
          cx={0}
          cy={-r.relativeY * ppm}
          radius={rosetteR}
        />
      ))}
      {/* Outline subtil */}
      <Rect
        x={-tubeW / 2}
        y={-h}
        width={tubeW}
        height={h}
        stroke={STEEL.outline}
        strokeWidth={0.8}
        fill="transparent"
        cornerRadius={tubeW / 4}
        listening={false}
      />
    </>
  );
}

// Rosette Layher — fleur 8 trous avec anneau central
function RosetteShape({ cx, cy, radius }: { cx: number; cy: number; radius: number }) {
  return (
    <>
      {/* Disque de fond */}
      <Circle
        x={cx}
        y={cy}
        radius={radius}
        fill={ROSETTE_GOLD.base}
        stroke={ROSETTE_GOLD.rim}
        strokeWidth={Math.max(1, radius * 0.15)}
        listening={false}
      />
      {/* Centre surélevé */}
      <Circle
        x={cx}
        y={cy}
        radius={radius * 0.3}
        fill={ROSETTE_GOLD.light}
        stroke={ROSETTE_GOLD.center}
        strokeWidth={Math.max(0.5, radius * 0.08)}
        listening={false}
      />
      {/* 8 trous (simplifiés en petits cercles foncés) */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i * Math.PI) / 4;
        const dist = radius * 0.62;
        const holeR = radius * 0.14;
        return (
          <Circle
            key={i}
            x={cx + Math.cos(angle) * dist}
            y={cy + Math.sin(angle) * dist}
            radius={holeR}
            fill={ROSETTE_GOLD.hole}
            listening={false}
          />
        );
      })}
      {/* Reflet subtil */}
      <Arc
        x={cx}
        y={cy}
        innerRadius={radius * 0.35}
        outerRadius={radius * 0.85}
        angle={90}
        rotation={-135}
        fill="rgba(255,255,255,0.15)"
        listening={false}
      />
    </>
  );
}

// ==========================================
// LONGERON / GARDE-CORPS — tube horizontal avec têtes à clavette
// ==========================================
function LedgerRenderer({ w, h, ppm, def, isGuardrail }: { w: number; h: number; ppm: number; def: PieceDefinition; isGuardrail: boolean }) {
  const tubeH = Math.max(ppm * 0.045, 6);
  const headW = Math.max(ppm * 0.06, 8);
  const headH = tubeH * 2.2;

  const clr = isGuardrail ? GUARDRAIL_CLR : { base: STEEL.base, light: STEEL.light, dark: STEEL.dark, outline: STEEL.outline };

  return (
    <>
      {/* Shadow */}
      <Rect
        x={2}
        y={-tubeH / 2 + 2}
        width={w}
        height={tubeH}
        fill="rgba(0,0,0,0.15)"
        cornerRadius={tubeH / 3}
        listening={false}
      />
      {/* Main tube */}
      <Rect
        x={0}
        y={-tubeH / 2}
        width={w}
        height={tubeH}
        fill={clr.base}
        cornerRadius={tubeH / 3}
      />
      {/* Highlight haut */}
      <Rect
        x={headW}
        y={-tubeH / 2}
        width={w - headW * 2}
        height={tubeH * 0.3}
        fill={clr.light}
        opacity={0.5}
        cornerRadius={[tubeH / 3, tubeH / 3, 0, 0]}
        listening={false}
      />
      {/* Ombre bas */}
      <Rect
        x={headW}
        y={tubeH * 0.1}
        width={w - headW * 2}
        height={tubeH * 0.4}
        fill={clr.dark}
        opacity={0.3}
        cornerRadius={[0, 0, tubeH / 3, tubeH / 3]}
        listening={false}
      />

      {/* Wedge head LEFT */}
      <WedgeHead x={0} y={0} width={headW} height={headH} flip={false} />
      {/* Wedge head RIGHT */}
      <WedgeHead x={w} y={0} width={headW} height={headH} flip={true} />

      {/* Outline */}
      <Rect
        x={0}
        y={-tubeH / 2}
        width={w}
        height={tubeH}
        stroke={isGuardrail ? GUARDRAIL_CLR.outline : STEEL.outline}
        strokeWidth={0.6}
        fill="transparent"
        cornerRadius={tubeH / 3}
        listening={false}
      />
    </>
  );
}

// Tête à clavette Layher (wedge coupler)
function WedgeHead({ x, y, width, height, flip }: { x: number; y: number; width: number; height: number; flip: boolean }) {
  const dir = flip ? -1 : 1;
  return (
    <>
      {/* Corps de la tête */}
      <Shape
        sceneFunc={(ctx, shape) => {
          const hw = width;
          const hh = height / 2;
          ctx.beginPath();
          if (!flip) {
            ctx.moveTo(x, y - hh);
            ctx.lineTo(x - hw * 0.3, y - hh * 0.6);
            ctx.lineTo(x - hw * 0.3, y + hh * 0.6);
            ctx.lineTo(x, y + hh);
            ctx.lineTo(x + hw * 0.2, y + hh * 0.8);
            ctx.lineTo(x + hw * 0.2, y - hh * 0.8);
          } else {
            ctx.moveTo(x, y - hh);
            ctx.lineTo(x + hw * 0.3, y - hh * 0.6);
            ctx.lineTo(x + hw * 0.3, y + hh * 0.6);
            ctx.lineTo(x, y + hh);
            ctx.lineTo(x - hw * 0.2, y + hh * 0.8);
            ctx.lineTo(x - hw * 0.2, y - hh * 0.8);
          }
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
        fill={WEDGE.base}
        stroke={WEDGE.dark}
        strokeWidth={0.8}
        listening={false}
      />
      {/* Clavette (bolt) — petit rectangle */}
      <Rect
        x={x - 1.5 + dir * width * 0.05}
        y={y + height * 0.15}
        width={3}
        height={height * 0.35}
        fill={WEDGE.bolt}
        cornerRadius={1}
        listening={false}
      />
      {/* Highlight */}
      <Rect
        x={flip ? x - width * 0.05 : x - width * 0.25}
        y={y - height * 0.3}
        width={width * 0.15}
        height={height * 0.3}
        fill="rgba(255,255,255,0.15)"
        cornerRadius={1}
        listening={false}
      />
    </>
  );
}

// ==========================================
// DIAGONALE — tube oblique avec embouts
// ==========================================
function DiagonalRenderer({ w, h, ppm, def }: { w: number; h: number; ppm: number; def: PieceDefinition }) {
  const tubeW = Math.max(ppm * 0.04, 5);
  const endR = Math.max(ppm * 0.03, 4);

  return (
    <>
      {/* Shadow */}
      <Line
        points={[2, 2, w + 2, -h + 2]}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={tubeW + 2}
        lineCap="round"
        listening={false}
      />
      {/* Main tube */}
      <Line
        points={[0, 0, w, -h]}
        stroke={STEEL.base}
        strokeWidth={tubeW}
        lineCap="round"
      />
      {/* Highlight line (reflet métallique sur le tube) */}
      <Line
        points={[0, 0, w, -h]}
        stroke={STEEL.highlight}
        strokeWidth={tubeW * 0.3}
        lineCap="round"
        opacity={0.4}
        listening={false}
      />
      {/* Embout bas — wedge coupler simplifié */}
      <Circle x={0} y={0} radius={endR} fill={WEDGE.base} stroke={WEDGE.dark} strokeWidth={1} listening={false} />
      <Circle x={0} y={0} radius={endR * 0.4} fill={WEDGE.bolt} listening={false} />
      {/* Embout haut */}
      <Circle x={w} y={-h} radius={endR} fill={WEDGE.base} stroke={WEDGE.dark} strokeWidth={1} listening={false} />
      <Circle x={w} y={-h} radius={endR * 0.4} fill={WEDGE.bolt} listening={false} />
    </>
  );
}

// ==========================================
// PLATEFORME — plancher métallique anti-dérapant
// ==========================================
function PlatformRenderer({ w, h, ppm, def }: { w: number; h: number; ppm: number; def: PieceDefinition }) {
  const pH = Math.max(h, ppm * 0.06);
  const hookW = Math.max(ppm * 0.03, 4);
  const ribCount = Math.max(2, Math.floor(w / (ppm * 0.15)));
  const gripSpacing = Math.max(ppm * 0.04, 5);

  return (
    <>
      {/* Shadow */}
      <Rect
        x={3}
        y={-pH + 3}
        width={w}
        height={pH}
        fill="rgba(0,0,0,0.2)"
        cornerRadius={1}
        listening={false}
      />
      {/* Main deck body */}
      <Rect
        x={0}
        y={-pH}
        width={w}
        height={pH}
        fill={PLATFORM_CLR.surface}
        stroke={PLATFORM_CLR.edge}
        strokeWidth={1}
        cornerRadius={1}
      />
      {/* Surface highlight band */}
      <Rect
        x={hookW}
        y={-pH}
        width={w - hookW * 2}
        height={pH * 0.25}
        fill={PLATFORM_CLR.surfaceLight}
        opacity={0.5}
        cornerRadius={[1, 1, 0, 0]}
        listening={false}
      />
      {/* Raidisseurs transversaux (ribs) */}
      {Array.from({ length: ribCount }, (_, i) => {
        const rx = ((i + 1) / (ribCount + 1)) * w;
        return (
          <Line
            key={`rib-${i}`}
            points={[rx, -pH + 1, rx, -1]}
            stroke={PLATFORM_CLR.edge}
            strokeWidth={1.2}
            opacity={0.5}
            listening={false}
          />
        );
      })}
      {/* Texture anti-dérapante (grip pattern) — petits losanges */}
      {ppm >= 60 && (
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            const rows = Math.floor(pH / gripSpacing);
            const cols = Math.floor((w - hookW * 2) / gripSpacing);
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                const gx = hookW + c * gripSpacing + gripSpacing / 2 + ((r % 2) * gripSpacing * 0.5);
                const gy = -pH + r * gripSpacing + gripSpacing / 2;
                if (gx > w - hookW) continue;
                const s = gripSpacing * 0.15;
                ctx.moveTo(gx, gy - s);
                ctx.lineTo(gx + s, gy);
                ctx.lineTo(gx, gy + s);
                ctx.lineTo(gx - s, gy);
                ctx.closePath();
              }
            }
            ctx.fillStrokeShape(shape);
          }}
          fill={PLATFORM_CLR.grip}
          opacity={0.3}
          listening={false}
        />
      )}
      {/* Crochets d'accroche aux extrémités */}
      <Shape
        sceneFunc={(ctx, shape) => {
          // Left hook
          ctx.beginPath();
          ctx.moveTo(0, -pH);
          ctx.lineTo(-hookW, -pH + hookW * 0.5);
          ctx.lineTo(-hookW, -hookW * 0.3);
          ctx.lineTo(0, 0);
          ctx.closePath();
          // Right hook
          ctx.moveTo(w, -pH);
          ctx.lineTo(w + hookW, -pH + hookW * 0.5);
          ctx.lineTo(w + hookW, -hookW * 0.3);
          ctx.lineTo(w, 0);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
        fill={PLATFORM_CLR.hook}
        stroke={STEEL.outline}
        strokeWidth={0.6}
        listening={false}
      />
      {/* Edge banding — bord replié visible */}
      <Line
        points={[0, 0, w, 0]}
        stroke={PLATFORM_CLR.edge}
        strokeWidth={1.5}
        listening={false}
      />
      <Line
        points={[0, -pH, w, -pH]}
        stroke={PLATFORM_CLR.surfaceLight}
        strokeWidth={0.8}
        opacity={0.5}
        listening={false}
      />
    </>
  );
}

// ==========================================
// VÉRIN DE PIED (Base Jack) — filetage + écrou + platine
// ==========================================
function BaseJackRenderer({ w, h, ppm, def }: { w: number; h: number; ppm: number; def: PieceDefinition }) {
  const plateW = Math.max(ppm * 0.14, 18);
  const plateH = Math.max(ppm * 0.02, 3);
  const rodW = Math.max(ppm * 0.025, 4);
  const nutH = Math.max(ppm * 0.03, 4);
  const nutW = rodW * 2.5;
  const topCapR = Math.max(ppm * 0.03, 4);
  const threadSpacing = Math.max(ppm * 0.02, 3);

  return (
    <>
      {/* Shadow */}
      <Rect
        x={-plateW / 2 + 2}
        y={-plateH + 2}
        width={plateW}
        height={plateH}
        fill="rgba(0,0,0,0.2)"
        cornerRadius={1}
        listening={false}
      />
      {/* Platine de base (base plate) */}
      <Rect
        x={-plateW / 2}
        y={-plateH}
        width={plateW}
        height={plateH}
        fill={JACK_CLR.plate}
        stroke={JACK_CLR.plateDark}
        strokeWidth={1}
        cornerRadius={1}
      />
      {/* Highlight sur platine */}
      <Rect
        x={-plateW / 2}
        y={-plateH}
        width={plateW}
        height={plateH * 0.4}
        fill={STEEL.highlight}
        opacity={0.3}
        cornerRadius={[1, 1, 0, 0]}
        listening={false}
      />
      {/* Trous de la platine (4 coins) */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => (
        <Circle
          key={i}
          x={dx * plateW * 0.35}
          y={-plateH / 2}
          radius={Math.max(plateW * 0.06, 1.5)}
          fill={JACK_CLR.plateDark}
          listening={false}
        />
      ))}
      {/* Tige filetée (threaded rod) */}
      <Rect
        x={-rodW / 2}
        y={-h + topCapR}
        width={rodW}
        height={h - plateH - topCapR}
        fill={JACK_CLR.thread}
      />
      {/* Filetage visible (thread lines) */}
      {Array.from({ length: Math.floor((h - plateH - topCapR) / threadSpacing) }, (_, i) => (
        <Line
          key={i}
          points={[-rodW / 2, -plateH - i * threadSpacing - threadSpacing, rodW / 2, -plateH - i * threadSpacing - threadSpacing + 1]}
          stroke={JACK_CLR.threadDark}
          strokeWidth={0.6}
          opacity={0.6}
          listening={false}
        />
      ))}
      {/* Highlight sur tige */}
      <Rect
        x={-rodW / 2}
        y={-h + topCapR}
        width={rodW * 0.35}
        height={h - plateH - topCapR}
        fill={STEEL.highlight}
        opacity={0.3}
        listening={false}
      />
      {/* Écrou de réglage (nut) */}
      <Shape
        sceneFunc={(ctx, shape) => {
          const ny = -plateH - nutH * 2;
          const nw2 = nutW / 2;
          const nh2 = nutH / 2;
          // Hexagonal nut
          ctx.beginPath();
          ctx.moveTo(-nw2, ny - nh2 * 0.5);
          ctx.lineTo(-nw2 * 0.6, ny - nh2);
          ctx.lineTo(nw2 * 0.6, ny - nh2);
          ctx.lineTo(nw2, ny - nh2 * 0.5);
          ctx.lineTo(nw2, ny + nh2 * 0.5);
          ctx.lineTo(nw2 * 0.6, ny + nh2);
          ctx.lineTo(-nw2 * 0.6, ny + nh2);
          ctx.lineTo(-nw2, ny + nh2 * 0.5);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
        fill={JACK_CLR.nut}
        stroke={JACK_CLR.plateDark}
        strokeWidth={0.8}
        listening={false}
      />
      {/* Nut highlight */}
      <Rect
        x={-nutW * 0.2}
        y={-plateH - nutH * 2.5}
        width={nutW * 0.15}
        height={nutH * 0.8}
        fill={JACK_CLR.nutLight}
        opacity={0.4}
        cornerRadius={0.5}
        listening={false}
      />
      {/* Top tube cap (receives the standard) */}
      <Circle
        x={0}
        y={-h}
        radius={topCapR}
        fill={STEEL.base}
        stroke={STEEL.outline}
        strokeWidth={1}
        listening={false}
      />
      <Circle
        x={0}
        y={-h}
        radius={topCapR * 0.5}
        fill={STEEL.dark}
        listening={false}
      />
    </>
  );
}

// ==========================================
// CONSOLE (bracket) — bras horizontal + jambe de force diagonale
// ==========================================
function ConsoleRenderer({ w, h, ppm, def }: { w: number; h: number; ppm: number; def: PieceDefinition }) {
  const tubeH = Math.max(ppm * 0.04, 5);
  const braceLen = Math.sqrt(w * w + (w * 1.5) * (w * 1.5));

  return (
    <>
      {/* Shadow */}
      <Rect
        x={2}
        y={-tubeH / 2 + 2}
        width={w}
        height={tubeH}
        fill="rgba(0,0,0,0.15)"
        cornerRadius={tubeH / 3}
        listening={false}
      />
      {/* Main horizontal arm */}
      <Rect
        x={0}
        y={-tubeH / 2}
        width={w}
        height={tubeH}
        fill={STEEL.base}
        cornerRadius={tubeH / 3}
      />
      {/* Arm highlight */}
      <Rect
        x={4}
        y={-tubeH / 2}
        width={w - 8}
        height={tubeH * 0.3}
        fill={STEEL.highlight}
        opacity={0.4}
        cornerRadius={[tubeH / 3, tubeH / 3, 0, 0]}
        listening={false}
      />
      {/* Diagonal brace (jambe de force) */}
      <Line
        points={[w * 0.15, tubeH / 2, w * 0.85, -w * 0.8]}
        stroke={STEEL.base}
        strokeWidth={Math.max(tubeH * 0.6, 3)}
        lineCap="round"
        listening={false}
      />
      <Line
        points={[w * 0.15, tubeH / 2, w * 0.85, -w * 0.8]}
        stroke={STEEL.highlight}
        strokeWidth={Math.max(tubeH * 0.15, 1)}
        lineCap="round"
        opacity={0.3}
        listening={false}
      />
      {/* Wedge attachment at left end */}
      <WedgeHead x={0} y={0} width={Math.max(ppm * 0.05, 6)} height={tubeH * 2} flip={false} />
      {/* End cap */}
      <Circle
        x={w}
        y={0}
        radius={tubeH * 0.6}
        fill={STEEL.dark}
        stroke={STEEL.outline}
        strokeWidth={0.6}
        listening={false}
      />
      {/* Outline */}
      <Rect
        x={0}
        y={-tubeH / 2}
        width={w}
        height={tubeH}
        stroke={STEEL.outline}
        strokeWidth={0.6}
        fill="transparent"
        cornerRadius={tubeH / 3}
        listening={false}
      />
    </>
  );
}

// ==========================================
// ROUE (Castor) — roue + fourche + frein + tige
// ==========================================
function CastorRenderer({ w, h, ppm }: { w: number; h: number; ppm: number }) {
  const wheelR = Math.max(ppm * 0.06, 8);
  const wheelW = Math.max(ppm * 0.03, 4);
  const forkW = Math.max(ppm * 0.015, 2.5);
  const stemR = Math.max(ppm * 0.025, 3.5);
  const brakeW = Math.max(ppm * 0.04, 5);

  return (
    <>
      {/* Shadow under wheel */}
      <Ellipse
        x={0}
        y={1}
        radiusX={wheelR * 1.1}
        radiusY={wheelR * 0.2}
        fill="rgba(0,0,0,0.3)"
        listening={false}
      />
      {/* Wheel tire */}
      <Circle
        x={0}
        y={-wheelR}
        radius={wheelR}
        fill="#3a4450"
        stroke="#2a3440"
        strokeWidth={Math.max(wheelR * 0.15, 2)}
        listening={false}
      />
      {/* Wheel hub */}
      <Circle
        x={0}
        y={-wheelR}
        radius={wheelR * 0.45}
        fill={STEEL.base}
        stroke={STEEL.dark}
        strokeWidth={1}
        listening={false}
      />
      {/* Hub detail — cross spokes */}
      <Line points={[-wheelR * 0.35, -wheelR, wheelR * 0.35, -wheelR]} stroke={STEEL.dark} strokeWidth={1} listening={false} />
      <Line points={[0, -wheelR - wheelR * 0.35, 0, -wheelR + wheelR * 0.35]} stroke={STEEL.dark} strokeWidth={1} listening={false} />
      {/* Axle */}
      <Circle x={0} y={-wheelR} radius={wheelR * 0.12} fill={STEEL.shadow} listening={false} />
      {/* Fork — two prongs */}
      <Rect x={-wheelR * 0.55 - forkW / 2} y={-wheelR * 2} width={forkW} height={wheelR * 1.3} fill={STEEL.base} cornerRadius={forkW / 3} listening={false} />
      <Rect x={wheelR * 0.55 - forkW / 2} y={-wheelR * 2} width={forkW} height={wheelR * 1.3} fill={STEEL.base} cornerRadius={forkW / 3} listening={false} />
      {/* Fork crown (top plate connecting prongs) */}
      <Rect
        x={-wheelR * 0.6}
        y={-wheelR * 2 - forkW}
        width={wheelR * 1.2}
        height={forkW * 1.5}
        fill={STEEL.base}
        stroke={STEEL.outline}
        strokeWidth={0.6}
        cornerRadius={forkW / 2}
        listening={false}
      />
      {/* Swivel stem */}
      <Rect
        x={-forkW * 0.8}
        y={-h}
        width={forkW * 1.6}
        height={h - wheelR * 2 - forkW}
        fill={STEEL.dark}
        cornerRadius={forkW / 2}
        listening={false}
      />
      {/* Top spigot cap */}
      <Circle
        x={0}
        y={-h}
        radius={stemR}
        fill={STEEL.base}
        stroke={STEEL.outline}
        strokeWidth={1}
        listening={false}
      />
      <Circle x={0} y={-h} radius={stemR * 0.4} fill={STEEL.dark} listening={false} />
      {/* Brake lever */}
      <Rect
        x={wheelR * 0.5}
        y={-wheelR * 1.6}
        width={brakeW}
        height={forkW * 1.2}
        fill="#cc3030"
        stroke="#992020"
        strokeWidth={0.5}
        cornerRadius={1}
        listening={false}
      />
      {/* Fork highlights */}
      <Rect
        x={-wheelR * 0.55 - forkW / 2}
        y={-wheelR * 2}
        width={forkW * 0.3}
        height={wheelR * 1.3}
        fill={STEEL.highlight}
        opacity={0.3}
        cornerRadius={forkW / 3}
        listening={false}
      />
    </>
  );
}

// ==========================================
// TRAPPE — plateforme avec ouverture battante
// ==========================================
function TrapdoorRenderer({ w, h, ppm }: { w: number; h: number; ppm: number }) {
  const pH = Math.max(h, ppm * 0.06);
  const hookW = Math.max(ppm * 0.03, 4);
  const holeW = w * 0.35;
  const holeH = pH * 0.7;
  const holeX = w * 0.55;

  return (
    <>
      <Rect x={3} y={-pH + 3} width={w} height={pH} fill="rgba(0,0,0,0.2)" cornerRadius={1} listening={false} />
      <Rect x={0} y={-pH} width={w} height={pH} fill="#b09050" stroke="#806030" strokeWidth={1} cornerRadius={1} />
      <Rect x={hookW} y={-pH} width={w - hookW * 2} height={pH * 0.25} fill="#c0a070" opacity={0.5} cornerRadius={[1, 1, 0, 0]} listening={false} />
      {/* Ouverture trappe — rectangle découpé avec charnière */}
      <Rect x={holeX} y={-pH + (pH - holeH) / 2} width={holeW} height={holeH} fill="#1a1510" stroke="#604020" strokeWidth={1} cornerRadius={1} listening={false} />
      {/* Charnière */}
      <Rect x={holeX + holeW - 2} y={-pH + (pH - holeH) / 2 + holeH * 0.15} width={3} height={holeH * 0.2} fill={STEEL.base} cornerRadius={1} listening={false} />
      <Rect x={holeX + holeW - 2} y={-pH + (pH - holeH) / 2 + holeH * 0.65} width={3} height={holeH * 0.2} fill={STEEL.base} cornerRadius={1} listening={false} />
      {/* Poignée */}
      <Circle x={holeX + holeW * 0.3} y={-pH / 2} radius={Math.max(2, pH * 0.12)} fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.5} listening={false} />
      {/* Crochets */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(0, -pH); ctx.lineTo(-hookW, -pH + hookW * 0.5); ctx.lineTo(-hookW, -hookW * 0.3); ctx.lineTo(0, 0); ctx.closePath();
          ctx.moveTo(w, -pH); ctx.lineTo(w + hookW, -pH + hookW * 0.5); ctx.lineTo(w + hookW, -hookW * 0.3); ctx.lineTo(w, 0); ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
        fill={PLATFORM_CLR.hook} stroke={STEEL.outline} strokeWidth={0.6} listening={false}
      />
      <Line points={[0, 0, w, 0]} stroke="#806030" strokeWidth={1.5} listening={false} />
    </>
  );
}

// ==========================================
// ÉCHELLE — 2 montants + barreaux
// ==========================================
function LadderRenderer({ w, h, ppm }: { w: number; h: number; ppm: number }) {
  const railW = Math.max(ppm * 0.025, 3);
  const rungSpacing = Math.max(ppm * 0.25, 15);
  const rungCount = Math.max(2, Math.floor(h / rungSpacing));
  const hookH = Math.max(ppm * 0.06, 8);

  return (
    <>
      {/* Shadow */}
      <Rect x={2} y={-h + 2} width={w} height={h} fill="rgba(0,0,0,0.12)" cornerRadius={1} listening={false} />
      {/* Left rail */}
      <Rect x={0} y={-h} width={railW} height={h} fill={STEEL.base} cornerRadius={railW / 3} />
      <Rect x={0} y={-h} width={railW * 0.35} height={h} fill={STEEL.highlight} opacity={0.4} cornerRadius={railW / 3} listening={false} />
      {/* Right rail */}
      <Rect x={w - railW} y={-h} width={railW} height={h} fill={STEEL.base} cornerRadius={railW / 3} />
      <Rect x={w - railW} y={-h} width={railW * 0.35} height={h} fill={STEEL.highlight} opacity={0.4} cornerRadius={railW / 3} listening={false} />
      {/* Barreaux (rungs) */}
      {Array.from({ length: rungCount }, (_, i) => {
        const ry = -((i + 1) / (rungCount + 1)) * h;
        const rungH = Math.max(railW * 0.8, 2.5);
        return (
          <Group key={i}>
            <Rect x={railW} y={ry - rungH / 2} width={w - railW * 2} height={rungH} fill={STEEL.base} cornerRadius={rungH / 3} listening={false} />
            <Rect x={railW} y={ry - rungH / 2} width={w - railW * 2} height={rungH * 0.3} fill={STEEL.highlight} opacity={0.3} cornerRadius={rungH / 3} listening={false} />
          </Group>
        );
      })}
      {/* Crochets d'accroche en haut */}
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(0, -h); ctx.lineTo(-railW, -h - hookH); ctx.lineTo(railW * 2, -h - hookH); ctx.lineTo(railW, -h); ctx.closePath();
          ctx.moveTo(w - railW, -h); ctx.lineTo(w - railW * 2, -h - hookH); ctx.lineTo(w + railW, -h - hookH); ctx.lineTo(w, -h); ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
        fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.8} listening={false}
      />
      {/* Outline */}
      <Rect x={0} y={-h} width={railW} height={h} stroke={STEEL.outline} strokeWidth={0.5} fill="transparent" cornerRadius={railW / 3} listening={false} />
      <Rect x={w - railW} y={-h} width={railW} height={h} stroke={STEEL.outline} strokeWidth={0.5} fill="transparent" cornerRadius={railW / 3} listening={false} />
    </>
  );
}

// ==========================================
// PLINTHE (Toeboard) — planche bois/alu 15cm
// ==========================================
function ToeboardRenderer({ w, h, ppm }: { w: number; h: number; ppm: number }) {
  const bH = Math.max(h, ppm * 0.12);
  const clipW = Math.max(ppm * 0.03, 4);

  return (
    <>
      <Rect x={2} y={-bH + 2} width={w} height={bH} fill="rgba(0,0,0,0.15)" cornerRadius={1} listening={false} />
      {/* Planche */}
      <Rect x={0} y={-bH} width={w} height={bH} fill="#b89858" stroke="#906828" strokeWidth={0.8} cornerRadius={1} />
      {/* Grain de bois */}
      {Array.from({ length: Math.max(1, Math.floor(bH / 4)) }, (_, i) => (
        <Line
          key={i}
          points={[2, -bH + (i + 1) * (bH / (Math.floor(bH / 4) + 1)), w - 2, -bH + (i + 1) * (bH / (Math.floor(bH / 4) + 1))]}
          stroke="#a08838"
          strokeWidth={0.5}
          opacity={0.4}
          listening={false}
        />
      ))}
      {/* Highlight haut */}
      <Rect x={clipW} y={-bH} width={w - clipW * 2} height={bH * 0.2} fill="#d0b070" opacity={0.4} cornerRadius={[1, 1, 0, 0]} listening={false} />
      {/* Clips d'attache aux extrémités */}
      <Rect x={-clipW * 0.5} y={-bH - clipW * 0.5} width={clipW} height={bH + clipW} fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.5} cornerRadius={1} listening={false} />
      <Rect x={w - clipW * 0.5} y={-bH - clipW * 0.5} width={clipW} height={bH + clipW} fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.5} cornerRadius={1} listening={false} />
    </>
  );
}

// ==========================================
// TUBE LIBRE — tube acier Ø48.3mm
// ==========================================
function TubeRenderer({ w, h, ppm }: { w: number; h: number; ppm: number }) {
  const tubeH = Math.max(ppm * 0.04, 5);

  return (
    <>
      <Rect x={2} y={-tubeH / 2 + 1.5} width={w} height={tubeH} fill="rgba(0,0,0,0.15)" cornerRadius={tubeH / 2} listening={false} />
      {/* Tube principal */}
      <Rect x={0} y={-tubeH / 2} width={w} height={tubeH} fill="#7a8a9a" cornerRadius={tubeH / 2} />
      {/* Reflet haut */}
      <Rect x={3} y={-tubeH / 2} width={w - 6} height={tubeH * 0.3} fill={STEEL.highlight} opacity={0.45} cornerRadius={[tubeH / 2, tubeH / 2, 0, 0]} listening={false} />
      {/* Ombre bas */}
      <Rect x={3} y={tubeH * 0.1} width={w - 6} height={tubeH * 0.35} fill={STEEL.shadow} opacity={0.25} cornerRadius={[0, 0, tubeH / 2, tubeH / 2]} listening={false} />
      {/* Extrémités — section ronde visible */}
      <Circle x={0} y={0} radius={tubeH / 2 + 0.5} fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.6} listening={false} />
      <Circle x={0} y={0} radius={tubeH / 2 - 1.5} fill="#0a0a0f" listening={false} />
      <Circle x={w} y={0} radius={tubeH / 2 + 0.5} fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.6} listening={false} />
      <Circle x={w} y={0} radius={tubeH / 2 - 1.5} fill="#0a0a0f" listening={false} />
      {/* Outline */}
      <Rect x={0} y={-tubeH / 2} width={w} height={tubeH} stroke={STEEL.outline} strokeWidth={0.5} fill="transparent" cornerRadius={tubeH / 2} listening={false} />
    </>
  );
}

// ==========================================
// COLLIERS — fixe, crapaud, plinthe, équerre
// ==========================================
function ClampRenderer({ w, h, ppm, def }: { w: number; h: number; ppm: number; def: PieceDefinition }) {
  const cw = Math.max(w, ppm * 0.1);
  const ch = Math.max(h, ppm * 0.07);
  const boltR = Math.max(ppm * 0.012, 2);
  const isCrapaud = def.name.includes('crapaud');
  const isEquerre = def.name.includes('querre');
  const isPlinthe = def.name.includes('plinthe');

  if (isEquerre) {
    const armL = cw;
    const armW = Math.max(ppm * 0.03, 4);
    return (
      <>
        {/* Branche horizontale */}
        <Rect x={0} y={-armW / 2} width={armL} height={armW} fill={STEEL.base} cornerRadius={1} />
        {/* Branche verticale */}
        <Rect x={-armW / 2} y={-armL} width={armW} height={armL} fill={STEEL.base} cornerRadius={1} />
        {/* Gousset central */}
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.moveTo(armW * 0.5, -armW * 0.5);
            ctx.lineTo(armL * 0.5, -armW * 0.5);
            ctx.lineTo(armW * 0.5, -armL * 0.5);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
          fill={STEEL.dark} opacity={0.6} listening={false}
        />
        {/* Boulons */}
        <Circle x={armL * 0.6} y={0} radius={boltR} fill={WEDGE.bolt} stroke={STEEL.outline} strokeWidth={0.5} listening={false} />
        <Circle x={0} y={-armL * 0.6} radius={boltR} fill={WEDGE.bolt} stroke={STEEL.outline} strokeWidth={0.5} listening={false} />
        {/* Highlight */}
        <Rect x={armW * 0.5} y={-armW / 2} width={armL * 0.4} height={armW * 0.25} fill={STEEL.highlight} opacity={0.3} cornerRadius={1} listening={false} />
      </>
    );
  }

  if (isPlinthe) {
    const bodyW = cw;
    const bodyH = ch;
    return (
      <>
        {/* Corps en U du collier */}
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.moveTo(0, -bodyH / 2);
            ctx.lineTo(bodyW, -bodyH / 2);
            ctx.lineTo(bodyW, bodyH / 2);
            ctx.lineTo(0, bodyH / 2);
            ctx.lineTo(0, bodyH * 0.3);
            ctx.lineTo(bodyW * 0.2, bodyH * 0.3);
            ctx.lineTo(bodyW * 0.2, -bodyH * 0.3);
            ctx.lineTo(0, -bodyH * 0.3);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
          fill={STEEL.base} stroke={STEEL.outline} strokeWidth={0.8}
        />
        <Circle x={bodyW * 0.65} y={0} radius={boltR} fill={WEDGE.bolt} listening={false} />
        {/* Patte porte-plinthe */}
        <Rect x={bodyW * 0.3} y={bodyH / 2} width={bodyW * 0.4} height={bodyH * 0.4} fill={STEEL.dark} cornerRadius={1} listening={false} />
      </>
    );
  }

  // Collier fixe ou crapaud
  const halfW = cw / 2;
  const halfH = ch / 2;

  return (
    <>
      {/* Demi-coquille A */}
      <Arc
        x={0} y={0}
        innerRadius={halfH * 0.5}
        outerRadius={halfH}
        angle={180}
        rotation={-90}
        fill={STEEL.base}
        stroke={STEEL.outline}
        strokeWidth={0.8}
      />
      {/* Demi-coquille B — décalée pour crapaud, même axe pour fixe */}
      <Arc
        x={isCrapaud ? halfW * 0.3 : 0}
        y={isCrapaud ? halfH * 0.3 : 0}
        innerRadius={halfH * 0.5}
        outerRadius={halfH}
        angle={180}
        rotation={isCrapaud ? 0 : 90}
        fill={STEEL.base}
        stroke={STEEL.outline}
        strokeWidth={0.8}
      />
      {/* Boulon central */}
      <Circle x={0} y={halfH + boltR} radius={boltR * 1.2} fill={WEDGE.bolt} stroke={STEEL.outline} strokeWidth={0.5} listening={false} />
      {/* Pivot du crapaud */}
      {isCrapaud && (
        <Circle x={halfW * 0.15} y={halfH * 0.15} radius={boltR * 1.5} fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.6} listening={false} />
      )}
      {/* Écrou */}
      <Circle x={0} y={-halfH - boltR} radius={boltR * 1.2} fill={JACK_CLR.nut} stroke={STEEL.outline} strokeWidth={0.5} listening={false} />
      {/* Highlight */}
      <Arc
        x={0} y={0}
        innerRadius={halfH * 0.55}
        outerRadius={halfH * 0.85}
        angle={60}
        rotation={-120}
        fill={STEEL.highlight}
        opacity={0.3}
        listening={false}
      />
    </>
  );
}

// ==========================================
// ACCESSOIRES — couvre-joint, embase, cale
// ==========================================
function AccessoryRenderer({ w, h, ppm, def, defId }: { w: number; h: number; ppm: number; def: PieceDefinition; defId: string }) {
  if (defId === 'couvre-joint') {
    const tubeW = Math.max(ppm * 0.055, 7);
    return (
      <>
        <Rect x={2} y={-h + 2} width={tubeW} height={h} fill="rgba(0,0,0,0.15)" cornerRadius={tubeW / 3} listening={false} />
        {/* Manchon principal */}
        <Rect x={-tubeW / 2} y={-h} width={tubeW} height={h} fill={STEEL.light} cornerRadius={tubeW / 3} />
        {/* Reflet */}
        <Rect x={-tubeW / 2} y={-h} width={tubeW * 0.3} height={h} fill={STEEL.highlight} opacity={0.4} cornerRadius={tubeW / 3} listening={false} />
        {/* Ligne de séparation au centre */}
        <Line points={[-tubeW / 2 - 1, -h / 2, tubeW / 2 + 1, -h / 2]} stroke={STEEL.outline} strokeWidth={1} listening={false} />
        {/* Goupilles (2) */}
        <Circle x={0} y={-h * 0.25} radius={Math.max(2, ppm * 0.01)} fill={WEDGE.bolt} stroke={STEEL.outline} strokeWidth={0.5} listening={false} />
        <Circle x={0} y={-h * 0.75} radius={Math.max(2, ppm * 0.01)} fill={WEDGE.bolt} stroke={STEEL.outline} strokeWidth={0.5} listening={false} />
        {/* Outline */}
        <Rect x={-tubeW / 2} y={-h} width={tubeW} height={h} stroke={STEEL.outline} strokeWidth={0.6} fill="transparent" cornerRadius={tubeW / 3} listening={false} />
      </>
    );
  }

  if (defId === 'embase') {
    const baseW = Math.max(ppm * 0.1, 12);
    const baseH = Math.max(h, ppm * 0.06);
    const spigotW = Math.max(ppm * 0.04, 5);
    return (
      <>
        <Rect x={-baseW / 2 + 1} y={-baseH + 1} width={baseW} height={baseH} fill="rgba(0,0,0,0.15)" cornerRadius={1} listening={false} />
        {/* Corps de l'embase — cylindre évasé */}
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.moveTo(-baseW / 2, 0);
            ctx.lineTo(-spigotW / 2, -baseH * 0.3);
            ctx.lineTo(-spigotW / 2, -baseH);
            ctx.lineTo(spigotW / 2, -baseH);
            ctx.lineTo(spigotW / 2, -baseH * 0.3);
            ctx.lineTo(baseW / 2, 0);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
          fill={STEEL.dark} stroke={STEEL.outline} strokeWidth={0.8}
        />
        {/* Highlight */}
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            ctx.moveTo(-baseW * 0.3, -baseH * 0.05);
            ctx.lineTo(-spigotW * 0.3, -baseH * 0.35);
            ctx.lineTo(-spigotW * 0.3, -baseH * 0.9);
            ctx.lineTo(0, -baseH * 0.9);
            ctx.lineTo(0, -baseH * 0.35);
            ctx.lineTo(-baseW * 0.1, -baseH * 0.05);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
          fill={STEEL.highlight} opacity={0.25} listening={false}
        />
      </>
    );
  }

  // Cales
  const caleW = Math.max(ppm * 0.14, 16);
  const caleH = Math.max(h, 3);
  return (
    <>
      <Rect x={-caleW / 2} y={-caleH} width={caleW} height={caleH} fill="#6a7a8a" stroke="#4a5a6a" strokeWidth={0.6} cornerRadius={0.5} />
      {/* Highlight */}
      <Rect x={-caleW / 2} y={-caleH} width={caleW} height={caleH * 0.35} fill={STEEL.highlight} opacity={0.25} cornerRadius={[0.5, 0.5, 0, 0]} listening={false} />
      {/* Texture hachurée */}
      {Array.from({ length: Math.floor(caleW / 5) }, (_, i) => (
        <Line
          key={i}
          points={[-caleW / 2 + (i + 1) * 5, -caleH + 0.5, -caleW / 2 + (i + 1) * 5 - 2, -0.5]}
          stroke="#5a6a7a" strokeWidth={0.4} opacity={0.4} listening={false}
        />
      ))}
    </>
  );
}
