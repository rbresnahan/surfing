import { CONFIG } from "./config.js";

export class EncounterManager {
  constructor({ diagnostics = null, debugEncounterFactory = null, onEncounterCompleted = null } = {}) {
    this.diagnostics = diagnostics;
    this.debugEncounterFactory = debugEncounterFactory;
    this.onEncounterCompleted = onEncounterCompleted;
    this.registeredEncounters = [];
    this.registrationKeys = new WeakMap();
    this.reset();
  }

  register(encounter) {
    this.registrationKeys.set(encounter, `${this.registeredEncounters.length}:${encounter.id}`);
    this.registeredEncounters.push(encounter);
  }

  reset() {
    if (this.activeEncounter) {
      this.recordCleanupStarted(this.activeEncounter, this.lastElapsedSeconds ?? 0);
      this.activeEncounter.cleanup();
      this.recordCleanupFinished(this.activeEncounter, this.lastElapsedSeconds ?? 0);
    }
    for (const encounter of this.registeredEncounters) {
      if (encounter === this.activeEncounter) continue;
      this.recordCleanupStarted(encounter, this.lastElapsedSeconds ?? 0);
      encounter.cleanup?.();
      this.recordCleanupFinished(encounter, this.lastElapsedSeconds ?? 0);
    }
    this.activeEncounter = null;
    this.completedEncounterIds = new Set();
    this.startedMajorEncounter = false;
    this.postEncounterGraceTimer = 0;
    this.difficultyStage = CONFIG.DEBUG_START_STAGE ?? 0;
    this.nonScoringDebugRun = CONFIG.DEBUG_START_STAGE !== null || CONFIG.DEBUG_REDUCED_SPEED_MULTIPLIER !== 1;
    this.activePhase = null;
    this.lastElapsedSeconds = 0;
    this.lastGraceOwner = null;
    this.pendingHandoff = null;
    this.scheduleRegisteredEncounters();
  }

  update(dt, gameState) {
    if (!CONFIG.ENCOUNTERS_ENABLED) return;
    this.lastElapsedSeconds = gameState.elapsedSeconds ?? 0;

    if (this.postEncounterGraceTimer > 0) {
      this.postEncounterGraceTimer = Math.max(0, this.postEncounterGraceTimer - dt);
      if (this.postEncounterGraceTimer === 0 && this.lastGraceOwner) {
        this.diagnostics?.emit("encounter.grace_ended", {
          elapsedSeconds: gameState.elapsedSeconds ?? 0,
          occurrenceId: this.lastGraceOwner.occurrenceId,
          encounterType: this.lastGraceOwner.encounterType,
          owner: this.lastGraceOwner.occurrenceId
        });
        this.lastGraceOwner = null;
      }
      return;
    }

    if (this.activeEncounter) {
      this.activeEncounter.update(dt, gameState);
      this.recordPhaseIfChanged(this.activeEncounter, gameState.elapsedSeconds ?? 0);
      if (this.activeEncounter.isComplete()) {
        this.completeActiveEncounter(gameState);
      }
      return;
    }

    const encounter = this.selectEncounter(gameState);
    if (!encounter) return;

    this.activateEncounter(encounter, gameState, { source: "scheduled" });
  }

  triggerDebugEncounter(encounterId, gameState, {
    developerControlsEnabled = false,
    gameRunning = false,
    swimmerTierTestActive = false
  } = {}) {
    const reject = (reason) => {
      this.diagnostics?.emit("encounter.debug_trigger_rejected", {
        elapsedSeconds: gameState?.elapsedSeconds ?? this.lastElapsedSeconds ?? 0,
        encounterType: encounterId ?? null,
        reason
      });
      return { ok: false, reason };
    };

    if (!developerControlsEnabled) return reject("developer-controls-disabled");
    if (!gameRunning) return reject("no-running-game");
    if (swimmerTierTestActive || gameState?.runController?.isDebugSwimmerTierActive?.()) return reject("active-swimmer-tier-test");
    if (this.activeEncounter) return reject("active-encounter");

    const encounter = this.debugEncounterFactory?.(encounterId) ?? null;
    if (!encounter) return reject("unknown-encounter");

    this.postEncounterGraceTimer = 0;
    this.lastGraceOwner = null;
    this.nonScoringDebugRun = true;
    this.diagnostics?.emit("encounter.debug_trigger_accepted", {
      elapsedSeconds: gameState?.elapsedSeconds ?? this.lastElapsedSeconds ?? 0,
      encounterType: encounter.id
    });
    this.activateEncounter(encounter, gameState, { source: "debug" });
    return { ok: true, reason: "accepted", encounterId: encounter.id };
  }

  activateEncounter(encounter, gameState, { source = "scheduled" } = {}) {
    this.activeEncounter = encounter;
    if (source === "scheduled" && encounter.type === "major") {
      this.startedMajorEncounter = true;
    }
    const occurrenceId = this.diagnostics?.occurrenceId(encounter);
    encounter.start({
      ...gameState,
      diagnostics: this.diagnostics,
      occurrenceId
    });
    this.activePhase = "inactive";
    this.diagnostics?.emit("encounter.activated", {
      elapsedSeconds: gameState.elapsedSeconds ?? 0,
      occurrenceId,
      encounterType: encounter.id,
      owner: occurrenceId,
      phase: encounterPhase(encounter),
      source,
      handoffToNext: encounter.handoffToNext === true,
      immediateSuccessorId: encounter.immediateSuccessorId ?? null
    });
    this.recordPhaseIfChanged(encounter, gameState.elapsedSeconds ?? 0, true);
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
    this.recordCleanupStarted(this.activeEncounter, gameState?.elapsedSeconds ?? this.lastElapsedSeconds ?? 0);
    this.activeEncounter.cleanup(gameState);
    this.recordCleanupFinished(this.activeEncounter, gameState?.elapsedSeconds ?? this.lastElapsedSeconds ?? 0, gameState);
    this.activeEncounter = null;
    this.activePhase = null;
  }

  selectEncounter(gameState) {
    const candidates = this.registeredEncounters.filter((encounter) => {
      if (this.completedEncounterIds.has(this.registrationKey(encounter))) return false;
      if (encounter.type === "major" && this.startedMajorEncounter) return false;
      if (encounter.exclusive && this.hasExclusiveEncounter()) return false;
      return encounter.canStart(gameState);
    });

    return candidates[0] ?? null;
  }

  completeActiveEncounter(gameState) {
    const encounter = this.activeEncounter;
    if (this.registrationKeys.has(encounter)) {
      this.completedEncounterIds.add(this.registrationKey(encounter));
    }
    const occurrenceId = this.diagnostics?.occurrenceId(encounter);
    const handoff = this.createCompletionHandoff(encounter);
    this.diagnostics?.emit("encounter.completed", {
      elapsedSeconds: gameState.elapsedSeconds ?? 0,
      occurrenceId,
      encounterType: encounter.id,
      owner: occurrenceId,
      handoffToNext: encounter.handoffToNext === true,
      immediateSuccessorId: encounter.immediateSuccessorId ?? null
    });
    this.recordCleanupStarted(encounter, gameState.elapsedSeconds ?? 0);
    encounter.cleanup(gameState);
    this.recordCleanupFinished(encounter, gameState.elapsedSeconds ?? 0, gameState);
    this.activeEncounter = null;
    this.activePhase = null;
    const handoffActivated = this.activateHandoffSuccessor(encounter, handoff, gameState);
    this.onEncounterCompleted?.(encounter, gameState, {
      handoffActivated,
      registrationKey: this.registrationKey(encounter),
      handoff
    });
    if (!handoffActivated) {
      this.startPostEncounterGrace(encounter, occurrenceId, gameState);
    }
  }

  hasExclusiveEncounter() {
    return this.activeEncounter?.exclusive === true;
  }

  registrationKey(encounter) {
    return this.registrationKeys.get(encounter) ?? encounter.id;
  }

  createCompletionHandoff(encounter) {
    const handoff = encounter.createHandoffState?.() ?? null;
    if (!handoff || typeof handoff !== "object") return null;
    if (typeof handoff.targetEncounterId !== "string") return null;
    return handoff;
  }

  activateHandoffSuccessor(previousEncounter, handoff, gameState) {
    if (!handoff) return false;
    const successor = this.nextRegisteredEncounter(previousEncounter);
    if (!successor || successor.id !== handoff.targetEncounterId) return false;
    if (this.completedEncounterIds.has(this.registrationKey(successor))) return false;
    if (successor.exclusive && this.hasExclusiveEncounter()) return false;
    if (successor.canStartWithHandoff?.(handoff, gameState) === false) return false;

    this.pendingHandoff = handoff;
    this.activateEncounter(successor, {
      ...gameState,
      encounterHandoff: handoff
    }, { source: "handoff" });
    this.pendingHandoff = null;
    return true;
  }

  nextRegisteredEncounter(encounter) {
    const index = this.registeredEncounters.indexOf(encounter);
    return index >= 0 ? this.registeredEncounters[index + 1] ?? null : null;
  }

  startPostEncounterGrace(encounter, occurrenceId, gameState) {
    this.postEncounterGraceTimer = encounter.postEncounterGraceSeconds ?? 0;
    if (this.postEncounterGraceTimer <= 0) return;
    this.lastGraceOwner = { occurrenceId, encounterType: encounter.id };
    this.diagnostics?.emit("encounter.grace_started", {
      elapsedSeconds: gameState.elapsedSeconds ?? 0,
      occurrenceId,
      encounterType: encounter.id,
      owner: occurrenceId,
      durationSeconds: this.postEncounterGraceTimer
    });
  }

  scheduleRegisteredEncounters() {
    if (!this.diagnostics?.enabled) return;
    for (const encounter of this.registeredEncounters) {
      const occurrenceId = this.diagnostics.occurrenceId(encounter);
      this.diagnostics.emit("encounter.scheduled", {
        elapsedSeconds: 0,
        occurrenceId,
        encounterType: encounter.id,
        owner: occurrenceId,
        startTimeMs: encounter.startTimeMs ?? null,
        type: encounter.type ?? null,
        handoffToNext: encounter.handoffToNext === true,
        immediateSuccessorId: encounter.immediateSuccessorId ?? null
      });
    }
  }

  recordPhaseIfChanged(encounter, elapsedSeconds, force = false) {
    if (!this.diagnostics?.enabled) return;
    const nextPhase = encounterPhase(encounter);
    if (!force && nextPhase === this.activePhase) return;
    const previousPhase = this.activePhase;
    this.activePhase = nextPhase;
    const occurrenceId = this.diagnostics.occurrenceId(encounter);
    this.diagnostics.emit("encounter.phase_transition", {
      elapsedSeconds,
      occurrenceId,
      encounterType: encounter.id,
      owner: occurrenceId,
      from: previousPhase,
      to: nextPhase
    });
  }

  recordCleanupStarted(encounter, elapsedSeconds) {
    if (!this.diagnostics?.enabled) return;
    const occurrenceId = this.diagnostics.occurrenceId(encounter);
    this.diagnostics.emit("encounter.cleanup_started", {
      elapsedSeconds,
      occurrenceId,
      encounterType: encounter.id,
      owner: occurrenceId
    });
  }

  recordCleanupFinished(encounter, elapsedSeconds, gameState = null) {
    if (!this.diagnostics?.enabled) return;
    const occurrenceId = this.diagnostics.occurrenceId(encounter);
    this.diagnostics.emit("encounter.cleanup_finished", {
      elapsedSeconds,
      occurrenceId,
      encounterType: encounter.id,
      owner: occurrenceId,
      remainingOwnedObjects: gameState?.obstacles?.countEncounterObstaclesBySource?.(encounter.id) ?? "not observed",
      temporaryState: "not observed"
    });
  }
}

function encounterPhase(encounter) {
  return normalizePhase(encounter.phase ?? encounter.state ?? "inactive");
}

function normalizePhase(phase) {
  return String(phase).toLowerCase().replaceAll("_", "-");
}
