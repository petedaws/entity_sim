export const ENTITY_COUNT = 65_536;
export const TYPE_COUNT = 4;
export const WORKGROUP_SIZE = 256;
export const ENTITY_STRIDE_FLOATS = 8;
export const DEFAULT_TYPE_ATTRACTION_RADIUS = 0.16;
export const DEFAULT_TYPE_REPULSION_RADIUS = 0.028;
export const DEFAULT_TYPE_MAX_SPEED = 0.55;

export interface SimulationControls {
  paused: boolean;
  entityCount: number;
  timeScale: number;
  damping: number;
  noiseStrength: number;
  entityRadius: number;
  dragRadius: number;
}

export const DEFAULT_CONTROLS: SimulationControls = {
  paused: false,
  entityCount: ENTITY_COUNT,
  timeScale: 1,
  damping: 0.985,
  noiseStrength: 0.015,
  entityRadius: 0.008,
  dragRadius: 0.075
};
