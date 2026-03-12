import { useState, useRef } from 'react';
import {
  FilePlus, FolderOpen, Save, Download, Upload, Undo2, Redo2,
  ClipboardList, Hexagon, Ruler,
} from 'lucide-react';
import { useEditorStore, VIEW_LABELS } from '../stores/editorStore';
import type { ViewMode } from '../stores/editorStore';
import { saveProject, loadAllProjects, loadProject, exportJSON } from '../engine/serializer';
import { calculateBOM } from '../engine/materialCalculator';

const VIEW_MODES: ViewMode[] = ['face', 'side', 'top'];
const VIEW_ICONS: Record<ViewMode, string> = { face: '▣', side: '▥', top: '⬡' };

export function ProjectToolbar({ onBack }: { onBack?: () => void } = {}) {
  const {
    projectName, setProjectName, viewMode, setViewMode, viewPieces,
    getAllPieces, clearAll, setShowBOM, setShowPlanner,
    loadProject: loadProjectIntoStore,
    isDirty, markSaved, addToast, undo, redo, history, historyIndex,
  } = useEditorStore();
  const [showOpen, setShowOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const allPieces = getAllPieces();
  const bom = calculateBOM(allPieces);

  const handleSave = () => {
    saveProject(projectName, viewPieces);
    markSaved();
    addToast('Projet sauvegardé', 'success');
  };

  const handleNew = () => {
    if (allPieces.length > 0 && !confirm('Créer un nouveau projet ? Les modifications non sauvegardées seront perdues.')) return;
    clearAll();
    setProjectName('Sans titre');
  };

  const handleExport = () => {
    exportJSON(projectName, viewPieces);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.viewPieces) {
          loadProjectIntoStore({ viewPieces: data.viewPieces });
        } else if (data.pieces && Array.isArray(data.pieces)) {
          loadProjectIntoStore({ pieces: data.pieces });
        }
        if (data.name) setProjectName(data.name);
      } catch {
        alert('Fichier invalide');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <div className="glass-panel flex items-center gap-1.5 px-3 py-1.5 border-b border-black/[0.06]">
        {/* Bouton retour accueil */}
        {onBack && (
          <>
            <button onClick={onBack} className="glass-button !px-2 !py-1.5 text-[11px] flex items-center gap-1 text-[#6e6e73] hover:text-[#1d1d1f]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Accueil
            </button>
            <div className="divider-v" />
          </>
        )}
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <div className="w-7 h-7 rounded-lg bg-[#F2A900]/10 border border-[#F2A900]/20 flex items-center justify-center">
            <Hexagon size={14} className="text-[#F2A900]" strokeWidth={2.5} />
          </div>
          <div className="hidden sm:block">
            <span className="text-xs font-bold tracking-wide text-[#1d1d1f]">Échaf'</span>
            <span className="text-xs font-light tracking-wide text-[#c88800] ml-0.5">3D</span>
          </div>
        </div>

        <div className="divider-v" />

        {/* File actions */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton icon={<FilePlus size={14} />} tooltip="Nouveau" onClick={handleNew} />
          <ToolbarButton icon={<FolderOpen size={14} />} tooltip="Ouvrir" onClick={() => setShowOpen(!showOpen)} />
          <ToolbarButton icon={<Save size={14} />} tooltip="Sauvegarder (Ctrl+S)" onClick={handleSave} />
          <ToolbarButton icon={<Download size={14} />} tooltip="Exporter JSON" onClick={handleExport} />
          <ToolbarButton icon={<Upload size={14} />} tooltip="Importer" onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
        </div>

        <div className="divider-v" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={<Undo2 size={14} />}
            tooltip="Annuler (Ctrl+Z)"
            onClick={undo}
            disabled={historyIndex < 0}
          />
          <ToolbarButton
            icon={<Redo2 size={14} />}
            tooltip="Rétablir (Ctrl+Shift+Z)"
            onClick={redo}
            disabled={historyIndex >= history.length - 2}
          />
        </div>

        <div className="divider-v" />

        {/* View mode tabs */}
        <div className="flex items-center bg-black/[0.03] rounded-lg p-0.5 gap-0.5">
          {VIEW_MODES.map((mode) => {
            const isActive = viewMode === mode;
            const count = viewPieces[mode].length;
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`relative text-[11px] px-3 py-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-white text-[#c88800] font-semibold shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03]'
                }`}
              >
                <span className="text-[10px] opacity-60">{VIEW_ICONS[mode]}</span>
                {VIEW_LABELS[mode]}
                {count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                    isActive
                      ? 'bg-[#F2A900]/10 text-[#c88800]'
                      : 'bg-black/[0.04] text-[#aeaeb2]'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="divider-v" />

        {/* Project name */}
        <div className="relative">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="neo-input text-xs w-36 pr-4"
          />
          {isDirty && (
            <span
              className="absolute top-1/2 -translate-y-1/2 right-2 w-2 h-2 bg-[#F2A900] rounded-full animate-pulse-glow"
              title="Modifications non sauvegardées"
            />
          )}
        </div>

        <div className="flex-1" />

        {/* Planner */}
        <button
          onClick={() => setShowPlanner(true)}
          className="glass-button gold text-[11px]"
        >
          <Ruler size={13} />
          Planificateur
        </button>

        {/* BOM */}
        <button
          onClick={() => setShowBOM(true)}
          className="glass-button active text-[11px]"
        >
          <ClipboardList size={13} />
          BOM
          <span className="badge-muted text-[9px] py-0 px-1.5 rounded-full">
            {bom.totalPieces}
          </span>
        </button>
      </div>

      {/* Open project dropdown */}
      {showOpen && (
        <OpenProjectDropdown
          onClose={() => setShowOpen(false)}
          onLoad={(name) => {
            const project = loadProject(name);
            if (project) {
              loadProjectIntoStore(project);
              setProjectName(project.name);
            }
            setShowOpen(false);
          }}
        />
      )}
    </>
  );
}

function ToolbarButton({
  icon, tooltip, onClick, disabled,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-tooltip={tooltip}
      className={`p-1.5 rounded-md transition-all duration-150 ${
        disabled
          ? 'opacity-20 cursor-not-allowed'
          : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] active:scale-90'
      }`}
    >
      {icon}
    </button>
  );
}

function OpenProjectDropdown({
  onClose,
  onLoad,
}: {
  onClose: () => void;
  onLoad: (name: string) => void;
}) {
  const projects = loadAllProjects();

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute left-[140px] top-[44px] glass-panel rounded-xl w-72 py-2 shadow-2xl animate-modal-panel border border-black/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 pb-2 mb-1 border-b border-black/[0.06]">
          <span className="section-label">Projets sauvegardés</span>
        </div>
        {projects.length === 0 ? (
          <p className="px-4 py-4 text-xs text-[#aeaeb2] text-center">Aucun projet sauvegardé</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.name}
                onClick={() => onLoad(p.name)}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-black/[0.03] flex justify-between items-center transition-colors"
              >
                <div>
                  <span className="font-medium text-[#1d1d1f]">{p.name}</span>
                </div>
                <span className="text-[10px] text-[#aeaeb2]">
                  {new Date(p.savedAt).toLocaleDateString('fr-FR')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
