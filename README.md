# Entity Sim

GPU-first particle/entity simulation playground for exploring emergent behavior from simple local rules.

The starting stack in this repo is:

- Browser `WebGPU` for compute + rendering
- `TypeScript` for iteration speed and better shader/host coordination
- `Vite` for a minimal dev loop
- `lil-gui` for tuning rule parameters live

This skeleton is intentionally split into two layers:

1. A working starter that already uses the GPU for simulation and rendering.
2. A documented path toward a large-entity architecture that scales beyond toy demos.

## Current Skeleton

The current implementation uses:

- Ping-pong entity buffers on the GPU
- A 3-pass compute pipeline: clear grid, bin entities, simulate local neighborhoods
- A uniform-grid broadphase with fixed-capacity cell buckets
- Broadphase cell sizing that is derived from the largest force radius, but is finer than the force radius itself
- Instanced rendering from the same GPU entity buffer
- A live control panel to adjust attraction radius, repulsion radius, speed, noise, and interaction rules

This is a real grid broadphase already, but it is still an intermediate architecture because it uses fixed-capacity per-cell buckets instead of a prefix-sum scatter stage.

The important detail is that `attractionRadius` and `repulsionRadius` are now treated as physical interaction cutoffs, not as the grid cell size. The shader computes how many neighboring cells to scan from the actual cell size each frame.

It still teaches the important pieces first:

- GPU buffer layout
- compute passes
- render passes
- bind groups
- no-CPU-readback simulation loops
- parameter updates from CPU to GPU

## Recommended Architecture For Large N

For genuinely large populations with local interactions, move toward this pipeline:

1. `clear grid counts`
2. `bin entities into uniform grid cells`
3. `prefix sum / offsets`
4. `scatter entity indices into a sorted cell list`
5. `simulate each entity by scanning only nearby cells`
6. `render directly from the latest entity buffer`

That changes the cost profile from "global interactions are impossible" to "local interactions are practical".

More detail is in [docs/architecture.md](/c:/Users/peted/Documents/dev/entity_sim/docs/architecture.md).

## Project Layout

- [src/app.ts](/c:/Users/peted/Documents/dev/entity_sim/src/app.ts): app bootstrap and UI wiring
- [src/sim/EntitySimulation.ts](/c:/Users/peted/Documents/dev/entity_sim/src/sim/EntitySimulation.ts): GPU buffers, pipelines, and frame loop
- [src/shaders/sim.wgsl](/c:/Users/peted/Documents/dev/entity_sim/src/shaders/sim.wgsl): compute shader
- [src/shaders/render.wgsl](/c:/Users/peted/Documents/dev/entity_sim/src/shaders/render.wgsl): render shader
- [src/sim/config.ts](/c:/Users/peted/Documents/dev/entity_sim/src/sim/config.ts): core sim constants and tweakable defaults
- [src/sim/rules.ts](/c:/Users/peted/Documents/dev/entity_sim/src/sim/rules.ts): attraction/repulsion rule helpers

## Dependencies

Runtime requirements:

- A browser with `WebGPU` enabled, ideally current Chrome or Edge
- Node.js `20.19.0+` for the current `Vite 8` toolchain

App dependencies:

- `lil-gui`

Dev dependencies:

- `typescript`
- `vite`

## Getting Started

Use Node.js `20.19.0+`.

```powershell
npm install
npm run dev
```

On Windows PowerShell, `npm.ps1` may be blocked by execution policy. This repo includes [run.cmd](/c:/Users/peted/Documents/dev/entity_sim/run.cmd), which avoids that problem:

```powershell
.\run.cmd
```

## Next Milestones

1. Replace fixed-capacity cell buckets with a prefix-sum scatter stage.
2. Add lifecycle rules: spawn, decay, type switching, and death.
3. Introduce field textures for food, heat, or pheromones.
4. Add GPU-side profiling and entity count scaling tests.
