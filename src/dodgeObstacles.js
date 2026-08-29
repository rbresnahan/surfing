const HEAD_RENDER_WIDTH = 70;
const HEAD_SOURCE_ASPECT = 1448 / 1086;
const HEAD_ALPHA_WIDTH_RATIO = 1422 / 1448;
const HEAD_ALPHA_HEIGHT_RATIO = 1059 / 1086;

const TUBE_RENDER_HEIGHT = 64;
const TUBE_SOURCE_ASPECT = 1;
const TUBE_ALPHA_WIDTH_RATIO = 1145 / 1254;
const TUBE_ALPHA_HEIGHT_RATIO = 1192 / 1254;

export const DODGE_OBSTACLE_TYPES = [
  {
    id: "head",
    assetKey: "dodge-head",
    file: "dodge-head.png",
    spawnWeight: 1,
    render: {
      width: HEAD_RENDER_WIDTH,
      height: HEAD_RENDER_WIDTH / HEAD_SOURCE_ASPECT,
      offsetX: 0,
      offsetY: 0,
      anchor: { x: 0.5, y: 0.5 }
    },
    hitbox: {
      width: HEAD_RENDER_WIDTH * HEAD_ALPHA_WIDTH_RATIO,
      height: (HEAD_RENDER_WIDTH / HEAD_SOURCE_ASPECT) * HEAD_ALPHA_HEIGHT_RATIO,
      scaleX: 0.62,
      scaleY: 0.62
    },
    visualGap: {
      x: 18,
      y: 18
    }
  },
  {
    id: "tube",
    assetKey: "dodge-tube",
    file: "dodge-tube.png",
    spawnWeight: 1,
    render: {
      width: TUBE_RENDER_HEIGHT * TUBE_SOURCE_ASPECT,
      height: TUBE_RENDER_HEIGHT,
      offsetX: 0,
      offsetY: 3,
      anchor: { x: 0.5, y: 0.5 }
    },
    hitbox: {
      width: TUBE_RENDER_HEIGHT * TUBE_SOURCE_ASPECT * TUBE_ALPHA_WIDTH_RATIO,
      height: TUBE_RENDER_HEIGHT * TUBE_ALPHA_HEIGHT_RATIO,
      scaleX: 0.72,
      scaleY: 0.72
    },
    visualGap: {
      x: 18,
      y: 18
    }
  }
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
