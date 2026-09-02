import { CONFIG, VERSION } from "./config.js";
import { SWIMMER_TIERS } from "./obstacleTuning.js";

export const DIAGNOSTIC_SCHEMA_VERSION = "surf-run-diagnostics-v1";
export const DIAGNOSTIC_CHANNEL_NAME = "surf-run-diagnostics";
export const DIAGNOSTIC_EVENT_LIMIT = 5000;

const TERMINAL_EVENTS = new Set(["object.collision", "object.dodge_awarded", "object.removed"]);
const VALID_PHASES = new Set([
  "inactive",
  "waiting",
  "entering",
  "positioning",
  "moving-to-lane",
  "holding",
  "windup",
  "preparing-wave",
  "dumping-wave",
  "throwing",
  "post-throw",
  "wallet-airborne",
  "cooldown",
  "between-waves",
  "exiting",
  "wallet-loss-pause",
  "wallet-loss-exit",
  "complete"
]);

const VALID_PHASE_TRANSITIONS = new Map([
  ["inactive", new Set(["entering"])],
  ["waiting", new Set(["entering"])],
  ["entering", new Set(["positioning", "moving-to-lane"])],
  ["positioning", new Set(["preparing-wave"])],
  ["holding", new Set(["windup"])],
  ["moving-to-lane", new Set(["windup"])],
  ["windup", new Set(["throwing"])],
  ["preparing-wave", new Set(["dumping-wave"])],
  ["dumping-wave", new Set(["between-waves"])],
  ["throwing", new Set(["cooldown", "wallet-airborne", "post-throw", "exiting"])],
  ["post-throw", new Set(["exiting"])],
  ["wallet-airborne", new Set(["wallet-loss-pause"])],
  ["cooldown", new Set(["moving-to-lane"])],
  ["between-waves", new Set(["positioning", "exiting"])],
  ["exiting", new Set(["complete"])],
  ["wallet-loss-pause", new Set(["wallet-loss-exit"])],
  ["wallet-loss-exit", new Set(["complete"])]
]);

export class DiagnosticsSink {
  constructor({
    enabled = false,
    channelName = DIAGNOSTIC_CHANNEL_NAME,
    maxEvents = DIAGNOSTIC_EVENT_LIMIT,
    channelFactory = defaultChannelFactory
  } = {}) {
    this.enabled = enabled;
    this.channelName = channelName;
    this.maxEvents = maxEvents;
    this.channelFactory = channelFactory;
    this.channel = null;
    this.runId = null;
    this.sequence = 0;
    this.events = [];
    this.droppedEventCount = 0;
    this.objectIds = new WeakMap();
    this.nextObjectNumber = 1;
    this.occurrenceIds = new WeakMap();
    this.nextOccurrenceNumber = 1;
    this.createdObjectIds = new Set();
  }

  enable(elapsedSeconds = 0) {
    if (this.enabled) return;
    this.enabled = true;
    this.openChannel();
    this.emit("diagnostics.enabled", { elapsedSeconds });
  }

  disable(elapsedSeconds = 0) {
    if (!this.enabled) return;
    this.emit("diagnostics.disabled", { elapsedSeconds });
    this.enabled = false;
  }

  startRun({ elapsedSeconds = 0, config = CONFIG, deterministicSeed = null } = {}) {
    if (!this.enabled) return null;
    this.runId = createRunId();
    this.sequence = 0;
    this.events = [];
    this.droppedEventCount = 0;
    this.objectIds = new WeakMap();
    this.nextObjectNumber = 1;
    this.occurrenceIds = new WeakMap();
    this.nextOccurrenceNumber = 1;
    this.createdObjectIds = new Set();
    this.emit("game.start", {
      elapsedSeconds,
      deterministicSeed,
      config: diagnosticsConfigSnapshot(config),
      encounterSequence: config.ENCOUNTER_SEQUENCE
    });
    this.emit("diagnostics.enabled", { elapsedSeconds });
    return this.runId;
  }

  endRun({ elapsedSeconds = 0, finalScore = 0, headsDodged = 0, survivalTime = 0 } = {}) {
    this.emit("game.over", {
      elapsedSeconds,
      finalScore,
      headsDodged,
      survivalTime
    });
  }

  restart({ elapsedSeconds = 0, ...payload } = {}) {
    this.emit("game.restart", { elapsedSeconds, ...payload });
  }

  teardown({ elapsedSeconds = 0 } = {}) {
    this.emit("game.teardown", { elapsedSeconds });
  }

  emit(type, payload = {}) {
    if (!this.enabled) return null;
    this.openChannel();
    const event = freezeEvent({
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      gameVersion: VERSION,
      runId: this.runId,
      sequence: ++this.sequence,
      elapsedSeconds: finiteNumber(payload.elapsedSeconds, 0),
      type,
      occurrenceId: payload.occurrenceId ?? null,
      encounterType: payload.encounterType ?? null,
      objectId: payload.objectId ?? null,
      objectType: payload.objectType ?? null,
      owner: payload.owner ?? null,
      payload: stripEnvelopeFields(payload)
    });

    if (this.events.length < this.maxEvents) {
      this.events.push(event);
    } else {
      this.droppedEventCount += 1;
    }

    this.post({ kind: "diagnostic-event", event });
    return event;
  }

  objectId(object, prefix = "obj") {
    if (!this.enabled || !object || typeof object !== "object") return null;
    const existing = this.objectIds.get(object);
    if (existing) return existing;
    const id = `${prefix}-${this.nextObjectNumber++}`;
    this.objectIds.set(object, id);
    return id;
  }

  occurrenceId(encounter) {
    if (!this.enabled || !encounter || typeof encounter !== "object") return null;
    const existing = this.occurrenceIds.get(encounter);
    if (existing) return existing;
    const id = `enc-${this.nextOccurrenceNumber++}-${encounter.id ?? "unknown"}`;
    this.occurrenceIds.set(encounter, id);
    return id;
  }

  warning(message, payload = {}) {
    return this.emit("diagnostics.warning", { ...payload, message });
  }

  markObjectCreated(objectId) {
    if (!objectId) return true;
    if (this.createdObjectIds.has(objectId)) return false;
    this.createdObjectIds.add(objectId);
    return true;
  }

  openChannel() {
    if (this.channel || typeof this.channelFactory !== "function") return;
    try {
      this.channel = this.channelFactory(this.channelName);
    } catch {
      this.channel = null;
    }
  }

  post(message) {
    try {
      this.channel?.postMessage?.(message);
    } catch {
      // Diagnostics must never affect gameplay.
    }
  }
}

export function createDiagnosticsSink(options = {}) {
  return new DiagnosticsSink(options);
}

export function diagnosticsConfigSnapshot(config = CONFIG) {
  return {
    developerControls: config.DEVELOPER_CONTROLS,
    encountersEnabled: config.ENCOUNTERS_ENABLED,
    debugStartStage: config.DEBUG_START_STAGE,
    debugReducedSpeedMultiplier: config.DEBUG_REDUCED_SPEED_MULTIPLIER,
    firstEncounterTimeMs: config.FIRST_ENCOUNTER_TIME_MS,
    coolerEncounterTimeMs: config.COOLER_ENCOUNTER_TIME_MS,
    postEncounterGraceSeconds: config.COOLER_POST_ENCOUNTER_GRACE_SECONDS,
    antiCampPassivePassThreshold: config.ANTI_CAMP_PASSIVE_PASS_THRESHOLD,
    antiCampMovementThreshold: config.ANTI_CAMP_MOVEMENT_THRESHOLD,
    antiCampTelegraphSeconds: config.ANTI_CAMP_TELEGRAPH_SECONDS,
    scoreDodgeValue: config.SCORE_DODGE_VALUE,
    scoreTimeMultiplier: config.SCORE_TIME_MULTIPLIER,
    encounterSequence: config.ENCOUNTER_SEQUENCE,
    swimmerTiers: SWIMMER_TIERS
  };
}

export function createDiagnosticsReport(events, { droppedEventCount = 0 } = {}) {
  const runEvents = [...events].sort((a, b) => a.sequence - b.sequence);
  const metadata = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    gameVersion: runEvents[0]?.gameVersion ?? VERSION,
    runId: runEvents.find((event) => event.runId)?.runId ?? null,
    generatedAt: new Date().toISOString(),
    droppedEventCount
  };
  const config = runEvents.find((event) => event.type === "game.start")?.payload.config ?? null;
  const summary = summarizeEvents(runEvents, droppedEventCount);
  const invariantResults = evaluateInvariants(runEvents, summary, droppedEventCount);
  const result = invariantResults.some((check) => check.status === "fail")
    ? "FAIL"
    : summary.incomplete
      ? "INCOMPLETE"
      : "PASS";

  return {
    metadata,
    config,
    summary: summaryForJson(summary, result),
    invariantResults,
    encounterRecords: [...summary.encounters.values()],
    objectRecords: [...summary.objects.values()],
    events: runEvents.slice(0, DIAGNOSTIC_EVENT_LIMIT),
    warnings: summary.warnings,
    errors: summary.errors,
    text: formatTextReport(metadata, config, summary, invariantResults, result)
  };
}

function summaryForJson(summary, result) {
  const { encounters, objects, ...plain } = summary;
  return {
    ...plain,
    result,
    encounterCount: encounters.size,
    objectCount: objects.size
  };
}

function summarizeEvents(events, droppedEventCount) {
  const encounters = new Map();
  const objects = new Map();
  const warnings = [];
  const errors = [];
  let activeCount = 0;
  let maxActiveEncounters = 0;
  let finalScore = null;
  let nonScoringDebugRun = false;
  let runDuration = 0;
  let deterministicSeed = "not configured";
  let configuredEncounterOrder = [];
  let duplicateScoringCount = 0;
  let rowMismatchCount = 0;
  let normalSpawnViolationCount = 0;
  let cleanupRemovalCount = 0;
  let leakedObjectCount = 0;
  let repeatedRemovalCount = 0;
  let postRemovalOutcomeCount = 0;

  for (const event of events) {
    runDuration = Math.max(runDuration, event.elapsedSeconds ?? 0);
    if (event.type === "game.start") {
      deterministicSeed = event.payload.deterministicSeed ?? "not configured";
      configuredEncounterOrder = (event.payload.encounterSequence ?? []).map((entry) => entry.id);
    }
    if (event.type === "game.over") {
      finalScore = event.payload.finalScore;
      nonScoringDebugRun = nonScoringDebugRun || event.payload.nonScoringDebugRun === true;
    }
    if (event.type === "encounter.debug_trigger_accepted") nonScoringDebugRun = true;
    if (event.type === "diagnostics.warning") warnings.push(event.payload.message);
    if (event.type === "diagnostics.error") errors.push(event.payload.message);

    if (event.occurrenceId) {
      const record = ensureEncounter(encounters, event);
      record.events += 1;
      record.lastElapsedSeconds = event.elapsedSeconds;
      if (event.type === "encounter.scheduled") {
        record.scheduled = true;
        record.handoffToNext = event.payload.handoffToNext === true;
        record.immediateSuccessorId = event.payload.immediateSuccessorId ?? null;
      }
      if (event.type === "encounter.activated") {
        record.activationCount += 1;
        activeCount += 1;
        maxActiveEncounters = Math.max(maxActiveEncounters, activeCount);
      }
      if (event.type === "encounter.phase_transition") {
        record.phases.push(event.payload.to);
      }
      if (event.type === "encounter.completed") {
        record.completionCount += 1;
        activeCount = Math.max(0, activeCount - 1);
      }
      if (event.type === "encounter.cleanup_finished") {
        record.cleanupFinished = true;
        record.remainingOwnedObjects = event.payload.remainingOwnedObjects ?? "not observed";
        if (Number.isFinite(event.payload.remainingOwnedObjects)) {
          leakedObjectCount += event.payload.remainingOwnedObjects;
        }
      }
    }

    if (event.objectId) {
      const record = ensureObject(objects, event);
      record.events += 1;
      if (event.type === "object.created") {
        record.created = true;
        record.row = event.payload.row ?? null;
        record.owner = event.owner;
      }
      if (event.type === "object.rowboat_release") {
        record.rowboatRow = event.payload.rowboatRow ?? null;
        record.releasedItemRow = event.payload.releasedItemRow ?? null;
        if (record.rowboatRow !== record.releasedItemRow) rowMismatchCount += 1;
      }
      if (event.type === "object.dodge_awarded") {
        record.dodgeCount += 1;
        if (record.dodgeCount > 1) duplicateScoringCount += 1;
        if (record.removed) postRemovalOutcomeCount += 1;
      }
      if (event.type === "object.collision" && record.removed) postRemovalOutcomeCount += 1;
      if (TERMINAL_EVENTS.has(event.type)) {
        record.terminalEvents.push(event.type);
        record.terminalReason = event.payload.reason ?? event.type;
      }
      if (event.type === "object.removed") {
        if (record.removed) repeatedRemovalCount += 1;
        record.removed = true;
        if (event.payload.reason === "cleanup") cleanupRemovalCount += 1;
      }
    }

    if (event.type === "normal_spawn.violation") normalSpawnViolationCount += 1;
  }

  const scheduledCount = [...encounters.values()].filter((record) => record.scheduled).length;
  const activatedCount = [...encounters.values()].filter((record) => record.activationCount > 0).length;
  const completedCount = [...encounters.values()].filter((record) => record.completionCount > 0).length;
  const incompleteCount = [...encounters.values()].filter((record) => record.activationCount > record.completionCount).length;

  return {
    runDuration,
    finalScore,
    nonScoringDebugRun,
    deterministicSeed,
    configuredEncounterOrder,
    scheduledCount,
    activatedCount,
    completedCount,
    incompleteCount,
    maxActiveEncounters,
    duplicateScoringCount,
    rowMismatchCount,
    normalSpawnViolationCount,
    cleanupRemovalCount,
    leakedObjectCount,
    repeatedRemovalCount,
    postRemovalOutcomeCount,
    encounters,
    objects,
    warnings,
    errors,
    incomplete: droppedEventCount > 0 || events.length === 0 || !events.some((event) => event.type === "game.over")
  };
}

function evaluateInvariants(events, summary, droppedEventCount) {
  const checks = [];
  addCheck(checks, "No more than one encounter is active at a time", summary.maxActiveEncounters <= 1);
  addCheck(checks, "Each encounter occurrence activates at most once", [...summary.encounters.values()].every((record) => record.activationCount <= 1));
  addCheck(checks, "Each occurrence completes at most once", [...summary.encounters.values()].every((record) => record.completionCount <= 1));
  addCheck(checks, "Phase transitions follow the observed lifecycle order", phasesAreValid(summary.encounters));
  addCheck(checks, "Normal spawning is suppressed while required", summary.normalSpawnViolationCount === 0);
  addCheck(checks, "Grace starts and ends in order", graceOrderIsValid(events));
  addCheck(checks, "Each encounter-created object has a valid owner", [...summary.objects.values()].every((record) => record.owner || record.objectType === "normal-obstacle"));
  addCheck(checks, "Every object reaches a terminal outcome", [...summary.objects.values()].every((record) => record.terminalEvents.length > 0));
  addCheck(checks, "Each object awards a dodge no more than once", summary.duplicateScoringCount === 0);
  addCheck(checks, "No object is removed more than once", summary.repeatedRemovalCount === 0);
  addCheck(checks, "No collision or dodge is recorded after removal", summary.postRemovalOutcomeCount === 0);
  addCheck(checks, "Rowboat items release into the occupied row", summary.rowMismatchCount === 0);
  addCheck(checks, "No encounter is incomplete at game over", summary.incompleteCount === 0);
  addCheck(checks, "Multi-object activity completes after owned objects are terminal", multiObjectCompletionObserved(summary));
  checks.push(cleanupObjectCheck(summary));
  addCheck(checks, "Back-to-back repeated encounter types use distinct occurrence IDs", repeatedTypesHaveDistinctIds(summary));
  addCheck(checks, "Restart begins a new run without observed object leakage", restartLeakCheck(events));

  checks.push({
    name: "Temporary timer or closure cleanup",
    status: "not_observed",
    detail: "No invasive timer or closure inspection is available."
  });

  if (droppedEventCount > 0) {
    checks.push({
      name: "Complete event capture",
      status: "not_observed",
      detail: `${droppedEventCount} events were dropped after the configured limit.`
    });
  }

  return checks;
}

function formatTextReport(metadata, config, summary, checks, result) {
  const lines = [
    "Surfing Run Diagnostics",
    `Game version: ${metadata.gameVersion}`,
    `Schema version: ${metadata.schemaVersion}`,
    `Run ID: ${metadata.runId ?? "not captured"}`,
    `Run duration: ${summary.runDuration.toFixed(2)}s`,
    `Final score: ${summary.finalScore ?? "not captured"}`,
    `Non-scoring debug run: ${summary.nonScoringDebugRun ? "yes" : "no"}`,
    `Deterministic seed: ${summary.deterministicSeed}`,
    `Configured encounter order: ${summary.configuredEncounterOrder.join(", ") || "none"}`,
    `Scheduled / activated / completed / incomplete: ${summary.scheduledCount} / ${summary.activatedCount} / ${summary.completedCount} / ${summary.incompleteCount}`,
    `Maximum simultaneously active encounters: ${summary.maxActiveEncounters}`,
    `Collisions: ${countEvents(summary.objects, "object.collision")}`,
    `Dodges: ${countDodges(summary.objects)}`,
    `Removals: ${countEvents(summary.objects, "object.removed")}`,
    `Cleanup removals: ${summary.cleanupRemovalCount}`,
    `Duplicate scoring count: ${summary.duplicateScoringCount}`,
    `Rowboat/item row mismatch count: ${summary.rowMismatchCount}`,
    `Normal-spawn violation count: ${summary.normalSpawnViolationCount}`,
    `Leaked-object count: ${summary.leakedObjectCount}`,
    "",
    "Encounter timeline:"
  ];

  for (const record of summary.encounters.values()) {
    lines.push(`- ${record.occurrenceId} ${record.encounterType}: ${record.phases.join(" -> ") || "no phases"}`);
  }

  lines.push("", "Per-encounter object totals:");
  for (const record of summary.encounters.values()) {
    const objectCount = [...summary.objects.values()].filter((object) => object.owner === record.occurrenceId).length;
    lines.push(`- ${record.occurrenceId}: ${objectCount}`);
  }

  lines.push("", "Warnings and invariant violations:");
  const failed = checks.filter((check) => check.status === "fail");
  if (!summary.warnings.length && !summary.errors.length && !failed.length) {
    lines.push("- none");
  }
  for (const warning of summary.warnings) lines.push(`- warning: ${warning}`);
  for (const error of summary.errors) lines.push(`- error: ${error}`);
  for (const check of failed) lines.push(`- failed: ${check.name}`);

  lines.push("", "Checks not observed:");
  const notObserved = checks.filter((check) => check.status === "not_observed");
  if (!notObserved.length) lines.push("- none");
  for (const check of notObserved) lines.push(`- ${check.name}: ${check.detail}`);

  lines.push("", `Final result: ${result}`);
  return lines.join("\n");
}

function ensureEncounter(encounters, event) {
  if (!encounters.has(event.occurrenceId)) {
    encounters.set(event.occurrenceId, {
      occurrenceId: event.occurrenceId,
      encounterType: event.encounterType,
      scheduled: false,
      activationCount: 0,
      completionCount: 0,
      cleanupFinished: false,
      remainingOwnedObjects: "not observed",
      phases: [],
      handoffToNext: false,
      immediateSuccessorId: null,
      events: 0,
      lastElapsedSeconds: 0
    });
  }
  return encounters.get(event.occurrenceId);
}

function ensureObject(objects, event) {
  if (!objects.has(event.objectId)) {
    objects.set(event.objectId, {
      objectId: event.objectId,
      objectType: event.objectType,
      owner: event.owner,
      created: false,
      row: null,
      rowboatRow: null,
      releasedItemRow: null,
      dodgeCount: 0,
      terminalEvents: [],
      terminalReason: null,
      removed: false,
      events: 0
    });
  }
  return objects.get(event.objectId);
}

function addCheck(checks, name, passed) {
  checks.push({ name, status: passed ? "pass" : "fail" });
}

function phasesAreValid(encounters) {
  return [...encounters.values()].every((record) => {
    let previousPhase = null;
    for (const phase of record.phases) {
      if (!VALID_PHASES.has(phase)) return false;
      if (
        previousPhase &&
        phase !== previousPhase &&
        !VALID_PHASE_TRANSITIONS.get(previousPhase)?.has(phase) &&
        !isConfiguredCoolerHandoffCompletion(record, previousPhase, phase)
      ) {
        return false;
      }
      previousPhase = phase;
    }
    return true;
  });
}

function isConfiguredCoolerHandoffCompletion(record, previousPhase, phase) {
  return record.encounterType === "angry-fisherman-cooler" &&
    record.handoffToNext === true &&
    typeof record.immediateSuccessorId === "string" &&
    record.immediateSuccessorId.length > 0 &&
    previousPhase === "between-waves" &&
    phase === "complete";
}

function graceOrderIsValid(events) {
  const started = new Set();
  for (const event of events) {
    if (!event.occurrenceId) continue;
    if (event.type === "encounter.grace_started") started.add(event.occurrenceId);
    if (event.type === "encounter.grace_ended" && !started.has(event.occurrenceId)) return false;
  }
  return true;
}

function multiObjectCompletionObserved(summary) {
  for (const encounter of summary.encounters.values()) {
    const objects = [...summary.objects.values()].filter((object) => object.owner === encounter.occurrenceId);
    if (objects.length > 1 && encounter.completionCount > 0 && objects.some((object) => object.terminalEvents.length === 0)) {
      return false;
    }
  }
  return true;
}

function cleanupObjectCheck(summary) {
  if (summary.leakedObjectCount > 0) {
    return {
      name: "Cleanup leaves no owned gameplay objects behind",
      status: "fail"
    };
  }
  const cleanupRecords = [...summary.encounters.values()].filter((record) => record.cleanupFinished);
  if (cleanupRecords.some((record) => record.remainingOwnedObjects === "not observed")) {
    return {
      name: "Cleanup leaves no owned gameplay objects behind",
      status: "not_observed",
      detail: "At least one cleanup did not provide an owned-object count."
    };
  }
  return {
    name: "Cleanup leaves no owned gameplay objects behind",
    status: "pass"
  };
}

function repeatedTypesHaveDistinctIds(summary) {
  const byType = new Map();
  for (const record of summary.encounters.values()) {
    const ids = byType.get(record.encounterType) ?? new Set();
    if (ids.has(record.occurrenceId)) return false;
    ids.add(record.occurrenceId);
    byType.set(record.encounterType, ids);
  }
  return true;
}

function restartLeakCheck(events) {
  return !events.some((event) => event.type === "game.restart" && event.payload.previousRunOpenObjects > 0);
}

function countEvents(objects, type) {
  return [...objects.values()].filter((object) => object.terminalEvents.includes(type)).length;
}

function countDodges(objects) {
  return [...objects.values()].reduce((total, object) => total + object.dodgeCount, 0);
}

function stripEnvelopeFields(payload) {
  const {
    elapsedSeconds,
    occurrenceId,
    encounterType,
    objectId,
    objectType,
    owner,
    ...rest
  } = payload;
  return structuredCloneSafe(rest);
}

function freezeEvent(event) {
  return Object.freeze(structuredCloneSafe(event));
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function createRunId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `run-${Date.now().toString(36)}-${randomPart}`;
}

function defaultChannelFactory(channelName) {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(channelName);
}
