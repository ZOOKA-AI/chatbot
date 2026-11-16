import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildTaskDetail } from "@/lib/agents/task-detail";

/**
 * One shape, three surfaces. These assertions exist because the chat, the task page and
 * the history row previously disagreed about the same task.
 */

const now = new Date("2026-11-16T07:30:00Z");
const past = new Date(now.getTime() - 9000);
const task = { id: "t-1", title: "Inspect deployment", status: "running" };

describe("task detail", () => {
  test("a task with no execution is queued, not missing", () => {
    const detail = buildTaskDetail({ ...task, status: "pending" }, null, now);
    assert.equal(detail.progress.stage, "queued");
    assert.equal(detail.evidence.present, false);
    assert.equal(detail.timing.startedAt, null);
  });

  test("evidence reference and summary both survive into the detail", () => {
    const detail = buildTaskDetail(task, {
      status: "completed",
      tool: "github_read_file",
      startedAt: past,
      finishedAt: now,
      durationMs: 9000,
      resultSummary: { path: "README.md", bytes: 412 },
      evidenceRef: "exec-abc",
    }, now);

    assert.equal(detail.progress.stage, "completed");
    assert.equal(detail.evidence.present, true);
    assert.equal(detail.evidence.reference, "exec-abc");
    assert.equal(detail.evidence.size, 2);
    assert.equal(detail.timing.durationMs, 9000);
  });

  test("a failure keeps its error and does not read as success", () => {
    const detail = buildTaskDetail({ ...task, status: "failed" }, {
      status: "failed",
      startedAt: past,
      error: "provider returned 403",
    }, now);
    assert.equal(detail.progress.stage, "failed");
    assert.equal(detail.error, "provider returned 403");
    assert.match(detail.line, /403/);
  });

  test("the execution row wins when the task row is stale", () => {
    // This is the disagreement that used to exist: task still says running, execution failed.
    const detail = buildTaskDetail({ ...task, status: "running" }, { status: "failed", startedAt: past }, now);
    assert.equal(detail.progress.stage, "failed");
  });
});
