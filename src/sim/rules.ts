export function createDefaultRuleMatrix(typeCount: number): Float32Array {
  if (typeCount !== 4) {
    return createRandomRuleMatrix(typeCount);
  }

  return new Float32Array([
    0.45, -0.28, 0.18, -0.12,
    -0.24, 0.38, -0.26, 0.16,
    0.16, -0.22, 0.42, -0.34,
    -0.14, 0.2, -0.32, 0.48
  ]);
}

export function createRandomRuleMatrix(typeCount: number): Float32Array {
  const values = new Float32Array(typeCount * typeCount);

  for (let row = 0; row < typeCount; row += 1) {
    for (let column = 0; column < typeCount; column += 1) {
      const index = row * typeCount + column;
      const base = Math.random() * 0.9 - 0.45;
      values[index] = row === column ? base + 0.25 : base;
    }
  }

  return values;
}
