import renderShaderSource from "../shaders/render.wgsl?raw";
import simShaderSource from "../shaders/sim.wgsl?raw";
import {
  DEFAULT_TYPE_DENSITY_THRESHOLD,
  DEFAULT_TYPE_MAX_SPEED,
  DEFAULT_CONTROLS,
  DENSITY_PROBE_RADIUS,
  ENTITY_COUNT,
  ENTITY_STRIDE_FLOATS,
  TYPE_COUNT,
  type SimulationControls,
  WORKGROUP_SIZE
} from "./config";
import {
  createDefaultRuleMatrices,
  createRandomRuleMatrices
} from "./rules";

const SIM_SETTINGS_SIZE = 160;
const RENDER_SETTINGS_SIZE = 32;
const MIN_CELL_CAPACITY = 64;
const CELL_CAPACITY_MULTIPLIER = 6;
const TARGET_CELLS_PER_SEARCH_RADIUS = 2;

type BufferPair<T> = [T, T];

interface Vector2 {
  x: number;
  y: number;
}

interface GridSpec {
  columns: number;
  rows: number;
  cellCount: number;
  cellCapacity: number;
}

export class EntitySimulation {
  readonly controls: SimulationControls = { ...DEFAULT_CONTROLS };
  readonly maxEntityCount = ENTITY_COUNT;
  readonly typeCount = TYPE_COUNT;

  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly clearGridPipeline: GPUComputePipeline;
  private readonly binGridPipeline: GPUComputePipeline;
  private readonly simulatePipeline: GPUComputePipeline;
  private readonly renderPipeline: GPURenderPipeline;
  private readonly entityBuffers: BufferPair<GPUBuffer>;
  private simulationBindGroups!: BufferPair<GPUBindGroup>;
  private binGridBindGroups!: BufferPair<GPUBindGroup>;
  private clearGridBindGroup!: GPUBindGroup;
  private readonly renderBindGroups: BufferPair<GPUBindGroup>;
  private readonly simSettingsBuffer: GPUBuffer;
  private readonly renderSettingsBuffer: GPUBuffer;
  private readonly attractionBuffer: GPUBuffer;
  private readonly repulsionBuffer: GPUBuffer;
  private readonly attractionRadiusBuffer: GPUBuffer;
  private readonly repulsionRadiusBuffer: GPUBuffer;
  private gridCountsBuffer!: GPUBuffer;
  private gridEntriesBuffer!: GPUBuffer;
  private attractionMatrix: Float32Array;
  private repulsionMatrix: Float32Array;
  private attractionRadiiMatrix: Float32Array;
  private repulsionRadiiMatrix: Float32Array;
  private readonly typeEnabled = new Uint32Array(TYPE_COUNT).fill(1);
  private readonly searchRadii = new Float32Array(TYPE_COUNT);
  private readonly typeMaxSpeeds = new Float32Array(TYPE_COUNT).fill(
    DEFAULT_TYPE_MAX_SPEED
  );
  private readonly typeDensityThresholds = new Float32Array(TYPE_COUNT).fill(
    DEFAULT_TYPE_DENSITY_THRESHOLD
  );
  private readonly typeDensityRadii = new Float32Array(TYPE_COUNT).fill(
    DENSITY_PROBE_RADIUS
  );

  private activeBufferIndex: 0 | 1 = 0;
  private activeEntityCount = ENTITY_COUNT;
  private frameIndex = 0;
  private worldHalfWidth = 1;
  private worldHalfHeight = 1;
  private gridColumns = 1;
  private gridRows = 1;
  private gridCellCount = 1;
  private gridCellCapacity = MIN_CELL_CAPACITY;
  private gridCellWidth = 2;
  private gridCellHeight = 2;
  private searchSpanX = 1;
  private searchSpanY = 1;
  private dragActive = false;
  private dragPosition: Vector2 = { x: 0, y: 0 };
  private dragDelta: Vector2 = { x: 0, y: 0 };

  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat
  ) {
    this.device = device;
    this.context = context;
    this.format = format;

    this.simSettingsBuffer = device.createBuffer({
      label: "sim settings",
      size: SIM_SETTINGS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.renderSettingsBuffer = device.createBuffer({
      label: "render settings",
      size: RENDER_SETTINGS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.attractionBuffer = device.createBuffer({
      label: "attraction matrix",
      size: TYPE_COUNT * TYPE_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.repulsionBuffer = device.createBuffer({
      label: "repulsion matrix",
      size: TYPE_COUNT * TYPE_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.attractionRadiusBuffer = device.createBuffer({
      label: "attraction radius matrix",
      size: TYPE_COUNT * TYPE_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.repulsionRadiusBuffer = device.createBuffer({
      label: "repulsion radius matrix",
      size: TYPE_COUNT * TYPE_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const defaultRules = createDefaultRuleMatrices(TYPE_COUNT);
    this.attractionMatrix = defaultRules.attraction;
    this.repulsionMatrix = defaultRules.repulsion;
    this.attractionRadiiMatrix = defaultRules.attractionRadii;
    this.repulsionRadiiMatrix = defaultRules.repulsionRadii;

    this.entityBuffers = [
      this.createEntityBuffer("entities a"),
      this.createEntityBuffer("entities b")
    ];

    const initialEntities = this.buildInitialEntities();
    device.queue.writeBuffer(this.entityBuffers[0], 0, initialEntities);
    device.queue.writeBuffer(this.entityBuffers[1], 0, initialEntities);
    this.writeRuleBuffers();

    const simModule = device.createShaderModule({
      label: "simulation shader",
      code: simShaderSource
    });

    const renderModule = device.createShaderModule({
      label: "render shader",
      code: renderShaderSource
    });

    this.clearGridPipeline = device.createComputePipeline({
      label: "clear grid pipeline",
      layout: "auto",
      compute: {
        module: simModule,
        entryPoint: "clearGrid"
      }
    });

    this.binGridPipeline = device.createComputePipeline({
      label: "bin grid pipeline",
      layout: "auto",
      compute: {
        module: simModule,
        entryPoint: "binGrid"
      }
    });

    this.simulatePipeline = device.createComputePipeline({
      label: "simulate grid pipeline",
      layout: "auto",
      compute: {
        module: simModule,
        entryPoint: "simulateGrid"
      }
    });

    this.renderPipeline = device.createRenderPipeline({
      label: "render pipeline",
      layout: "auto",
      vertex: {
        module: renderModule,
        entryPoint: "vsMain"
      },
      fragment: {
        module: renderModule,
        entryPoint: "fsMain",
        targets: [
          {
            format
          }
        ]
      },
      primitive: {
        topology: "triangle-list"
      }
    });

    this.renderBindGroups = [
      device.createBindGroup({
        label: "render a",
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.entityBuffers[0] } },
          { binding: 1, resource: { buffer: this.renderSettingsBuffer } }
        ]
      }),
      device.createBindGroup({
        label: "render b",
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.entityBuffers[1] } },
          { binding: 1, resource: { buffer: this.renderSettingsBuffer } }
        ]
      })
    ];

    this.rebuildGridResources();
    this.writeRenderSettings();
  }

  get gridSummary(): string {
    return `${this.gridColumns}x${this.gridRows} grid`;
  }

  get entityCount(): number {
    return this.activeEntityCount;
  }

  get cellCapacity(): number {
    return this.gridCellCapacity;
  }

  get gridCellSummary(): string {
    const cellSize = Math.max(this.gridCellWidth, this.gridCellHeight);
    return `${cellSize.toFixed(3)} cell`;
  }

  get searchSummary(): string {
    return `${this.searchSpanX * 2 + 1}x${this.searchSpanY * 2 + 1} search`;
  }

  resize(width: number, height: number): void {
    this.syncControlState();

    const aspect = height === 0 ? 1 : width / height;
    this.worldHalfWidth = aspect;
    this.worldHalfHeight = 1;

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque"
    });

    this.ensureGridResources();
    this.writeRenderSettings();
  }

  step(deltaSeconds: number): void {
    this.syncControlState();
    this.ensureGridResources();

    const scaledDt = deltaSeconds * this.controls.timeScale;
    const shouldDispatchSimulation =
      !this.controls.paused || this.hasPendingDragMotion();
    const encoder = this.device.createCommandEncoder({
      label: "frame encoder"
    });

    if (shouldDispatchSimulation) {
      this.writeSimSettings(this.controls.paused ? 0 : scaledDt);

      const clearPass = encoder.beginComputePass({
        label: "clear grid"
      });
      clearPass.setPipeline(this.clearGridPipeline);
      clearPass.setBindGroup(0, this.clearGridBindGroup);
      clearPass.dispatchWorkgroups(
        Math.ceil(this.gridCellCount / WORKGROUP_SIZE)
      );
      clearPass.end();

      const binPass = encoder.beginComputePass({
        label: "bin entities"
      });
      binPass.setPipeline(this.binGridPipeline);
      binPass.setBindGroup(0, this.binGridBindGroups[this.activeBufferIndex]);
      binPass.dispatchWorkgroups(
        Math.ceil(this.activeEntityCount / WORKGROUP_SIZE)
      );
      binPass.end();

      const simulatePass = encoder.beginComputePass({
        label: "simulate"
      });
      simulatePass.setPipeline(this.simulatePipeline);
      simulatePass.setBindGroup(0, this.simulationBindGroups[this.activeBufferIndex]);
      simulatePass.dispatchWorkgroups(
        Math.ceil(this.activeEntityCount / WORKGROUP_SIZE)
      );
      simulatePass.end();

      this.activeBufferIndex = this.activeBufferIndex === 0 ? 1 : 0;
      if (!this.controls.paused) {
        this.frameIndex += 1;
      }
      this.consumeDragMotion();
    }

    this.writeRenderSettings();
    this.render(encoder);
    this.device.queue.submit([encoder.finish()]);
  }

  randomizeRules(): void {
    const nextRules = createRandomRuleMatrices(this.typeCount);
    this.attractionMatrix = nextRules.attraction;
    this.repulsionMatrix = nextRules.repulsion;
    this.attractionRadiiMatrix = nextRules.attractionRadii;
    this.repulsionRadiiMatrix = nextRules.repulsionRadii;
    this.writeRuleBuffers();
  }

  resetRules(): void {
    const nextRules = createDefaultRuleMatrices(this.typeCount);
    this.attractionMatrix = nextRules.attraction;
    this.repulsionMatrix = nextRules.repulsion;
    this.attractionRadiiMatrix = nextRules.attractionRadii;
    this.repulsionRadiiMatrix = nextRules.repulsionRadii;
    this.writeRuleBuffers();
  }

  getAttractionValue(sourceType: number, targetType: number): number {
    return this.attractionMatrix[this.getRuleIndex(sourceType, targetType)];
  }

  getRepulsionValue(sourceType: number, targetType: number): number {
    return this.repulsionMatrix[this.getRuleIndex(sourceType, targetType)];
  }

  getAttractionRadius(sourceType: number, targetType: number): number {
    return this.attractionRadiiMatrix[this.getRuleIndex(sourceType, targetType)];
  }

  getRepulsionRadius(sourceType: number, targetType: number): number {
    return this.repulsionRadiiMatrix[this.getRuleIndex(sourceType, targetType)];
  }

  getTypeMaxSpeed(typeIndex: number): number {
    return this.typeMaxSpeeds[typeIndex];
  }

  getTypeDensityThreshold(typeIndex: number): number {
    return this.typeDensityThresholds[typeIndex];
  }

  getTypeDensityRadius(typeIndex: number): number {
    return this.typeDensityRadii[typeIndex];
  }

  isTypeEnabled(typeIndex: number): boolean {
    return this.typeEnabled[typeIndex] !== 0;
  }

  setAttractionValue(
    sourceType: number,
    targetType: number,
    value: number
  ): void {
    this.attractionMatrix[this.getRuleIndex(sourceType, targetType)] = value;
    this.device.queue.writeBuffer(this.attractionBuffer, 0, this.attractionMatrix);
  }

  setRepulsionValue(
    sourceType: number,
    targetType: number,
    value: number
  ): void {
    this.repulsionMatrix[this.getRuleIndex(sourceType, targetType)] = Math.max(
      0,
      value
    );
    this.device.queue.writeBuffer(this.repulsionBuffer, 0, this.repulsionMatrix);
  }

  setTypeEnabled(typeIndex: number, enabled: boolean): void {
    this.typeEnabled[typeIndex] = enabled ? 1 : 0;
  }

  setAttractionRadius(
    sourceType: number,
    targetType: number,
    value: number
  ): void {
    this.attractionRadiiMatrix[this.getRuleIndex(sourceType, targetType)] =
      Math.max(0, value);
    this.device.queue.writeBuffer(
      this.attractionRadiusBuffer,
      0,
      this.attractionRadiiMatrix
    );
  }

  setRepulsionRadius(
    sourceType: number,
    targetType: number,
    value: number
  ): void {
    this.repulsionRadiiMatrix[this.getRuleIndex(sourceType, targetType)] =
      Math.max(0, value);
    this.device.queue.writeBuffer(
      this.repulsionRadiusBuffer,
      0,
      this.repulsionRadiiMatrix
    );
  }

  setTypeMaxSpeed(typeIndex: number, value: number): void {
    this.typeMaxSpeeds[typeIndex] = Math.max(0.01, value);
  }

  setTypeDensityThreshold(typeIndex: number, value: number): void {
    this.typeDensityThresholds[typeIndex] = Math.max(0, value);
  }

  setTypeDensityRadius(typeIndex: number, value: number): void {
    this.typeDensityRadii[typeIndex] = Math.max(0.001, value);
  }

  viewportToWorld(u: number, v: number): Vector2 {
    const clampedU = Math.min(Math.max(u, 0), 1);
    const clampedV = Math.min(Math.max(v, 0), 1);

    return {
      x: (clampedU * 2 - 1) * this.worldHalfWidth,
      y: (1 - clampedV * 2) * this.worldHalfHeight
    };
  }

  beginDrag(position: Vector2): void {
    this.dragActive = true;
    this.dragPosition = position;
    this.dragDelta = { x: 0, y: 0 };
  }

  updateDrag(position: Vector2): void {
    if (!this.dragActive) {
      return;
    }

    this.dragDelta = {
      x: this.dragDelta.x + (position.x - this.dragPosition.x),
      y: this.dragDelta.y + (position.y - this.dragPosition.y)
    };
    this.dragPosition = position;
  }

  endDrag(): void {
    this.dragActive = false;
    this.dragDelta = { x: 0, y: 0 };
  }

  resetEntities(): void {
    const initialEntities = this.buildInitialEntities();
    this.device.queue.writeBuffer(this.entityBuffers[0], 0, initialEntities);
    this.device.queue.writeBuffer(this.entityBuffers[1], 0, initialEntities);
    this.activeBufferIndex = 0;
    this.frameIndex = 0;
  }

  private createEntityBuffer(label: string): GPUBuffer {
    return this.device.createBuffer({
      label,
      size:
        this.maxEntityCount *
        ENTITY_STRIDE_FLOATS *
        Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
  }

  private buildInitialEntities(): Float32Array {
    const values = new Float32Array(this.maxEntityCount * ENTITY_STRIDE_FLOATS);
    const spawnHalfWidth = this.worldHalfWidth * 0.88;
    const spawnHalfHeight = this.worldHalfHeight * 0.88;

    for (let index = 0; index < this.maxEntityCount; index += 1) {
      const base = index * ENTITY_STRIDE_FLOATS;
      const type = index % this.typeCount;
      const radius = Math.sqrt(Math.random());
      const angle = Math.random() * Math.PI * 2;
      const jitter = (Math.random() * 2 - 1) * 0.05;

      values[base + 0] = Math.cos(angle) * radius * spawnHalfWidth + jitter;
      values[base + 1] = Math.sin(angle) * radius * spawnHalfHeight + jitter;
      values[base + 2] = 0;
      values[base + 3] = type;
      values[base + 4] = (Math.random() * 2 - 1) * 0.03;
      values[base + 5] = (Math.random() * 2 - 1) * 0.03;
      values[base + 6] = 0;
      values[base + 7] = Math.random();
    }

    return values;
  }

  private writeSimSettings(deltaSeconds: number): void {
    this.refreshSearchRadii();

    const buffer = new ArrayBuffer(SIM_SETTINGS_SIZE);
    const counts = new Uint32Array(buffer, 0, 4);
    const grid = new Uint32Array(buffer, 16, 4);
    const scalars0 = new Float32Array(buffer, 32, 4);
    const scalars1 = new Float32Array(buffer, 48, 4);
    const drag = new Float32Array(buffer, 64, 4);
    const enabled = new Uint32Array(buffer, 80, 4);
    const searchRadii = new Float32Array(buffer, 96, 4);
    const maxSpeeds = new Float32Array(buffer, 112, 4);
    const densityThresholds = new Float32Array(buffer, 128, 4);
    const densityRadii = new Float32Array(buffer, 144, 4);

    counts[0] = this.activeEntityCount;
    counts[1] = this.typeCount;
    counts[2] = this.gridColumns;
    counts[3] = this.gridRows;

    grid[0] = this.gridCellCount;
    grid[1] = this.gridCellCapacity;
    grid[2] = this.frameIndex;
    grid[3] = this.hasPendingDragMotion() ? 1 : 0;

    scalars0[0] = deltaSeconds;
    scalars0[1] = this.controls.damping;
    scalars0[2] = this.controls.noiseStrength;
    scalars0[3] = this.worldHalfWidth;

    scalars1[0] = this.worldHalfHeight;
    scalars1[1] = this.controls.dragRadius;
    scalars1[2] = this.getMaxSearchRadius();
    scalars1[3] = 0;

    drag[0] = this.dragPosition.x;
    drag[1] = this.dragPosition.y;
    drag[2] = this.dragDelta.x;
    drag[3] = this.dragDelta.y;

    enabled.set(this.typeEnabled);
    searchRadii.set(this.searchRadii);
    maxSpeeds.set(this.typeMaxSpeeds);
    densityThresholds.set(this.typeDensityThresholds);
    densityRadii.set(this.typeDensityRadii);

    this.device.queue.writeBuffer(this.simSettingsBuffer, 0, buffer);
  }

  private writeRenderSettings(): void {
    const buffer = new ArrayBuffer(RENDER_SETTINGS_SIZE);
    const scalars = new Float32Array(buffer, 0, 4);
    const enabled = new Uint32Array(buffer, 16, 4);

    scalars[0] = this.worldHalfWidth;
    scalars[1] = this.worldHalfHeight;
    scalars[2] = this.controls.entityRadius;
    scalars[3] = 0;

    enabled.set(this.typeEnabled);

    this.device.queue.writeBuffer(this.renderSettingsBuffer, 0, buffer);
  }

  private render(encoder: GPUCommandEncoder): void {
    const view = this.context.getCurrentTexture().createView();

    const renderPass = encoder.beginRenderPass({
      label: "render",
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.01, g: 0.03, b: 0.05, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroups[this.activeBufferIndex]);
    renderPass.draw(6, this.activeEntityCount);
    renderPass.end();
  }

  private ensureGridResources(): void {
    const nextGrid = this.computeGridSpec();
    if (
      nextGrid.columns === this.gridColumns &&
      nextGrid.rows === this.gridRows &&
      nextGrid.cellCapacity === this.gridCellCapacity
    ) {
      return;
    }

    this.rebuildGridResources(nextGrid);
  }

  private computeGridSpec(): GridSpec {
    const searchRadius = this.getMaxSearchRadius();
    const targetCellSize = searchRadius / TARGET_CELLS_PER_SEARCH_RADIUS;
    const worldWidth = this.worldHalfWidth * 2;
    const worldHeight = this.worldHalfHeight * 2;
    const columns = Math.max(1, Math.ceil(worldWidth / targetCellSize));
    const rows = Math.max(1, Math.ceil(worldHeight / targetCellSize));
    const cellCount = columns * rows;
    const averageOccupancy = this.activeEntityCount / cellCount;
    const cellCapacity = Math.max(
      MIN_CELL_CAPACITY,
      Math.ceil(averageOccupancy * CELL_CAPACITY_MULTIPLIER)
    );

    return {
      columns,
      rows,
      cellCount,
      cellCapacity
    };
  }

  private rebuildGridResources(gridSpec = this.computeGridSpec()): void {
    const retiredBuffers: GPUBuffer[] = [];
    if (this.gridCountsBuffer) {
      retiredBuffers.push(this.gridCountsBuffer);
    }
    if (this.gridEntriesBuffer) {
      retiredBuffers.push(this.gridEntriesBuffer);
    }

    this.gridColumns = gridSpec.columns;
    this.gridRows = gridSpec.rows;
    this.gridCellCount = gridSpec.cellCount;
    this.gridCellCapacity = gridSpec.cellCapacity;
    this.gridCellWidth = (this.worldHalfWidth * 2) / this.gridColumns;
    this.gridCellHeight = (this.worldHalfHeight * 2) / this.gridRows;
    const searchRadius = this.getMaxSearchRadius();
    this.searchSpanX = Math.max(1, Math.ceil(searchRadius / this.gridCellWidth));
    this.searchSpanY = Math.max(1, Math.ceil(searchRadius / this.gridCellHeight));

    this.gridCountsBuffer = this.device.createBuffer({
      label: "grid counts",
      size: this.gridCellCount * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE
    });

    this.gridEntriesBuffer = this.device.createBuffer({
      label: "grid entries",
      size:
        this.gridCellCount *
        this.gridCellCapacity *
        Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE
    });

    this.clearGridBindGroup = this.device.createBindGroup({
      label: "clear grid",
      layout: this.clearGridPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simSettingsBuffer } },
        { binding: 4, resource: { buffer: this.gridCountsBuffer } }
      ]
    });

    this.binGridBindGroups = [
      this.device.createBindGroup({
        label: "bin a",
        layout: this.binGridPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simSettingsBuffer } },
          { binding: 1, resource: { buffer: this.entityBuffers[0] } },
          { binding: 4, resource: { buffer: this.gridCountsBuffer } },
          { binding: 5, resource: { buffer: this.gridEntriesBuffer } }
        ]
      }),
      this.device.createBindGroup({
        label: "bin b",
        layout: this.binGridPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simSettingsBuffer } },
          { binding: 1, resource: { buffer: this.entityBuffers[1] } },
          { binding: 4, resource: { buffer: this.gridCountsBuffer } },
          { binding: 5, resource: { buffer: this.gridEntriesBuffer } }
        ]
      })
    ];

    this.simulationBindGroups = [
      this.device.createBindGroup({
        label: "simulate a->b",
        layout: this.simulatePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simSettingsBuffer } },
          { binding: 1, resource: { buffer: this.entityBuffers[0] } },
          { binding: 2, resource: { buffer: this.entityBuffers[1] } },
          { binding: 3, resource: { buffer: this.attractionBuffer } },
          { binding: 4, resource: { buffer: this.gridCountsBuffer } },
          { binding: 5, resource: { buffer: this.gridEntriesBuffer } },
          { binding: 6, resource: { buffer: this.repulsionBuffer } },
          { binding: 7, resource: { buffer: this.attractionRadiusBuffer } },
          { binding: 8, resource: { buffer: this.repulsionRadiusBuffer } }
        ]
      }),
      this.device.createBindGroup({
        label: "simulate b->a",
        layout: this.simulatePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simSettingsBuffer } },
          { binding: 1, resource: { buffer: this.entityBuffers[1] } },
          { binding: 2, resource: { buffer: this.entityBuffers[0] } },
          { binding: 3, resource: { buffer: this.attractionBuffer } },
          { binding: 4, resource: { buffer: this.gridCountsBuffer } },
          { binding: 5, resource: { buffer: this.gridEntriesBuffer } },
          { binding: 6, resource: { buffer: this.repulsionBuffer } },
          { binding: 7, resource: { buffer: this.attractionRadiusBuffer } },
          { binding: 8, resource: { buffer: this.repulsionRadiusBuffer } }
        ]
      })
    ];

    this.retireBuffers(retiredBuffers);
  }

  private retireBuffers(buffers: GPUBuffer[]): void {
    if (buffers.length === 0) {
      return;
    }

    void this.device.queue
      .onSubmittedWorkDone()
      .then(() => {
        for (const buffer of buffers) {
          buffer.destroy();
        }
      })
      .catch(() => {
        for (const buffer of buffers) {
          buffer.destroy();
        }
      });
  }

  private getRuleIndex(sourceType: number, targetType: number): number {
    return sourceType * this.typeCount + targetType;
  }

  private syncControlState(): void {
    const nextEntityCount = Math.min(
      this.maxEntityCount,
      Math.max(1, Math.round(this.controls.entityCount))
    );

    if (this.activeEntityCount !== nextEntityCount) {
      this.activeEntityCount = nextEntityCount;
    }

    this.controls.entityCount = nextEntityCount;
  }

  private hasPendingDragMotion(): boolean {
    return (
      this.dragActive &&
      (Math.abs(this.dragDelta.x) > 0.000001 ||
        Math.abs(this.dragDelta.y) > 0.000001)
    );
  }

  private consumeDragMotion(): void {
    this.dragDelta = { x: 0, y: 0 };
  }

  private refreshSearchRadii(): void {
    for (let source = 0; source < this.typeCount; source += 1) {
      let maxRadius = 0.001;
      if (this.isTypeEnabled(source)) {
        for (let target = 0; target < this.typeCount; target += 1) {
          if (!this.isTypeEnabled(target)) {
            continue;
          }
          const index = source * this.typeCount + target;
          maxRadius = Math.max(
            maxRadius,
            this.attractionRadiiMatrix[index],
            this.repulsionRadiiMatrix[index]
          );
        }
        if (this.typeDensityThresholds[source] > 0) {
          maxRadius = Math.max(maxRadius, this.typeDensityRadii[source]);
        }
      }
      this.searchRadii[source] = maxRadius;
    }
  }

  private getMaxSearchRadius(): number {
    this.refreshSearchRadii();
    let maxRadius = 0.001;
    for (let source = 0; source < this.typeCount; source += 1) {
      if (!this.isTypeEnabled(source)) {
        continue;
      }
      maxRadius = Math.max(maxRadius, this.searchRadii[source]);
    }
    return maxRadius;
  }

  private writeRuleBuffers(): void {
    this.device.queue.writeBuffer(this.attractionBuffer, 0, this.attractionMatrix);
    this.device.queue.writeBuffer(this.repulsionBuffer, 0, this.repulsionMatrix);
    this.device.queue.writeBuffer(
      this.attractionRadiusBuffer,
      0,
      this.attractionRadiiMatrix
    );
    this.device.queue.writeBuffer(
      this.repulsionRadiusBuffer,
      0,
      this.repulsionRadiiMatrix
    );
  }
}
