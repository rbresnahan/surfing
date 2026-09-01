export const STANDARD_SWIMMER_VISIBLE_ALPHA_HEIGHT = 48;
export const ROW_VISUAL_OVERLAP_TOLERANCE = 0.001;

export const DODGE_OBSTACLE_TYPES = [
  createDodgeObstacleType({
    id: "head",
    assetKey: "dodge-head",
    file: "dodge-head.png",
    source: { width: 1448, height: 1086 },
    alpha: { x: 0, y: 5, width: 1422, height: 1059 },
    targetVisibleAlphaHeight: STANDARD_SWIMMER_VISIBLE_ALPHA_HEIGHT,
    hitboxScale: { x: 0.62, y: 0.62 },
    visualGap: { x: 18 }
  }),
  createDodgeObstacleType({
    id: "noodle-girl",
    assetKey: "dodge-noodle-girl",
    file: "dodge-noodle-girl.png",
    source: { width: 1448, height: 1086 },
    alpha: { x: 0, y: 35, width: 1448, height: 1051 },
    targetVisibleAlphaHeight: STANDARD_SWIMMER_VISIBLE_ALPHA_HEIGHT,
    hitboxScale: { x: 0.64, y: 0.58 },
    visualGap: { x: 20 }
  }),
  createDodgeObstacleType({
    id: "noodle-man",
    assetKey: "dodge-noodle-man",
    file: "dodge-noodle-man.png",
    source: { width: 1672, height: 941 },
    alpha: { x: 40, y: 13, width: 1614, height: 928 },
    targetVisibleAlphaHeight: STANDARD_SWIMMER_VISIBLE_ALPHA_HEIGHT,
    hitboxScale: { x: 0.58, y: 0.58 },
    visualGap: { x: 22 }
  }),
  createDodgeObstacleType({
    id: "scuba-man",
    assetKey: "dodge-scuba-man",
    file: "dodge-scuba-man.png",
    source: { width: 1536, height: 1024 },
    alpha: { x: 0, y: 13, width: 1516, height: 987 },
    targetVisibleAlphaHeight: STANDARD_SWIMMER_VISIBLE_ALPHA_HEIGHT,
    hitboxScale: { x: 0.6, y: 0.6 },
    visualGap: { x: 20 }
  }),
  createDodgeObstacleType({
    id: "tube-girl",
    assetKey: "dodge-tube-girl",
    file: "dodge-tube-girl.png",
    source: { width: 1254, height: 1254 },
    alpha: { x: 31, y: 16, width: 1191, height: 1238 },
    targetVisibleAlphaHeight: STANDARD_SWIMMER_VISIBLE_ALPHA_HEIGHT,
    hitboxScale: { x: 0.62, y: 0.62 },
    visualGap: { x: 18 }
  }),
  createDodgeObstacleType({
    id: "tube-woman",
    assetKey: "dodge-tube-woman",
    file: "dodge-tube-woman.png",
    source: { width: 1536, height: 1024 },
    alpha: { x: 0, y: 21, width: 1510, height: 965 },
    targetVisibleAlphaHeight: STANDARD_SWIMMER_VISIBLE_ALPHA_HEIGHT,
    hitboxScale: { x: 0.62, y: 0.62 },
    visualGap: { x: 20 }
  })
];

export const DODGE_OBSTACLE_TYPE_BY_ID = Object.fromEntries(
  DODGE_OBSTACLE_TYPES.map((type) => [type.id, type])
);

export function getDodgeObstacleType(id) {
  return DODGE_OBSTACLE_TYPE_BY_ID[id] ?? null;
}

export function selectDodgeObstacleType(random = () => 0, types = DODGE_OBSTACLE_TYPES) {
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
  targetVisibleAlphaHeight,
  renderOffsetX = 0,
  renderOffsetY = 0,
  hitboxScale,
  visualGap
}) {
  const sourceAspect = source.width / source.height;
  const height = targetVisibleAlphaHeight / (alpha.height / source.height);
  const width = height * sourceAspect;
  const visibleAlpha = {
    width: width * (alpha.width / source.width),
    height: targetVisibleAlphaHeight
  };

  return {
    id,
    assetKey,
    file,
    spawnWeight: 1,
    targetVisibleAlphaHeight,
    render: {
      width,
      height,
      offsetX: renderOffsetX,
      offsetY: renderOffsetY,
      anchor: { x: 0.5, y: 0.5 }
    },
    source,
    alpha,
    visibleAlpha,
    hitbox: {
      width: visibleAlpha.width,
      height: visibleAlpha.height,
      scaleX: hitboxScale.x,
      scaleY: hitboxScale.y
    },
    visualGap
  };
}

export function dodgeObstacleVisibleBounds(obstacle) {
  const type = getDodgeObstacleType(obstacle.obstacleTypeId);
  const source = type?.source ?? obstacle.source;
  const alpha = type?.alpha ?? obstacle.alpha;
  if (!source || !alpha) {
    return {
      left: obstacle.x - obstacle.width / 2,
      right: obstacle.x + obstacle.width / 2,
      top: obstacle.y - obstacle.height / 2,
      bottom: obstacle.y + obstacle.height / 2,
      width: obstacle.width,
      height: obstacle.height
    };
  }

  const anchor = obstacle.renderAnchor ?? type?.render.anchor ?? { x: 0.5, y: 0.5 };
  const offsetX = obstacle.renderOffsetX ?? type?.render.offsetX ?? 0;
  const offsetY = obstacle.renderOffsetY ?? type?.render.offsetY ?? 0;
  const renderLeft = obstacle.x + offsetX - obstacle.width * anchor.x;
  const renderTop = obstacle.y + offsetY - obstacle.height * anchor.y;
  const left = renderLeft + (alpha.x / source.width) * obstacle.width;
  const top = renderTop + (alpha.y / source.height) * obstacle.height;
  const width = (alpha.width / source.width) * obstacle.width;
  const height = (alpha.height / source.height) * obstacle.height;

  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height
  };
}

export function materializeDodgeObstacleGeometry(typeId) {
  const type = getDodgeObstacleType(typeId);
  if (!type) return null;
  return {
    obstacleTypeId: type.id,
    assetKey: type.assetKey,
    source: type.source,
    alpha: type.alpha,
    width: type.render.width,
    height: type.render.height,
    collisionWidth: type.hitbox.width,
    collisionHeight: type.hitbox.height,
    hitboxScaleX: type.hitbox.scaleX,
    hitboxScaleY: type.hitbox.scaleY,
    visualGapX: type.visualGap.x,
    renderAnchor: type.render.anchor,
    renderOffsetX: type.render.offsetX,
    renderOffsetY: type.render.offsetY
  };
}
