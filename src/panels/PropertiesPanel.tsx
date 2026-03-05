import {
  RotateCw, Copy, Trash2, MousePointer, AlignLeft, AlignRight,
  AlignStartVertical, AlignEndVertical, AlignCenterHorizontal,
  AlignCenterVertical, ArrowLeftRight, ArrowUpDown,
} from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { ALL_PIECES } from '../catalog/definitions';
import { PIECES_BY_CATEGORY } from '../catalog/definitions';

export function PropertiesPanel() {
  const {
    viewMode, viewPieces, selectedIds,
    removePiece, rotatePiece, duplicatePiece, updatePiecePosition,
    pushHistory, addToast,
  } = useEditorStore();

  const pieces = viewPieces[viewMode];
  const selectedPieces = pieces.filter((p) => selectedIds.has(p.id));

  // Empty state
  if (selectedPieces.length === 0) {
    return (
      <div className="w-[280px] glass-panel flex flex-col border-l border-white/6">
        <div className="px-4 py-3 border-b border-white/6">
          <h2 className="text-[11px] font-semibold tracking-widest uppercase text-[#888899]">
            Propriétés
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/[0.03] border border-white/6 flex items-center justify-center">
              <MousePointer size={18} className="text-[#444455]" />
            </div>
            <p className="text-[11px] text-[#555566] leading-relaxed">
              Sélectionne une pièce pour voir ses propriétés
            </p>
            <p className="text-[9px] text-[#333344] mt-2">
              Glisse depuis le catalogue ou Shift+clic pour multi-sélection
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Multi-select
  if (selectedPieces.length > 1) {
    const totalWeight = selectedPieces.reduce(
      (sum, p) => sum + (ALL_PIECES[p.definitionId]?.weightKg ?? 0), 0
    );
    const avgX = selectedPieces.reduce((s, p) => s + p.x, 0) / selectedPieces.length;
    const avgY = selectedPieces.reduce((s, p) => s + p.y, 0) / selectedPieces.length;

    const alignLeft = () => { pushHistory(); const v = Math.min(...selectedPieces.map(p=>p.x)); selectedPieces.forEach(p=>updatePiecePosition(p.id,v,p.y)); addToast('Aligné à gauche','info'); };
    const alignRight = () => { pushHistory(); const v = Math.max(...selectedPieces.map(p=>p.x)); selectedPieces.forEach(p=>updatePiecePosition(p.id,v,p.y)); addToast('Aligné à droite','info'); };
    const alignTop = () => { pushHistory(); const v = Math.min(...selectedPieces.map(p=>p.y)); selectedPieces.forEach(p=>updatePiecePosition(p.id,p.x,v)); addToast('Aligné en haut','info'); };
    const alignBottom = () => { pushHistory(); const v = Math.max(...selectedPieces.map(p=>p.y)); selectedPieces.forEach(p=>updatePiecePosition(p.id,p.x,v)); addToast('Aligné en bas','info'); };
    const alignCenterH = () => { pushHistory(); selectedPieces.forEach(p=>updatePiecePosition(p.id,avgX,p.y)); addToast('Centré H','info'); };
    const alignCenterV = () => { pushHistory(); selectedPieces.forEach(p=>updatePiecePosition(p.id,p.x,avgY)); addToast('Centré V','info'); };
    const distributeH = () => { if (selectedPieces.length<3)return; pushHistory(); const s=[...selectedPieces].sort((a,b)=>a.x-b.x); const mn=s[0].x; const mx=s[s.length-1].x; const step=(mx-mn)/(s.length-1); s.forEach((p,i)=>updatePiecePosition(p.id,mn+i*step,p.y)); addToast('Distribué H','info'); };
    const distributeV = () => { if (selectedPieces.length<3)return; pushHistory(); const s=[...selectedPieces].sort((a,b)=>a.y-b.y); const mn=s[0].y; const mx=s[s.length-1].y; const step=(mx-mn)/(s.length-1); s.forEach((p,i)=>updatePiecePosition(p.id,p.x,mn+i*step)); addToast('Distribué V','info'); };

    return (
      <div className="w-[280px] glass-panel flex flex-col border-l border-white/6">
        <div className="px-4 py-3 border-b border-white/6">
          <h2 className="text-[11px] font-semibold tracking-widest uppercase text-[#888899]">
            Propriétés
          </h2>
        </div>
        <div className="p-3 flex flex-col gap-3 overflow-y-auto">
          {/* Summary */}
          <div className="glass-card p-3">
            <div className="text-[12px] font-semibold">{selectedPieces.length} pièces</div>
            <div className="flex gap-4 mt-1.5 text-[10px] text-[#888899]">
              <div>Poids <span className="text-[#e8c840] font-medium ml-1">{Math.round(totalWeight * 10) / 10} kg</span></div>
              <div>Centre <span className="text-white/60 font-mono ml-1">{avgX.toFixed(1)}, {avgY.toFixed(1)}</span></div>
            </div>
          </div>

          {/* Alignment */}
          <div className="glass-card p-3">
            <h4 className="section-label mb-2">Aligner</h4>
            <div className="grid grid-cols-3 gap-1">
              <AlignBtn icon={<AlignLeft size={12} />} title="Gauche" onClick={alignLeft} />
              <AlignBtn icon={<AlignCenterHorizontal size={12} />} title="Centre H" onClick={alignCenterH} />
              <AlignBtn icon={<AlignRight size={12} />} title="Droite" onClick={alignRight} />
              <AlignBtn icon={<AlignStartVertical size={12} />} title="Haut" onClick={alignTop} />
              <AlignBtn icon={<AlignCenterVertical size={12} />} title="Centre V" onClick={alignCenterV} />
              <AlignBtn icon={<AlignEndVertical size={12} />} title="Bas" onClick={alignBottom} />
            </div>
            {selectedPieces.length >= 3 && (
              <>
                <h4 className="section-label mb-2 mt-3">Distribuer</h4>
                <div className="grid grid-cols-2 gap-1">
                  <AlignBtn icon={<ArrowLeftRight size={12} />} title="Horizontal" onClick={distributeH} />
                  <AlignBtn icon={<ArrowUpDown size={12} />} title="Vertical" onClick={distributeV} />
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <button onClick={() => selectedPieces.forEach(p=>rotatePiece(p.id))} className="glass-button flex-1 text-[11px]">
                <RotateCw size={12} /> Rotation
              </button>
              <button onClick={() => { selectedPieces.forEach(p=>duplicatePiece(p.id)); addToast(`${selectedPieces.length} dupliquées`,'success'); }} className="glass-button flex-1 text-[11px]">
                <Copy size={12} /> Dupliquer
              </button>
            </div>
            <button
              onClick={() => { selectedPieces.forEach(p=>removePiece(p.id)); addToast(`${selectedPieces.length} supprimées`,'info'); }}
              className="glass-button danger text-[11px]"
            >
              <Trash2 size={12} /> Supprimer tout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Single piece
  const piece = selectedPieces[0];
  const def = ALL_PIECES[piece.definitionId];
  if (!def) return null;

  const catLabel =
    Object.values(PIECES_BY_CATEGORY).find((c) =>
      c.pieces.some(([id]) => id === piece.definitionId)
    )?.label ?? def.category;

  const connUsed = piece.connectionPoints.reduce((s, cp) => s + cp.connectedTo.length, 0);
  const connTotal = piece.connectionPoints.length;

  return (
    <div className="w-[280px] glass-panel flex flex-col border-l border-white/6">
      <div className="px-4 py-3 border-b border-white/6">
        <h2 className="text-[11px] font-semibold tracking-widest uppercase text-[#888899]">
          Propriétés
        </h2>
      </div>
      <div className="p-3 flex flex-col gap-3 overflow-y-auto">
        {/* Name */}
        <div>
          <h3 className="text-[14px] font-semibold text-white/90">{def.name}</h3>
          <span className="badge badge-gold text-[9px] mt-1">{catLabel}</span>
          <p className="text-[10px] text-[#555566] mt-1.5 leading-relaxed">{def.description}</p>
        </div>

        {/* Dimensions */}
        <div className="glass-card p-3">
          <h4 className="section-label mb-2">Dimensions</h4>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[11px]">
            <PropRow label="Largeur" value={`${def.widthM}m`} />
            <PropRow label="Hauteur" value={`${def.heightM}m`} />
            <PropRow label="Poids" value={`${def.weightKg} kg`} accent />
            <PropRow label="Rotation" value={`${piece.rotation}°`} />
          </div>
        </div>

        {/* Position */}
        <div className="glass-card p-3">
          <h4 className="section-label mb-2">Position</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-[#555566] block mb-1">X (m)</label>
              <input
                type="number"
                value={Math.round(piece.x * 100) / 100}
                onChange={(e) => updatePiecePosition(piece.id, parseFloat(e.target.value) || 0, piece.y)}
                onBlur={() => pushHistory()}
                className="neo-input w-full text-[11px] py-1.5"
                step={0.05}
              />
            </div>
            <div>
              <label className="text-[9px] text-[#555566] block mb-1">Y (m)</label>
              <input
                type="number"
                value={Math.round(piece.y * 100) / 100}
                onChange={(e) => updatePiecePosition(piece.id, piece.x, parseFloat(e.target.value) || 0)}
                onBlur={() => pushHistory()}
                className="neo-input w-full text-[11px] py-1.5"
                step={0.05}
              />
            </div>
          </div>
        </div>

        {/* Connections */}
        <div className="glass-card p-3">
          <h4 className="section-label mb-2">
            Connexions
            <span className="ml-1.5 text-[#888899] font-normal">{connUsed}/{connTotal}</span>
          </h4>
          <div className="flex flex-wrap gap-1">
            {def.connectionPoints.map((cp, i) => (
              <span key={i} className="badge badge-muted text-[9px]">
                {cp.type}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <button
              onClick={() => rotatePiece(piece.id)}
              className="glass-button flex-1 text-[11px]"
              disabled={def.constraints.allowedRotations.length <= 1}
            >
              <RotateCw size={12} /> Rotation
            </button>
            <button
              onClick={() => { duplicatePiece(piece.id); addToast('Dupliquée', 'success'); }}
              className="glass-button flex-1 text-[11px]"
            >
              <Copy size={12} /> Dupliquer
            </button>
          </div>
          <button
            onClick={() => { removePiece(piece.id); addToast('Supprimée', 'info'); }}
            className="glass-button danger text-[11px]"
          >
            <Trash2 size={12} /> Supprimer
          </button>
        </div>

        {/* Shortcuts */}
        <div className="text-[9px] text-[#444455] space-y-1 border-t border-white/4 pt-3">
          <ShortcutRow label="Rotation" keys="R" />
          <ShortcutRow label="Supprimer" keys="Del" />
          <ShortcutRow label="Dupliquer" keys="Ctrl+D" />
          <ShortcutRow label="Annuler" keys="Ctrl+Z" />
          <ShortcutRow label="Raccourcis" keys="?" />
        </div>
      </div>
    </div>
  );
}

function PropRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#555566]">{label}</span>
      <span className={accent ? 'text-[#e8c840] font-medium' : 'text-white/70'}>{value}</span>
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <kbd>{keys}</kbd>
    </div>
  );
}

function AlignBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="glass-button p-1.5 text-[#888899] hover:text-white/80"
    >
      {icon}
    </button>
  );
}
