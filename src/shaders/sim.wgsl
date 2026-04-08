struct Entity {
  position_type: vec4f,
  velocity_seed: vec4f,
};

struct SimSettings {
  counts: vec4u,
  grid: vec4u,
  scalars0: vec4f,
  scalars1: vec4f,
  scalars2: vec4f,
  drag: vec4f,
  enabled: vec4u,
};

@group(0) @binding(0) var<uniform> settings: SimSettings;
@group(0) @binding(1) var<storage, read> input_entities: array<Entity>;
@group(0) @binding(2) var<storage, read_write> output_entities: array<Entity>;
@group(0) @binding(3) var<storage, read> attraction_matrix: array<f32>;
@group(0) @binding(4) var<storage, read_write> cell_counts: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> cell_entries: array<u32>;
@group(0) @binding(6) var<storage, read> repulsion_matrix: array<f32>;

fn hash32(value: u32) -> u32 {
  var x = value;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = (x >> 16u) ^ x;
  return x;
}

fn random_signed(seed: u32) -> f32 {
  let raw = f32(hash32(seed) & 0x00ffffffu) / f32(0x00ffffffu);
  return raw * 2.0 - 1.0;
}

fn limit_length(vector: vec2f, max_length: f32) -> vec2f {
  let length_sq = dot(vector, vector);
  if (length_sq <= max_length * max_length) {
    return vector;
  }

  let length_value = sqrt(length_sq);
  return vector / length_value * max_length;
}

fn get_bounds() -> vec2f {
  return vec2f(settings.scalars1.w, settings.scalars2.x);
}

fn get_cell_extent() -> vec2f {
  let bounds = get_bounds();
  let world_size = bounds * 2.0;
  let grid_size = vec2f(f32(settings.counts.z), f32(settings.counts.w));
  return world_size / grid_size;
}

fn is_type_enabled(type_index: u32) -> bool {
  switch type_index {
    case 0u: {
      return settings.enabled.x != 0u;
    }
    case 1u: {
      return settings.enabled.y != 0u;
    }
    case 2u: {
      return settings.enabled.z != 0u;
    }
    default: {
      return settings.enabled.w != 0u;
    }
  }
}

fn get_cell_coordinates(position: vec2f) -> vec2u {
  let bounds = get_bounds();
  let world_min = -bounds;
  let world_size = bounds * 2.0;
  let scaled = (position - world_min) / world_size;
  let clamped = clamp(scaled, vec2f(0.0), vec2f(0.999999));
  let grid_size = vec2f(f32(settings.counts.z), f32(settings.counts.w));
  return vec2u(floor(clamped * grid_size));
}

fn get_cell_index(cell: vec2u) -> u32 {
  return cell.y * settings.counts.z + cell.x;
}

@compute @workgroup_size(256)
fn clearGrid(@builtin(global_invocation_id) global_id: vec3u) {
  let index = global_id.x;
  if (index >= settings.grid.x) {
    return;
  }

  atomicStore(&cell_counts[index], 0u);
}

@compute @workgroup_size(256)
fn binGrid(@builtin(global_invocation_id) global_id: vec3u) {
  let index = global_id.x;
  if (index >= settings.counts.x) {
    return;
  }

  let entity = input_entities[index];
  if (!is_type_enabled(u32(entity.position_type.w))) {
    return;
  }

  let cell = get_cell_coordinates(entity.position_type.xy);
  let cell_index = get_cell_index(cell);
  let slot = atomicAdd(&cell_counts[cell_index], 1u);

  if (slot >= settings.grid.y) {
    return;
  }

  let write_index = cell_index * settings.grid.y + slot;
  cell_entries[write_index] = index;
}

@compute @workgroup_size(256)
fn simulateGrid(@builtin(global_invocation_id) global_id: vec3u) {
  let index = global_id.x;
  let entity_count = settings.counts.x;

  if (index >= entity_count) {
    return;
  }

  let type_count = settings.counts.y;
  let grid_columns = settings.counts.z;
  let grid_rows = settings.counts.w;
  let cell_capacity = settings.grid.y;
  let frame_index = settings.grid.z;
  let drag_active = settings.grid.w != 0u;
  let dt = settings.scalars0.x;
  let interaction_radius = settings.scalars0.y;
  let repulsion_radius = settings.scalars0.z;
  let max_speed = settings.scalars0.w;
  let damping = settings.scalars1.x;
  let noise_strength = settings.scalars1.y;
  let boundary_force = settings.scalars1.z;
  let bounds = vec2f(settings.scalars1.w, settings.scalars2.x);
  let drag_radius = settings.scalars2.y;
  let drag_position = settings.drag.xy;
  let drag_delta = settings.drag.zw;
  let drag_source = drag_position - drag_delta;
  let cell_extent = get_cell_extent();
  let search_radius = max(interaction_radius, repulsion_radius);
  let search_radius_sq = search_radius * search_radius;
  let interaction_radius_sq = interaction_radius * interaction_radius;
  let repulsion_radius_sq = repulsion_radius * repulsion_radius;
  let drag_radius_sq = drag_radius * drag_radius;
  let search_range_x = i32(ceil(search_radius / cell_extent.x));
  let search_range_y = i32(ceil(search_radius / cell_extent.y));
  let min_distance_sq = 0.0001;

  let entity = input_entities[index];
  let self_type = u32(entity.position_type.w);
  if (!is_type_enabled(self_type)) {
    output_entities[index].position_type = entity.position_type;
    output_entities[index].velocity_seed = vec4f(0.0, 0.0, 0.0, entity.velocity_seed.w);
    return;
  }

  var position = entity.position_type.xy;
  var velocity = entity.velocity_seed.xy;
  var acceleration = vec2f(0.0);
  let cell = get_cell_coordinates(position);

  for (var offset_y = -search_range_y; offset_y <= search_range_y; offset_y += 1) {
    let neighbor_y = i32(cell.y) + offset_y;
    if (neighbor_y < 0 || neighbor_y >= i32(grid_rows)) {
      continue;
    }

    for (var offset_x = -search_range_x; offset_x <= search_range_x; offset_x += 1) {
      let neighbor_x = i32(cell.x) + offset_x;
      if (neighbor_x < 0 || neighbor_x >= i32(grid_columns)) {
        continue;
      }

      let neighbor_cell = vec2u(u32(neighbor_x), u32(neighbor_y));
      let cell_index = get_cell_index(neighbor_cell);
      let neighbor_count = min(atomicLoad(&cell_counts[cell_index]), cell_capacity);
      let cell_base = cell_index * cell_capacity;

      for (var slot = 0u; slot < neighbor_count; slot += 1u) {
        let other_index = cell_entries[cell_base + slot];
        if (other_index == index) {
          continue;
        }

        let other = input_entities[other_index];
        let delta = other.position_type.xy - position;
        let distance_sq = dot(delta, delta);

        if (distance_sq < 0.000001 || distance_sq > search_radius_sq) {
          continue;
        }

        let distance_value = sqrt(distance_sq);
        let direction = delta / distance_value;
        let other_type = u32(other.position_type.w);
        if (!is_type_enabled(other_type)) {
          continue;
        }

        let rule_index = self_type * type_count + other_type;
        let attraction_strength = attraction_matrix[rule_index];
        let repulsion_strength = repulsion_matrix[rule_index];
        if (distance_sq <= interaction_radius_sq) {
          let attraction_force =
            attraction_strength / max(distance_sq, min_distance_sq);
          acceleration += direction * attraction_force;
        }

        if (distance_sq <= repulsion_radius_sq) {
          let compression = max(repulsion_radius - distance_value, 0.0);
          let repulsion_force = repulsion_strength * compression;
          acceleration -= direction * repulsion_force;
        }
      }
    }
  }

  let overflow_x = abs(position.x) - bounds.x;
  if (overflow_x > 0.0) {
    acceleration.x -= sign(position.x) * overflow_x * boundary_force;
  }

  let overflow_y = abs(position.y) - bounds.y;
  if (overflow_y > 0.0) {
    acceleration.y -= sign(position.y) * overflow_y * boundary_force;
  }

  let noise_seed = index + frame_index * 1664525u;
  let noise = vec2f(
    random_signed(noise_seed),
    random_signed(noise_seed ^ 0xa511e9b3u)
  );
  acceleration += noise * noise_strength;

  velocity = velocity * damping + acceleration * dt;
  velocity = limit_length(velocity, max_speed);
  position += velocity * dt;
  if (drag_active) {
    let drag_offset = position - drag_source;
    if (dot(drag_offset, drag_offset) <= drag_radius_sq) {
      position += drag_delta;
      position = clamp(position, -bounds, bounds);
      velocity = vec2f(0.0);
    }
  }

  output_entities[index].position_type = vec4f(position, 0.0, entity.position_type.w);
  output_entities[index].velocity_seed = vec4f(velocity, 0.0, entity.velocity_seed.w);
}
