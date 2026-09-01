import { CONFIG } from "./config.js";

const EPSILON = 0.000001;

export function surferPlayfieldPolygon(config = CONFIG) {
  const boundary = config.SURFER_PLAYFIELD_BOUNDARY;
  const first = boundary[0];
  const last = boundary[boundary.length - 1];
  const polygon = [...boundary];

  if (last.x !== config.SURF_BOUNDS.right || last.y !== config.SURF_BOUNDS.bottom) {
    polygon.push({ x: config.SURF_BOUNDS.right, y: config.SURF_BOUNDS.bottom });
  }

  if (first.y !== config.SURF_BOUNDS.bottom) {
    polygon.push({ x: first.x, y: config.SURF_BOUNDS.bottom });
  }

  return polygon;
}

export function surferMovementFootprint(config = CONFIG) {
  return config.SURFER_MOVEMENT_FOOTPRINT.map((point) => ({ ...point }));
}

export function surferMovementFootprintAt(centerX, centerY, config = CONFIG) {
  return config.SURFER_MOVEMENT_FOOTPRINT.map((point) => ({
    x: centerX + point.x,
    y: centerY + point.y
  }));
}

export function isSurferPositionValid(centerX, centerY, config = CONFIG) {
  return surferPlayfieldMargins(centerX, centerY, config).every((margin) => margin >= -EPSILON);
}

export function clampSurferCenterToPlayfield(centerX, centerY, config = CONFIG) {
  let x = centerX;
  let y = centerY;
  const polygon = surferPlayfieldPolygon(config);
  const footprint = config.SURFER_MOVEMENT_FOOTPRINT;

  for (let pass = 0; pass < 8; pass += 1) {
    let adjusted = false;

    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const edgeX = b.x - a.x;
      const edgeY = b.y - a.y;
      const normalX = -edgeY;
      const normalY = edgeX;
      const normalLengthSquared = normalX * normalX + normalY * normalY;

      if (normalLengthSquared === 0) continue;

      const required = supportRequiredInside(footprint, normalX, normalY);
      const actual = normalX * (x - a.x) + normalY * (y - a.y);
      if (actual >= required - EPSILON) continue;

      const correction = (required - actual) / normalLengthSquared;
      x += normalX * correction;
      y += normalY * correction;
      adjusted = true;
    }

    if (!adjusted) break;
  }

  return {
    x: normalizeZero(x),
    y: normalizeZero(y)
  };
}

export function getSurferBoundaryYAtX(x, config = CONFIG) {
  const boundary = config.SURFER_PLAYFIELD_BOUNDARY;
  for (let i = 0; i < boundary.length - 1; i += 1) {
    const a = boundary[i];
    const b = boundary[i + 1];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x < minX || x > maxX) continue;
    if (a.x === b.x) return Math.min(a.y, b.y);

    const progress = (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * progress;
  }

  return boundary[boundary.length - 1].y;
}

function surferPlayfieldMargins(centerX, centerY, config) {
  const polygon = surferPlayfieldPolygon(config);
  const footprint = surferMovementFootprintAt(centerX, centerY, config);
  const margins = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const normalLength = Math.hypot(edgeX, edgeY);
    if (normalLength === 0) continue;

    for (const point of footprint) {
      margins.push((edgeX * (point.y - a.y) - edgeY * (point.x - a.x)) / normalLength);
    }
  }

  return margins;
}

function supportRequiredInside(footprint, normalX, normalY) {
  return Math.max(...footprint.map((point) => -(normalX * point.x + normalY * point.y)));
}

function normalizeZero(value) {
  return Math.abs(value) < EPSILON ? 0 : value;
}
