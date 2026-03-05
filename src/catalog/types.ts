export type PieceCategory =
  | 'standard'
  | 'ledger'
  | 'diagonal'
  | 'platform'
  | 'baseJack'
  | 'guardrail'
  | 'console'
  | 'castor'
  | 'ladder'
  | 'clamp'
  | 'toeboard'
  | 'tube'
  | 'accessory';

export type ConnectionDirection = 'up' | 'down' | 'left' | 'right' | 'any';

export type ConnectionType =
  | 'spigot'
  | 'socket'
  | 'rosette'
  | 'wedge'
  | 'platform'
  | 'base'
  | 'clamp'
  | 'tube';

export interface ConnectionPoint {
  id: string;
  type: ConnectionType;
  direction: ConnectionDirection;
  relativeX: number;
  relativeY: number;
  accepts: ConnectionType[];
  maxConnections: number;
  connectedTo: string[];
}

export interface AssemblyConstraints {
  requiresGround: boolean;
  requiresSupport: boolean;
  minConnections: number;
  allowedRotations: number[];
}

export interface PieceDefinition {
  category: PieceCategory;
  name: string;
  description: string;
  widthM: number;
  heightM: number;
  weightKg: number;
  connectionPoints: Omit<ConnectionPoint, 'connectedTo'>[];
  constraints: AssemblyConstraints;
  color: string;
}

export interface PlacedPiece {
  id: string;
  definitionId: string;
  x: number;
  y: number;
  rotation: number;
  connectionPoints: ConnectionPoint[];
  isSelected: boolean;
}
