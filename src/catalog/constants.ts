// Dimensions Layher Allround réelles (catalogue 2019)

export const ROSETTE_INTERVAL = 0.5; // mètres
export const TUBE_DIAMETER = 0.0483; // 48.3mm
export const STANDARD_HEIGHTS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
export const LEDGER_LENGTHS = [0.10, 0.30, 0.73, 1.09, 1.40, 1.57, 2.07, 2.57, 3.07];
export const PLATFORM_LENGTHS = [0.73, 1.09, 1.40, 1.57, 2.07, 2.57, 3.07];
export const PLATFORM_WIDTH = 0.32; // 320mm
export const PLATFORM_HEIGHT = 0.076; // 76mm

// Tubes libres (longueurs standard)
export const TUBE_LENGTHS = [1.0, 1.5, 2.0, 3.0, 4.0, 6.0];

// Échelles
export const LADDER_HEIGHTS = [2.0, 3.0, 4.0];

// Plinthes
export const TOEBOARD_LENGTHS = [0.73, 1.09, 1.40, 1.57, 2.07, 2.57, 3.07];
export const TOEBOARD_HEIGHT = 0.15; // 150mm réglementaire

// Conversion monde réel → écran
export const DEFAULT_PIXELS_PER_METER = 100;
export const GRID_CELL_SIZE = ROSETTE_INTERVAL; // 0.5m

// Snap
export const SNAP_DISTANCE = ROSETTE_INTERVAL * 0.4; // 20cm
export const MAX_ROSETTE_CONNECTIONS = 8;
