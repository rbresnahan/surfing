export const DIFFICULTY_STAGES = [
  {
    id: 0,
    name: "opening",
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
  {
    id: 1,
    name: "first-clear",
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
      "stage1-diagonal"
    ]
  },
  {
    id: 2,
    name: "cooler-clear",
    rowRelease: "progress",
    releaseProgress: 0.5,
    maxActivePerRow: 2,
    spawnDelaySeconds: 0.46,
    speed: 260,
    schedule: [
      "stage2-staggered-diagonal",
      "stage2-sweeping-staircase",
      "stage2-split-clusters",
      "stage2-dense-gate",
      "stage2-long-weave"
    ]
  }
];

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

export function stageTuning(stage) {
  return DIFFICULTY_STAGES[Math.max(0, Math.min(DIFFICULTY_STAGES.length - 1, Math.floor(stage)))] ?? DIFFICULTY_STAGES[0];
}
