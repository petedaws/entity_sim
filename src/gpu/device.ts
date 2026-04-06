export interface GpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

export async function createGpuContext(
  canvas: HTMLCanvasElement
): Promise<GpuContext> {
  if (!("gpu" in navigator)) {
    throw new Error("WebGPU is not available in this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No compatible GPU adapter was found.");
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new Error("Unable to create a WebGPU canvas context.");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: "opaque"
  });

  device.addEventListener("uncapturederror", (event) => {
    console.error("WebGPU uncaptured error", event.error);
  });

  return { device, context, format };
}
