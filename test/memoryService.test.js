const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { MemoryService } = require("../src/main/services/memoryService");

test("memory service persists project summary and preferences", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-memory-"));
  const filePath = path.join(tempDir, "memory.json");
  const service = new MemoryService({ filePath });

  service.updateProjectSummary("BB-8 helps with the desktop assistant roadmap.");
  service.updateUserPreferences({
    tone: "concise",
    codingStyle: "modular",
    workflows: "show plan, then implement"
  });

  const reloaded = new MemoryService({ filePath });
  const state = reloaded.loadState();

  assert.equal(state.projectSummary, "BB-8 helps with the desktop assistant roadmap.");
  assert.equal(state.userPreferences.tone, "concise");
  assert.equal(state.userPreferences.codingStyle, "modular");
  assert.equal(state.userPreferences.workflows, "show plan, then implement");
});

test("memory service can reset preferences without clearing project summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-memory-"));
  const filePath = path.join(tempDir, "memory.json");
  const service = new MemoryService({ filePath });

  service.updateProjectSummary("Desktop overlay AI assistant.");
  service.updateUserPreferences({
    tone: "friendly",
    codingStyle: "tidy",
    workflows: "one thing at a time"
  });

  const state = service.resetUserPreferences();

  assert.equal(state.projectSummary, "Desktop overlay AI assistant.");
  assert.equal(state.userPreferences.tone, "");
  assert.equal(state.userPreferences.codingStyle, "");
  assert.equal(state.userPreferences.workflows, "");
});
