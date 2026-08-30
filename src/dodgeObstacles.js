export const DODGE_OBSTACLE_RENDER_SCALE = 1.12;

const DODGE_HEAD_RENDER_WIDTH = 70;
const DODGE_NOODLE_GIRL_RENDER_WIDTH = 88;
const DODGE_NOODLE_MAN_RENDER_WIDTH = 96;
const DODGE_SCUBA_MAN_RENDER_WIDTH = 86;
const DODGE_TUBE_GIRL_RENDER_HEIGHT = 78;
const DODGE_TUBE_WOMAN_RENDER_WIDTH = 92;

export const DODGE_OBSTACLE_TYPES = [
  createDodgeObstacleType({
    id: "head",
    assetKey: "dodge-head",
    file: "dodge-head.png",
    source: { width: 1448, height: 1086 },
    alpha: { x: 0, y: 5, width: 1422, height: 1059 },
    renderWidth: DODGE_HEAD_RENDER_WIDTH,
    hitboxScale: { x: 0.62, y: 0.62 },
    visualGap: { x: 18, y: 18 }
  }),
  createDodgeObstacleType({
    id: "noodle-girl",
    assetKey: "dodge-noodle-girl",
    file: "dodge-noodle-girl.png",
    source: { width: 1448, height: 1086 },
    alpha: { x: 0, y: 35, width: 1448, height: 1051 },
    renderWidth: DODGE_NOODLE_GIRL_RENDER_WIDTH,
    hitboxScale: { x: 0.64, y: 0.58 },
    visualGap: { x: 20, y: 18 }
  }),
  createDodgeObstacleType({
    id: "noodle-man",
    assetKey: "dodge-noodle-man",
    file: "dodge-noodle-man.png",
    source: { width: 1672, height: 941 },
    alpha: { x: 40, y: 13, width: 1614, height: 928 },
    renderWidth: DODGE_NOODLE_MAN_RENDER_WIDTH,
    hitboxScale: { x: 0.58, y: 0.58 },
    visualGap: { x: 22, y: 18 }
  }),
  createDodgeObstacleType({
    id: "scuba-man",
    assetKey: "dodge-scuba-man",
    file: "dodge-scuba-man.png",
    source: { width: 1536, height: 1024 },
    alpha: { x: 0, y: 13, width: 1516, height: 987 },
    renderWidth: DODGE_SCUBA_MAN_RENDER_WIDTH,
    hitboxScale: { x: 0.6, y: 0.6 },
    visualGap: { x: 20, y: 18 }
  }),
  createDodgeObstacleType({
    id: "tube-girl",
    assetKey: "dodge-tube-girl",
    file: "dodge-tube-girl.png",
    source: { width: 1254, height: 1254 },
    alpha: { x: 31, y: 16, width: 1191, height: 1238 },
    renderHeight: DODGE_TUBE_GIRL_RENDER_HEIGHT,
    hitboxScale: { x: 0.62, y: 0.62 },
    visualGap: { x: 18, y: 20 }
  }),
  createDodgeObstacleType({
    id: "tube-woman",
    assetKey: "dodge-tube-woman",
    file: "dodge-tube-woman.png",
    source: { width: 1536, height: 1024 },
    alpha: { x: 0, y: 21, width: 1510, height: 965 },
    renderWidth: DODGE_TUBE_WOMAN_RENDER_WIDTH,
    hitboxScale: { x: 0.62, y: 0.62 },
    visualGap: { x: 20, y: 18 }
  })
];

export const DODGE_OBSTACLE_TYPE_BY_ID = Object.fromEntries(
  DODGE_OBSTACLE_TYPES.map((type) => [type.id, type])
);

export function getDodgeObstacleType(id) {
  return DODGE_OBSTACLE_TYPE_BY_ID[id] ?? null;
}

export function selectDodgeObstacleType(random = Math.random, types = DODGE_OBSTACLE_TYPES) {
  const totalWeight = types.reduce((sum, type) => sum + Math.max(0, type.spawnWeight), 0);
  if (totalWeight <= 0) {
    throw new Error("At least one dodge obstacle type must have a positive spawn weight");
  }

  let pick = random() * totalWeight;
  for (const type of types) {
    pick -= Math.max(0, type.spawnWeight);
    if (pick < 0) return type;
  }

  return types[types.length - 1];
}

function createDodgeObstacleType({
  id,
  assetKey,
  file,
  source,
  alpha,
  renderWidth = null,
  renderHeight = null,
  renderOffsetX = 0,
  renderOffsetY = 0,
  hitboxScale,
  visualGap
}) {
  const sourceAspect = source.width / source.height;
  const baseWidth = renderWidth ?? renderHeight * sourceAspect;
  const baseHeight = renderHeight ?? renderWidth / sourceAspect;
  const width = baseWidth * DODGE_OBSTACLE_RENDER_SCALE;
  const height = baseHeight * DODGE_OBSTACLE_RENDER_SCALE;

  return {
    id,
    assetKey,
    file,
    spawnWeight: 1,
    render: {
      width,
      height,
      offsetX: renderOffsetX,
      offsetY: renderOffsetY,
      anchor: { x: 0.5, y: 0.5 }
    },
    source,
    alpha,
    hitbox: {
      width: width * (alpha.width / source.width),
      height: height * (alpha.height / source.height),
      scaleX: hitboxScale.x,
      scaleY: hitboxScale.y
    },
    visualGap
  };
}
