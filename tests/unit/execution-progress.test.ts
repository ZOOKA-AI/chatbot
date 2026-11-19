import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { describeExecution, executionLine, isTerminalStage, pollDelayMs, summariseEvidence } from "@/lib/agents/execution-progress";

/**
 * The contract a progress screen depends on. Assertions cover the wording, not just the
 * stage, because a label that overstates what the database proves is the failure this
 * module exists to prevent.
 */

const now = new Date("2026-11-16T07:00:00Z");
const past = new Date(now.getTime() - 60_000);
const future = new Date(now.getTime() + 60_000);
const liveLease = { startedAt: past, leaseExpiresAt: future };

describe("every stage comes from a status the system writes", () => {
  test("pending is queued and cancellable", () => {
    const view = describeExecution(null, { status: "pending" }, now);
    assert.equal(view.stage, "queued");
    assert.equal(view.canCancel, true);
    assert.equal(view.evidenceVerified, false);
  });

  test("running names the tool", () => {
    const view = describeExecution({ status: "running", tool: "github_read_file", ...liveLease }, { status: "running" }, now);
    assert.equal(view.stage, "running");
    assert.match(view.label, /github_read_file/);
  });

  test("awaiting approval is a decision, not a delay", () => {
    const view = describeExecution(null, { status: "pending", approvalRequired: true }, now);
    assert.equal(view.stage, "awaiting_approval");
    assert.match(view.hint!, /owner or admin/);
    assert.equal(view.canCancel, true);
  });

  test("completed with evidence is verified", () => {
    const view = describeExecution({ status: "completed", startedAt: past, evidence: { sha: "abc" } }, { status: "completed" }, now);
    assert.equal(view.stage, "completed");
    assert.equal(view.evidenceVerified, true);
    assert.equal(executionLine(view), "Completed. evidence is recorded.");
  });

  test("completed without evidence says so instead of claiming success", () => {
    const view = describeExecution({ status: "succeeded", startedAt: past }, { status: "succeeded" }, now);
    assert.equal(view.stage, "completed");
    assert.equal(view.evidenceVerified, false);
    assert.match(view.label, /no evidence/i);
    assert.match(view.hint!, /unverified/);
  });

  test("failed carries the recorded error", () => {
    const view = describeExecution({ status: "failed", startedAt: past, error: "401 from provider" }, { status: "failed" }, now);
    assert.equal(view.stage, "failed");
    assert.match(executionLine(view), /401 from provider/);
  });

  test("timed out is its own stage, not a failure", () => {
    const view = describeExecution({ status: "timed_out", startedAt: past, evidence: { steps: ["read"] } }, { status: "timed_out" }, now);
    assert.equal(view.stage, "timed_out");
    assert.equal(view.evidenceVerified, true, "partial evidence must survive a timeout");
  });

  test("cancelled stays cancelled", () => {
    assert.equal(describeExecution({ status: "cancelled", startedAt: past }, { status: "cancelled" }, now).stage, "cancelled");
  });

  test("blocked explains itself and refuses a pointless retry", () => {
    const view = describeExecution({ status: "blocked", startedAt: past, error: "write_blocked" }, { status: "blocked" }, now);
    assert.equal(view.stage, "blocked");
    assert.match(view.label, /policy or permission/);
    assert.equal(view.canRetry, false);
    assert.match(view.retryReason!, /same refusal/);
  });

  test("an expired lease is stalled, not running and not failed", () => {
    const view = describeExecution({ status: "running", tool: "t", startedAt: past, leaseExpiresAt: past }, { status: "running" }, now);
    assert.equal(view.stage, "stalled");
    assert.match(view.hint!, /reclaimed and retried/);
  });
});

describe("retry and cancel follow attempts, not optimism", () => {
  test("retry is offered with the real number of attempts left", () => {
    const view = describeExecution({ status: "failed", startedAt: past }, { status: "failed", attempts: 1, maxAttempts: 3 }, now);
    assert.equal(view.canRetry, true);
    assert.match(view.retryReason!, /2 attempt\(s\) left/);
  });

  test("exhausted retries are refused with a reason", () => {
    const view = describeExecution({ status: "failed", startedAt: past }, { status: "failed", attempts: 3, maxAttempts: 3 }, now);
    assert.equal(view.canRetry, false);
    assert.match(view.retryReason!, /exhausted/);
  });

  test("a finished success cannot be cancelled", () => {
    const view = describeExecution({ status: "completed", startedAt: past, evidence: { ok: true } }, { status: "completed" }, now);
    assert.equal(view.canCancel, false);
  });
});

describe("evidence summaries", () => {
  test("an empty object is not evidence", () => {
    assert.equal(summariseEvidence({ status: "failed", startedAt: past, evidence: {} }).present, false);
    assert.equal(summariseEvidence({ status: "failed", startedAt: past, evidence: "   " }).present, false);
  });

  test("arrays and objects report their size", () => {
    assert.equal(summariseEvidence({ status: "failed", startedAt: past, evidence: [1, 2, 3] }).size, 3);
    assert.equal(summariseEvidence({ status: "failed", startedAt: past, evidence: { a: 1, b: 2 } }).size, 2);
  });
});

describe("polling follows the stage, and stops when nothing can change", () => {
  test("terminal stages stop the poll loop", () => {
    for (const stage of ["completed", "failed", "cancelled", "blocked"] as const) {
      assert.equal(isTerminalStage(stage), true, stage);
      assert.equal(pollDelayMs(stage), null, stage);
    }
  });

  test("a stalled task keeps polling, slower, because the scheduler may reclaim it", () => {
    assert.equal(isTerminalStage("stalled"), false);
    assert.equal(pollDelayMs("stalled"), 8000);
  });

  test("a running task polls faster than one waiting on a person", () => {
    assert.equal(pollDelayMs("running"), 4000);
    assert.equal(pollDelayMs("queued"), 4000);
    assert.equal(pollDelayMs("awaiting_approval"), 15000);
  });
});
