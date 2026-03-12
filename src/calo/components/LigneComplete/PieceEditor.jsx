import { useState, useRef, useMemo, useCallback } from 'react';
import { DN_TABLE, DN_LIST } from '../../utils/calculs';
import { calcSurfacePiece } from '../../utils/calculs-ligne';

// --- Couleurs par type ---
const TYPE_COLORS = {
  droit: '#3B82F6',
  coude90: '#F97316',
  casse: '#F59E0B',
  reduction: '#8B5CF6',
  te: '#10B981',
  piquage: '#EC4899',
};

const TYPES_PIECE = [
  { type: 'droit', label: 'Tuyau droit', category: 'Sections droites' },
  { type: 'coude90', label: 'Coude 90', category: 'Coudes' },
  { type: 'casse', label: 'Cassé', category: 'Coudes' },
  { type: 'reduction', label: 'Reduction', category: 'Raccords' },
  { type: 'te', label: 'Te', category: 'Raccords' },
  { type: 'piquage', label: 'Piquage', category: 'Raccords' },
];

const NB_SEGMENTS_OPTIONS = [2, 3, 4, 5, 6];
const RAYON_FACTEURS = [1.0, 1.5, 2.0];

// --- Mini SVG icons par type (20x20) ---
function PieceIcon({ type, size = 20, strokeWidth = 2 }) {
  const color = TYPE_COLORS[type] || '#6e6e73';
  const props = {
    viewBox: '0 0 20 20',
    width: size,
    height: size,
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    className: 'shrink-0',
  };
  switch (type) {
    case 'droit':
      return (
        <svg {...props}>
          <line x1="2" y1="10" x2="18" y2="10" />
          <line x1="2" y1="7" x2="2" y2="13" />
          <line x1="18" y1="7" x2="18" y2="13" />
        </svg>
      );
    case 'coude90':
      return (
        <svg {...props}>
          <path d="M2 16 A12 12 0 0 1 16 2" />
          <circle cx="2" cy="16" r="1" fill={color} stroke="none" />
          <circle cx="16" cy="2" r="1" fill={color} stroke="none" />
        </svg>
      );
    case 'casse':
      return (
        <svg {...props}>
          <path d="M3 16 A14 14 0 0 1 14 8" />
          <circle cx="3" cy="16" r="1" fill={color} stroke="none" />
          <circle cx="14" cy="8" r="1" fill={color} stroke="none" />
        </svg>
      );
    case 'piquage':
      return (
        <svg {...props}>
          <line x1="2" y1="10" x2="18" y2="10" />
          <line x1="10" y1="10" x2="10" y2="18" />
          <circle cx="2" cy="10" r="1.5" fill={color} stroke="none" />
          <circle cx="18" cy="10" r="1" fill={color} stroke="none" />
          <circle cx="10" cy="18" r="1.2" fill={color} stroke="none" />
        </svg>
      );
    case 'reduction':
      return (
        <svg {...props}>
          <path d="M2 5 L18 7.5 L18 12.5 L2 15 Z" />
        </svg>
      );
    case 'te':
      return (
        <svg {...props}>
          <line x1="2" y1="10" x2="18" y2="10" />
          <line x1="10" y1="10" x2="10" y2="18" />
          <circle cx="10" cy="10" r="1.5" fill={color} stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

// --- Templates par categorie ---
const TEMPLATES = [
  {
    key: 'ligne',
    label: 'Ligne droite',
    description: '3 droits + 2 coudes 90',
    category: 'Sections droites',
    types: ['droit', 'coude90', 'droit', 'coude90', 'droit'],
  },
  {
    key: 'coude_simple',
    label: 'Coude simple',
    description: 'droit + coude + droit',
    category: 'Coudes',
    types: ['droit', 'coude90', 'droit'],
  },
  {
    key: 'u',
    label: 'Forme en U',
    description: 'droit + 2 coudes + droits',
    category: 'Coudes',
    types: ['droit', 'coude90', 'droit', 'coude90', 'droit'],
  },
  {
    key: 'derivation',
    label: 'Derivation',
    description: 'droit + te + droit',
    category: 'Raccords',
    types: ['droit', 'te', 'droit'],
  },
];

function getTypeInfo(type) {
  return TYPES_PIECE.find(t => t.type === type) || TYPES_PIECE[0];
}

// Dimension label compact
function getDimensionLabel(piece) {
  switch (piece.type) {
    case 'droit': return `L = ${piece.longueur || 1000} mm`;
    case 'coude90': return `${piece.nbSegments || 4} seg.  |  90°`;
    case 'casse': return `${piece.nbSegments || 3} seg.  |  45°`;
    case 'reduction': return `→ DN${piece.dnSortie}  |  L = ${piece.longueur || 300} mm`;
    case 'te': return `Piq DN${piece.dnPiquage}  |  H = ${piece.hauteurPiquage || 200} mm`;
    case 'piquage': return `DN${piece.dnSortie || '?'} / Piq DN${piece.dnPiquage || '?'}  |  H = ${piece.hauteurPiquage || 150} mm`;
    default: return '';
  }
}

export default function PieceEditor({
  pieces,
  setPieces,
  params,
  getDnAtIndex,
  ajouterPiece,
  modifierPiece,
  supprimerPiece,
  dupliquerPiece,
  monterPiece,
  descendrePiece,
  viderLigne,
  ajouterTemplate,
}) {
  const [showConfirmVider, setShowConfirmVider] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Drag state
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNodeRef = useRef(null);

  // Delete confirmation for last piece or many pieces (>5)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // --- Stats bar ---
  const stats = useMemo(() => {
    let totalLength = 0;
    let totalSurfTole = 0;
    pieces.forEach((p, i) => {
      if (p.type === 'droit') totalLength += (p.longueur || 1000);
      if (p.type === 'reduction') totalLength += (p.longueur || 300);
      if (p.type === 'te' || p.type === 'piquage') totalLength += 200;
      const dn = getDnAtIndex(i);
      const surf = calcSurfacePiece(p, dn, params.epIsolant, params.epTole, params.rayonFacteur);
      totalSurfTole += surf.surfTole;
    });
    return {
      count: pieces.length,
      totalLength: (totalLength / 1000).toFixed(1),
      totalSurface: totalSurfTole.toFixed(2),
    };
  }, [pieces, params, getDnAtIndex]);

  // --- Drag handlers ---
  const handleDragStart = useCallback((e, index) => {
    setDragIndex(index);
    dragNodeRef.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    // Slight delay so the drag image captures current state
    requestAnimationFrame(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.4';
      }
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && index !== dragIndex) {
      setDragOverIndex(index);
    }
  }, [dragIndex]);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      handleDragEnd();
      return;
    }
    setPieces(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(dropIndex, 0, moved);
      return arr;
    });
    handleDragEnd();
  }, [dragIndex, setPieces, handleDragEnd]);

  // --- Toggle expand ---
  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
    setConfirmDeleteId(null);
  }, []);

  // --- Delete with conditional confirmation ---
  const handleDelete = useCallback((id) => {
    const needsConfirm = pieces.length === 1 || pieces.length > 5;
    if (needsConfirm && confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    supprimerPiece(id);
    setConfirmDeleteId(null);
    if (expandedId === id) setExpandedId(null);
  }, [pieces.length, confirmDeleteId, supprimerPiece, expandedId]);

  function handleVider() {
    viderLigne();
    setShowConfirmVider(false);
    setExpandedId(null);
  }

  function appliquerTemplate(template) {
    if (template.key && ajouterTemplate) {
      ajouterTemplate(template.key);
    } else {
      template.types.forEach(type => ajouterPiece(type));
    }
  }

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    const grouped = {};
    TEMPLATES.forEach(tpl => {
      if (!grouped[tpl.category]) grouped[tpl.category] = [];
      grouped[tpl.category].push(tpl);
    });
    return grouped;
  }, []);

  return (
    <div className="space-y-3">
      {/* ====== STATISTICS BAR ====== */}
      {pieces.length > 0 && (
        <div className="glass-card rounded-xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <StatItem label="Pieces" value={stats.count} color="#f57c00" />
            <StatItem label="Longueur" value={`${stats.totalLength} m`} color="#3B82F6" />
            <StatItem label="Surface tole" value={`${stats.totalSurface} m²`} color="#8B5CF6" />
          </div>
          <div className="flex items-center gap-1 text-[10px] text-[#86868b]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Temps reel
          </div>
        </div>
      )}

      {/* ====== TEMPLATES SECTION ====== */}
      <div className="glass-card rounded-xl overflow-hidden" data-tuto="templates">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-black/[0.02] transition-colors duration-200"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-[#F2A900]/10 flex items-center justify-center">
              <svg className="w-3 h-3 text-[#F2A900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-[#1d1d1f]">Templates rapides</span>
          </div>
          <svg
            className={`w-3.5 h-3.5 text-[#86868b] transition-transform duration-200 ${showTemplates ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTemplates && (
          <div className="px-4 pb-4 pt-1 border-t border-black/[0.04] animate-accordion">
            {Object.entries(templatesByCategory).map(([category, templates]) => (
              <div key={category} className="mb-3 last:mb-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#86868b] block mb-1.5">{category}</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.key}
                      onClick={() => appliquerTemplate(tpl)}
                      className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg bg-black/[0.02] border border-black/[0.04] hover:border-[#F2A900]/40 hover:bg-[#F2A900]/[0.04] active:scale-[0.97] transition-all duration-200 text-left"
                    >
                      {/* Mini preview: show stacked type icons */}
                      <div className="flex items-center -space-x-1">
                        {tpl.types.slice(0, 3).map((type, ti) => (
                          <div key={ti} className="w-4 h-4 rounded-full bg-white border border-black/[0.06] flex items-center justify-center shadow-sm" style={{ zIndex: 3 - ti }}>
                            <PieceIcon type={type} size={10} strokeWidth={2.5} />
                          </div>
                        ))}
                        {tpl.types.length > 3 && (
                          <div className="w-4 h-4 rounded-full bg-black/[0.04] border border-black/[0.06] flex items-center justify-center text-[7px] text-[#86868b] font-bold" style={{ zIndex: 0 }}>
                            +{tpl.types.length - 3}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-[#1d1d1f] block leading-tight">{tpl.label}</span>
                        <span className="text-[8px] text-[#86868b] leading-tight">{tpl.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ====== ADD PIECE BUTTONS ====== */}
      <div className="glass-card rounded-xl p-3" data-tuto="add-piece">
        <span className="text-[9px] font-bold uppercase tracking-wider text-[#86868b] block mb-2">Ajouter une piece</span>
        <div className="flex gap-1.5">
          {TYPES_PIECE.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => ajouterPiece(type)}
              className="flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-black/[0.02] border border-black/[0.04] hover:border-[#f57c00]/30 hover:bg-[#f57c00]/[0.03] active:scale-[0.95] transition-all duration-200"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: `${TYPE_COLORS[type]}15`, border: `1.5px solid ${TYPE_COLORS[type]}30` }}
              >
                <PieceIcon type={type} size={14} strokeWidth={2.5} />
              </div>
              <span className="text-[9px] font-semibold text-[#6e6e73] leading-tight text-center">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ====== PIECE LIST ====== */}
      {pieces.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#86868b] block px-1">
            Pieces de la ligne ({pieces.length})
          </span>

          {pieces.map((piece, index) => {
            const info = getTypeInfo(piece.type);
            const dnCourant = getDnAtIndex(index);
            const oeCourant = DN_TABLE[dnCourant];
            const color = TYPE_COLORS[piece.type];
            const isExpanded = expandedId === piece.id;
            const isDragOver = dragOverIndex === index && dragIndex !== index;

            return (
              <div
                key={piece.id}
                data-piece-id={piece.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                className="transition-all duration-200"
                style={{
                  transform: isDragOver ? 'translateY(2px)' : 'none',
                }}
              >
                {/* Drop indicator line */}
                {isDragOver && (
                  <div className="h-0.5 bg-[#F2A900] rounded-full mx-4 mb-1 animate-pulse" />
                )}

                <div
                  className="glass-card rounded-xl overflow-hidden"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  {/* ---- Card header (always visible) ---- */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-black/[0.015] transition-colors duration-200 select-none"
                    onClick={() => toggleExpand(piece.id)}
                  >
                    {/* Drag handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-[#c7c7cc] hover:text-[#86868b] transition-colors"
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Glisser pour reordonner"
                    >
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                        <circle cx="3" cy="2" r="1.2" />
                        <circle cx="7" cy="2" r="1.2" />
                        <circle cx="3" cy="7" r="1.2" />
                        <circle cx="7" cy="7" r="1.2" />
                        <circle cx="3" cy="12" r="1.2" />
                        <circle cx="7" cy="12" r="1.2" />
                      </svg>
                    </div>

                    {/* Type icon */}
                    <PieceIcon type={piece.type} size={16} strokeWidth={2.5} />

                    {/* Index + type */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[12px] font-bold text-[#1d1d1f]">P{index + 1}</span>
                      <span className="text-[10px] font-medium text-[#86868b] truncate">{info.label}</span>
                    </div>

                    {/* Key dimension */}
                    <span className="text-[10px] font-medium text-[#6e6e73] hidden sm:block">
                      {getDimensionLabel(piece)}
                    </span>

                    {/* DN badge */}
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: `${color}12`, color: color }}
                    >
                      DN{dnCourant}
                    </span>

                    {/* Quick actions */}
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {/* Move up */}
                      <button
                        onClick={() => monterPiece(index)}
                        disabled={index === 0}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[#aeaeb2] hover:text-[#1d1d1f] hover:bg-black/[0.04] disabled:opacity-20 transition-all duration-200"
                        title="Monter"
                      >
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {/* Move down */}
                      <button
                        onClick={() => descendrePiece(index)}
                        disabled={index === pieces.length - 1}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[#aeaeb2] hover:text-[#1d1d1f] hover:bg-black/[0.04] disabled:opacity-20 transition-all duration-200"
                        title="Descendre"
                      >
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {/* Duplicate */}
                      <button
                        onClick={() => dupliquerPiece(piece.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[#aeaeb2] hover:text-[#3B82F6] hover:bg-[#3B82F6]/[0.06] transition-all duration-200"
                        title="Dupliquer"
                      >
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7zm2 1v8h8V8H6z" />
                        </svg>
                      </button>
                      {/* Delete */}
                      {confirmDeleteId === piece.id ? (
                        <button
                          onClick={() => handleDelete(piece.id)}
                          className="h-6 px-1.5 flex items-center justify-center rounded-md text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 transition-all duration-200"
                          title="Confirmer"
                        >
                          OK?
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDelete(piece.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-md text-[#aeaeb2] hover:text-red-500 hover:bg-red-500/[0.06] transition-all duration-200"
                          title="Supprimer"
                        >
                          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Expand chevron */}
                    <svg
                      className={`w-3 h-3 text-[#c7c7cc] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* ---- Expanded editing area (accordion) ---- */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-1 border-t border-black/[0.04] animate-accordion">
                      {/* DN + Oe info */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-semibold text-[#86868b]">
                          DN{dnCourant} — Oe {oeCourant} mm
                        </span>
                        <span className="text-[10px] text-[#c7c7cc]">|</span>
                        <span className="text-[10px] text-[#86868b]">
                          {getDimensionLabel(piece)}
                        </span>
                      </div>

                      {/* ---- Tuyau droit fields ---- */}
                      {piece.type === 'droit' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Longueur (mm)</label>
                          <input
                            type="number"
                            value={piece.longueur}
                            onChange={e => modifierPiece(piece.id, { longueur: Number(e.target.value) })}
                            className="neo-input w-full text-xs"
                            min="1"
                            step="10"
                          />
                          {/* Quick presets */}
                          <div className="flex gap-1 mt-1.5">
                            {[300, 500, 1000, 1500, 2000, 3000].map(v => (
                              <button
                                key={v}
                                onClick={() => modifierPiece(piece.id, { longueur: v })}
                                className={`flex-1 py-1 rounded-md text-[9px] font-semibold transition-all duration-200 ${
                                  piece.longueur === v
                                    ? 'bg-[#3B82F6] text-white'
                                    : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                                }`}
                              >
                                {v >= 1000 ? `${v / 1000}m` : v}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ---- Coude 90 fields ---- */}
                      {piece.type === 'coude90' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Nb segments</label>
                            <div className="flex gap-1">
                              {NB_SEGMENTS_OPTIONS.map(n => (
                                <button
                                  key={n}
                                  onClick={() => modifierPiece(piece.id, { nbSegments: n })}
                                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${
                                    piece.nbSegments === n
                                      ? 'bg-[#F97316] text-white shadow-sm'
                                      : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Rayon de cintrage</label>
                            <div className="flex gap-1">
                              {RAYON_FACTEURS.map(r => (
                                <button
                                  key={r}
                                  onClick={() => modifierPiece(piece.id, { rayonFacteur: r })}
                                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${
                                    (piece.rayonFacteur || 1.5) === r
                                      ? 'bg-[#F97316] text-white shadow-sm'
                                      : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                                  }`}
                                >
                                  {r}x
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ---- Casse (45) fields ---- */}
                      {piece.type === 'casse' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Nb segments</label>
                            <div className="flex gap-1">
                              {NB_SEGMENTS_OPTIONS.map(n => (
                                <button
                                  key={n}
                                  onClick={() => modifierPiece(piece.id, { nbSegments: n })}
                                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${
                                    piece.nbSegments === n
                                      ? 'bg-[#F59E0B] text-white shadow-sm'
                                      : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Rayon de cintrage</label>
                            <div className="flex gap-1">
                              {RAYON_FACTEURS.map(r => (
                                <button
                                  key={r}
                                  onClick={() => modifierPiece(piece.id, { rayonFacteur: r })}
                                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${
                                    (piece.rayonFacteur || 1.5) === r
                                      ? 'bg-[#F59E0B] text-white shadow-sm'
                                      : 'bg-black/[0.03] text-[#6e6e73] hover:bg-black/[0.06]'
                                  }`}
                                >
                                  {r}x
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ---- Reduction fields ---- */}
                      {piece.type === 'reduction' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">DN de sortie</label>
                            <select
                              value={piece.dnSortie}
                              onChange={e => modifierPiece(piece.id, { dnSortie: Number(e.target.value) })}
                              className="neo-input w-full text-xs"
                            >
                              {DN_LIST.filter(d => d < dnCourant).map(d => (
                                <option key={d} value={d}>DN{d} — Oe {DN_TABLE[d]} mm</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Longueur (mm)</label>
                            <input
                              type="number"
                              value={piece.longueur}
                              onChange={e => modifierPiece(piece.id, { longueur: Number(e.target.value) })}
                              className="neo-input w-full text-xs"
                              min="50"
                              step="10"
                            />
                          </div>
                        </div>
                      )}

                      {/* ---- Te fields ---- */}
                      {piece.type === 'te' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">DN piquage</label>
                            <select
                              value={piece.dnPiquage}
                              onChange={e => modifierPiece(piece.id, { dnPiquage: Number(e.target.value) })}
                              className="neo-input w-full text-xs"
                            >
                              {DN_LIST.filter(d => d <= dnCourant).map(d => (
                                <option key={d} value={d}>DN{d} — Oe {DN_TABLE[d]} mm</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Hauteur piquage (mm)</label>
                            <input
                              type="number"
                              value={piece.hauteurPiquage}
                              onChange={e => modifierPiece(piece.id, { hauteurPiquage: Number(e.target.value) })}
                              className="neo-input w-full text-xs"
                              min="50"
                              step="10"
                            />
                          </div>
                        </div>
                      )}

                      {/* ---- Piquage fields ---- */}
                      {piece.type === 'piquage' && (
                        <div className="space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">DN sortie (ligne principale)</label>
                            <select
                              value={piece.dnSortie}
                              onChange={e => modifierPiece(piece.id, { dnSortie: Number(e.target.value) })}
                              className="neo-input w-full text-xs"
                            >
                              {DN_LIST.map(d => (
                                <option key={d} value={d}>DN{d} — Oe {DN_TABLE[d]} mm</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">DN piquage (branche)</label>
                            <select
                              value={piece.dnPiquage}
                              onChange={e => modifierPiece(piece.id, { dnPiquage: Number(e.target.value) })}
                              className="neo-input w-full text-xs"
                            >
                              {DN_LIST.map(d => (
                                <option key={d} value={d}>DN{d} — Oe {DN_TABLE[d]} mm</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#86868b] mb-1">Hauteur piquage (mm)</label>
                            <input
                              type="number"
                              value={piece.hauteurPiquage}
                              onChange={e => modifierPiece(piece.id, { hauteurPiquage: Number(e.target.value) })}
                              className="neo-input w-full text-xs"
                              min="50"
                              step="10"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ====== CLEAR ALL BUTTON ====== */}
      {pieces.length > 0 && (
        <div>
          {showConfirmVider ? (
            <div className="flex gap-2 animate-accordion">
              <button
                onClick={handleVider}
                className="flex-1 glass-button danger !py-2.5 text-[11px] font-bold"
              >
                Confirmer la suppression
              </button>
              <button
                onClick={() => setShowConfirmVider(false)}
                className="flex-1 glass-button !py-2.5 text-[11px] font-semibold"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmVider(true)}
              className="w-full glass-button danger !py-2.5 text-[11px] font-semibold"
            >
              Vider la ligne
            </button>
          )}
        </div>
      )}

      {/* ====== EMPTY STATE ====== */}
      {pieces.length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#F2A900]/10 to-[#f57c00]/10 flex items-center justify-center border border-[#F2A900]/20">
            <svg className="w-8 h-8 text-[#F2A900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16 L4 10 A6 6 0 0 1 10 4 L20 4" />
              <circle cx="4" cy="18" r="2" />
              <circle cx="20" cy="4" r="2" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#1d1d1f] mb-1">Votre ligne est vide</p>
          <p className="text-xs text-[#86868b] mb-5 max-w-[260px] mx-auto">
            Ajoutez des tuyaux, coudes et raccords pour construire votre ligne de calorifuge
          </p>

          {/* Quick start buttons */}
          <div className="flex flex-col gap-2 max-w-[280px] mx-auto">
            <button
              onClick={() => ajouterPiece('droit')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-[#F2A900]/[0.07] border border-[#F2A900]/20 hover:bg-[#F2A900]/[0.12] active:scale-[0.97] transition-all text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
                <PieceIcon type="droit" size={16} strokeWidth={2.5} />
              </div>
              <div>
                <span className="text-xs font-bold text-[#1d1d1f] block">Ajouter un tuyau droit</span>
                <span className="text-[10px] text-[#86868b]">La piece de base</span>
              </div>
            </button>
            <button
              onClick={() => ajouterTemplate('coude_simple')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-black/[0.02] border border-black/[0.06] hover:bg-black/[0.04] active:scale-[0.97] transition-all text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-[#F97316]/10 flex items-center justify-center">
                <PieceIcon type="coude90" size={16} strokeWidth={2.5} />
              </div>
              <div>
                <span className="text-xs font-bold text-[#1d1d1f] block">Demarrer avec un modele</span>
                <span className="text-[10px] text-[#86868b]">Coude simple pre-configure</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ====== CSS ANIMATIONS ====== */}
      <style>{`
        @keyframes accordion {
          from {
            opacity: 0;
            max-height: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            max-height: 500px;
            transform: translateY(0);
          }
        }
        .animate-accordion {
          animation: accordion 0.2s cubic-bezier(0.4, 0, 0.2, 1) both;
        }
      `}</style>
    </div>
  );
}

// --- Stat item for the stats bar ---
function StatItem({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-[#86868b]">{label}</span>
      <span className="text-[11px] font-bold text-[#1d1d1f]">{value}</span>
    </div>
  );
}
