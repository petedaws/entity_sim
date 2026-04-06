export const ENTITY_COUNT = 65_536;
export const TYPE_COUNT = 4;
export const WORKGROUP_SIZE = 256;
export const ENTITY_STRIDE_FLOATS = 8;

export interface SimulationControls {
  paused: boolean;
  timeScale: number;
  sampleCount: number;
  interactionRadius: number;
  damping: number;
  maxSpeed: number;
  noiseStrength: number;
  boundaryForce: number;
  entityRadius: number;
}

export const DEFAULT_CONTROLS: SimulationControls = {
  paused: false,
  timeScale: 1,
  sampleCount: 8,
  interactionRadius: 0.16,
  damping: 0.985,
  maxSpeed: 0.55,
  noiseStrength: 0.015,
  boundaryForce: 2.8,
  entityRadius: 0.008
};
