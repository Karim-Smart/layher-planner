import { useState } from 'react';
import { Magnet, Crosshair, Cloud, CloudOff } from 'lucide-react';
import { useEditorStore, VIEW_LABELS } from '../stores/editorStore';
import { calculateBOM } from '../engine/materialCalculator';
import { ALL_PIECES } from '../catalog/definitions';

export function StatusBar() {
  const {
    viewMode, viewPieces, zoom, setZoom, snapToGrid, setSnapToGrid,
    selectedIds, mouseX, mouseY, isDirty, lastSavedAt,
  } = useEditorStore();
  const pieces = viewPieces[viewMode];
  const bom = calculateBOM(pieces);
  const [editingZoom, setEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState('');

  const selectedCount = selectedIds.size;
  const selectedWeight = selectedCount > 0
    ? pieces
        .filter((p) => selectedIds.has(p.id))
        .reduce((sum, p) => sum + (ALL_PIECES[p.definitionId]?.weightKg ?? 0), 0)
    : 0;

  const savedLabel = lastSavedAt ? formatTimeAgo(lastSavedAt) : null;

  const handleZoomSubmit = () => {
    const val = parseInt(zoomInput, 10);
    if (!isNaN(val) && val >= 10 && val <= 500) {
      setZoom(val / 100);
    }
    setEditingZoom(false);
  };

  return (
    <div className="glass-panel flex items-center gap-2 px-3 py-1 border-t border-white/6 text-[10px] select-none">
      {/* View label */}
      <span className="text-[#e8c840] font-semibold text-[10px] tracking-wide">
        {VIEW_LABELS[viewMode]}
      </span>

      <Sep />

      {/* Zoom */}
      {editingZoom ? (
        <input
          autoFocus
          value={zoomInput}
          onChange={(e) => setZoomInput(e.target.value)}
          onBlur={handleZoomSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleZoomSubmit()}
          className="w-12 bg-white/10 border border-white/20 rounded px-1 text-center text-[10px] text-white outline-none"
        />
      ) : (
        <button
          onClick={() => { setEditingZoom(true); setZoomInput(String(Math.round(zoom * 100))); }}
          className="text-[#888899] hover:text-white transition-colors font-mono"
          title="Cliquer pour modifier le zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
      )}

      <Sep />

      {/* Piece count */}
      <span className="text-[#888899]">
        {bom.totalPieces} pièce{bom.totalPieces !== 1 ? 's' : ''}
      </span>

      <Sep />

      {/* Weight */}
      <span className="text-[#e8c840]/70 font-medium">{bom.totalWeight} kg</span>

      {/* Selection */}
      {selectedCount > 0 && (
        <>
          <Sep />
          <span className="text-[#60a5fa] font-medium flex items-center gap-1">
            <Crosshair size={10} />
            {selectedCount} sel. · {Math.round(selectedWeight * 10) / 10} kg
          </span>
        </>
      )}

      <div className="flex-1" />

      {/* Mouse coords */}
      <span className="font-mono text-[9px] text-[#444455] w-24 text-right tabular-nums">
        {mouseX.toFixed(2)}, {mouseY.toFixed(2)} m
      </span>

      <Sep />

      {/* Snap toggle */}
      <button
        onClick={() => setSnapToGrid(!snapToGrid)}
        className={`flex items-center gap-1 transition-all duration-200 ${
          snapToGrid
            ? 'text-[#60a5fa]'
            : 'text-[#444455] hover:text-[#666677]'
        }`}
      >
        <Magnet size={10} />
        <span className="text-[10px]">{snapToGrid ? 'ON' : 'OFF'}</span>
      </button>

      <Sep />

      {/* Save status */}
      <div className="flex items-center gap-1">
        {isDirty ? (
          <>
            <CloudOff size={10} className="text-[#e8c840]/60" />
            <span className="text-[#e8c840]/60">Non sauvé</span>
          </>
        ) : savedLabel ? (
          <>
            <Cloud size={10} className="text-[#444455]" />
            <span className="text-[#444455]">{savedLabel}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Sep() {
  return <span className="w-px h-3 bg-white/6 mx-0.5" />;
}

function formatTimeAgo(timestamp: number): string {
  const sec = Math.floor((Date.now() - timestamp) / 1000);
  if (sec < 60) return 'à l\'instant';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h`;
}
