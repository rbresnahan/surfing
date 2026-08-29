export const MOVEMENT_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const START_KEYS = new Set(["Space", "Enter"]);

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.directionPriority = [];
    this.startPressed = false;

    target.addEventListener("keydown", (event) => {
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        if (!event.repeat && !this.keys.has(event.code)) {
          this.directionPriority.push(event.code);
        }
        this.keys.add(event.code);
      }

      if (START_KEYS.has(event.code)) {
        event.preventDefault();
        this.startPressed = true;
      }
    });

    target.addEventListener("keyup", (event) => {
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.delete(event.code);
        this.directionPriority = this.directionPriority.filter((code) => code !== event.code);
      }
    });
  }

  reset() {
    this.keys.clear();
    this.directionPriority = [];
    this.startPressed = false;
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
    const activeCode = this.directionPriority.at(-1);
    return activeCode ? directionFromCode(activeCode) : "idle";
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
