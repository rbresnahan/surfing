const DODGE_HEAD_RENDER_WIDTH = 70;
const DODGE_NOODLE_GIRL_RENDER_WIDTH = 88;
const DODGE_TUBE_GIRL_RENDER_HEIGHT = 78;
const DODGE_TUBE_WOMAN_RENDER_HEIGHT = 64;

export const DODGE_OBSTACLE_TYPES = [
  createDodgeObstacleType({
    id: "head",
    assetKey: "dodge-head",
    file: "dodge-head.png",
    source: { width: 1448, height: 1086 },
    alpha: { width: 1422, height: 1059 },
    renderWidth: DODGE_HEAD_RENDER_WIDTH,
    hitboxScale: { x: 0.62, y: 0.62 },
    visualGap: { x: 18, y: 18 }
  }),
  createDodgeObstacleType({
    id: "noodle-girl",
    assetKey: "dodge-noodle-girl",
    file: "dodge-noodle-girl.png",
    source: { width: 1537, height: 1023 },
    alpha: { width: 1366, height: 837 },
    renderWidth: DODGE_NOODLE_GIRL_RENDER_WIDTH,
    hitboxScale: { x: 0.68, y: 0.64 },
    visualGap: { x: 20, y: 18 }
  }),
  createDodgeObstacleType({
    id: "tube-girl",
    assetKey: "dodge-tube-girl",
    file: "dodge-tube-girl.png",
    source: { width: 1050, height: 1498 },
    alpha: { width: 844, height: 1378 },
    renderHeight: DODGE_TUBE_GIRL_RENDER_HEIGHT,
    hitboxScale: { x: 0.7, y: 0.68 },
    visualGap: { x: 18, y: 20 }
  }),
  createDodgeObstacleType({
    id: "tube-woman",
    assetKey: "dodge-tube-woman",
    file: "dodge-tube-woman.png",
    source: { width: 1254, height: 1254 },
    alpha: { width: 1145, height: 1192 },
    renderHeight: DODGE_TUBE_WOMAN_RENDER_HEIGHT,
    renderOffsetY: 3,
    hitboxScale: { x: 0.72, y: 0.72 },
    visualGap: { x: 18, y: 18 }
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
  const width = renderWidth ?? renderHeight * sourceAspect;
  const height = renderHeight ?? renderWidth / sourceAspect;

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
    hitbox: {
      width: width * (alpha.width / source.width),
      height: height * (alpha.height / source.height),
      scaleX: hitboxScale.x,
      scaleY: hitboxScale.y
    },
    visualGap
  };
}
