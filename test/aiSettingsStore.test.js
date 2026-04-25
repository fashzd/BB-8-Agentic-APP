const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AISettingsStore } = require("../src/main/services/aiSettingsStore");

function makeSafeStorage() {
  return {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(value) {
      return Buffer.from(`enc:${value}`, "utf8");
    },
    decryptString(buffer) {
      return buffer.toString("utf8").replace(/^enc:/, "");
    }
  };
}

test("ai settings store saves encrypted api key and model", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-ai-store-"));
  const filePath = path.join(tempDir, "ai.json");
  const store = new AISettingsStore({
    filePath,
    safeStorage: makeSafeStorage()
  });

  const saveResult = store.save({
    apiKey: "secret-key",
    model: "gpt-4o-mini"
  });
  const loaded = store.load();
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  assert.equal(saveResult.persistedApiKey, true);
  assert.equal(loaded.apiKey, "secret-key");
  assert.equal(loaded.model, "gpt-4o-mini");
  assert.equal(raw.model, "gpt-4o-mini");
  assert.equal(raw.encrypted, true);
  assert.ok(typeof raw.data === "string" && raw.data.length > 0);
});
