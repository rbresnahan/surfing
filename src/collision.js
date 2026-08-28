export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function centeredRect(centerX, centerY, width, height) {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}
