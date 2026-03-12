import type { ReactElement } from 'react';
import { Line, Circle, Text } from 'react-konva';
import { GRID_CELL_SIZE } from '../../catalog/constants';
import { THEME } from '../../theme/colors';

interface GridLayerProps {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
}

export function GridLayer({ width, height, zoom, panX, panY }: GridLayerProps) {
  const PPM = 100 * zoom;
  const cellPx = GRID_CELL_SIZE * PPM;

  // Adaptive grid: scale cell size by zoom level
  let gridMult = 1;
  let showMinor = true;
  let showDots = zoom >= 0.4;
  if (zoom < 0.3) {
    gridMult = 5;    // 5m cells at far zoom
    showMinor = false;
    showDots = false;
  } else if (zoom < 0.6) {
    gridMult = 2;    // 2m cells
    showMinor = false;
  }

  const effectiveCellPx = cellPx * gridMult;

  // Visible area in grid coords
  const startX = Math.floor(-panX / effectiveCellPx) - 1;
  const endX = Math.ceil((-panX + width) / effectiveCellPx) + 1;
  const startY = Math.floor(-panY / effectiveCellPx) - 1;
  const endY = Math.ceil((-panY + height) / effectiveCellPx) + 1;

  const elements: ReactElement[] = [];

  // Grid lines
  for (let i = startX; i <= endX; i++) {
    const x = i * effectiveCellPx;
    const isMajor = i % 2 === 0;
    elements.push(
      <Line
        key={`v-${i}`}
        points={[x, startY * effectiveCellPx, x, endY * effectiveCellPx]}
        stroke={isMajor ? THEME.gridMajor : THEME.grid}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false}
      />
    );
  }

  for (let j = startY; j <= endY; j++) {
    const y = j * effectiveCellPx;
    const isMajor = j % 2 === 0;
    elements.push(
      <Line
        key={`h-${j}`}
        points={[startX * effectiveCellPx, y, endX * effectiveCellPx, y]}
        stroke={isMajor ? THEME.gridMajor : THEME.grid}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false}
      />
    );
  }

  // Minor grid (finer subdivisions at high zoom)
  if (showMinor && gridMult === 1 && zoom >= 1.5) {
    const minorCellPx = cellPx / 2;
    const msX = Math.floor(-panX / minorCellPx) - 1;
    const meX = Math.ceil((-panX + width) / minorCellPx) + 1;
    const msY = Math.floor(-panY / minorCellPx) - 1;
    const meY = Math.ceil((-panY + height) / minorCellPx) + 1;
    for (let i = msX; i <= meX; i++) {
      if (i % 2 === 0) continue; // skip major lines
      elements.push(
        <Line
          key={`mv-${i}`}
          points={[i * minorCellPx, msY * minorCellPx, i * minorCellPx, meY * minorCellPx]}
          stroke="rgba(0,0,0,0.025)"
          strokeWidth={0.5}
          listening={false}
        />
      );
    }
    for (let j = msY; j <= meY; j++) {
      if (j % 2 === 0) continue;
      elements.push(
        <Line
          key={`mh-${j}`}
          points={[msX * minorCellPx, j * minorCellPx, meX * minorCellPx, j * minorCellPx]}
          stroke="rgba(0,0,0,0.025)"
          strokeWidth={0.5}
          listening={false}
        />
      );
    }
  }

  // Origin crosshair (0,0)
  const originLen = Math.max(width, height) * 2;
  elements.push(
    <Line key="origin-v" points={[0, -originLen, 0, originLen]} stroke="#F2A900" strokeWidth={1.5} opacity={0.35} listening={false} />,
    <Line key="origin-h" points={[-originLen, 0, originLen, 0]} stroke="#F2A900" strokeWidth={1.5} opacity={0.35} listening={false} />,
    <Circle key="origin-dot" x={0} y={0} radius={4} fill="#F2A900" opacity={0.5} listening={false} />,
  );

  // Axis labels (every 5m)
  if (zoom >= 0.3) {
    const labelStep = zoom < 0.6 ? 5 : zoom < 1 ? 2 : 1;
    const labelCellPx = labelStep * PPM;
    const lsX = Math.floor(-panX / labelCellPx) - 1;
    const leX = Math.ceil((-panX + width) / labelCellPx) + 1;
    const lsY = Math.floor(-panY / labelCellPx) - 1;
    const leY = Math.ceil((-panY + height) / labelCellPx) + 1;

    for (let i = lsX; i <= leX; i++) {
      if (i === 0) continue;
      const m = i * labelStep;
      elements.push(
        <Text
          key={`lx-${i}`}
          x={i * labelCellPx + 3}
          y={3}
          text={`${m}m`}
          fontSize={9}
          fill="rgba(0,0,0,0.2)"
          listening={false}
        />
      );
    }
    for (let j = lsY; j <= leY; j++) {
      if (j === 0) continue;
      const m = j * labelStep;
      elements.push(
        <Text
          key={`ly-${j}`}
          x={3}
          y={j * labelCellPx + 3}
          text={`${m}m`}
          fontSize={9}
          fill="rgba(0,0,0,0.2)"
          listening={false}
        />
      );
    }
  }

  // Rosette dots
  if (showDots) {
    const dotStartX = Math.floor(-panX / cellPx) - 1;
    const dotEndX = Math.ceil((-panX + width) / cellPx) + 1;
    const dotStartY = Math.floor(-panY / cellPx) - 1;
    const dotEndY = Math.ceil((-panY + height) / cellPx) + 1;
    for (let i = dotStartX; i <= dotEndX; i++) {
      for (let j = dotStartY; j <= dotEndY; j++) {
        elements.push(
          <Circle
            key={`d-${i}-${j}`}
            x={i * cellPx}
            y={j * cellPx}
            radius={Math.max(1.5, 2 * zoom)}
            fill="rgba(242, 169, 0, 0.2)"
            listening={false}
          />
        );
      }
    }
  }

  return <>{elements}</>;
}
