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
    this.difficultyStage = CONFIG.DEBUG_START_STAGE ?? 0;
    this.nonScoringDebugRun = CONFIG.DEBUG_START_STAGE !== null || CONFIG.DEBUG_REDUCED_SPEED_MULTIPLIER !== 1;
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
    const encounter = this.activeEncounter;
    this.completedEncounterIds.add(encounter.id);
    this.advanceDifficultyForEncounter(encounter);
    this.postEncounterGraceTimer = encounter.postEncounterGraceSeconds ?? 0;
    encounter.cleanup(gameState);
    this.activeEncounter = null;
  }

  advanceDifficultyForEncounter(encounter) {
    const nextStage = encounter.difficultyStageOnComplete;
    if (Number.isInteger(nextStage) && this.difficultyStage < nextStage) {
      this.difficultyStage = nextStage;
    }
  }

  hasExclusiveEncounter() {
    return this.activeEncounter?.exclusive === true;
  }
}
