import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { PlacedPiece, ConnectionPoint } from '../catalog/types';
import { ALL_PIECES } from '../catalog/definitions';

export type ViewMode = 'face' | 'side' | 'top';

const VIEW_LABELS: Record<ViewMode, string> = {
  face: 'Face',
  side: 'Côté',
  top: 'Dessus',
};

export { VIEW_LABELS };

interface HistoryEntry {
  pieces: Record<ViewMode, PlacedPiece[]>;
}

interface EditorState {
  // Current view
  viewMode: ViewMode;

  // Pieces per view
  viewPieces: Record<ViewMode, PlacedPiece[]>;
  selectedIds: Set<string>;

  // Project
  projectName: string;

  // Undo/redo
  history: HistoryEntry[];
  historyIndex: number;

  // Canvas
  zoom: number;
  panX: number;
  panY: number;

  // Mouse world coords
  mouseX: number;
  mouseY: number;

  // Snap
  snapToGrid: boolean;

  // Dragging state (for snap guides)
  draggingId: string | null;
  snapGuides: { x?: number; y?: number };

  // BOM modal
  showBOM: boolean;

  // Generator modal
  showGenerator: boolean;

  // Planner view
  showPlanner: boolean;

  // EDF viewer
  showEDF: boolean;

  // Dirty flag
  isDirty: boolean;
  lastSavedAt: number | null;

  // Toast
  toasts: { id: number; message: string; type: 'info' | 'success' | 'warning' }[];

  // All pieces across views (for BOM)
  getAllPieces: () => PlacedPiece[];

  // Actions
  setViewMode: (mode: ViewMode) => void;
  addPiece: (definitionId: string, x: number, y: number) => void;
  removePiece: (id: string) => void;
  updatePiecePosition: (id: string, x: number, y: number) => void;
  rotatePiece: (id: string) => void;
  duplicatePiece: (id: string) => void;
  selectPiece: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  setProjectName: (name: string) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  setShowBOM: (show: boolean) => void;
  setShowGenerator: (show: boolean) => void;
  setShowPlanner: (show: boolean) => void;
  setShowEDF: (show: boolean) => void;
  bulkAddPieces: (viewPieces: Record<ViewMode, { definitionId: string; x: number; y: number }[]>) => void;
  setMousePos: (x: number, y: number) => void;
  setDraggingId: (id: string | null) => void;
  setSnapGuides: (guides: { x?: number; y?: number }) => void;
  markSaved: () => void;
  addToast: (message: string, type?: 'info' | 'success' | 'warning') => void;
  resetView: () => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  clearAll: () => void;
  loadProject: (data: { viewPieces?: Record<ViewMode, PlacedPiece[]>; pieces?: PlacedPiece[] }) => void;
}

function createPlacedPiece(definitionId: string, x: number, y: number): PlacedPiece | null {
  const def = ALL_PIECES[definitionId];
  if (!def) return null;

  const connectionPoints: ConnectionPoint[] = def.connectionPoints.map((cp) => ({
    ...cp,
    connectedTo: [],
  }));

  return {
    id: uuidv4(),
    definitionId,
    x,
    y,
    rotation: 0,
    connectionPoints,
    isSelected: false,
  };
}

const MAX_HISTORY = 50;

const emptyViews = (): Record<ViewMode, PlacedPiece[]> => ({
  face: [],
  side: [],
  top: [],
});

export const useEditorStore = create<EditorState>((set, get) => ({
  viewMode: 'face',
  viewPieces: emptyViews(),
  selectedIds: new Set<string>(),
  projectName: 'Sans titre',
  history: [],
  historyIndex: -1,
  zoom: 1,
  panX: 0,
  panY: 0,
  snapToGrid: true,
  draggingId: null,
  snapGuides: {},
  showBOM: false,
  showGenerator: false,
  showPlanner: true,
  showEDF: false,
  isDirty: false,
  lastSavedAt: null,
  toasts: [],
  mouseX: 0,
  mouseY: 0,

  getAllPieces: () => {
    const vp = get().viewPieces;
    return [...vp.face, ...vp.side, ...vp.top];
  },

  setViewMode: (mode) => set({ viewMode: mode, selectedIds: new Set() }),

  addPiece: (definitionId, x, y) => {
    const piece = createPlacedPiece(definitionId, x, y);
    if (!piece) return;
    const state = get();
    state.pushHistory();
    const view = state.viewMode;
    set({
      viewPieces: {
        ...state.viewPieces,
        [view]: [...state.viewPieces[view], piece],
      },
      isDirty: true,
    });
  },

  removePiece: (id) => {
    const state = get();
    state.pushHistory();
    const view = state.viewMode;
    set({
      viewPieces: {
        ...state.viewPieces,
        [view]: state.viewPieces[view].filter((p) => p.id !== id),
      },
      selectedIds: new Set([...state.selectedIds].filter((sid) => sid !== id)),
      isDirty: true,
    });
  },

  updatePiecePosition: (id, x, y) => {
    const state = get();
    const view = state.viewMode;
    set({
      viewPieces: {
        ...state.viewPieces,
        [view]: state.viewPieces[view].map((p) => (p.id === id ? { ...p, x, y } : p)),
      },
    });
  },

  rotatePiece: (id) => {
    const state = get();
    const view = state.viewMode;
    const piece = state.viewPieces[view].find((p) => p.id === id);
    if (!piece) return;
    const def = ALL_PIECES[piece.definitionId];
    if (!def) return;
    const rotations = def.constraints.allowedRotations;
    if (rotations.length <= 1) return;
    state.pushHistory();
    const currentIndex = rotations.indexOf(piece.rotation);
    const nextRotation = rotations[(currentIndex + 1) % rotations.length];
    set({
      viewPieces: {
        ...state.viewPieces,
        [view]: state.viewPieces[view].map((p) =>
          p.id === id ? { ...p, rotation: nextRotation } : p
        ),
      },
    });
  },

  duplicatePiece: (id) => {
    const state = get();
    const view = state.viewMode;
    const piece = state.viewPieces[view].find((p) => p.id === id);
    if (!piece) return;
    const newPiece = createPlacedPiece(piece.definitionId, piece.x + 0.5, piece.y + 0.5);
    if (!newPiece) return;
    newPiece.rotation = piece.rotation;
    state.pushHistory();
    set({
      viewPieces: {
        ...state.viewPieces,
        [view]: [...state.viewPieces[view], newPiece],
      },
      selectedIds: new Set([newPiece.id]),
    });
  },

  selectPiece: (id, multi = false) => {
    set((state) => {
      if (multi) {
        const newSet = new Set(state.selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return { selectedIds: newSet };
      }
      return { selectedIds: new Set([id]) };
    });
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  setProjectName: (name) => set({ projectName: name }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
  setShowBOM: (show) => set({ showBOM: show }),
  setShowGenerator: (show) => set({ showGenerator: show }),
  setShowPlanner: (show) => set({ showPlanner: show }),
  setShowEDF: (show) => set({ showEDF: show }),

  bulkAddPieces: (viewPiecesInput) => {
    const state = get();
    state.pushHistory();
    const newViewPieces = { ...state.viewPieces };

    for (const view of ['face', 'side', 'top'] as ViewMode[]) {
      const incoming = viewPiecesInput[view];
      if (!incoming || incoming.length === 0) continue;
      const created = incoming
        .map((p) => createPlacedPiece(p.definitionId, p.x, p.y))
        .filter((p): p is PlacedPiece => p !== null);
      newViewPieces[view] = [...newViewPieces[view], ...created];
    }

    set({ viewPieces: newViewPieces, isDirty: true });
  },

  setMousePos: (x, y) => set({ mouseX: x, mouseY: y }),
  setDraggingId: (id) => set({ draggingId: id, snapGuides: id ? get().snapGuides : {} }),
  setSnapGuides: (guides) => set({ snapGuides: guides }),

  markSaved: () => set({ isDirty: false, lastSavedAt: Date.now() }),

  addToast: (message, type = 'info') => {
    const id = Date.now();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2500);
  },

  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),

  undo: () => {
    const { history, historyIndex, viewPieces } = get();
    if (historyIndex < 0) return;
    const entry = history[historyIndex];
    const newHistory = [...history];
    if (historyIndex === history.length - 1) {
      newHistory.push({ pieces: structuredClone(viewPieces) });
    }
    set({
      viewPieces: structuredClone(entry.pieces),
      historyIndex: historyIndex - 1,
      history: newHistory,
      selectedIds: new Set(),
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 2) return;
    const entry = history[historyIndex + 2];
    if (!entry) return;
    set({
      viewPieces: structuredClone(entry.pieces),
      historyIndex: historyIndex + 1,
    });
  },

  pushHistory: () => {
    const { viewPieces, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ pieces: structuredClone(viewPieces) });
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  clearAll: () => {
    const state = get();
    state.pushHistory();
    const view = state.viewMode;
    set({
      viewPieces: { ...state.viewPieces, [view]: [] },
      selectedIds: new Set(),
    });
  },

  loadProject: (data) => {
    if (data.viewPieces) {
      set({ viewPieces: data.viewPieces, selectedIds: new Set(), history: [], historyIndex: -1 });
    } else if (data.pieces) {
      // Legacy: single pieces array → face view
      set({ viewPieces: { face: data.pieces, side: [], top: [] }, selectedIds: new Set(), history: [], historyIndex: -1 });
    }
  },
}));
