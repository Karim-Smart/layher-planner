import { useState, useMemo } from 'react';
import { Search, X, Download, ClipboardList } from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { calculateBOM, exportCSV } from '../engine/materialCalculator';
import type { BOMEntry } from '../engine/materialCalculator';
import { PIECES_BY_CATEGORY } from '../catalog/definitions';

type SortKey = 'name' | 'quantity' | 'unitWeight' | 'totalWeight' | 'category';
type SortDir = 'asc' | 'desc';

export function MaterialList() {
  const { showBOM, setShowBOM, getAllPieces } = useEditorStore();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('category');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  if (!showBOM) return null;

  const bom = calculateBOM(getAllPieces());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredEntries = useMemo(() => {
    let entries = bom.entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      entries = entries.filter((e) => e.name.toLowerCase().includes(q));
    }
    const sorted = [...entries].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'quantity': cmp = a.quantity - b.quantity; break;
        case 'unitWeight': cmp = a.unitWeight - b.unitWeight; break;
        case 'totalWeight': cmp = a.totalWeight - b.totalWeight; break;
        case 'category': cmp = a.category.localeCompare(b.category) || a.name.localeCompare(b.name); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [bom.entries, search, sortKey, sortDir]);

  const handleExportCSV = () => {
    const csv = exportCSV(bom);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'liste-materiel.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategoryLabel = (cat: string) =>
    Object.values(PIECES_BY_CATEGORY).find((c) =>
      c.pieces.some(([, d]) => d.category === cat)
    )?.label ?? cat;

  let lastCat = '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-modal-backdrop">
      <div className="glass-panel rounded-2xl w-[680px] max-h-[85vh] flex flex-col animate-modal-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#007aff]/10 border border-[#007aff]/20 flex items-center justify-center">
              <ClipboardList size={16} className="text-[#007aff]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#1d1d1f]">Liste de matériel</h2>
              <p className="text-[9px] text-[#aeaeb2] mt-0.5">
                {bom.totalPieces} pièces · {bom.entries.length} références · toutes vues
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowBOM(false)}
            className="p-1.5 rounded-md hover:bg-black/[0.04] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search + stats */}
        <div className="px-5 py-3 border-b border-black/[0.04] flex items-center gap-3">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par nom..."
              className="neo-input w-full text-[11px] pl-8"
            />
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#aeaeb2]" />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#aeaeb2] hover:text-[#1d1d1f] transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="badge badge-gold">
            {bom.totalWeight} kg
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2 opacity-15">📦</div>
              <p className="text-[11px] text-[#aeaeb2]">
                {search ? `Aucun résultat pour « ${search} »` : 'Aucune pièce sur le canvas'}
              </p>
            </div>
          ) : (
            <table className="neo-table">
              <thead>
                <tr>
                  <SortHeader label="Pièce" sortKey="name" currentKey={sortKey} dir={sortDir} onToggle={toggleSort} align="left" />
                  <SortHeader label="Qté" sortKey="quantity" currentKey={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-14" />
                  <SortHeader label="Poids unit." sortKey="unitWeight" currentKey={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-24" />
                  <SortHeader label="Poids total" sortKey="totalWeight" currentKey={sortKey} dir={sortDir} onToggle={toggleSort} align="right" className="w-24" />
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const showCatHeader = sortKey === 'category' && entry.category !== lastCat;
                  if (sortKey === 'category') lastCat = entry.category;
                  return (
                    <BOMRow key={entry.definitionId} entry={entry} showCatHeader={showCatHeader} getCategoryLabel={getCategoryLabel} />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-black/[0.06]">
          <div className="text-[12px] flex items-center gap-2">
            <span className="text-[#86868b]">Total :</span>
            <span className="font-semibold text-[#1d1d1f]">{bom.totalPieces} pièces</span>
            <span className="text-[#d1d1d6]">·</span>
            <span className="font-semibold text-[#c88800]">{bom.totalWeight} kg</span>
          </div>
          <button onClick={handleExportCSV} className="glass-button text-[11px]">
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label, sortKey, currentKey, dir, onToggle, align, className,
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; dir: SortDir;
  onToggle: (key: SortKey) => void; align: 'left' | 'right'; className?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={`cursor-pointer hover:text-[#1d1d1f] transition-colors select-none ${align === 'right' ? 'text-right' : 'text-left'} ${className ?? ''}`}
      onClick={() => onToggle(sortKey)}
    >
      {label}
      {isActive && <span className="ml-1 text-[#c88800] text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

function BOMRow({ entry, showCatHeader, getCategoryLabel }: {
  entry: BOMEntry; showCatHeader: boolean; getCategoryLabel: (cat: string) => string;
}) {
  return (
    <>
      {showCatHeader && (
        <tr>
          <td
            colSpan={4}
            className="pt-4 pb-1.5 text-[9px] font-semibold text-[#c88800] uppercase tracking-wider"
          >
            {getCategoryLabel(entry.category)}
          </td>
        </tr>
      )}
      <tr>
        <td className="pl-3 text-[#1d1d1f]/80">{entry.name}</td>
        <td className="text-right font-semibold tabular-nums">{entry.quantity}</td>
        <td className="text-right text-[#86868b] tabular-nums">{entry.unitWeight} kg</td>
        <td className="text-right tabular-nums">{entry.totalWeight} kg</td>
      </tr>
    </>
  );
}
