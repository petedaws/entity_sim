struct Entity {
  position_type: vec4f,
  velocity_seed: vec4f,
};

struct SimSettings {
  counts: vec4u,
  scalars0: vec4f,
  scalars1: vec4f,
};

@group(0) @binding(0) var<uniform> settings: SimSettings;
@group(0) @binding(1) var<storage, read> input_entities: array<Entity>;
@group(0) @binding(2) var<storage, read_write> output_entities: array<Entity>;
@group(0) @binding(3) var<storage, read> rule_matrix: array<f32>;

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

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let index = global_id.x;
  let entity_count = settings.counts.x;

  if (index >= entity_count) {
    return;
  }

  let sample_count = max(settings.counts.z, 1u);
  let type_count = settings.counts.y;
  let dt = settings.scalars0.x;
  let interaction_radius = settings.scalars0.y;
  let max_speed = settings.scalars0.z;
  let damping = settings.scalars0.w;
  let noise_strength = settings.scalars1.x;
  let boundary_force = settings.scalars1.y;
  let bounds = settings.scalars1.zw;
  let interaction_radius_sq = interaction_radius * interaction_radius;

  let entity = input_entities[index];
  let self_type = u32(entity.position_type.w);
  var position = entity.position_type.xy;
  var velocity = entity.velocity_seed.xy;
  var acceleration = vec2f(0.0);

  // Sampled interactions are a stepping stone toward a grid broadphase:
  // cheap enough to explore rule design now, replaceable later with local-cell scans.
  for (var sample = 0u; sample < sample_count; sample += 1u) {
    let other_index = hash32(index ^ settings.counts.w ^ (sample * 0x9e3779b9u)) % entity_count;
    if (other_index == index) {
      continue;
    }

    let other = input_entities[other_index];
    let delta = other.position_type.xy - position;
    let distance_sq = dot(delta, delta);

    if (distance_sq < 0.000001 || distance_sq > interaction_radius_sq) {
      continue;
    }

    let distance_value = sqrt(distance_sq);
    let direction = delta / distance_value;
    let other_type = u32(other.position_type.w);
    let rule_index = self_type * type_count + other_type;
    let force = rule_matrix[rule_index];
    let falloff = 1.0 - distance_value / interaction_radius;
    acceleration += direction * force * falloff;
  }

  let overflow_x = abs(position.x) - bounds.x;
  if (overflow_x > 0.0) {
    acceleration.x -= sign(position.x) * overflow_x * boundary_force;
  }

  let overflow_y = abs(position.y) - bounds.y;
  if (overflow_y > 0.0) {
    acceleration.y -= sign(position.y) * overflow_y * boundary_force;
  }

  let noise_seed = index + settings.counts.w * 1664525u;
  let noise = vec2f(
    random_signed(noise_seed),
    random_signed(noise_seed ^ 0xa511e9b3u)
  );
  acceleration += noise * noise_strength;

  velocity = velocity * damping + acceleration * dt;
  velocity = limit_length(velocity, max_speed);
  position += velocity * dt;

  output_entities[index].position_type = vec4f(position, 0.0, entity.position_type.w);
  output_entities[index].velocity_seed = vec4f(velocity, 0.0, entity.velocity_seed.w);
}
