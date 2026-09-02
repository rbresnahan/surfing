import { PATTERN_BY_ID } from "./obstaclePatterns.js";
import { DeterministicObstacleScheduler } from "./obstacles.js";
import { assertPlayableSwimmerTier, swimmerTier } from "./obstacleTuning.js";

const COMPLETION_TYPES = new Set(["patterns", "activeDuration", "endless"]);
const OVERRIDABLE_TUNING_FIELDS = new Set([
  "speed",
  "spawnDelaySeconds",
  "rowRelease",
  "releaseProgress",
  "maxActivePerRow"
]);

export class SwimmerSection {
  constructor(definition, { diagnostics = null } = {}) {
    validateSwimmerSectionDefinition(definition);
    this.definition = structuredCloneSafe(definition);
    this.diagnostics = diagnostics;
    this.reset();
  }

  get id() {
    return this.definition.id;
  }

  get tierId() {
    return this.definition.tier;
  }

  get completion() {
    return this.definition.completion;
  }

  get isActive() {
    return this.started && !this.completed;
  }

  reset() {
    this.tier = buildEffectiveTier(this.definition);
    this.scheduler = new DeterministicObstacleScheduler({
      tier: this.tier,
      patternIds: this.tier.schedule
    });
    this.started = false;
    this.activeGameplayStarted = false;
    this.activeSeconds = 0;
    this.patternsSpawned = 0;
    this.patternsCompleted = 0;
    this.draining = false;
    this.completed = false;
    this.completionEmitted = false;
    this.eventIds = new WeakMap();
    this.nextEventNumber = 1;
  }

  start(elapsedSeconds = 0) {
    this.reset();
    this.started = true;
    this.emit("swimmer_section.started", {
      elapsedSeconds,
      sectionId: this.id,
      tierId: this.tierId,
      completionType: this.completion.type
    });
  }

  update(dt, elapsedSeconds = 0, obstacles = null) {
    if (!this.isActive) return;
    if (this.activeGameplayStarted && !this.draining && this.completion.type === "activeDuration") {
      this.activeSeconds += dt;
      if (this.activeSeconds >= this.completion.seconds) {
        this.startDraining(elapsedSeconds);
      }
    }
    this.checkCompletion(elapsedSeconds, obstacles);
  }

  shouldSchedule() {
    return this.isActive && !this.draining;
  }

  allowsSpawning() {
    return this.isActive && !this.draining;
  }

  obstacleOptions() {
    return {
      swimmerSection: this,
      tierTuning: this.tier,
      scheduler: this.scheduler
    };
  }

  recordPatternSpawned(event, elapsedSeconds = 0) {
    if (!this.isActive) return;
    const eventId = `${this.id}-pattern-${this.nextEventNumber++}`;
    this.eventIds.set(event, eventId);
    event.sectionId = this.id;
    event.sectionEventId = eventId;
    for (const head of event.heads) {
      head.sectionId = this.id;
      head.sectionEventId = eventId;
      head.diagnosticsOwner = this.id;
    }
    this.patternsSpawned += 1;
    if (!this.activeGameplayStarted) {
      this.activeGameplayStarted = true;
      this.emit("swimmer_section.active_started", {
        elapsedSeconds,
        sectionId: this.id,
        tierId: this.tierId
      });
    }
    this.emit("swimmer_section.pattern_spawned", {
      elapsedSeconds,
      sectionId: this.id,
      tierId: this.tierId,
      patternId: event.patternId,
      sectionEventId: eventId,
      patternsSpawned: this.patternsSpawned
    });
    if (this.completion.type === "patterns" && this.patternsSpawned >= this.completion.count) {
      this.startDraining(elapsedSeconds);
    }
  }

  recordPatternCompleted(event, elapsedSeconds = 0) {
    if (!this.started || event.sectionId !== this.id || event.sectionCompleted) return;
    event.sectionCompleted = true;
    this.patternsCompleted += 1;
    this.emit("swimmer_section.pattern_completed", {
      elapsedSeconds,
      sectionId: this.id,
      tierId: this.tierId,
      patternId: event.patternId,
      sectionEventId: event.sectionEventId ?? this.eventIds.get(event) ?? null,
      patternsCompleted: this.patternsCompleted
    });
    this.checkCompletion(elapsedSeconds);
  }

  startDraining(elapsedSeconds = 0) {
    if (this.draining) return;
    this.draining = true;
    this.emit("swimmer_section.draining_started", {
      elapsedSeconds,
      sectionId: this.id,
      tierId: this.tierId,
      patternsSpawned: this.patternsSpawned,
      patternsCompleted: this.patternsCompleted
    });
  }

  checkCompletion(elapsedSeconds = 0, obstacles = null) {
    if (!this.isActive || this.completion.type === "endless" || !this.draining) return;
    if (obstacles?.countNormalEventsBySection?.(this.id) > 0) return;
    this.complete(elapsedSeconds);
  }

  complete(elapsedSeconds = 0) {
    if (this.completed) return;
    this.completed = true;
    if (this.completionEmitted) return;
    this.completionEmitted = true;
    this.emit("swimmer_section.completed", {
      elapsedSeconds,
      sectionId: this.id,
      tierId: this.tierId,
      patternsSpawned: this.patternsSpawned,
      patternsCompleted: this.patternsCompleted
    });
  }

  cleanup(elapsedSeconds = 0, reason = "cleanup") {
    this.emit("swimmer_section.cleanup", {
      elapsedSeconds,
      sectionId: this.id,
      tierId: this.tierId,
      reason
    });
    this.reset();
  }

  emit(type, payload) {
    this.diagnostics?.emit(type, payload);
  }
}

export function validateSwimmerSectionDefinition(definition) {
  if (!definition || typeof definition !== "object") throw new Error("Swimmer section definition is required");
  if (!definition.id || typeof definition.id !== "string") throw new Error("Swimmer section id is required");
  const tier = swimmerTier(definition.tier);
  validatePlayableTier(definition, tier);
  const completion = definition.completion;
  if (!completion || typeof completion !== "object") throw new Error(`${definition.id}: completion is required`);
  if (!COMPLETION_TYPES.has(completion.type)) throw new Error(`${definition.id}: invalid completion type ${completion.type}`);
  if (completion.type === "patterns" && (!Number.isInteger(completion.count) || completion.count <= 0)) {
    throw new Error(`${definition.id}: pattern completion count must be > 0`);
  }
  if (completion.type === "activeDuration" && (!Number.isFinite(completion.seconds) || completion.seconds <= 0)) {
    throw new Error(`${definition.id}: active duration seconds must be > 0`);
  }
  if (completion.type === "endless" && Object.keys(completion).some((key) => key !== "type")) {
    throw new Error(`${definition.id}: endless completion must not include extra configuration`);
  }
  validatePatternSubset(definition, tier);
  validateTuningOverrides(definition, tier);
  return true;
}

export function validateSwimmerSections(definitions) {
  const ids = new Set();
  for (const definition of definitions) {
    validateSwimmerSectionDefinition(definition);
    if (ids.has(definition.id)) throw new Error(`Duplicate swimmer section id: ${definition.id}`);
    ids.add(definition.id);
  }
  return true;
}

export function buildEffectiveTier(definition) {
  const tier = swimmerTier(definition.tier);
  validateSwimmerSectionDefinition(definition);
  return {
    ...tier,
    schedule: definition.patternIds ? [...definition.patternIds] : [...tier.schedule],
    ...(definition.tuning ?? {})
  };
}

function validatePlayableTier(definition, tier) {
  assertPlayableSwimmerTier(tier, definition.id);
}

function validatePatternSubset(definition, tier) {
  if (definition.patternIds === undefined) return;
  if (!Array.isArray(definition.patternIds) || definition.patternIds.length === 0) {
    throw new Error(`${definition.id}: patternIds must be a non-empty array`);
  }
  const allowed = new Set(tier.schedule);
  for (const patternId of definition.patternIds) {
    if (!PATTERN_BY_ID[patternId]) throw new Error(`${definition.id}: unknown pattern ${patternId}`);
    if (!allowed.has(patternId)) throw new Error(`${definition.id}: pattern ${patternId} is outside tier ${tier.id}`);
  }
}

function validateTuningOverrides(definition, tier) {
  const overrides = definition.tuning;
  if (overrides === undefined) return;
  if (!overrides || typeof overrides !== "object") throw new Error(`${definition.id}: tuning must be an object`);
  for (const [field, value] of Object.entries(overrides)) {
    if (!OVERRIDABLE_TUNING_FIELDS.has(field)) throw new Error(`${definition.id}: unsupported tuning override ${field}`);
    if (field === "speed" && (!Number.isFinite(value) || value > tier.speed || value <= 0)) {
      throw new Error(`${definition.id}: speed override exceeds tier ${tier.id}`);
    }
    if (field === "spawnDelaySeconds" && (!Number.isFinite(value) || value < tier.spawnDelaySeconds || value <= 0)) {
      throw new Error(`${definition.id}: spawn delay override exceeds tier ${tier.id}`);
    }
    if (field === "maxActivePerRow" && (!Number.isInteger(value) || value > tier.maxActivePerRow || value <= 0)) {
      throw new Error(`${definition.id}: maxActivePerRow override exceeds tier ${tier.id}`);
    }
    if (field === "releaseProgress" && (!Number.isFinite(value) || value < tier.releaseProgress || value > 1)) {
      throw new Error(`${definition.id}: releaseProgress override exceeds tier ${tier.id}`);
    }
    if (field === "rowRelease" && value !== tier.rowRelease) {
      throw new Error(`${definition.id}: rowRelease override exceeds tier ${tier.id}`);
    }
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
