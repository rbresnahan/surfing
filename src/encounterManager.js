import { CONFIG } from "./config.js";

export class EncounterManager {
  constructor() {
    this.registeredEncounters = [];
    this.reset();
  }

  register(encounter) {
    this.registeredEncounters.push(encounter);
  }

  reset() {
    if (this.activeEncounter) {
      this.activeEncounter.cleanup();
    }
    for (const encounter of this.registeredEncounters) {
      if (encounter === this.activeEncounter) continue;
      encounter.cleanup?.();
    }
    this.activeEncounter = null;
    this.completedEncounterIds = new Set();
    this.startedMajorEncounter = false;
    this.postEncounterGraceTimer = 0;
  }

  update(dt, gameState) {
    if (!CONFIG.ENCOUNTERS_ENABLED) return;

    if (this.postEncounterGraceTimer > 0) {
      this.postEncounterGraceTimer = Math.max(0, this.postEncounterGraceTimer - dt);
      return;
    }

    if (this.activeEncounter) {
      this.activeEncounter.update(dt, gameState);
      if (this.activeEncounter.isComplete()) {
        this.completeActiveEncounter(gameState);
      }
      return;
    }

    const encounter = this.selectEncounter(gameState);
    if (!encounter) return;

    this.activeEncounter = encounter;
    if (encounter.type === "major") {
      this.startedMajorEncounter = true;
    }
    encounter.start(gameState);
  }

  render(ctx, gameState) {
    if (this.activeEncounter) {
      this.activeEncounter.render(ctx, gameState);
    }
  }

  shouldPauseNormalSpawns() {
    return this.activeEncounter?.pauseNormalSpawns === true || this.postEncounterGraceTimer > 0;
  }

  hitboxes() {
    return this.activeEncounter?.projectileHitboxes?.() ?? [];
  }

  cleanupActive(gameState) {
    if (!this.activeEncounter) return;
    this.activeEncounter.cleanup(gameState);
    this.activeEncounter = null;
  }

  selectEncounter(gameState) {
    const candidates = this.registeredEncounters.filter((encounter) => {
      if (this.completedEncounterIds.has(encounter.id)) return false;
      if (encounter.type === "major" && this.startedMajorEncounter) return false;
      if (encounter.exclusive && this.hasExclusiveEncounter()) return false;
      return encounter.canStart(gameState);
    });

    return candidates[0] ?? null;
  }

  completeActiveEncounter(gameState) {
    this.completedEncounterIds.add(this.activeEncounter.id);
    this.postEncounterGraceTimer = this.activeEncounter.postEncounterGraceSeconds ?? 0;
    this.activeEncounter.cleanup(gameState);
    this.activeEncounter = null;
  }

  hasExclusiveEncounter() {
    return this.activeEncounter?.exclusive === true;
  }
}
