import { useState, useMemo } from 'react';
import { Search, X, ChevronDown, GripVertical } from 'lucide-react';
import { PIECES_BY_CATEGORY } from '../catalog/definitions';
import type { PieceDefinition } from '../catalog/types';

const CATEGORY_ICONS: Record<string, string> = {
  standard: '|',
  ledger: '—',
  diagonal: '/',
  platform: '▬',
  baseJack: '▽',
  guardrail: '═',
  console: '⌐',
  castor: '●',
  ladder: '⊞',
  clamp: '◎',
  toeboard: '▃',
  tube: '―',
  accessory: '◇',
};

const CATEGORY_COLORS: Record<string, string> = {
  standard: '#9eaab8',
  ledger: '#9eaab8',
  diagonal: '#bcc8d4',
  platform: '#c8a060',
  baseJack: '#7a8a9a',
  guardrail: '#e8c840',
  console: '#9eaab8',
  castor: '#7a8a9a',
  ladder: '#9eaab8',
  clamp: '#708090',
  toeboard: '#c0a060',
  tube: '#7a8a9a',
  accessory: '#6a7a8a',
};

export function PiecePalette() {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['standard', 'ledger']));
  const [search, setSearch] = useState('');

  const toggle = (cat: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const normalizedSearch = search.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!normalizedSearch) return Object.entries(PIECES_BY_CATEGORY);
    return Object.entries(PIECES_BY_CATEGORY)
      .map(([catKey, { label, pieces }]) => {
        const filtered = pieces.filter(([, def]) =>
          def.name.toLowerCase().includes(normalizedSearch) ||
          def.description.toLowerCase().includes(normalizedSearch)
        );
        return [catKey, { label, pieces: filtered }] as [string, typeof PIECES_BY_CATEGORY[string]];
      })
      .filter(([, { pieces }]) => pieces.length > 0);
  }, [normalizedSearch]);

  const totalPieces = Object.values(PIECES_BY_CATEGORY).reduce((s, c) => s + c.pieces.length, 0);

  return (
    <div className="w-[260px] glass-panel flex flex-col overflow-hidden border-r border-white/6">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[11px] font-semibold tracking-widest uppercase text-[#888899]">
            Catalogue
          </h2>
          <span className="badge badge-muted text-[9px]">{totalPieces}</span>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une pièce..."
            className="neo-input w-full text-[11px] pl-8 pr-7 py-[7px]"
          />
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555566]" />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555566] hover:text-white/70 transition-colors p-0.5"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {filteredCategories.length === 0 && (
          <div className="text-center py-8 px-6">
            <div className="text-2xl mb-2 opacity-20">🔍</div>
            <p className="text-[11px] text-[#555566]">
              Aucune pièce pour « {search} »
            </p>
          </div>
        )}
        {filteredCategories.map(([catKey, { label, pieces }]) => {
          const isOpen = !!normalizedSearch || openCategories.has(catKey);
          const color = CATEGORY_COLORS[catKey] || '#888899';
          return (
            <div key={catKey}>
              <button
                onClick={() => !normalizedSearch && toggle(catKey)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors group"
              >
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-mono shrink-0"
                  style={{
                    background: `${color}12`,
                    color: color,
                    border: `1px solid ${color}25`,
                  }}
                >
                  {CATEGORY_ICONS[catKey] || '■'}
                </span>
                <span className="text-[12px] font-medium flex-1 text-white/80 group-hover:text-white/95 transition-colors">
                  {label}
                </span>
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                  style={{
                    background: `${color}10`,
                    color: `${color}99`,
                  }}
                >
                  {pieces.length}
                </span>
                {!normalizedSearch && (
                  <ChevronDown
                    size={12}
                    className={`text-[#555566] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                )}
              </button>
              {isOpen && (
                <div className="px-2 pb-1.5 animate-accordion">
                  {pieces.map(([defId, def]) => (
                    <PaletteItem key={defId} definitionId={defId} definition={def} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaletteItem({ definitionId, definition }: { definitionId: string; definition: PieceDefinition }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('definitionId', definitionId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="palette-item glass-card px-2.5 py-2 mb-1 flex items-center gap-2.5 rounded-lg"
      title={`${definition.name}\n${definition.description}\n${definition.widthM}m × ${definition.heightM}m — ${definition.weightKg} kg`}
    >
      <GripVertical size={10} className="text-[#333344] shrink-0" />
      <PieceMiniature definition={definition} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate text-white/80">{definition.name}</div>
        <div className="text-[9px] text-[#555566] flex items-center gap-1.5">
          <span>{definition.widthM}×{definition.heightM}m</span>
          <span className="text-[#333344]">·</span>
          <span className="text-[#e8c840]/60">{definition.weightKg} kg</span>
        </div>
      </div>
    </div>
  );
}

function PieceMiniature({ definition }: { definition: PieceDefinition }) {
  const S = 32;
  const cx = S / 2;
  const cy = S / 2;

  const renderShape = () => {
    switch (definition.category) {
      case 'standard': {
        const tw = 4;
        const th = Math.min(S - 6, Math.max(10, definition.heightM * 9));
        const rosettes = Math.floor(definition.heightM / 0.5) + 1;
        return (
          <>
            <defs>
              <linearGradient id={`sg-${definition.heightM}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#bcc8d4" />
                <stop offset="40%" stopColor="#9eaab8" />
                <stop offset="100%" stopColor="#6b7a8a" />
              </linearGradient>
            </defs>
            <rect x={cx - tw / 2} y={cy - th / 2} width={tw} height={th} rx={1} fill={`url(#sg-${definition.heightM})`} stroke="#5a6a7a" strokeWidth={0.4} />
            {Array.from({ length: Math.min(rosettes, 5) }, (_, i) => {
              const ry = cy - th / 2 + (i + 0.5) * (th / Math.min(rosettes, 5));
              return <circle key={i} cx={cx} cy={ry} r={1.8} fill="#d4a830" stroke="#b08820" strokeWidth={0.3} />;
            })}
          </>
        );
      }
      case 'ledger': {
        const bw = Math.min(S - 6, Math.max(12, definition.widthM * 7));
        return (
          <>
            <rect x={cx - bw / 2} y={cy - 1.5} width={bw} height={3} rx={1.5} fill="#9eaab8" stroke="#5a6a7a" strokeWidth={0.3} />
            <rect x={cx - bw / 2 - 1.5} y={cy - 3} width={3} height={6} rx={0.8} fill="#8090a0" stroke="#607080" strokeWidth={0.3} />
            <rect x={cx + bw / 2 - 1.5} y={cy - 3} width={3} height={6} rx={0.8} fill="#8090a0" stroke="#607080" strokeWidth={0.3} />
          </>
        );
      }
      case 'guardrail': {
        const bw = Math.min(S - 6, Math.max(12, definition.widthM * 7));
        return (
          <>
            <rect x={cx - bw / 2} y={cy - 1.5} width={bw} height={3} rx={1.5} fill="#e0b820" stroke="#a08008" strokeWidth={0.3} />
            <rect x={cx - bw / 2 - 1} y={cy - 3} width={3} height={6} rx={0.6} fill="#8090a0" strokeWidth={0.2} />
            <rect x={cx + bw / 2 - 2} y={cy - 3} width={3} height={6} rx={0.6} fill="#8090a0" strokeWidth={0.2} />
          </>
        );
      }
      case 'diagonal': {
        const dw = Math.min(S - 8, Math.max(8, definition.widthM * 5));
        const dh = Math.min(S - 8, Math.max(8, definition.heightM * 5));
        return (
          <>
            <line x1={cx - dw / 2} y1={cy + dh / 2} x2={cx + dw / 2} y2={cy - dh / 2} stroke="#9eaab8" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={cx - dw / 2} cy={cy + dh / 2} r={2} fill="#8090a0" stroke="#607080" strokeWidth={0.3} />
            <circle cx={cx + dw / 2} cy={cy - dh / 2} r={2} fill="#8090a0" stroke="#607080" strokeWidth={0.3} />
          </>
        );
      }
      case 'platform': {
        const pw = Math.min(S - 4, Math.max(12, definition.widthM * 7));
        const ph = 4;
        return (
          <>
            <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} rx={1} fill="#a08050" stroke="#806030" strokeWidth={0.4} />
            <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph * 0.3} rx={1} fill="#c0a070" opacity={0.4} />
          </>
        );
      }
      case 'baseJack': {
        const rodH = Math.min(S - 8, Math.max(8, definition.heightM * 14));
        return (
          <>
            <rect x={cx - 5} y={cy + rodH / 2 - 2} width={10} height={2} rx={0.5} fill="#7a8a9a" stroke="#5a6a7a" strokeWidth={0.3} />
            <rect x={cx - 1} y={cy - rodH / 2 + 2} width={2} height={rodH - 3} rx={0.5} fill="#8a9aaa" stroke="#6a7a8a" strokeWidth={0.2} />
            <circle cx={cx} cy={cy - rodH / 2 + 2} r={2} fill="#9eaab8" stroke="#5a6a7a" strokeWidth={0.3} />
          </>
        );
      }
      default: {
        return <rect x={6} y={6} width={S - 12} height={S - 12} rx={2} fill={definition.color} opacity={0.6} />;
      }
    }
  };

  return (
    <svg width={S} height={S} className="shrink-0 opacity-80">
      {renderShape()}
    </svg>
  );
}
