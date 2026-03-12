import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X, Keyboard, ArrowLeft } from 'lucide-react';
import { ProjectToolbar } from './panels/ProjectToolbar';
import { PiecePalette } from './panels/PiecePalette';
import { EditorCanvas } from './canvas/EditorCanvas';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { StatusBar } from './panels/StatusBar';
import { MaterialList } from './panels/MaterialList';
import { PlannerView } from './panels/PlannerView';
import { useEditorStore } from './stores/editorStore';
import { saveProject } from './engine/serializer';
import LigneComplete from './calo/components/LigneComplete/index.jsx';

type Section = 'home' | 'echaf' | 'calo';

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
            t.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            t.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            'bg-white text-[#1d1d1f] border border-black/10 shadow-lg'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="glass-panel rounded-2xl w-[420px] p-5 animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#007aff]/10 border border-[#007aff]/20 flex items-center justify-center">
              <Keyboard size={15} className="text-[#007aff]" />
            </div>
            <h2 className="text-sm font-semibold text-[#1d1d1f]">Raccourcis clavier</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/[0.04] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-0.5">
          {shortcuts.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-black/[0.02] transition-colors">
              <span className="text-[11px] text-[#86868b]">{desc}</span>
              <kbd className="text-[10px]">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Page d'accueil ─── */

function HomePage({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const sections = [
    {
      id: 'echaf' as Section,
      title: 'Échaf\' 3D',
      desc: 'Planification d\'échafaudages Layher — éditeur canvas 2D/3D avec catalogue de pièces, snap magnétique et calcul BOM',
      color: 'from-amber-500 to-orange-600',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      ),
    },
    {
      id: 'calo' as Section,
      title: 'Calorifugeur',
      desc: 'Ligne complète de tuyauterie — éditeur de pièces, vues 2D/3D, patrons de découpe tôle et laine, récapitulatif matériaux',
      color: 'from-blue-500 to-indigo-600',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16 L4 10 A6 6 0 0 1 10 4 L20 4" />
          <circle cx="4" cy="18" r="2" />
          <circle cx="20" cy="4" r="2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-[#f5f5f7]">
      {/* Header */}
      <header className="glass-panel px-6 py-4 flex items-center gap-3 border-b border-black/[0.06]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
          EB
        </div>
        <div>
          <h1 className="text-sm font-semibold text-[#1d1d1f]">Échaf' Belleville</h1>
          <p className="text-[10px] text-[#86868b]">Outils métier — échafaudage & calorifuge</p>
        </div>
      </header>

      {/* Cards */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => onNavigate(s.id)}
              className="group glass-card p-6 text-left hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white shadow-lg mb-4 group-hover:shadow-xl transition-shadow`}>
                {s.icon}
              </div>
              <h2 className="text-lg font-semibold text-[#1d1d1f] mb-1">{s.title}</h2>
              <p className="text-xs text-[#86868b] leading-relaxed">{s.desc}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ─── Section Calorifugeur ─── */

function CaloSection({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-screen flex flex-col bg-[#f5f5f7]">
      {/* Header */}
      <header className="glass-panel px-4 py-3 flex items-center gap-3 border-b border-black/[0.06]">
        <button
          onClick={onBack}
          className="glass-button !px-2.5 !py-1.5"
        >
          <ArrowLeft size={14} />
          <span className="text-[11px]">Accueil</span>
        </button>
        <div className="w-px h-5 bg-black/[0.06]" />
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
          C
        </div>
        <div>
          <h1 className="text-sm font-semibold text-[#1d1d1f]">Calorifugeur — Ligne Complète</h1>
          <p className="text-[10px] text-[#86868b]">Construire une ligne et générer les patrons de découpe</p>
        </div>
      </header>

      {/* Contenu */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-4">
          <LigneComplete />
        </div>
      </main>
    </div>
  );
}

/* ─── Section Échafaudage (le code existant) ─── */

function EchafSection({ onBack }: { onBack: () => void }) {
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
    <div className="h-screen flex flex-col bg-[#f5f5f7]">
      <ProjectToolbar onBack={onBack} />
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

/* ─── App principal ─── */

export default function App() {
  const [section, setSection] = useState<Section>('home');

  if (section === 'echaf') return <EchafSection onBack={() => setSection('home')} />;
  if (section === 'calo') return <CaloSection onBack={() => setSection('home')} />;
  return <HomePage onNavigate={setSection} />;
}
