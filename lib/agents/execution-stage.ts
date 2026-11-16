/**
 * The stage vocabulary, with no server dependency.
 *
 * This file exists because of a build failure worth remembering: the task panel is a
 * client component, and importing the stage helpers from `execution-progress.ts` pulled
 * `server-only` into the browser bundle and failed the build. The guard was right and the
 * import was wrong. The vocabulary and the polling rules are pure data and arithmetic, so
 * they live here; `execution-progress.ts` keeps the part that reads rows and re-exports
 * these so server callers still have one import.
 *
 * The word "stage" is deliberate: the platform knows stages and evidence, not percentages.
 */

export type ExecutionStage =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "blocked"
  | "stalled";

/** Terminal stages do not change on their own, so a polling surface must stop asking. */
const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled", "blocked"]);

export function isTerminalStage(stage: ExecutionStage): boolean {
  return TERMINAL.has(stage);
}

/**
 * How often to ask again. Faster while something is moving, slower when it waits on a
 * person, and never while terminal. `stalled` is not terminal: the scheduler reclaims it.
 */
export function pollDelayMs(stage: ExecutionStage): number | null {
  if (isTerminalStage(stage)) return null;
  if (stage === "running" || stage === "queued") return 4000;
  if (stage === "stalled") return 8000;
  return 15000;
}
