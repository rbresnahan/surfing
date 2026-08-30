import { CONFIG } from "./config.js";

export function obstacleRowCount(config = CONFIG) {
  return Math.max(1, Math.floor(config.OBSTACLE_ROW_COUNT ?? 6));
}

export function obstacleRowSpacing(config = CONFIG) {
  const bounds = config.SURF_BOUNDS;
  return (bounds.bottom - bounds.top) / obstacleRowCount(config);
}

export function obstacleRowCenters(config = CONFIG) {
  const bounds = config.SURF_BOUNDS;
  const spacing = obstacleRowSpacing(config);
  return Array.from(
    { length: obstacleRowCount(config) },
    (_, row) => bounds.top + spacing * (row + 0.5)
  );
}

export function obstacleRowCenter(row, config = CONFIG) {
  const centers = obstacleRowCenters(config);
  return centers[clampRow(row, config)];
}

export function obstacleRows(config = CONFIG) {
  return obstacleRowCenters(config).map((centerY, row) => ({
    row,
    centerY,
    spacing: obstacleRowSpacing(config)
  }));
}

export function isValidObstacleRow(row, config = CONFIG) {
  return Number.isInteger(row) && row >= 0 && row < obstacleRowCount(config);
}

export function clampRow(row, config = CONFIG) {
  return Math.max(0, Math.min(obstacleRowCount(config) - 1, Math.floor(row)));
}

export function mirrorRow(row, config = CONFIG) {
  return obstacleRowCount(config) - 1 - clampRow(row, config);
}

export function nearestObstacleRow(y, config = CONFIG) {
  const centers = obstacleRowCenters(config);
  let bestRow = 0;
  let bestDistance = Infinity;
  centers.forEach((centerY, row) => {
    const distance = Math.abs(y - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRow = row;
    }
  });
  return bestRow;
}

export function rowsForOpening(openRows, config = CONFIG) {
  const allowed = new Set(openRows.filter((row) => isValidObstacleRow(row, config)));
  return obstacleRows(config)
    .filter(({ row }) => !allowed.has(row))
    .map(({ row }) => row);
}
