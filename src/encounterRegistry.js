import { CONFIG } from "./config.js";
import { AngryFishermanEncounter } from "./angryFishermanEncounter.js";
import { CoolerFishermanEncounter } from "./coolerFishermanEncounter.js";
import { EncounterManager } from "./encounterManager.js";

export const ENCOUNTER_FACTORIES = {
  "angry-fisherman": () => new AngryFishermanEncounter(),
  "angry-fisherman-cooler": () => new CoolerFishermanEncounter()
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

export function createEncounterManager() {
  return registerConfiguredEncounters(new EncounterManager());
}
