struct Entity {
  position_type: vec4f,
  velocity_seed: vec4f,
};

struct RenderSettings {
  world_half_extent: vec2f,
  entity_radius: f32,
  _padding: f32,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local_uv: vec2f,
  @location(1) entity_type: f32,
};

@group(0) @binding(0) var<storage, read> entities: array<Entity>;
@group(0) @binding(1) var<uniform> settings: RenderSettings;

const QUAD_VERTICES = array<vec2f, 6>(
  vec2f(-1.0, -1.0),
  vec2f(1.0, -1.0),
  vec2f(1.0, 1.0),
  vec2f(-1.0, -1.0),
  vec2f(1.0, 1.0),
  vec2f(-1.0, 1.0)
);

const TYPE_COLORS = array<vec3f, 4>(
  vec3f(0.96, 0.40, 0.28),
  vec3f(0.26, 0.74, 0.96),
  vec3f(0.95, 0.83, 0.31),
  vec3f(0.48, 0.90, 0.58)
);

@vertex
fn vsMain(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32
) -> VertexOutput {
  let entity = entities[instance_index];
  let local_uv = QUAD_VERTICES[vertex_index];
  let radius = vec2f(
    settings.entity_radius / settings.world_half_extent.x,
    settings.entity_radius / settings.world_half_extent.y
  );
  let clip_position = entity.position_type.xy / settings.world_half_extent + local_uv * radius;

  var output: VertexOutput;
  output.position = vec4f(clip_position, 0.0, 1.0);
  output.local_uv = local_uv;
  output.entity_type = entity.position_type.w;
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4f {
  if (dot(input.local_uv, input.local_uv) > 1.0) {
    discard;
  }

  let type_index = u32(input.entity_type) % 4u;
  let radial_shade = 1.0 - dot(input.local_uv, input.local_uv) * 0.35;
  return vec4f(TYPE_COLORS[type_index] * radial_shade, 1.0);
}
