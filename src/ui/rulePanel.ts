import type { EntitySimulation } from "../sim/EntitySimulation";
import { getEntityTypeMetadata } from "../sim/typeMetadata";

const ATTRACTION_MIN = -0.001;
const ATTRACTION_MAX = 0.001;
const ATTRACTION_STEP = 0.000002;
const REPULSION_MAX = 5;
const REPULSION_STEP = 0.01;
const ATTRACTION_RADIUS_MIN = 0.02;
const ATTRACTION_RADIUS_MAX = 0.35;
const ATTRACTION_RADIUS_STEP = 0.005;
const REPULSION_RADIUS_MIN = 0.004;
const REPULSION_RADIUS_MAX = 0.16;
const REPULSION_RADIUS_STEP = 0.001;
const TYPE_MAX_SPEED_MIN = 0.05;
const TYPE_MAX_SPEED_MAX = 2;
const TYPE_MAX_SPEED_STEP = 0.01;
const TYPE_DENSITY_MIN = 0;
const TYPE_DENSITY_MAX = 5000;
const TYPE_DENSITY_STEP = 25;
const TYPE_DENSITY_RADIUS_MIN = 0.02;
const TYPE_DENSITY_RADIUS_MAX = 0.3;
const TYPE_DENSITY_RADIUS_STEP = 0.005;

export interface RulePanelController {
  syncFromSimulation(): void;
}

export function createRulePanel(
  simulation: EntitySimulation,
  host: HTMLElement = document.body
): RulePanelController {
  const panel = document.createElement("section");
  panel.className = "rule-panel";

  const header = document.createElement("button");
  header.type = "button";
  header.className = "rule-panel__header";
  header.setAttribute("aria-expanded", "true");

  const titleGroup = document.createElement("div");
  titleGroup.className = "rule-panel__title-group";

  const eyebrow = document.createElement("p");
  eyebrow.className = "rule-panel__eyebrow";
  eyebrow.textContent = "Interaction Matrix";

  const help = document.createElement("p");
  help.className = "rule-panel__help";
  help.textContent =
    "Each pair has its own attraction and repulsion strength and radius. Attraction is signed k / r^2. Repulsion is proportional to 1 / r^6.";

  titleGroup.append(eyebrow, help);

  const chevron = document.createElement("span");
  chevron.className = "rule-panel__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "\u25BE";

  header.append(titleGroup, chevron);

  const actions = document.createElement("div");
  actions.className = "rule-panel__actions";

  const defaultButton = document.createElement("button");
  defaultButton.type = "button";
  defaultButton.className = "rule-panel__button";
  defaultButton.textContent = "Defaults";
  defaultButton.addEventListener("click", () => {
    simulation.resetRules();
    renderRows();
  });

  const randomizeButton = document.createElement("button");
  randomizeButton.type = "button";
  randomizeButton.className = "rule-panel__button";
  randomizeButton.textContent = "Randomize";
  randomizeButton.addEventListener("click", () => {
    simulation.randomizeRules();
    renderRows();
  });

  actions.append(defaultButton, randomizeButton);

  header.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    header.setAttribute("aria-expanded", String(!collapsed));
  });

  const tabs = document.createElement("div");
  tabs.className = "rule-panel__tabs";

  const body = document.createElement("div");
  body.className = "rule-panel__body";

  const sectionHeader = document.createElement("div");
  sectionHeader.className = "rule-panel__section-header";

  const sectionTitle = document.createElement("p");
  sectionTitle.className = "rule-panel__section-title";

  const typeToggle = document.createElement("button");
  typeToggle.type = "button";
  typeToggle.className = "rule-panel__button rule-panel__toggle";

  const rows = document.createElement("div");
  rows.className = "rule-panel__rows";

  const typeSettings = document.createElement("div");
  typeSettings.className = "rule-panel__type-settings";

  const legend = document.createElement("p");
  legend.className = "rule-panel__legend";
  legend.textContent =
    `Attraction: ${ATTRACTION_MIN.toFixed(4)} to ${ATTRACTION_MAX.toFixed(4)} | Repulsion: 0 to ${REPULSION_MAX.toFixed(1)}`;

  sectionHeader.append(sectionTitle, typeToggle);
  body.append(sectionHeader, typeSettings, rows, legend);
  panel.append(header, actions, tabs, body);
  host.append(panel);

  let activeType = 0;
  const tabButtons: HTMLButtonElement[] = [];

  const syncTabStates = (): void => {
    for (const [buttonIndex, button] of tabButtons.entries()) {
      const metadata = getEntityTypeMetadata(buttonIndex);
      const isActive = buttonIndex === activeType;
      const isEnabled = simulation.isTypeEnabled(buttonIndex);
      button.classList.toggle("is-active", isActive);
      button.classList.toggle("is-disabled", !isEnabled);
      button.setAttribute("aria-selected", String(isActive));
      button.setAttribute(
        "aria-label",
        `${metadata.name} controls${isEnabled ? "" : " (disabled)"}`
      );
      button.style.setProperty("--tab-color", metadata.hex);
    }
  };

  const setActiveTab = (index: number): void => {
    activeType = index;
    syncTabStates();
    renderRows();
  };

  const createTab = (index: number): HTMLButtonElement => {
    const metadata = getEntityTypeMetadata(index);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rule-panel__tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-label", `${metadata.name} controls`);
    button.style.setProperty("--tab-color", metadata.hex);

    const swatch = document.createElement("span");
    swatch.className = "rule-panel__swatch";
    swatch.style.background = metadata.hex;

    const label = document.createElement("span");
    label.className = "rule-panel__tab-label";
    label.textContent = metadata.name;

    button.append(swatch, label);
    button.addEventListener("click", () => setActiveTab(index));
    return button;
  };

  const renderRows = (): void => {
    const sourceMetadata = getEntityTypeMetadata(activeType);
    const sourceEnabled = simulation.isTypeEnabled(activeType);
    sectionTitle.textContent = sourceEnabled
      ? `${sourceMetadata.name} reacts to`
      : `${sourceMetadata.name} is off`;
    sectionTitle.style.setProperty("--source-color", sourceMetadata.hex);
    typeToggle.textContent = sourceEnabled
      ? `Turn Off ${sourceMetadata.name}`
      : `Turn On ${sourceMetadata.name}`;

    typeSettings.replaceChildren(
      createCompactControl({
        label: "Max Speed",
        min: TYPE_MAX_SPEED_MIN,
        max: TYPE_MAX_SPEED_MAX,
        step: TYPE_MAX_SPEED_STEP,
        value: simulation.getTypeMaxSpeed(activeType),
        accentColor: "#92b7ff",
        formatter: formatSpeedValue,
        onInput: (nextValue) => {
          simulation.setTypeMaxSpeed(activeType, nextValue);
        }
      }),
      createCompactControl({
        label: "Density Radius",
        min: TYPE_DENSITY_RADIUS_MIN,
        max: TYPE_DENSITY_RADIUS_MAX,
        step: TYPE_DENSITY_RADIUS_STEP,
        value: simulation.getTypeDensityRadius(activeType),
        accentColor: "#ffd27c",
        formatter: formatRadiusValue,
        onInput: (nextValue) => {
          simulation.setTypeDensityRadius(activeType, nextValue);
        }
      }),
      createCompactControl({
        label: "Density",
        min: TYPE_DENSITY_MIN,
        max: TYPE_DENSITY_MAX,
        step: TYPE_DENSITY_STEP,
        value: simulation.getTypeDensityThreshold(activeType),
        accentColor: "#ffd27c",
        formatter: formatDensityValue,
        onInput: (nextValue) => {
          simulation.setTypeDensityThreshold(activeType, nextValue);
        }
      })
    );

    rows.replaceChildren();

    for (let targetType = 0; targetType < simulation.typeCount; targetType += 1) {
      const targetMetadata = getEntityTypeMetadata(targetType);
      const row = document.createElement("div");
      row.className = "rule-panel__row";

      const target = document.createElement("div");
      target.className = "rule-panel__target";

      const swatch = document.createElement("span");
      swatch.className = "rule-panel__swatch";
      swatch.style.background = targetMetadata.hex;

      const name = document.createElement("span");
      name.textContent = targetMetadata.name;

      target.append(swatch, name);

      const channels = document.createElement("div");
      channels.className = "rule-panel__channels";

      channels.append(
        createRuleChannel({
          label: "Attract",
          min: ATTRACTION_MIN,
          max: ATTRACTION_MAX,
          step: ATTRACTION_STEP,
          value: simulation.getAttractionValue(activeType, targetType),
          accentColor: targetMetadata.hex,
          formatter: formatAttractionValue,
          resetValue: 0,
          onInput: (nextValue) => {
            simulation.setAttractionValue(activeType, targetType, nextValue);
          }
        }),
        createRuleChannel({
          label: "Attr Radius",
          min: ATTRACTION_RADIUS_MIN,
          max: ATTRACTION_RADIUS_MAX,
          step: ATTRACTION_RADIUS_STEP,
          value: simulation.getAttractionRadius(activeType, targetType),
          accentColor: targetMetadata.hex,
          formatter: formatRadiusValue,
          onInput: (nextValue) => {
            simulation.setAttractionRadius(activeType, targetType, nextValue);
          }
        }),
        createRuleChannel({
          label: "Repel",
          min: 0,
          max: REPULSION_MAX,
          step: REPULSION_STEP,
          value: simulation.getRepulsionValue(activeType, targetType),
          accentColor: "#ff8f7c",
          formatter: formatRepulsionValue,
          onInput: (nextValue) => {
            simulation.setRepulsionValue(activeType, targetType, nextValue);
          }
        }),
        createRuleChannel({
          label: "Rep Radius",
          min: REPULSION_RADIUS_MIN,
          max: REPULSION_RADIUS_MAX,
          step: REPULSION_RADIUS_STEP,
          value: simulation.getRepulsionRadius(activeType, targetType),
          accentColor: "#ff8f7c",
          formatter: formatRadiusValue,
          onInput: (nextValue) => {
            simulation.setRepulsionRadius(activeType, targetType, nextValue);
          }
        })
      );

      row.append(target, channels);
      rows.append(row);
    }
  };

  for (let typeIndex = 0; typeIndex < simulation.typeCount; typeIndex += 1) {
    const tabButton = createTab(typeIndex);
    tabButtons.push(tabButton);
    tabs.append(tabButton);
  }

  typeToggle.addEventListener("click", () => {
    simulation.setTypeEnabled(activeType, !simulation.isTypeEnabled(activeType));
    syncTabStates();
    renderRows();
  });

  setActiveTab(0);

  return {
    syncFromSimulation(): void {
      syncTabStates();
      renderRows();
    }
  };
}

interface RuleChannelOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  accentColor: string;
  formatter: (value: number) => string;
  onInput: (value: number) => void;
  resetValue?: number;
}

interface CompactControlOptions extends RuleChannelOptions {}

function createRuleChannel(options: RuleChannelOptions): HTMLDivElement {
  const channel = document.createElement("div");
  channel.className = "rule-panel__channel";

  const header = document.createElement("div");
  header.className = "rule-panel__channel-header";

  const label = document.createElement("span");
  label.className = "rule-panel__channel-label";
  label.textContent = options.label;

  const value = document.createElement("output");
  value.className = "rule-panel__value";

  const slider = document.createElement("input");
  slider.className = "rule-panel__slider";
  slider.type = "range";
  slider.min = String(options.min);
  slider.max = String(options.max);
  slider.step = String(options.step);
  slider.value = String(options.value);
  slider.style.accentColor = options.accentColor;

  const updateValue = (nextValue: number): void => {
    value.textContent = options.formatter(nextValue);
  };

  updateValue(options.value);

  slider.addEventListener("input", () => {
    const nextValue = Number(slider.value);
    options.onInput(nextValue);
    updateValue(nextValue);
  });

  if (options.resetValue !== undefined) {
    const resetValue = options.resetValue;
    value.classList.add("rule-panel__value--resettable");
    value.title = `Click to set ${options.label.toLowerCase()} to ${options.formatter(resetValue)}`;
    const applyReset = (): void => {
      slider.value = String(resetValue);
      options.onInput(resetValue);
      updateValue(resetValue);
    };
    value.addEventListener("click", applyReset);
    slider.addEventListener("dblclick", applyReset);
  }

  header.append(label, value);
  channel.append(header, slider);
  return channel;
}

function createCompactControl(options: CompactControlOptions): HTMLDivElement {
  const control = document.createElement("div");
  control.className = "rule-panel__compact";

  const header = document.createElement("div");
  header.className = "rule-panel__compact-header";

  const label = document.createElement("span");
  label.className = "rule-panel__channel-label";
  label.textContent = options.label;

  const value = document.createElement("output");
  value.className = "rule-panel__compact-value";

  const slider = document.createElement("input");
  slider.className = "rule-panel__slider";
  slider.type = "range";
  slider.min = String(options.min);
  slider.max = String(options.max);
  slider.step = String(options.step);
  slider.value = String(options.value);
  slider.style.accentColor = options.accentColor;

  const updateValue = (nextValue: number): void => {
    value.textContent = options.formatter(nextValue);
  };

  updateValue(options.value);

  slider.addEventListener("input", () => {
    const nextValue = Number(slider.value);
    options.onInput(nextValue);
    updateValue(nextValue);
  });

  header.append(label, value);
  control.append(header, slider);
  return control;
}

function formatAttractionValue(value: number): string {
  if (value === 0) {
    return "0";
  }

  if (Math.abs(value) < 0.001) {
    return value.toExponential(1);
  }

  return value.toFixed(4);
}

function formatRepulsionValue(value: number): string {
  return value.toFixed(2);
}

function formatRadiusValue(value: number): string {
  return value.toFixed(3);
}

function formatSpeedValue(value: number): string {
  return value.toFixed(2);
}

function formatDensityValue(value: number): string {
  if (value <= 0) {
    return "off";
  }

  return value.toFixed(0);
}
