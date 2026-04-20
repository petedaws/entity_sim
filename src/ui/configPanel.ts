import type GUI from "lil-gui";
import type { EntitySimulation } from "../sim/EntitySimulation";
import { getEntityTypeMetadata } from "../sim/typeMetadata";

const ATTRACTION_MIN = -0.001;
const ATTRACTION_MAX = 0.001;
const ATTRACTION_STEP = 0.000002;
const REPULSION_MIN = 0;
const REPULSION_MAX = 5;
const REPULSION_STEP = 0.01;
const ATTRACTION_RADIUS_MIN = 0.02;
const ATTRACTION_RADIUS_MAX = 0.35;
const ATTRACTION_RADIUS_STEP = 0.005;
const REPULSION_RADIUS_MIN = 0.004;
const REPULSION_RADIUS_MAX = 0.16;
const REPULSION_RADIUS_STEP = 0.001;
const MAX_SPEED_MIN = 0.05;
const MAX_SPEED_MAX = 2;
const MAX_SPEED_STEP = 0.01;
const DENSITY_MIN = 0;
const DENSITY_MAX = 5000;
const DENSITY_STEP = 25;
const DENSITY_RADIUS_MIN = 0.02;
const DENSITY_RADIUS_MAX = 0.3;
const DENSITY_RADIUS_STEP = 0.005;

export function populateConfigPanel(gui: GUI, simulation: EntitySimulation): void {
  gui.add(simulation.controls, "paused");
  gui
    .add(simulation.controls, "entityCount", 1, simulation.maxEntityCount, 1)
    .name("entities");
  gui.add(simulation.controls, "timeScale", 0.1, 2, 0.05).name("time");
  gui.add(simulation.controls, "damping", 0.9, 0.999, 0.001);
  gui.add(simulation.controls, "noiseStrength", 0.0, 0.2, 0.005).name("noise");
  gui
    .add(simulation.controls, "entityRadius", 0.002, 0.03, 0.001)
    .name("dot size");
  gui.add(simulation.controls, "dragRadius", 0.01, 0.25, 0.005).name("drag");
  gui
    .add({ reset: () => simulation.resetEntities() }, "reset")
    .name("reset entities");

  const refreshers: Array<() => void> = [];
  const refreshAll = (): void => {
    for (const fn of refreshers) fn();
  };

  const rulesFolder = gui.addFolder("rules");
  rulesFolder.close();
  rulesFolder
    .add(
      {
        action: () => {
          simulation.resetRules();
          refreshAll();
        }
      },
      "action"
    )
    .name("defaults");
  rulesFolder
    .add(
      {
        action: () => {
          simulation.randomizeRules();
          refreshAll();
        }
      },
      "action"
    )
    .name("randomize");

  for (let sourceType = 0; sourceType < simulation.typeCount; sourceType += 1) {
    const sourceMeta = getEntityTypeMetadata(sourceType);
    const typeFolder = gui.addFolder(sourceMeta.name);
    typeFolder.close();

    const typeState = {
      enabled: simulation.isTypeEnabled(sourceType),
      maxSpeed: simulation.getTypeMaxSpeed(sourceType),
      densityRadius: simulation.getTypeDensityRadius(sourceType),
      density: simulation.getTypeDensityThreshold(sourceType)
    };
    const typeControllers = [
      typeFolder
        .add(typeState, "enabled")
        .onChange((value: boolean) =>
          simulation.setTypeEnabled(sourceType, value)
        ),
      typeFolder
        .add(typeState, "maxSpeed", MAX_SPEED_MIN, MAX_SPEED_MAX, MAX_SPEED_STEP)
        .name("max speed")
        .onChange((value: number) =>
          simulation.setTypeMaxSpeed(sourceType, value)
        ),
      typeFolder
        .add(
          typeState,
          "densityRadius",
          DENSITY_RADIUS_MIN,
          DENSITY_RADIUS_MAX,
          DENSITY_RADIUS_STEP
        )
        .name("density r")
        .onChange((value: number) =>
          simulation.setTypeDensityRadius(sourceType, value)
        ),
      typeFolder
        .add(typeState, "density", DENSITY_MIN, DENSITY_MAX, DENSITY_STEP)
        .onChange((value: number) =>
          simulation.setTypeDensityThreshold(sourceType, value)
        )
    ];

    const pairRefreshers: Array<() => void> = [];
    for (
      let targetType = 0;
      targetType < simulation.typeCount;
      targetType += 1
    ) {
      const targetMeta = getEntityTypeMetadata(targetType);
      const pairFolder = typeFolder.addFolder(`vs ${targetMeta.name}`);
      pairFolder.close();

      const pairState = {
        attract: simulation.getAttractionValue(sourceType, targetType),
        attractR: simulation.getAttractionRadius(sourceType, targetType),
        repel: simulation.getRepulsionValue(sourceType, targetType),
        repelR: simulation.getRepulsionRadius(sourceType, targetType)
      };
      const pairControllers = [
        pairFolder
          .add(
            pairState,
            "attract",
            ATTRACTION_MIN,
            ATTRACTION_MAX,
            ATTRACTION_STEP
          )
          .onChange((value: number) =>
            simulation.setAttractionValue(sourceType, targetType, value)
          ),
        pairFolder
          .add(
            pairState,
            "attractR",
            ATTRACTION_RADIUS_MIN,
            ATTRACTION_RADIUS_MAX,
            ATTRACTION_RADIUS_STEP
          )
          .name("attract r")
          .onChange((value: number) =>
            simulation.setAttractionRadius(sourceType, targetType, value)
          ),
        pairFolder
          .add(pairState, "repel", REPULSION_MIN, REPULSION_MAX, REPULSION_STEP)
          .onChange((value: number) =>
            simulation.setRepulsionValue(sourceType, targetType, value)
          ),
        pairFolder
          .add(
            pairState,
            "repelR",
            REPULSION_RADIUS_MIN,
            REPULSION_RADIUS_MAX,
            REPULSION_RADIUS_STEP
          )
          .name("repel r")
          .onChange((value: number) =>
            simulation.setRepulsionRadius(sourceType, targetType, value)
          )
      ];

      pairRefreshers.push(() => {
        pairState.attract = simulation.getAttractionValue(
          sourceType,
          targetType
        );
        pairState.attractR = simulation.getAttractionRadius(
          sourceType,
          targetType
        );
        pairState.repel = simulation.getRepulsionValue(sourceType, targetType);
        pairState.repelR = simulation.getRepulsionRadius(sourceType, targetType);
        for (const controller of pairControllers) controller.updateDisplay();
      });
    }

    refreshers.push(() => {
      typeState.enabled = simulation.isTypeEnabled(sourceType);
      typeState.maxSpeed = simulation.getTypeMaxSpeed(sourceType);
      typeState.densityRadius = simulation.getTypeDensityRadius(sourceType);
      typeState.density = simulation.getTypeDensityThreshold(sourceType);
      for (const controller of typeControllers) controller.updateDisplay();
      for (const fn of pairRefreshers) fn();
    });
  }
}
