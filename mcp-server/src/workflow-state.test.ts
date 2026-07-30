import assert from "node:assert/strict";
import test from "node:test";

import { interpretWorkflowRun } from "./workflow-state.js";

test("queued and waiting runs are not failures", () => {
  for (const status of ["queued", "requested", "pending", "waiting"]) {
    const result = interpretWorkflowRun({ id: 1, status, conclusion: null });
    assert.equal(result.terminal, false);
    assert.equal(result.successful, null);
    assert.equal(result.shouldWait, true);
  }
});

test("in-progress runs remain non-terminal", () => {
  const result = interpretWorkflowRun({ id: 2, status: "in_progress", conclusion: null });
  assert.equal(result.state, "running");
  assert.equal(result.terminal, false);
  assert.equal(result.successful, null);
});

test("completed success is successful", () => {
  const result = interpretWorkflowRun({ id: 3, status: "completed", conclusion: "success" });
  assert.equal(result.state, "succeeded");
  assert.equal(result.terminal, true);
  assert.equal(result.successful, true);
});

test("completed failure is terminal failure", () => {
  const result = interpretWorkflowRun({ id: 4, status: "completed", conclusion: "failure" });
  assert.equal(result.state, "failed");
  assert.equal(result.terminal, true);
  assert.equal(result.successful, false);
});

test("neutral and skipped conclusions are terminal non-failures", () => {
  for (const conclusion of ["neutral", "skipped"]) {
    const result = interpretWorkflowRun({ id: 5, status: "completed", conclusion });
    assert.equal(result.terminal, true);
    assert.equal(result.successful, true);
  }
});
