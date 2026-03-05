import { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer, Line, Rect } from 'react-konva';
import type Konva from 'konva';
import { GridLayer } from './layers/GridLayer';
import { PieceRenderer } from './renderers/PieceRenderer';
import { useEditorStore } from '../stores/editorStore';
import { calculateSnap, snapToGrid } from '../engine/snapEngine';
import { ALL_PIECES } from '../catalog/definitions';

interface ContextMenuState {
  x: number;
  y: number;
  pieceId: string;
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const {
    viewMode, viewPieces, selectedIds, zoom, panX, panY,
    snapToGrid: snapEnabled, draggingId, snapGuides,
    setZoom, setPan, selectPiece, clearSelection,
    updatePiecePosition, pushHistory, addPiece,
    setMousePos, setDraggingId, setSnapGuides,
    removePiece, rotatePiece, duplicatePiece, addToast,
  } = useEditorStore();

  const pieces = viewPieces[viewMode];

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  const ppm = 100 * zoom;

  // Track mouse world position
  const handleMouseMoveGlobal = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const worldX = (e.evt.offsetX - panX) / ppm;
      const worldY = (e.evt.offsetY - panY) / ppm;
      setMousePos(
        Math.round(worldX * 100) / 100,
        Math.round(worldY * 100) / 100,
      );

      // Pan handling
      if (isPanning && lastPointer) {
        const dx = e.evt.clientX - lastPointer.x;
        const dy = e.evt.clientY - lastPointer.y;
        setPan(panX + dx, panY + dy);
        setLastPointer({ x: e.evt.clientX, y: e.evt.clientY });
      }

      // Selection rectangle
      if (isSelecting && selectionRect) {
        const wx = (e.evt.offsetX - panX) / ppm;
        const wy = (e.evt.offsetY - panY) / ppm;
        setSelectionRect({ ...selectionRect, endX: wx, endY: wy });
      }
    },
    [isPanning, lastPointer, panX, panY, ppm, setPan, setMousePos, isSelecting, selectionRect]
  );

  // Wheel zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const delta = e.evt.deltaY > 0 ? 0.9 : 1.1;
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const newZoom = zoom * delta;
      const mousePointTo = {
        x: (pointer.x - panX) / ppm,
        y: (pointer.y - panY) / ppm,
      };
      const newPpm = 100 * newZoom;
      const newPanX = pointer.x - mousePointTo.x * newPpm;
      const newPanY = pointer.y - mousePointTo.y * newPpm;

      setZoom(newZoom);
      setPan(newPanX, newPanY);
    },
    [zoom, panX, panY, ppm, setZoom, setPan]
  );

  // Pan: middle mouse OR left-click on empty canvas (no Shift)
  // Selection rect: Shift+left-click on empty canvas
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Middle mouse → always pan
      if (e.evt.button === 1) {
        setIsPanning(true);
        setLastPointer({ x: e.evt.clientX, y: e.evt.clientY });
        e.evt.preventDefault();
        return;
      }
      // Left click on empty stage
      if (e.evt.button === 0 && e.target === stageRef.current) {
        if (e.evt.shiftKey) {
          // Shift+click → selection rectangle
          const wx = (e.evt.offsetX - panX) / ppm;
          const wy = (e.evt.offsetY - panY) / ppm;
          setSelectionRect({ startX: wx, startY: wy, endX: wx, endY: wy });
          setIsSelecting(true);
        } else {
          // Click without Shift → pan
          setIsPanning(true);
          setLastPointer({ x: e.evt.clientX, y: e.evt.clientY });
          e.evt.preventDefault();
        }
      }
    },
    [panX, ppm]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPointer(null);

    // Finish selection rect
    if (isSelecting && selectionRect) {
      const minX = Math.min(selectionRect.startX, selectionRect.endX);
      const maxX = Math.max(selectionRect.startX, selectionRect.endX);
      const minY = Math.min(selectionRect.startY, selectionRect.endY);
      const maxY = Math.max(selectionRect.startY, selectionRect.endY);

      // Only select if rect is big enough (not just a click)
      if (maxX - minX > 0.05 || maxY - minY > 0.05) {
        const inRect = pieces.filter((p) => {
          const def = ALL_PIECES[p.definitionId];
          if (!def) return false;
          const px = p.x;
          const py = p.y;
          return px >= minX && px <= maxX && py >= minY && py <= maxY;
        });
        if (inRect.length > 0) {
          // Use selectPiece with multi to add all
          clearSelection();
          inRect.forEach((p) => selectPiece(p.id, true));
        } else {
          clearSelection();
        }
      } else {
        clearSelection();
      }
      setSelectionRect(null);
      setIsSelecting(false);
    }
  }, [isSelecting, selectionRect, pieces, clearSelection, selectPiece]);

  // Click on empty canvas = deselect (only if not dragging a selection rect)
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === stageRef.current && !isSelecting) {
        clearSelection();
      }
    },
    [clearSelection, isSelecting]
  );

  // Piece interactions
  const handlePieceSelect = useCallback(
    (id: string, e: { evt: { shiftKey: boolean } }) => {
      selectPiece(id, e.evt.shiftKey);
    },
    [selectPiece]
  );

  const handleDragStart = useCallback(
    (id: string) => {
      pushHistory();
      setDraggingId(id);
    },
    [pushHistory, setDraggingId]
  );

  const handleDragMove = useCallback(
    (id: string, x: number, y: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (piece) {
        const tempPiece = { ...piece, x, y };
        const snap = calculateSnap(tempPiece, pieces.filter((p) => p.id !== id), snapEnabled);
        if (snap.snapped) {
          setSnapGuides({
            x: snap.x !== x ? snap.x : undefined,
            y: snap.y !== y ? snap.y : undefined,
          });
        } else {
          setSnapGuides({});
        }
      }
      updatePiecePosition(id, x, y);
    },
    [pieces, snapEnabled, updatePiecePosition, setSnapGuides]
  );

  const handleDragEnd = useCallback(
    (id: string) => {
      const piece = pieces.find((p) => p.id === id);
      if (piece) {
        const snap = calculateSnap(piece, pieces.filter((p) => p.id !== id), snapEnabled);
        if (snap.snapped) {
          updatePiecePosition(id, snap.x, snap.y);
        }
      }
      setDraggingId(null);
      setSnapGuides({});
    },
    [pieces, snapEnabled, updatePiecePosition, setDraggingId, setSnapGuides]
  );

  // Right-click context menu
  const handlePieceContextMenu = useCallback(
    (id: string, e: { evt: MouseEvent }) => {
      e.evt.preventDefault();
      e.evt.stopPropagation();
      selectPiece(id, false);
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, pieceId: id });
    },
    [selectPiece]
  );

  // Drop from palette (HTML5 DnD)
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const definitionId = e.dataTransfer.getData('definitionId');
      if (!definitionId || !ALL_PIECES[definitionId]) return;

      const stage = stageRef.current;
      if (!stage) return;
      const rect = (e.target as HTMLElement).closest('.canvas-container')?.getBoundingClientRect();
      if (!rect) return;

      const pointerX = (e.clientX - rect.left - panX) / ppm;
      const pointerY = (e.clientY - rect.top - panY) / ppm;
      const snapped = snapToGrid(pointerX, pointerY);
      addPiece(definitionId, snapped.x, snapped.y);
      addToast('Pièce ajoutée', 'success');
    },
    [panX, panY, ppm, addPiece, addToast]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Snap guide extent
  const guideExtent = 200;

  // Selection rect rendering
  const selRect = selectionRect && isSelecting ? {
    x: Math.min(selectionRect.startX, selectionRect.endX) * ppm,
    y: Math.min(selectionRect.startY, selectionRect.endY) * ppm,
    w: Math.abs(selectionRect.endX - selectionRect.startX) * ppm,
    h: Math.abs(selectionRect.endY - selectionRect.startY) * ppm,
  } : null;

  return (
    <div
      ref={containerRef}
      className="canvas-container flex-1 relative overflow-hidden"
      style={{ background: '#08080c' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveGlobal}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        style={{ cursor: isPanning ? 'grabbing' : isSelecting ? 'crosshair' : 'grab' }}
      >
        <Layer x={panX} y={panY}>
          <GridLayer
            width={size.width}
            height={size.height}
            zoom={zoom}
            panX={panX}
            panY={panY}
          />
        </Layer>
        <Layer x={panX} y={panY}>
          {pieces.map((piece) => (
            <PieceRenderer
              key={piece.id}
              piece={piece}
              ppm={ppm}
              isSelected={selectedIds.has(piece.id)}
              isDragging={draggingId === piece.id}
              onSelect={handlePieceSelect}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onContextMenu={handlePieceContextMenu}
            />
          ))}
        </Layer>

        {/* Snap guide lines */}
        {draggingId && (snapGuides.x !== undefined || snapGuides.y !== undefined) && (
          <Layer x={panX} y={panY}>
            {snapGuides.x !== undefined && (
              <Line
                points={[snapGuides.x * ppm, -guideExtent * ppm, snapGuides.x * ppm, guideExtent * ppm]}
                stroke="#3b82f6"
                strokeWidth={1}
                dash={[6, 4]}
                opacity={0.6}
                listening={false}
              />
            )}
            {snapGuides.y !== undefined && (
              <Line
                points={[-guideExtent * ppm, snapGuides.y * ppm, guideExtent * ppm, snapGuides.y * ppm]}
                stroke="#3b82f6"
                strokeWidth={1}
                dash={[6, 4]}
                opacity={0.6}
                listening={false}
              />
            )}
          </Layer>
        )}

        {/* Selection rectangle */}
        {selRect && (
          <Layer x={panX} y={panY}>
            <Rect
              x={selRect.x}
              y={selRect.y}
              width={selRect.w}
              height={selRect.h}
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[6, 3]}
              fill="rgba(59,130,246,0.06)"
              listening={false}
            />
          </Layer>
        )}
      </Stage>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRotate={() => { rotatePiece(contextMenu.pieceId); setContextMenu(null); }}
          onDuplicate={() => { duplicatePiece(contextMenu.pieceId); setContextMenu(null); addToast('Pièce dupliquée', 'success'); }}
          onDelete={() => { removePiece(contextMenu.pieceId); setContextMenu(null); addToast('Pièce supprimée', 'info'); }}
        />
      )}
    </div>
  );
}

function ContextMenu({
  x, y, onRotate, onDuplicate, onDelete,
}: {
  x: number; y: number;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed z-50 glass-panel rounded-lg py-1 shadow-2xl min-w-[160px] border border-white/10"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={onRotate} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/8 flex items-center justify-between transition-colors">
        <span>Rotation</span>
        <kbd className="text-[9px] text-[#555566] bg-white/5 px-1 rounded">R</kbd>
      </button>
      <button onClick={onDuplicate} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/8 flex items-center justify-between transition-colors">
        <span>Dupliquer</span>
        <kbd className="text-[9px] text-[#555566] bg-white/5 px-1 rounded">Ctrl+D</kbd>
      </button>
      <div className="my-1 border-t border-white/8" />
      <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/8 text-red-400 flex items-center justify-between transition-colors">
        <span>Supprimer</span>
        <kbd className="text-[9px] text-red-400/50 bg-white/5 px-1 rounded">Del</kbd>
      </button>
    </div>
  );
}
