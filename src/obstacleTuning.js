export const SWIMMER_TIERS = {
  1: {
    id: 1,
    legacyStage: 0,
    name: "foundation",
    contentStatus: "ready",
    rowRelease: "fade",
    releaseProgress: 1,
    maxActivePerRow: 1,
    spawnDelaySeconds: 0.78,
    speed: 180,
    schedule: [
      "opening-single-low",
      "opening-single-high",
      "opening-pair-wide",
      "opening-gate-top",
      "opening-gate-bottom",
      "opening-single-center"
    ]
  },
  2: {
    id: 2,
    legacyStage: 1,
    name: "weave",
    contentStatus: "ready",
    rowRelease: "progress",
    releaseProgress: 0.6,
    maxActivePerRow: 2,
    spawnDelaySeconds: 0.58,
    speed: 230,
    schedule: [
      "stage1-alternating-openings",
      "stage1-same-row-follow",
      "stage1-high-low",
      "stage1-low-high",
      "center-gate",
      "stage1-diagonal"
    ]
  },
  3: {
    id: 3,
    legacyStage: 2,
    name: "pressure",
    contentStatus: "ready",
    rowRelease: "progress",
    releaseProgress: 0.5,
    maxActivePerRow: 2,
    spawnDelaySeconds: 0.46,
    speed: 260,
    schedule: [
      "stage2-staggered-diagonal",
      "stage2-sweeping-staircase",
      "sweeping-staircase",
      "stage2-split-clusters",
      "stage2-dense-gate",
      "stage2-long-weave"
    ]
  },
  4: {
    id: 4,
    name: "advanced",
    contentStatus: "ready",
    rowRelease: "progress",
    releaseProgress: 0.45,
    maxActivePerRow: 2,
    spawnDelaySeconds: 0.4,
    speed: 290,
    schedule: [
      "diagonal-weave",
      "split-clusters",
      "advanced-pressure-release",
      "advanced-route-migration"
    ]
  },
  5: {
    id: 5,
    name: "escalated",
    contentStatus: "ready",
    rowRelease: "progress",
    releaseProgress: 0.4,
    maxActivePerRow: 2,
    spawnDelaySeconds: 0.34,
    speed: 320,
    schedule: [
      "dense-finale",
      "escalated-cross-pressure",
      "escalated-endurance-weave"
    ]
  }
};

export const LEGACY_SWIMMER_TIER_IDS = [1, 2, 3];

export const DIFFICULTY_STAGES = LEGACY_SWIMMER_TIER_IDS.map((tierId) => {
  const tier = SWIMMER_TIERS[tierId];
  return {
    ...tier,
    id: tier.legacyStage,
    tier: tier.id
  };
});

export const PATTERN_SCHEDULE = DIFFICULTY_STAGES.flatMap((stage) =>
  stage.schedule.map((patternId, index) => ({
    stage: stage.id,
    index,
    patternId
  }))
);

export const PATTERN_VALIDATION = {
  collisionPadding: 6,
  reactionSeconds: 0.18,
  yStep: 6,
  timestepSeconds: 0.08
};

export const DEBUG_TUNING = {
  showRows: false,
  startStage: null,
  reducedSpeedMultiplier: 1
};

export function swimmerTier(tierId) {
  if (!Number.isInteger(tierId)) {
    throw new Error(`Unknown swimmer tier: ${tierId}`);
  }
  const tier = SWIMMER_TIERS[tierId];
  if (!tier) {
    throw new Error(`Unknown swimmer tier: ${tierId}`);
  }
  return tier;
}

export function assertPlayableSwimmerTier(tier, owner = `tier ${tier?.id ?? "unknown"}`) {
  if (tier?.contentStatus !== "ready" || !Array.isArray(tier.schedule) || tier.schedule.length === 0) {
    throw new Error(`${owner}: tier ${tier?.id ?? "unknown"} does not yet have playable authored content`);
  }
  return tier;
}

export function playableSwimmerTierCatalog() {
  return Object.values(SWIMMER_TIERS)
    .filter((tier) => tier.contentStatus === "ready" && Array.isArray(tier.schedule) && tier.schedule.length > 0)
    .sort((a, b) => a.id - b.id)
    .map((tier) => ({
      id: tier.id,
      name: tier.name,
      label: `Tier ${tier.id} - ${titleCase(tier.name)}`
    }));
}

export function tierForStage(stage) {
  return stageTuning(stage).tier;
}

export function stageTuning(stage) {
  return DIFFICULTY_STAGES[Math.max(0, Math.min(DIFFICULTY_STAGES.length - 1, Math.floor(stage)))] ?? DIFFICULTY_STAGES[0];
}

function titleCase(value) {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
