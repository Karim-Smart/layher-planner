import type { PlacedPiece } from '../catalog/types';
import type { ViewMode } from '../stores/editorStore';

const STORAGE_KEY = 'echaf3d-projects';

type ViewPieces = Record<ViewMode, PlacedPiece[]>;

export interface SavedProject {
  name: string;
  viewPieces?: ViewPieces;
  pieces?: PlacedPiece[]; // legacy format
  savedAt: string;
}

export function saveProject(name: string, viewPieces: ViewPieces): void {
  const projects = loadAllProjects();
  const index = projects.findIndex((p) => p.name === name);
  const entry: SavedProject = { name, viewPieces, savedAt: new Date().toISOString() };
  if (index >= 0) projects[index] = entry;
  else projects.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function loadAllProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function loadProject(name: string): SavedProject | null {
  return loadAllProjects().find((p) => p.name === name) ?? null;
}

export function deleteProject(name: string): void {
  const projects = loadAllProjects().filter((p) => p.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function exportJSON(name: string, viewPieces: ViewPieces): void {
  const data = JSON.stringify({ name, viewPieces, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\s+/g, '-')}.echaf3d.json`;
  a.click();
  URL.revokeObjectURL(url);
}
