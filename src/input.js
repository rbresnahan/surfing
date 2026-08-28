const MOVEMENT_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const START_KEYS = new Set(["Space", "Enter"]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.lastDirection = "idle";
    this.startPressed = false;

    window.addEventListener("keydown", (event) => {
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        this.lastDirection = directionFromCode(event.code);
      }

      if (START_KEYS.has(event.code)) {
        event.preventDefault();
        this.startPressed = true;
      }
    });

    window.addEventListener("keyup", (event) => {
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.delete(event.code);
      }
    });
  }

  consumeStart() {
    const wasPressed = this.startPressed;
    this.startPressed = false;
    return wasPressed;
  }

  movementVector() {
    let x = 0;
    let y = 0;

    if (this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("ArrowUp")) y -= 1;
    if (this.keys.has("ArrowDown")) y += 1;

    if (x !== 0 && y !== 0) {
      const normal = Math.SQRT1_2;
      x *= normal;
      y *= normal;
    }

    return { x, y };
  }

  visibleState() {
    if (this.keys.size === 0) return "idle";

    const vector = this.movementVector();
    if (Math.abs(vector.x) > Math.abs(vector.y)) {
      return vector.x > 0 ? "right" : "left";
    }
    if (Math.abs(vector.y) > Math.abs(vector.x)) {
      return vector.y > 0 ? "down" : "up";
    }

    return this.keys.has(codeFromDirection(this.lastDirection))
      ? this.lastDirection
      : vector.y > 0
        ? "down"
        : "up";
  }
}

function directionFromCode(code) {
  return {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right"
  }[code] ?? "idle";
}

function codeFromDirection(direction) {
  return {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight"
  }[direction];
}
