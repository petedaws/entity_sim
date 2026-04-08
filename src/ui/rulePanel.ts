import type { EntitySimulation } from "../sim/EntitySimulation";
import { getEntityTypeMetadata } from "../sim/typeMetadata";

const ATTRACTION_MIN = -0.001;
const ATTRACTION_MAX = 0.001;
const ATTRACTION_STEP = 0.000002;
const REPULSION_MAX = 2000;
const REPULSION_STEP = 1;

export interface RulePanelController {
  syncFromSimulation(): void;
}

export function createRulePanel(
  simulation: EntitySimulation
): RulePanelController {
  const panel = document.createElement("section");
  panel.className = "rule-panel";

  const header = document.createElement("div");
  header.className = "rule-panel__header";

  const titleGroup = document.createElement("div");

  const eyebrow = document.createElement("p");
  eyebrow.className = "rule-panel__eyebrow";
  eyebrow.textContent = "Interaction Matrix";

  const help = document.createElement("p");
  help.className = "rule-panel__help";
  help.textContent =
    "Attraction is a signed k / r^2 term inside the attraction radius, so negative values become inverse-square repulsion. Repulsion uses a spring term k * (repulsionRadius - distance) inside the repulsion radius. The active tab chooses the source color.";

  titleGroup.append(eyebrow, help);

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
  header.append(titleGroup, actions);

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

  const legend = document.createElement("p");
  legend.className = "rule-panel__legend";
  legend.textContent =
    `Attraction: ${ATTRACTION_MIN.toFixed(4)} to ${ATTRACTION_MAX.toFixed(4)} | Repulsion: 0 to ${REPULSION_MAX.toFixed(1)}`;

  sectionHeader.append(sectionTitle, typeToggle);
  body.append(sectionHeader, rows, legend);
  panel.append(header, tabs, body);
  document.body.append(panel);

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
          onInput: (nextValue) => {
            simulation.setAttractionValue(activeType, targetType, nextValue);
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
}

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

  header.append(label, value);
  channel.append(header, slider);
  return channel;
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
  return value.toFixed(0);
}
