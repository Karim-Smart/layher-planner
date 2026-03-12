import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { DN_TABLE } from '../../utils/calculs';

// ── Couleurs par type ──
const COLORS = {
  droit: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1d4ed8', shadow: '#3b82f640' },
  coude90: { fill: '#ffedd5', stroke: '#f97316', text: '#c2410c', shadow: '#f9731640' },
  casse: { fill: '#fef3c7', stroke: '#f59e0b', text: '#b45309', shadow: '#f59e0b40' },
  reduction: { fill: '#ede9fe', stroke: '#8b5cf6', text: '#6d28d9', shadow: '#8b5cf640' },
  te: { fill: '#d1fae5', stroke: '#10b981', text: '#047857', shadow: '#10b98140' },
  piquage: { fill: '#fce7f3', stroke: '#ec4899', text: '#be185d', shadow: '#ec489940' },
};

const TYPE_LABELS = {
  droit: 'Droit', coude90: 'C90', casse: 'Cassé',
  reduction: 'Red.', te: 'Te', piquage: 'PIQ',
};

const PIPE_WIDTH = 16;
const ISO_WIDTH = 26;
const SCALE = 0.065;
const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;

// ── Layout automatique de la ligne ──
function layoutPipeline(pieces, params, getDnAtIndex) {
  let x = 0, y = 0;
  let angle = 0;
  const elements = [];

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const dn = getDnAtIndex(i);
    const De = DN_TABLE[dn] || 114.3;
    const orient = piece.orientation || 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    if (piece.type === 'droit') {
      const L = Math.max((piece.longueur || 1000) * SCALE, 30);
      const ex = x + dx * L;
      const ey = y + dy * L;
      elements.push({ type: 'droit', i, piece, dn, De, x1: x, y1: y, x2: ex, y2: ey, angle, longueur: piece.longueur || 1000 });
      x = ex; y = ey;

    } else if (piece.type === 'coude90' || piece.type === 'casse') {
      const bendAngle = piece.type === 'coude90' ? Math.PI / 2 : Math.PI / 4;
      const turnSign = (Math.round(orient / 90) % 2 === 0) ? -1 : 1;
      const R = 28;

      const px = -dy * turnSign;
      const py = dx * turnSign;
      const cx = x + px * R;
      const cy = y + py * R;

      const sa = Math.atan2(y - cy, x - cx);
      const ea = sa + turnSign * bendAngle;

      const newAngle = angle + turnSign * bendAngle;
      const ex = cx + R * Math.cos(ea);
      const ey = cy + R * Math.sin(ea);

      elements.push({
        type: piece.type, i, piece, dn, De, cx, cy, R,
        sa, ea, turnSign, x1: x, y1: y, x2: ex, y2: ey,
        angle, newAngle, bendDeg: piece.type === 'coude90' ? 90 : 45,  // casse = 45 degrees
      });

      x = ex; y = ey;
      angle = newAngle;

    } else if (piece.type === 'reduction') {
      const De2 = DN_TABLE[piece.dnSortie] || De;
      const L = Math.max((piece.longueur || 300) * SCALE, 20);
      const ex = x + dx * L;
      const ey = y + dy * L;
      elements.push({ type: 'reduction', i, piece, dn, De, De2, x1: x, y1: y, x2: ex, y2: ey, angle, longueur: piece.longueur || 300 });
      x = ex; y = ey;

    } else if (piece.type === 'te') {
      const L = 40;
      const ex = x + dx * L;
      const ey = y + dy * L;
      const mx = x + dx * L / 2;
      const my = y + dy * L / 2;
      const turnSign = (Math.round(orient / 90) % 2 === 0) ? -1 : 1;
      const pLen = 25;
      const bx = mx + (-dy) * turnSign * pLen;
      const by = my + dx * turnSign * pLen;
      elements.push({
        type: 'te', i, piece, dn, De,
        x1: x, y1: y, x2: ex, y2: ey,
        mx, my, bx, by, angle,
      });
      x = ex; y = ey;

    } else if (piece.type === 'piquage') {
      const L = 40;
      const ex = x + dx * L;
      const ey = y + dy * L;
      const mx = x + dx * L / 2;
      const my = y + dy * L / 2;
      const turnSign = (Math.round(orient / 90) % 2 === 0) ? -1 : 1;
      const pLen = 25;
      const bx = mx + (-dy) * turnSign * pLen;
      const by = my + dx * turnSign * pLen;
      elements.push({
        type: 'piquage', i, piece, dn, De,
        x1: x, y1: y, x2: ex, y2: ey,
        mx, my, bx, by, angle,
      });
      x = ex; y = ey;
    }
  }

  return elements;
}

// ── Arc SVG ──
function arcPath(cx, cy, R, startAngle, endAngle, turnSign) {
  const x1 = cx + R * Math.cos(startAngle);
  const y1 = cy + R * Math.sin(startAngle);
  const x2 = cx + R * Math.cos(endAngle);
  const y2 = cy + R * Math.sin(endAngle);
  const sweep = turnSign > 0 ? 1 : 0;
  const large = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} ${sweep} ${x2} ${y2}`;
}

// ── Fleche de direction ──
function FlowArrow({ x1, y1, x2, y2 }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tipX = mx + cos * size;
  const tipY = my + sin * size;
  const lx = mx - cos * size + (-sin) * size * 0.6;
  const ly = my - sin * size + cos * size * 0.6;
  const rx = mx - cos * size - (-sin) * size * 0.6;
  const ry = my - sin * size - cos * size * 0.6;
  return (
    <polygon
      points={`${tipX},${tipY} ${lx},${ly} ${rx},${ry}`}
      fill="white"
      opacity={0.85}
    />
  );
}

// ── Ligne de cote ──
function DimensionLine({ x1, y1, x2, y2, label, offset }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(angle) * offset;
  const ny = Math.cos(angle) * offset;
  const ax = x1 + nx, ay = y1 + ny;
  const bx = x2 + nx, by = y2 + ny;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;

  return (
    <g opacity={0.5}>
      <line x1={x1 + nx * 0.3} y1={y1 + ny * 0.3} x2={ax + nx * 0.15} y2={ay + ny * 0.15}
        stroke="#94a3b8" strokeWidth={0.5} />
      <line x1={x2 + nx * 0.3} y1={y2 + ny * 0.3} x2={bx + nx * 0.15} y2={by + ny * 0.15}
        stroke="#94a3b8" strokeWidth={0.5} />
      <line x1={ax} y1={ay} x2={bx} y2={by}
        stroke="#94a3b8" strokeWidth={0.7}
        markerStart="url(#dimArrowStart)" markerEnd="url(#dimArrowEnd)" />
      <rect x={mx - 16} y={my - 6} width={32} height={11} rx={2}
        fill="#f8fafc" opacity={0.9} />
      <text x={mx} y={my + 3} textAnchor="middle" fontSize={7} fontWeight="600"
        fill="#64748b">
        {label}
      </text>
    </g>
  );
}

// ── Annotation angle ──
function AngleAnnotation({ cx, cy, sa, ea, R, label, color }) {
  const midA = (sa + ea) / 2;
  const ar = R + 36;
  const lx = cx + ar * Math.cos(midA);
  const ly = cy + ar * Math.sin(midA);
  return (
    <g opacity={0.6}>
      <rect x={lx - 12} y={ly - 6} width={24} height={11} rx={2} fill="white" stroke={color} strokeWidth={0.5} />
      <text x={lx} y={ly + 3} textAnchor="middle" fontSize={7} fontWeight="600" fill={color}>
        {label}
      </text>
    </g>
  );
}

// ── Info-bulle piece ──
function InfoPanel({ el, onClose }) {
  if (!el) return null;
  const De = DN_TABLE[el.dn] || 114.3;
  const lines = [
    { label: 'DN', value: `DN${el.dn}` },
    { label: 'De', value: `${De} mm` },
  ];
  if (el.type === 'droit') lines.push({ label: 'Longueur', value: `${el.longueur} mm` });
  if (el.type === 'coude90' || el.type === 'casse') lines.push({ label: 'Angle', value: `${el.bendDeg}°` });
  if (el.type === 'reduction') {
    lines.push({ label: 'Longueur', value: `${el.longueur} mm` });
    lines.push({ label: 'DN sortie', value: `DN${el.piece.dnSortie}` });
  }
  if (el.piece.orientation !== undefined) lines.push({ label: 'Orient.', value: `${el.piece.orientation}°` });

  return (
    <div className="absolute top-3 right-3 z-20 glass-card rounded-lg w-44 overflow-hidden animate-modal-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/[0.06]">
        <span className="text-[11px] font-bold text-[#1d1d1f] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: COLORS[el.type].stroke }} />
          P{el.i + 1} — {TYPE_LABELS[el.type]}
        </span>
        <button onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-sm leading-none transition-colors">x</button>
      </div>
      <div className="px-3 py-2 space-y-1">
        {lines.map((l, idx) => (
          <div key={idx} className="flex justify-between text-[10px]">
            <span className="text-[#86868b]">{l.label}</span>
            <span className="font-semibold text-[#1d1d1f]">{l.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Composant principal ──
export default function VueSchema({ pieces, params, getDnAtIndex, tournerPiece }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState(null);
  const [selectedEl, setSelectedEl] = useState(null);

  const hasPieces = pieces && pieces.length > 0;

  const elements = useMemo(() => {
    if (!hasPieces) return [];
    return layoutPipeline(pieces, params, getDnAtIndex);
  }, [pieces, params, getDnAtIndex, hasPieces]);

  useEffect(() => { setSelectedEl(null); }, [pieces]);

  const naturalBbox = useMemo(() => {
    if (elements.length === 0) return { x: -50, y: -50, w: 400, h: 250 };
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of elements) {
      x1 = Math.min(x1, el.x1, el.x2);
      y1 = Math.min(y1, el.y1, el.y2);
      x2 = Math.max(x2, el.x1, el.x2);
      y2 = Math.max(y2, el.y1, el.y2);
      if (el.bx !== undefined) { x1 = Math.min(x1, el.bx); y1 = Math.min(y1, el.by); x2 = Math.max(x2, el.bx); y2 = Math.max(y2, el.by); }
      if (el.cx !== undefined) {
        x1 = Math.min(x1, el.cx - el.R); y1 = Math.min(y1, el.cy - el.R);
        x2 = Math.max(x2, el.cx + el.R); y2 = Math.max(y2, el.cy + el.R);
      }
    }
    const pad = 80;
    return { x: x1 - pad, y: y1 - pad, w: Math.max(300, x2 - x1 + pad * 2), h: Math.max(200, y2 - y1 + pad * 2) };
  }, [elements]);

  const bbox = useMemo(() => {
    const w = naturalBbox.w / zoom;
    const h = naturalBbox.h / zoom;
    const cx = naturalBbox.x + naturalBbox.w / 2 + pan.x;
    const cy = naturalBbox.y + naturalBbox.h / 2 + pan.y;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [naturalBbox, zoom, pan]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('[data-btn]') || e.target.closest('[data-piece]')) return;
    setDragState({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
    e.target.setPointerCapture?.(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e) => {
    if (!dragState) return;
    const svg = svgRef.current;
    if (!svg) return;
    const scale = bbox.w / svg.clientWidth;
    setPan({
      x: dragState.px - (e.clientX - dragState.sx) * scale,
      y: dragState.py - (e.clientY - dragState.sy) * scale,
    });
  }, [dragState, bbox.w]);

  const handlePointerUp = useCallback(() => setDragState(null), []);

  const handleFlip = useCallback((e, pieceId) => {
    e.stopPropagation();
    tournerPiece(pieceId);
  }, [tournerPiece]);

  const handlePieceClick = useCallback((e, el) => {
    e.stopPropagation();
    setSelectedEl((prev) => (prev && prev.i === el.i) ? null : el);
  }, []);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP)), []);
  const handleCenter = useCallback(() => { setPan({ x: 0, y: 0 }); setZoom(1); }, []);

  if (!hasPieces) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto mb-3 text-[#aeaeb2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
          </svg>
          <p className="text-xs text-[#86868b]">Ajoutez des pieces dans l'editeur</p>
          <p className="text-[10px] text-[#aeaeb2] mt-1">Le schema 2D s'affichera ici</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#f57c00]/10 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[#f57c00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-[#1d1d1f]">Schema 2D</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/[0.04] text-[#86868b]">
            {pieces.length} piece{pieces.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Controles zoom */}
        <div className="flex items-center gap-0.5">
          <button data-btn="true" onClick={handleZoomOut}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/[0.04] text-[#86868b] hover:text-[#1d1d1f] transition text-xs font-bold">
            -
          </button>
          <span className="text-[10px] text-[#aeaeb2] w-8 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button data-btn="true" onClick={handleZoomIn}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/[0.04] text-[#86868b] hover:text-[#1d1d1f] transition text-xs font-bold">
            +
          </button>
          <div className="w-px h-4 bg-black/[0.06] mx-1" />
          <button data-btn="true" onClick={handleCenter}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/[0.04] text-[#86868b] hover:text-[#1d1d1f] transition">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-2.5 px-3 py-1.5 border-b border-black/[0.04] bg-black/[0.01]">
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <span key={type} className="flex items-center gap-1 text-[10px] text-[#86868b]">
            <span className="w-2 h-2 rounded-sm" style={{ background: COLORS[type].stroke }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-[#aeaeb2]">
          DN{getDnAtIndex(0)} (De {DN_TABLE[getDnAtIndex(0)] || '?'} mm)
        </span>
      </div>

      <div className="p-2 relative" ref={containerRef}>
        <InfoPanel el={selectedEl} onClose={() => setSelectedEl(null)} />

        <svg
          ref={svgRef}
          viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
          className="w-full touch-none select-none rounded-lg"
          style={{ height: '320px', cursor: dragState ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={() => setSelectedEl(null)}
        >
          <defs>
            <pattern id="grid2d" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.5" fill="#e2e8f0" />
            </pattern>
            <filter id="pipeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="3" dy="3" stdDeviation="2" floodOpacity="0.12" floodColor="#000" />
            </filter>
            <linearGradient id="isoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity="0.25" />
              <stop offset="50%" stopColor="white" stopOpacity="0" />
              <stop offset="100%" stopColor="black" stopOpacity="0.1" />
            </linearGradient>
            <marker id="dimArrowEnd" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
            </marker>
            <marker id="dimArrowStart" markerWidth="6" markerHeight="4" refX="0" refY="2" orient="auto">
              <polygon points="6 0, 0 2, 6 4" fill="#94a3b8" />
            </marker>
            <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#8b5cf6" opacity="0.6" />
            </marker>
          </defs>

          {/* Fond */}
          <rect x={bbox.x} y={bbox.y} width={bbox.w} height={bbox.h} fill="#fafafa" rx={8} />
          <rect x={bbox.x} y={bbox.y} width={bbox.w} height={bbox.h} fill="url(#grid2d)" />

          {/* Ombres */}
          <g filter="url(#pipeShadow)" opacity={0.4}>
            {elements.map((el) => {
              if (el.type === 'droit') {
                return <line key={`sh-${el.i}`} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                  stroke="#000" strokeWidth={PIPE_WIDTH} strokeLinecap="round" opacity={0.1} />;
              }
              if (el.type === 'coude90' || el.type === 'casse') {
                return <path key={`sh-${el.i}`} d={arcPath(el.cx, el.cy, el.R, el.sa, el.ea, el.turnSign)}
                  fill="none" stroke="#000" strokeWidth={PIPE_WIDTH} strokeLinecap="round" opacity={0.1} />;
              }
              if (el.type === 'te' || el.type === 'piquage') {
                return (
                  <g key={`sh-${el.i}`}>
                    <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                      stroke="#000" strokeWidth={PIPE_WIDTH} strokeLinecap="round" opacity={0.1} />
                    <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                      stroke="#000" strokeWidth={PIPE_WIDTH * 0.7} strokeLinecap="round" opacity={0.1} />
                  </g>
                );
              }
              return null;
            })}
          </g>

          {/* Point de depart */}
          {elements.length > 0 && (
            <g>
              <circle cx={elements[0].x1} cy={elements[0].y1} r={6}
                fill="#22c55e" stroke="white" strokeWidth={2} />
              <text x={elements[0].x1} y={elements[0].y1 - 12}
                textAnchor="middle" fontSize={7} fontWeight="bold"
                fill="#22c55e">DEPART</text>
            </g>
          )}

          {/* Elements */}
          {elements.map((el) => {
            const c = COLORS[el.type];
            const perp = { x: -Math.sin(el.angle), y: Math.cos(el.angle) };
            const isSelected = selectedEl && selectedEl.i === el.i;

            if (el.type === 'droit') {
              return (
                <g key={el.i} data-piece="true" onClick={(e) => handlePieceClick(e, el)} style={{ cursor: 'pointer' }}>
                  {isSelected && (
                    <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                      stroke={c.stroke} strokeWidth={ISO_WIDTH + 6} strokeLinecap="round" opacity={0.2} />
                  )}
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke={c.fill} strokeWidth={ISO_WIDTH} strokeLinecap="round" opacity={0.7} />
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke="url(#isoGrad)" strokeWidth={ISO_WIDTH} strokeLinecap="round" opacity={0.4} />
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke={c.stroke} strokeWidth={ISO_WIDTH} strokeLinecap="round"
                    fill="none" opacity={0.12} strokeDasharray="4 3" />
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke={c.stroke} strokeWidth={PIPE_WIDTH} strokeLinecap="round" opacity={0.75} />
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke={c.stroke} strokeWidth={1} strokeDasharray="5 3" opacity={0.25} />
                  <FlowArrow x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} />
                  <text x={(el.x1 + el.x2) / 2 + perp.x * 22} y={(el.y1 + el.y2) / 2 + perp.y * 22}
                    textAnchor="middle" fontSize={8} fontWeight="bold" fill={c.text}>
                    P{el.i + 1}
                  </text>
                  <DimensionLine x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    label={`${el.longueur} mm`} offset={-28} />
                </g>
              );
            }

            if (el.type === 'coude90' || el.type === 'casse') {
              const path = arcPath(el.cx, el.cy, el.R, el.sa, el.ea, el.turnSign);
              const midAngle = (el.sa + el.ea) / 2;
              const lx = el.cx + (el.R + 22) * Math.cos(midAngle);
              const ly = el.cy + (el.R + 22) * Math.sin(midAngle);
              return (
                <g key={el.i} data-piece="true" onClick={(e) => handlePieceClick(e, el)} style={{ cursor: 'pointer' }}>
                  {isSelected && (
                    <path d={path} fill="none" stroke={c.stroke} strokeWidth={ISO_WIDTH + 6}
                      strokeLinecap="round" opacity={0.2} />
                  )}
                  <path d={path} fill="none" stroke={c.fill} strokeWidth={ISO_WIDTH}
                    strokeLinecap="round" opacity={0.7} />
                  <path d={path} fill="none" stroke="url(#isoGrad)" strokeWidth={ISO_WIDTH}
                    strokeLinecap="round" opacity={0.4} />
                  <path d={path} fill="none" stroke={c.stroke} strokeWidth={ISO_WIDTH}
                    strokeLinecap="round" opacity={0.12} strokeDasharray="4 3" />
                  <path d={path} fill="none" stroke={c.stroke} strokeWidth={PIPE_WIDTH}
                    strokeLinecap="round" opacity={0.75} />
                  <AngleAnnotation cx={el.cx} cy={el.cy} sa={el.sa} ea={el.ea}
                    R={el.R} label={`${el.bendDeg}°`} color={c.text} />
                  {/* Bouton flip */}
                  <g data-btn="true" onClick={(e) => handleFlip(e, el.piece.id)} style={{ cursor: 'pointer' }}>
                    <circle cx={lx} cy={ly} r={9} fill="white" stroke={c.stroke} strokeWidth={1.5} />
                    <path d={`M ${lx - 3} ${ly - 1} A 3 3 0 1 1 ${lx + 1} ${ly + 2}`}
                      fill="none" stroke={c.stroke} strokeWidth={1.5} strokeLinecap="round" />
                    <polygon points={`${lx - 1},${ly + 2} ${lx + 2},${ly + 2} ${lx + 0.5},${ly + 4.5}`} fill={c.stroke} />
                  </g>
                  <text x={lx} y={ly - 14} textAnchor="middle" fontSize={8} fontWeight="bold" fill={c.text}>
                    P{el.i + 1}
                  </text>
                </g>
              );
            }

            if (el.type === 'reduction') {
              const hw1 = ISO_WIDTH / 2;
              const hw2 = ISO_WIDTH / 2 * 0.6;
              const dx = Math.cos(el.angle), dy = Math.sin(el.angle);
              const nx = -dy, ny = dx;
              const pts = [
                `${el.x1 + nx * hw1},${el.y1 + ny * hw1}`,
                `${el.x2 + nx * hw2},${el.y2 + ny * hw2}`,
                `${el.x2 - nx * hw2},${el.y2 - ny * hw2}`,
                `${el.x1 - nx * hw1},${el.y1 - ny * hw1}`,
              ].join(' ');
              return (
                <g key={el.i} data-piece="true" onClick={(e) => handlePieceClick(e, el)} style={{ cursor: 'pointer' }}>
                  {isSelected && (
                    <polygon points={pts} fill={c.stroke} stroke="none" opacity={0.15} />
                  )}
                  <polygon points={pts} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} opacity={0.75} />
                  <polygon points={pts} fill="url(#isoGrad)" stroke="none" opacity={0.3} />
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke={c.stroke} strokeWidth={1.5} markerEnd="url(#arrow)" opacity={0.5} />
                  <text x={(el.x1 + el.x2) / 2 + perp.x * 22} y={(el.y1 + el.y2) / 2 + perp.y * 22}
                    textAnchor="middle" fontSize={8} fontWeight="bold" fill={c.text}>
                    P{el.i + 1}
                  </text>
                  <DimensionLine x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    label={`DN${el.dn} > ${el.piece.dnSortie}`} offset={-28} />
                </g>
              );
            }

            if (el.type === 'te') {
              return (
                <g key={el.i} data-piece="true" onClick={(e) => handlePieceClick(e, el)} style={{ cursor: 'pointer' }}>
                  {isSelected && (
                    <>
                      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                        stroke={c.stroke} strokeWidth={ISO_WIDTH + 6} strokeLinecap="round" opacity={0.2} />
                      <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                        stroke={c.stroke} strokeWidth={ISO_WIDTH * 0.7 + 6} strokeLinecap="round" opacity={0.2} />
                    </>
                  )}
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke={c.fill} strokeWidth={ISO_WIDTH} strokeLinecap="round" opacity={0.7} />
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke="url(#isoGrad)" strokeWidth={ISO_WIDTH} strokeLinecap="round" opacity={0.4} />
                  <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    stroke={c.stroke} strokeWidth={PIPE_WIDTH} strokeLinecap="round" opacity={0.75} />
                  <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                    stroke={c.fill} strokeWidth={ISO_WIDTH * 0.7} strokeLinecap="round" opacity={0.7} />
                  <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                    stroke="url(#isoGrad)" strokeWidth={ISO_WIDTH * 0.7} strokeLinecap="round" opacity={0.4} />
                  <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                    stroke={c.stroke} strokeWidth={PIPE_WIDTH * 0.7} strokeLinecap="round" opacity={0.75} />
                  {/* Bouton flip */}
                  <g data-btn="true" onClick={(e) => handleFlip(e, el.piece.id)} style={{ cursor: 'pointer' }}>
                    <circle cx={el.bx} cy={el.by} r={8} fill="white" stroke={c.stroke} strokeWidth={1.5} />
                    <path d={`M ${el.bx - 3} ${el.by} A 3 3 0 1 1 ${el.bx + 1} ${el.by + 2}`}
                      fill="none" stroke={c.stroke} strokeWidth={1.3} strokeLinecap="round" />
                  </g>
                  <text x={(el.x1 + el.x2) / 2 + perp.x * 22} y={(el.y1 + el.y2) / 2 + perp.y * 22}
                    textAnchor="middle" fontSize={8} fontWeight="bold" fill={c.text}>
                    P{el.i + 1}
                  </text>
                </g>
              );
            }

            if (el.type === 'piquage') {
              return (
                <g key={el.i} data-piece="true" onClick={(e) => handlePieceClick(e, el)} style={{ cursor: 'pointer' }}>
                  {isSelected && (
                    <>
                      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                        stroke={c.stroke} strokeWidth={ISO_WIDTH + 6} strokeLinecap="round" opacity={0.2} />
                      <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                        stroke={c.stroke} strokeWidth={ISO_WIDTH * 0.7 + 6} strokeLinecap="round" opacity={0.2} />
                    </>
                  )}
                  {/* Main line - entry side (thicker) */}
                  <line x1={el.x1} y1={el.y1} x2={el.mx} y2={el.my}
                    stroke={c.fill} strokeWidth={ISO_WIDTH} strokeLinecap="round" opacity={0.7} />
                  <line x1={el.x1} y1={el.y1} x2={el.mx} y2={el.my}
                    stroke={c.stroke} strokeWidth={PIPE_WIDTH} strokeLinecap="round" opacity={0.75} />
                  {/* Main line - exit side (potentially different size) */}
                  <line x1={el.mx} y1={el.my} x2={el.x2} y2={el.y2}
                    stroke={c.fill} strokeWidth={ISO_WIDTH * 0.85} strokeLinecap="round" opacity={0.7} />
                  <line x1={el.mx} y1={el.my} x2={el.x2} y2={el.y2}
                    stroke={c.stroke} strokeWidth={PIPE_WIDTH * 0.85} strokeLinecap="round" opacity={0.75} />
                  {/* Branch */}
                  <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                    stroke={c.fill} strokeWidth={ISO_WIDTH * 0.6} strokeLinecap="round" opacity={0.7} />
                  <line x1={el.mx} y1={el.my} x2={el.bx} y2={el.by}
                    stroke={c.stroke} strokeWidth={PIPE_WIDTH * 0.6} strokeLinecap="round" opacity={0.75} />
                  {/* DN annotations */}
                  <text x={el.bx} y={el.by + 12} textAnchor="middle" fontSize={6} fill={c.text} opacity={0.7}>
                    DN{el.piece.dnPiquage || '?'}
                  </text>
                  <text x={el.x2 + perp.x * 14} y={el.y2 + perp.y * 14} textAnchor="middle" fontSize={6} fill={c.text} opacity={0.7}>
                    DN{el.piece.dnSortie || '?'}
                  </text>
                  {/* Bouton flip */}
                  <g data-btn="true" onClick={(e) => handleFlip(e, el.piece.id)} style={{ cursor: 'pointer' }}>
                    <circle cx={el.bx} cy={el.by} r={8} fill="white" stroke={c.stroke} strokeWidth={1.5} />
                    <path d={`M ${el.bx - 3} ${el.by} A 3 3 0 1 1 ${el.bx + 1} ${el.by + 2}`}
                      fill="none" stroke={c.stroke} strokeWidth={1.3} strokeLinecap="round" />
                  </g>
                  <text x={(el.x1 + el.x2) / 2 + perp.x * 22} y={(el.y1 + el.y2) / 2 + perp.y * 22}
                    textAnchor="middle" fontSize={8} fontWeight="bold" fill={c.text}>
                    P{el.i + 1}
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* Connecteurs */}
          {elements.map((el, idx) => (
            <g key={`conn-${idx}`}>
              <circle cx={el.x1} cy={el.y1} r={3.5} fill="white" stroke="#94a3b8" strokeWidth={1.5} />
              <circle cx={el.x1} cy={el.y1} r={1.2} fill="#94a3b8" />
              <circle cx={el.x2} cy={el.y2} r={3.5} fill="white" stroke="#94a3b8" strokeWidth={1.5} />
              <circle cx={el.x2} cy={el.y2} r={1.2} fill="#94a3b8" />
            </g>
          ))}

          {/* DN annotations */}
          {elements.filter((el, idx) => idx === 0 || getDnAtIndex(el.i) !== getDnAtIndex(elements[idx - 1].i)).map((el) => {
            const De = DN_TABLE[el.dn] || '?';
            return (
              <g key={`dn-${el.i}`}>
                <rect x={el.x1 - 26} y={el.y1 + 10} width={52} height={14} rx={3}
                  fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.8} />
                <text x={el.x1} y={el.y1 + 20} textAnchor="middle" fontSize={7} fontWeight="bold"
                  fill="#475569">
                  DN{el.dn} ({De})
                </text>
              </g>
            );
          })}

          {/* Point de fin */}
          {elements.length > 0 && (() => {
            const last = elements[elements.length - 1];
            return (
              <g>
                <circle cx={last.x2} cy={last.y2} r={6}
                  fill="#ef4444" stroke="white" strokeWidth={2} />
                <text x={last.x2} y={last.y2 + 16}
                  textAnchor="middle" fontSize={7} fontWeight="bold"
                  fill="#ef4444">FIN</text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Barre d'info */}
      <div className="px-3 py-1.5 bg-black/[0.02] text-[10px] text-[#aeaeb2] flex justify-between border-t border-black/[0.04]">
        <span>Glisser pour deplacer · Molette pour zoomer · Cliquer une piece pour details</span>
        <span>{pieces.length} pieces · DN{getDnAtIndex(0)}</span>
      </div>
    </div>
  );
}
