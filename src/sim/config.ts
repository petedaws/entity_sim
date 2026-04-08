export const ENTITY_COUNT = 65_536;
export const TYPE_COUNT = 4;
export const WORKGROUP_SIZE = 256;
export const ENTITY_STRIDE_FLOATS = 8;

export interface SimulationControls {
  paused: boolean;
  entityCount: number;
  timeScale: number;
  interactionRadius: number;
  repulsionRadius: number;
  damping: number;
  maxSpeed: number;
  noiseStrength: number;
  boundaryForce: number;
  entityRadius: number;
  dragRadius: number;
}

export const DEFAULT_CONTROLS: SimulationControls = {
  paused: false,
  entityCount: ENTITY_COUNT,
  timeScale: 1,
  interactionRadius: 0.16,
  repulsionRadius: 0.028,
  damping: 0.985,
  maxSpeed: 0.55,
  noiseStrength: 0.015,
  boundaryForce: 2.8,
  entityRadius: 0.008,
  dragRadius: 0.075
};
