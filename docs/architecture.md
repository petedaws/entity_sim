# Architecture Notes

## Goal

Simulate a large number of simple entities whose local rules produce interesting large-scale behavior, while keeping the simulation almost entirely on the GPU.

## Why This Skeleton Starts Simple

The hard part of this project is not rendering points. It is designing the data flow so that:

- entity state stays on the GPU
- each frame is only a few passes
- neighbor lookups do not become `O(N^2)`
- CPU involvement is limited to parameter updates and UI

The current starter keeps the data-flow shape correct without solving the full neighbor-search problem immediately.

## Current Starter Pipeline

Each frame:

1. Write a small settings buffer from CPU.
2. Run one compute pass over every entity.
3. Swap input/output entity buffers.
4. Render instances directly from the updated entity buffer.

The compute pass uses "sampled neighbors":

- each entity checks a fixed number of pseudo-random peers
- force strength comes from a type-vs-type rule matrix
- distance limits, drag, noise, and boundary forces keep it stable

This is still `O(N * k)` instead of `O(N^2)`, where `k` is a small fixed sample count.

## Large-N Target Pipeline

For a serious large-entity sim, use a spatial partitioning stage on the GPU.

Recommended pass sequence:

1. Clear grid counters.
2. Bin every entity into a cell.
3. Prefix-sum cell counts into offsets.
4. Scatter entity indices into a contiguous cell-index buffer.
5. Simulate each entity by scanning only the 3x3 local neighborhood of cells.
6. Render from the latest entity buffer.

## Data Model

Entity buffer:

- position
- type id
- velocity
- seed or auxiliary scalar

Rule buffer:

- flattened `typeCount x typeCount` matrix
- positive values attract
- negative values repel

Small uniform buffer:

- dt
- interaction radius
- damping
- max speed
- sample count or grid dimensions
- world bounds
- frame index

## Why Uniform Grid First

Uniform grids are the right next step because they match the rule set:

- local interactions
- fixed-radius neighborhoods
- large, mostly homogeneous populations

You do not need a tree structure until the world gets sparse or highly non-uniform.

## Likely Evolution

Phase 1:

- current sampled-neighbor GPU starter
- tune parameters until clusters, streams, and segregation appear

Phase 2:

- GPU uniform grid broadphase
- increase entity counts substantially
- add type-specific radii and stronger local rules

Phase 3:

- add state transitions such as growth, decay, infection, and conversion
- introduce field textures for nutrients, temperature, or pheromones

Phase 4:

- move toward reproducible experiments
- record presets
- benchmark workgroup sizes, entity counts, and pass timings

## Optional Future Directions

- `Rust + wgpu` if you want native deployment later
- compute-generated indirect draw commands
- toroidal wrapping instead of bounded walls
- multi-pass rules where some entities write into fields and others consume them
