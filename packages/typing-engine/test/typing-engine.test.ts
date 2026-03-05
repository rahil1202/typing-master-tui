import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { TypingSession } from "../src/index.js";

describe("TypingSession", () => {
  it("enforces strict mode", () => {
    const s = new TypingSession("abc", true);
    s.applyKey("a", 0);
    s.applyKey("x", 1);
    expect(s.snapshot.typed).toBe("a");
    expect(s.snapshot.mistakes).toBe(1);
  });

  it("computes deterministic trace hash", () => {
    const s1 = new TypingSession("ab", false);
    const s2 = new TypingSession("ab", false);
    s1.applyKey("a", 1000);
    s1.applyKey("b", 2000);
    s2.applyKey("a", 1000);
    s2.applyKey("b", 2000);
    expect(s1.finalize("test", "t1", 3000).inputTraceHash).toBe(s2.finalize("test", "t1", 3000).inputTraceHash);
  });

  it("never yields negative metrics", () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 100 }), (target) => {
      const s = new TypingSession(target, false);
      for (const c of target) s.applyKey(c);
      const r = s.finalize("custom", "arb");
      expect(r.grossWpm).toBeGreaterThanOrEqual(0);
      expect(r.netWpm).toBeGreaterThanOrEqual(0);
      expect(r.accuracy).toBeGreaterThanOrEqual(0);
      expect(r.cpm).toBeGreaterThanOrEqual(0);
    }));
  });
});
