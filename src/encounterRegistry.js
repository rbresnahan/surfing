import { CONFIG } from "./config.js";
import { AngryFishermanEncounter } from "./angryFishermanEncounter.js";
import { CoolerFishermanEncounter } from "./coolerFishermanEncounter.js";
import { AngryFishermanCoolerTossEncounter } from "./angryFishermanCoolerTossEncounter.js";
import { EncounterManager } from "./encounterManager.js";

export const ENCOUNTER_FACTORIES = {
  "angry-fisherman": (entry) => new AngryFishermanEncounter(undefined, entry),
  "angry-fisherman-cooler": (entry) => new CoolerFishermanEncounter(undefined, entry),
  "angry-fisherman-cooler-toss": (entry) => new AngryFishermanCoolerTossEncounter(undefined, entry)
};

export function registerConfiguredEncounters(
  manager,
  factories = ENCOUNTER_FACTORIES,
  sequence = CONFIG.ENCOUNTER_SEQUENCE
) {
  for (const entry of sequence) {
    const createEncounter = factories[entry.id];
    if (!createEncounter) {
      throw new Error(`No encounter factory registered for ${entry.id}`);
    }
    manager.register(createEncounter(entry));
  }
  return manager;
}

export function createEncounterManager(options = {}) {
  return registerConfiguredEncounters(new EncounterManager({
    ...options,
    debugEncounterFactory: (id) => createEncounterById(id)
  }));
}

export function createEncounterById(id, factories = ENCOUNTER_FACTORIES) {
  const createEncounter = factories[id];
  return createEncounter ? createEncounter() : null;
}

export function encounterCatalog(
  factories = ENCOUNTER_FACTORIES,
  sequence = CONFIG.ENCOUNTER_SEQUENCE
) {
  const seen = new Set();
  return sequence
    .filter((entry) => {
      if (typeof factories[entry.id] !== "function") return false;
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .map((entry) => ({
      id: entry.id,
      label: labelForEncounterId(entry.id)
    }));
}

function labelForEncounterId(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
