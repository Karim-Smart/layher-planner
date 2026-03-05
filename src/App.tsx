import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X, Keyboard } from 'lucide-react';
import { ProjectToolbar } from './panels/ProjectToolbar';
import { PiecePalette } from './panels/PiecePalette';
import { EditorCanvas } from './canvas/EditorCanvas';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { StatusBar } from './panels/StatusBar';
import { MaterialList } from './panels/MaterialList';
import { PlannerView } from './panels/PlannerView';
import { useEditorStore } from './stores/editorStore';
import { saveProject } from './engine/serializer';

const TOAST_ICONS = {
  success: <CheckCircle size={13} />,
  warning: <AlertTriangle size={13} />,
  info: <Info size={13} />,
};

function ToastContainer() {
  const toasts = useEditorStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-medium shadow-xl backdrop-blur-md animate-toast ${
            t.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 shadow-emerald-500/10' :
            t.type === 'warning' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20 shadow-amber-500/10' :
            'bg-white/8 text-white/75 border border-white/10'
          }`}
        >
          {TOAST_ICONS[t.type]}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    ['Suppr / Retour', 'Supprimer la sélection'],
    ['R', 'Rotation'],
    ['Ctrl+D', 'Dupliquer'],
    ['Ctrl+Z', 'Annuler'],
    ['Ctrl+Shift+Z', 'Rétablir'],
    ['Ctrl+S', 'Sauvegarder'],
    ['Shift+0', 'Réinitialiser la vue'],
    ['Clic gauche', 'Panoramique'],
    ['Shift+Clic', 'Sélection rectangle'],
    ['Molette', 'Zoom'],
    ['?', 'Aide raccourcis'],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-2xl w-[420px] p-5 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center">
              <Keyboard size={15} className="text-[#60a5fa]" />
            </div>
            <h2 className="text-sm font-semibold">Raccourcis clavier</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/[0.06] text-[#888899] hover:text-white/80 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-0.5">
          {shortcuts.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-white/[0.02] transition-colors">
              <span className="text-[11px] text-[#888899]">{desc}</span>
              <kbd className="text-[10px]">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const {
    selectedIds, removePiece, rotatePiece, duplicatePiece,
    undo, redo, resetView, projectName, viewPieces, isDirty,
    markSaved, addToast,
  } = useEditorStore();
  const [showHelp, setShowHelp] = useState(false);

  // Autosave every 30s
  const autosaveRef = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    autosaveRef.current = setInterval(() => {
      const state = useEditorStore.getState();
      if (state.isDirty) {
        saveProject(state.projectName, state.viewPieces);
        state.markSaved();
      }
    }, 30_000);
    return () => clearInterval(autosaveRef.current);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const count = selectedIds.size;
        selectedIds.forEach((id) => removePiece(id));
        if (count > 0) addToast(`${count} pièce${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}`, 'info');
      }
      if (e.key === 'r' || e.key === 'R') {
        selectedIds.forEach((id) => rotatePiece(id));
      }
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        selectedIds.forEach((id) => duplicatePiece(id));
        if (selectedIds.size > 0) addToast('Pièce dupliquée', 'success');
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        redo();
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveProject(projectName, viewPieces);
        markSaved();
        addToast('Projet sauvegardé', 'success');
      }
      if (e.key === ')' || (e.key === '0' && e.shiftKey)) {
        resetView();
        addToast('Vue réinitialisée', 'info');
      }
      if (e.key === '?') {
        setShowHelp((p) => !p);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, removePiece, rotatePiece, duplicatePiece, undo, redo, resetView, projectName, viewPieces, isDirty, markSaved, addToast]);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f]">
      <ProjectToolbar />
      <div className="flex flex-1 overflow-hidden">
        <PiecePalette />
        <EditorCanvas />
        <PropertiesPanel />
      </div>
      <StatusBar />
      <MaterialList />
      <PlannerView />
      <ToastContainer />
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
