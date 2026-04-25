const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureNotionError } = require("../src/main/services/notionErrors");

test("maps expired auth errors to a reconnect message", () => {
  const error = ensureNotionError(new Error("Unauthorized"));

  assert.equal(error.code, "AUTH_EXPIRED");
  assert.match(error.message, /expired/i);
});

test("maps permission failures to a helpful user message", () => {
  const error = ensureNotionError(new Error("403 Forbidden"));

  assert.equal(error.code, "INSUFFICIENT_PERMISSIONS");
  assert.match(error.message, /does not have access/i);
});
