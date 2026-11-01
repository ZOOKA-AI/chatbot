import { describe, expect, it } from "vitest";
import {
  creativeChallenges,
  creativeTemplates,
  gameResult,
  type Mark,
  quizQuestions,
  winLines,
} from "@/lib/studio-play";

describe("local playground", () => {
  it("finds either player's win on every winning line", () => {
    for (const line of winLines)
      for (const player of ["X", "O"] as const) {
        const board: Mark[] = Array(9).fill(null);
        for (const i of line) board[i] = player;
        expect(gameResult(board)).toBe(player);
      }
  });
  it("distinguishes ongoing from drawn games", () => {
    expect(gameResult(Array(9).fill(null))).toBeNull();
    expect(gameResult(["X", "O", "X", "X", "O", "O", "O", "X", "X"])).toBe(
      "draw",
    );
  });
  it("has valid answer indexes and explanations", () => {
    expect(quizQuestions).toHaveLength(5);
    for (const q of quizQuestions) {
      expect(q.options[q.answer]).toBeTruthy();
      expect(q.explanation.length).toBeGreaterThan(20);
    }
    expect(new Set(creativeChallenges).size).toBe(creativeChallenges.length);
  });
  it("ships actual script-free interactive templates", () => {
    for (const t of creativeTemplates) {
      expect(t.html).toContain("<details>");
      expect(t.html).not.toContain("<script");
      expect(t.html).toContain('lang="ar"');
    }
  });
});
