import GUI from "lil-gui";
import { createGpuContext } from "./gpu/device";
import { EntitySimulation } from "./sim/EntitySimulation";

export async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#app");
  const status = document.querySelector<HTMLParagraphElement>("#status");

  if (!canvas || !status) {
    throw new Error("Missing required DOM nodes.");
  }

  try {
    const gpu = await createGpuContext(canvas);
    const simulation = new EntitySimulation(gpu.device, gpu.context, gpu.format);

    const gui = new GUI({ title: "entity sim" });
    gui.add(simulation.controls, "paused");
    gui.add(simulation.controls, "timeScale", 0.1, 2, 0.05);
    gui.add(simulation.controls, "sampleCount", 2, 24, 1);
    gui.add(simulation.controls, "interactionRadius", 0.03, 0.35, 0.01);
    gui.add(simulation.controls, "damping", 0.9, 0.999, 0.001);
    gui.add(simulation.controls, "maxSpeed", 0.05, 2.0, 0.01);
    gui.add(simulation.controls, "noiseStrength", 0.0, 0.2, 0.005);
    gui.add(simulation.controls, "boundaryForce", 0.1, 8.0, 0.1);
    gui.add(simulation.controls, "entityRadius", 0.002, 0.03, 0.001);
    gui.add(
      {
        randomizeRules: () => simulation.randomizeRules(),
        resetEntities: () => simulation.resetEntities()
      },
      "randomizeRules"
    );
    gui.add(
      {
        resetEntities: () => simulation.resetEntities()
      },
      "resetEntities"
    );

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));

      canvas.width = width;
      canvas.height = height;
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";

      simulation.resize(width, height);
    };

    resize();
    window.addEventListener("resize", resize);

    let lastTime = performance.now();
    let lastFpsSample = lastTime;
    let framesSinceSample = 0;

    const frame = (now: number): void => {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 1 / 20);
      lastTime = now;

      simulation.step(deltaSeconds);

      framesSinceSample += 1;
      if (now - lastFpsSample >= 500) {
        const fps = (framesSinceSample * 1000) / (now - lastFpsSample);
        status.textContent =
          `${simulation.entityCount.toLocaleString()} entities | ` +
          `${simulation.typeCount} types | ` +
          `${fps.toFixed(1)} fps | sampled-neighbor prototype`;
        framesSinceSample = 0;
        lastFpsSample = now;
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize WebGPU.";
    status.textContent = message;
    throw error;
  }
}
