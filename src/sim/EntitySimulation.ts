import renderShaderSource from "../shaders/render.wgsl?raw";
import simShaderSource from "../shaders/sim.wgsl?raw";
import {
  DEFAULT_CONTROLS,
  ENTITY_COUNT,
  ENTITY_STRIDE_FLOATS,
  TYPE_COUNT,
  type SimulationControls,
  WORKGROUP_SIZE
} from "./config";
import { createDefaultRuleMatrix, createRandomRuleMatrix } from "./rules";

const SIM_SETTINGS_SIZE = 48;
const RENDER_SETTINGS_SIZE = 16;

type BufferPair<T> = [T, T];

export class EntitySimulation {
  readonly controls: SimulationControls = { ...DEFAULT_CONTROLS };
  readonly entityCount = ENTITY_COUNT;
  readonly typeCount = TYPE_COUNT;

  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly computePipeline: GPUComputePipeline;
  private readonly renderPipeline: GPURenderPipeline;
  private readonly entityBuffers: BufferPair<GPUBuffer>;
  private readonly simulationBindGroups: BufferPair<GPUBindGroup>;
  private readonly renderBindGroups: BufferPair<GPUBindGroup>;
  private readonly simSettingsBuffer: GPUBuffer;
  private readonly renderSettingsBuffer: GPUBuffer;
  private readonly ruleBuffer: GPUBuffer;

  private activeBufferIndex: 0 | 1 = 0;
  private frameIndex = 0;
  private worldHalfWidth = 1;
  private worldHalfHeight = 1;

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

    this.ruleBuffer = device.createBuffer({
      label: "rule matrix",
      size: TYPE_COUNT * TYPE_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.entityBuffers = [
      this.createEntityBuffer("entities a"),
      this.createEntityBuffer("entities b")
    ];

    const initialEntities = this.buildInitialEntities();
    device.queue.writeBuffer(this.entityBuffers[0], 0, initialEntities);
    device.queue.writeBuffer(this.entityBuffers[1], 0, initialEntities);
    device.queue.writeBuffer(this.ruleBuffer, 0, createDefaultRuleMatrix(TYPE_COUNT));

    const computeModule = device.createShaderModule({
      label: "simulation shader",
      code: simShaderSource
    });

    const renderModule = device.createShaderModule({
      label: "render shader",
      code: renderShaderSource
    });

    this.computePipeline = device.createComputePipeline({
      label: "simulation pipeline",
      layout: "auto",
      compute: {
        module: computeModule,
        entryPoint: "main"
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

    this.simulationBindGroups = [
      device.createBindGroup({
        label: "simulate a->b",
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simSettingsBuffer } },
          { binding: 1, resource: { buffer: this.entityBuffers[0] } },
          { binding: 2, resource: { buffer: this.entityBuffers[1] } },
          { binding: 3, resource: { buffer: this.ruleBuffer } }
        ]
      }),
      device.createBindGroup({
        label: "simulate b->a",
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simSettingsBuffer } },
          { binding: 1, resource: { buffer: this.entityBuffers[1] } },
          { binding: 2, resource: { buffer: this.entityBuffers[0] } },
          { binding: 3, resource: { buffer: this.ruleBuffer } }
        ]
      })
    ];

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

    this.writeRenderSettings();
  }

  resize(width: number, height: number): void {
    const aspect = height === 0 ? 1 : width / height;
    this.worldHalfWidth = aspect;
    this.worldHalfHeight = 1;

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque"
    });

    this.writeRenderSettings();
  }

  step(deltaSeconds: number): void {
    const scaledDt = deltaSeconds * this.controls.timeScale;
    const encoder = this.device.createCommandEncoder({
      label: "frame encoder"
    });

    if (!this.controls.paused) {
      this.writeSimSettings(scaledDt);

      const computePass = encoder.beginComputePass({
        label: "simulate"
      });
      computePass.setPipeline(this.computePipeline);
      computePass.setBindGroup(0, this.simulationBindGroups[this.activeBufferIndex]);
      computePass.dispatchWorkgroups(
        Math.ceil(this.entityCount / WORKGROUP_SIZE)
      );
      computePass.end();

      this.activeBufferIndex = this.activeBufferIndex === 0 ? 1 : 0;
      this.frameIndex += 1;
    }

    this.writeRenderSettings();
    this.render(encoder);
    this.device.queue.submit([encoder.finish()]);
  }

  randomizeRules(): void {
    this.device.queue.writeBuffer(
      this.ruleBuffer,
      0,
      createRandomRuleMatrix(this.typeCount)
    );
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
      size: this.entityCount * ENTITY_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
  }

  private buildInitialEntities(): Float32Array {
    const values = new Float32Array(this.entityCount * ENTITY_STRIDE_FLOATS);
    const spawnHalfWidth = this.worldHalfWidth * 0.88;
    const spawnHalfHeight = this.worldHalfHeight * 0.88;

    for (let index = 0; index < this.entityCount; index += 1) {
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
    const buffer = new ArrayBuffer(SIM_SETTINGS_SIZE);
    const counts = new Uint32Array(buffer, 0, 4);
    const scalars0 = new Float32Array(buffer, 16, 4);
    const scalars1 = new Float32Array(buffer, 32, 4);

    counts[0] = this.entityCount;
    counts[1] = this.typeCount;
    counts[2] = this.controls.sampleCount;
    counts[3] = this.frameIndex;

    scalars0[0] = deltaSeconds;
    scalars0[1] = this.controls.interactionRadius;
    scalars0[2] = this.controls.maxSpeed;
    scalars0[3] = this.controls.damping;

    scalars1[0] = this.controls.noiseStrength;
    scalars1[1] = this.controls.boundaryForce;
    scalars1[2] = this.worldHalfWidth;
    scalars1[3] = this.worldHalfHeight;

    this.device.queue.writeBuffer(this.simSettingsBuffer, 0, buffer);
  }

  private writeRenderSettings(): void {
    const buffer = new Float32Array([
      this.worldHalfWidth,
      this.worldHalfHeight,
      this.controls.entityRadius,
      0
    ]);
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
    renderPass.draw(6, this.entityCount);
    renderPass.end();
  }
}
