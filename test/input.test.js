import test from "node:test";
import assert from "node:assert/strict";
import { Input } from "../src/input.js";

test("input begins with the idle surfer state", () => {
  const input = new Input(new FakeEventTarget());

  assert.equal(input.visibleState(), "idle");
});

test("each arrow key selects the matching surfer state", () => {
  const cases = [
    ["ArrowRight", "right"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"]
  ];

  for (const [code, state] of cases) {
    const target = new FakeEventTarget();
    const input = new Input(target);

    target.dispatch("keydown", code);

    assert.equal(input.visibleState(), state);
  }
});

test("releasing the final held direction returns to idle", () => {
  const target = new FakeEventTarget();
  const input = new Input(target);

  target.dispatch("keydown", "ArrowRight");
  target.dispatch("keyup", "ArrowRight");

  assert.equal(input.visibleState(), "idle");
});

test("simultaneous arrow keys use most recently pressed priority", () => {
  const target = new FakeEventTarget();
  const input = new Input(target);

  target.dispatch("keydown", "ArrowRight");
  target.dispatch("keydown", "ArrowUp");
  target.dispatch("keydown", "ArrowDown");

  assert.equal(input.visibleState(), "down");
});

test("releasing the newest arrow key falls back to the newest key still held", () => {
  const target = new FakeEventTarget();
  const input = new Input(target);

  target.dispatch("keydown", "ArrowRight");
  target.dispatch("keydown", "ArrowUp");
  target.dispatch("keydown", "ArrowDown");
  target.dispatch("keyup", "ArrowDown");

  assert.equal(input.visibleState(), "up");
});

test("repeated keydown events do not refresh pose priority", () => {
  const target = new FakeEventTarget();
  const input = new Input(target);

  target.dispatch("keydown", "ArrowRight");
  target.dispatch("keydown", "ArrowUp");
  target.dispatch("keydown", "ArrowRight", { repeat: true });

  assert.equal(input.visibleState(), "up");
});

test("reset clears held directions and returns to idle", () => {
  const target = new FakeEventTarget();
  const input = new Input(target);

  target.dispatch("keydown", "ArrowLeft");
  input.reset();

  assert.equal(input.visibleState(), "idle");
  assert.deepEqual(input.movementVector(), { x: 0, y: 0 });
});

test("movement vector keeps existing diagonal movement behavior", () => {
  const target = new FakeEventTarget();
  const input = new Input(target);

  target.dispatch("keydown", "ArrowRight");
  target.dispatch("keydown", "ArrowUp");

  assert.equal(input.movementVector().x, Math.SQRT1_2);
  assert.equal(input.movementVector().y, -Math.SQRT1_2);
});

test("arrow keys prevent browser default behavior", () => {
  const target = new FakeEventTarget();
  new Input(target);
  const event = target.dispatch("keydown", "ArrowDown");

  assert.equal(event.defaultPrevented, true);
});

class FakeEventTarget {
  constructor() {
    this.listeners = {
      keydown: [],
      keyup: []
    };
  }

  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }

  dispatch(type, code, options = {}) {
    const event = {
      code,
      repeat: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...options
    };

    for (const listener of this.listeners[type]) {
      listener(event);
    }

    return event;
  }
}
