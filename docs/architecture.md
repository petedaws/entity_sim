# Architecture Notes

## Goal

Simulate a large number of simple entities whose local rules produce interesting large-scale behavior, while keeping the simulation almost entirely on the GPU.

## Why This Version Still Counts As A Skeleton

The hard part of this project is not rendering points. It is designing the data flow so that:

- entity state stays on the GPU
- each frame is only a few passes
- neighbor lookups do not become `O(N^2)`
- CPU involvement is limited to parameter updates and UI

The current version solves neighbor search with a practical uniform grid, but it still stops short of the most scalable variant because it uses fixed-capacity cell buckets instead of a prefix-sum scatter pass.

## Current Starter Pipeline

Each frame:

1. Write a small settings buffer from CPU.
2. Clear per-cell counts.
3. Bin every entity into a uniform grid cell.
4. Simulate each entity by scanning as many neighboring cells as needed to cover the active force radii.
5. Swap input/output entity buffers.
6. Render instances directly from the updated entity buffer.

The current grid stage uses fixed-capacity buckets:

- each cell owns a contiguous slice of an index buffer
- atomic counters assign entity slots within that cell
- if a cell exceeds capacity, extra occupants are ignored for that frame

That makes the implementation much simpler than a full prefix-sum scatter stage while still giving you a true local broadphase.

One subtle but important design point:

- attraction and repulsion radii are physical force cutoffs
- grid cell size is a separate broadphase detail
- the shader derives the required neighbor-cell span from `radius / cell_size`

That decoupling keeps the force controls meaningful while still letting the grid do its job.

## Large-N Target Pipeline

For a more robust large-entity sim, keep the spatial partitioning stage on the GPU but replace fixed-capacity buckets with a sorted scatter pipeline.

Recommended pass sequence:

1. Clear grid counters.
2. Bin every entity into a cell.
3. Prefix-sum cell counts into offsets.
4. Scatter entity indices into a contiguous cell-index buffer.
5. Simulate each entity by scanning as many neighboring cells as needed for the chosen search radius.
6. Render from the latest entity buffer.

## Data Model

Entity buffer:

- position
- type id
- velocity
- seed or auxiliary scalar

Rule buffer:

- attraction matrix using inverse-square strength
- repulsion matrix using spring-style strength

Small uniform buffer:

- dt
- attraction radius
- repulsion radius
- damping
- max speed
- grid dimensions and cell capacity
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

- current fixed-capacity grid broadphase
- tune parameters until clusters, streams, and segregation appear

Phase 2:

- prefix-sum scatter within the grid
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
