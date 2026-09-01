import { CONFIG } from "./config.js";
import { SwimmerSection, validateSwimmerSections } from "./swimmerSection.js";
import { swimmerTier } from "./obstacleTuning.js";

export function legacyEndlessSwimmerSectionDefinition(tier = 1) {
  return {
    id: "legacy-endless-swimmers",
    tier,
    completion: { type: "endless" }
  };
}

export class RunController {
  constructor({
    encounterManager,
    diagnostics = null,
    sequence = null,
    legacyEncounterCadence = true
  } = {}) {
    this.encounterManager = encounterManager;
    this.diagnostics = diagnostics;
    this.sequenceDefinitions = sequence;
    this.legacyEncounterCadence = legacyEncounterCadence;
    this.completedEncounterIds = new Set();
    if (this.encounterManager) {
      const existingCallback = this.encounterManager.onEncounterCompleted;
      this.encounterManager.onEncounterCompleted = (encounter, gameState, details) => {
        existingCallback?.(encounter, gameState, details);
        this.onEncounterCompleted(encounter, gameState, details);
      };
    }
    this.reset(0, { resetEncounters: false });
  }

  reset(elapsedSeconds = 0, { resetEncounters = true } = {}) {
    this.currentBlockIndex = 0;
    this.currentBlock = null;
    this.activeSwimmerSection = null;
    this.completed = false;
    this.completedEncounterIds = new Set();
    this.legacyTierId = CONFIG.DEBUG_START_STAGE === null ? 1 : CONFIG.DEBUG_START_STAGE + 1;
    if (resetEncounters) this.encounterManager?.reset?.();
    if (this.encounterManager) this.encounterManager.difficultyStage = this.legacyTierId - 1;
    if (this.sequenceDefinitions) {
      validateRunSequence(this.sequenceDefinitions);
      this.startCurrentBlock({ elapsedSeconds, elapsedMs: elapsedSeconds * 1000 });
    } else {
      this.startLegacySwimmerSection(elapsedSeconds);
    }
  }

  update(dt, gameState = {}) {
    const elapsedSeconds = gameState.elapsedSeconds ?? 0;

    if (this.sequenceDefinitions) {
      this.updateSequencedRun(dt, gameState);
      return;
    }

    const normalEventsActive = (gameState.obstacles?.activeEvents?.length ?? 0) > 0;
    if (this.encounterManager?.activeEncounter || !normalEventsActive) {
      this.encounterManager?.update?.(dt, {
        ...gameState,
        runController: this
      });
    }
    this.activeSwimmerSection?.update(dt, elapsedSeconds, gameState.obstacles);
  }

  shouldPauseNormalSpawns() {
    return this.encounterManager?.shouldPauseNormalSpawns?.() === true ||
      this.encounterManager?.activeEncounter !== null ||
      !this.activeSwimmerSection?.allowsSpawning?.();
  }

  obstacleOptions() {
    return this.activeSwimmerSection?.obstacleOptions?.() ?? { tierTuning: swimmerTier(this.legacyTierId) };
  }

  onEncounterCompleted(encounter, gameState = {}, details = {}) {
    const nextStage = encounter?.difficultyStageOnComplete;
    if (Number.isInteger(nextStage)) {
      this.updateCompatibilityDifficultyMirror(nextStage + 1);
      if (!this.sequenceDefinitions) {
        this.startLegacyTier(nextStage + 1, gameState.elapsedSeconds ?? 0);
      }
    }
    this.completedEncounterIds.add(details.registrationKey ?? encounter?.id);
    if (this.sequenceDefinitions && details.handoffActivated) {
      const next = this.sequenceDefinitions[this.currentBlockIndex + 1];
      if (next?.type === "encounter" && next.id === details.handoff?.targetEncounterId) {
        this.currentBlockIndex += 1;
        this.currentBlock = next;
      }
    }
    this.emit("run.block_completed", {
      elapsedSeconds: gameState.elapsedSeconds ?? 0,
      blockIndex: this.currentBlockIndex,
      blockType: "encounter",
      encounterType: encounter?.id ?? null,
      handoffActivated: details.handoffActivated === true
    });
  }

  setLegacyTier(tierId, elapsedSeconds = 0) {
    this.startLegacyTier(tierId, elapsedSeconds);
  }

  updateCompatibilityDifficultyMirror(tierId) {
    const tier = swimmerTier(tierId);
    this.legacyTierId = tier.id;
    if (this.encounterManager) this.encounterManager.difficultyStage = tier.id - 1;
    return tier;
  }

  startLegacyTier(tierId, elapsedSeconds = 0) {
    const tier = this.updateCompatibilityDifficultyMirror(tierId);
    if (this.activeSwimmerSection?.id === "legacy-endless-swimmers" && this.activeSwimmerSection.tierId === tier.id) return;
    this.activeSwimmerSection?.cleanup(elapsedSeconds, "tier-change");
    this.startLegacySwimmerSection(elapsedSeconds);
  }

  startLegacySwimmerSection(elapsedSeconds = 0) {
    this.activeSwimmerSection = new SwimmerSection(legacyEndlessSwimmerSectionDefinition(this.legacyTierId), {
      diagnostics: this.diagnostics
    });
    this.currentBlock = { type: "swimmers", id: this.activeSwimmerSection.id };
    this.activeSwimmerSection.start(elapsedSeconds);
    this.emit("run.block_started", {
      elapsedSeconds,
      blockIndex: this.currentBlockIndex,
      blockType: "swimmers",
      sectionId: this.activeSwimmerSection.id,
      tierId: this.activeSwimmerSection.tierId
    });
  }

  updateSequencedRun(dt, gameState = {}) {
    const elapsedSeconds = gameState.elapsedSeconds ?? 0;
    if (this.completed || !this.currentBlock) return;

    if (this.currentBlock.type === "swimmers") {
      this.activeSwimmerSection.update(dt, elapsedSeconds, gameState.obstacles);
      if (this.activeSwimmerSection.completed) this.advance(gameState);
      return;
    }

    this.encounterManager?.update?.(dt, { ...gameState, runController: this });
    if (!this.encounterManager?.activeEncounter && !this.encounterManager?.shouldPauseNormalSpawns?.()) {
      this.advance(gameState);
    }
  }

  startCurrentBlock(gameState = 0) {
    const state = typeof gameState === "number"
      ? { elapsedSeconds: gameState, elapsedMs: gameState * 1000 }
      : gameState;
    const elapsedSeconds = state.elapsedSeconds ?? 0;
    const definition = this.sequenceDefinitions[this.currentBlockIndex];
    if (!definition) {
      this.completed = true;
      return;
    }
    this.currentBlock = definition;
    this.emit("run.block_started", {
      elapsedSeconds,
      blockIndex: this.currentBlockIndex,
      blockType: definition.type,
      sectionId: definition.id ?? null,
      encounterType: definition.id ?? null
    });
    if (definition.type === "swimmers") {
      this.activeSwimmerSection = new SwimmerSection(definition, { diagnostics: this.diagnostics });
      this.activeSwimmerSection.start(elapsedSeconds);
      return;
    }
    this.activeSwimmerSection?.cleanup(elapsedSeconds, "encounter-transition");
    this.activeSwimmerSection = null;
    this.startEncounterBlock(definition, state);
  }

  startEncounterBlock(definition, gameState = {}) {
    if (this.encounterManager?.activeEncounter) return;
    const elapsedSeconds = gameState.elapsedSeconds ?? 0;
    const encounter = this.encounterManager?.registeredEncounters?.find((candidate) =>
      candidate.id === definition.id &&
      !this.encounterManager.completedEncounterIds?.has?.(this.encounterManager.registrationKey(candidate))
    );
    if (!encounter) throw new Error(`No registered encounter block available for ${definition.id}`);
    this.encounterManager.activateEncounter(encounter, {
      ...gameState,
      elapsedSeconds,
      elapsedMs: elapsedSeconds * 1000
    }, { source: "run-sequence" });
  }

  advance(gameState = 0) {
    if (this.completed) return;
    this.currentBlockIndex += 1;
    this.startCurrentBlock(gameState);
  }

  cleanup(elapsedSeconds = 0, reason = "cleanup") {
    this.activeSwimmerSection?.cleanup(elapsedSeconds, reason);
    this.activeSwimmerSection = null;
    this.encounterManager?.cleanupActive?.({ elapsedSeconds });
  }

  emit(type, payload) {
    this.diagnostics?.emit(type, payload);
  }
}

export function validateRunSequence(sequence) {
  if (!Array.isArray(sequence)) throw new Error("Run sequence must be an array");
  const swimmerDefinitions = sequence.filter((block) => block.type === "swimmers");
  validateSwimmerSections(swimmerDefinitions);
  for (const block of sequence) {
    if (!block || typeof block !== "object") throw new Error("Run block must be an object");
    if (block.type !== "swimmers" && block.type !== "encounter") {
      throw new Error(`Invalid run block type: ${block.type}`);
    }
    if (block.type === "encounter" && (!block.id || typeof block.id !== "string")) {
      throw new Error("Encounter block id is required");
    }
  }
  return true;
}
