import assert from "node:assert/strict";
import test from "node:test";
import { Soundscape } from "./soundscape.ts";

test("audio disposal closes each context once and permits safe scene restart", async () => {
  const original = globalThis.AudioContext;
  const contexts: FakeAudioContext[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    closes = 0;
    disconnects = 0;
    constructor() {
      contexts.push(this);
    }
    createGain() {
      return {
        gain: { value: 0, setTargetAtTime() {} },
        connect() {},
        disconnect: () => {
          this.disconnects++;
        },
      };
    }
    async resume() {}
    async close() {
      this.closes++;
      this.state = "closed";
    }
  }
  globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  try {
    const score = new Soundscape("grove");
    score.setState(false, true);
    assert.equal(
      contexts.length,
      0,
      "muted idle scenes allocate no audio context",
    );
    score.setState(true, false);
    assert.equal(contexts.length, 1);
    score.close();
    score.close();
    await Promise.resolve();
    assert.equal(
      contexts[0].closes,
      1,
      "shutdown plus destroy closes only once",
    );
    assert.equal(contexts[0].disconnects, 1);
    score.setState(true, false);
    assert.equal(
      contexts.length,
      2,
      "a reused score can acquire a new context",
    );
    score.close();
    await Promise.resolve();
    assert.equal(contexts[1].closes, 1);
  } finally {
    globalThis.AudioContext = original;
  }
});
