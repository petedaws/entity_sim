export interface GpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

export async function createGpuContext(
  canvas: HTMLCanvasElement
): Promise<GpuContext> {
  if (!("gpu" in navigator)) {
    const hints: string[] = [];

    if (!window.isSecureContext) {
      hints.push(
        "This page is not in a secure context. Open it from http://localhost or https."
      );
    }

    hints.push("Use a current Chrome, Edge, or Safari Technology Preview build.");
    hints.push("Make sure hardware acceleration is enabled.");
    hints.push("If disabled by policy/flags, re-enable WebGPU in browser settings.");

    throw new Error(`WebGPU is not available in this browser. ${hints.join(" ")}`);
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error(
      "No compatible WebGPU adapter was found. WebGL can still work on systems where WebGPU is blocked by driver/browser policy, outdated GPU drivers, or unsupported backend configuration."
    );
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
