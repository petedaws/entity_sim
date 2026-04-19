import {
  DEFAULT_TYPE_ATTRACTION_RADIUS,
  DEFAULT_TYPE_REPULSION_RADIUS
} from "./config";

export interface RuleMatrices {
  attraction: Float32Array;
  repulsion: Float32Array;
  attractionRadii: Float32Array;
  repulsionRadii: Float32Array;
}

export function createDefaultRuleMatrices(typeCount: number): RuleMatrices {
  if (typeCount !== 4) {
    return createRandomRuleMatrices(typeCount);
  }

  return {
    attraction: new Float32Array([
      0.00022, 0.00006, 0.00014, 0.00003,
      0.00008, 0.00020, 0.00005, 0.00013,
      0.00012, 0.00004, 0.00021, 0.00009,
      0.00005, 0.00011, 0.00007, 0.00023
    ]),
    repulsion: new Float32Array([
      0.80, 0.18, 0.36, 0.14,
      0.22, 0.74, 0.16, 0.30,
      0.28, 0.12, 0.78, 0.24,
      0.16, 0.26, 0.18, 0.84
    ]),
    attractionRadii: new Float32Array(typeCount * typeCount).fill(
      DEFAULT_TYPE_ATTRACTION_RADIUS
    ),
    repulsionRadii: new Float32Array(typeCount * typeCount).fill(
      DEFAULT_TYPE_REPULSION_RADIUS
    )
  };
}

export function createRandomRuleMatrices(typeCount: number): RuleMatrices {
  const attraction = new Float32Array(typeCount * typeCount);
  const repulsion = new Float32Array(typeCount * typeCount);
  const attractionRadii = new Float32Array(typeCount * typeCount);
  const repulsionRadii = new Float32Array(typeCount * typeCount);

  for (let row = 0; row < typeCount; row += 1) {
    for (let column = 0; column < typeCount; column += 1) {
      const index = row * typeCount + column;
      const isSelf = row === column;

      attraction[index] =
        (isSelf ? 0.00012 : 0) +
        (Math.random() * 2 - 1) * (isSelf ? 0.00012 : 0.0003);
      repulsion[index] =
        (isSelf ? 0.35 : 0.08) + Math.random() * (isSelf ? 0.65 : 0.55);
      attractionRadii[index] =
        DEFAULT_TYPE_ATTRACTION_RADIUS * (0.6 + Math.random() * 0.9);
      repulsionRadii[index] =
        DEFAULT_TYPE_REPULSION_RADIUS * (0.6 + Math.random() * 0.9);
    }
  }

  return { attraction, repulsion, attractionRadii, repulsionRadii };
}
