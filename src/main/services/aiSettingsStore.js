const fs = require("fs");
const path = require("path");

class AISettingsStore {
  constructor({ filePath, safeStorage }) {
    this.filePath = filePath;
    this.safeStorage = safeStorage;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return {
        apiKey: "",
        model: "",
        storageMode: this.safeStorage?.isEncryptionAvailable?.() ? "encrypted-file" : "memory-only"
      };
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      let apiKey = "";

      if (raw?.encrypted && typeof raw?.data === "string" && this.safeStorage?.isEncryptionAvailable?.()) {
        apiKey = this.safeStorage.decryptString(Buffer.from(raw.data, "base64"));
      }

      return {
        apiKey,
        model: typeof raw?.model === "string" ? raw.model.trim() : "",
        storageMode: this.safeStorage?.isEncryptionAvailable?.() ? "encrypted-file" : "memory-only"
      };
    } catch {
      return {
        apiKey: "",
        model: "",
        storageMode: this.safeStorage?.isEncryptionAvailable?.() ? "encrypted-file" : "memory-only"
      };
    }
  }

  save({ apiKey = "", model = "" }) {
    const normalizedModel = typeof model === "string" ? model.trim() : "";
    const normalizedKey = typeof apiKey === "string" ? apiKey.trim() : "";
    const payload = {
      version: 1,
      model: normalizedModel
    };

    if (normalizedKey && this.safeStorage?.isEncryptionAvailable?.()) {
      const encrypted = this.safeStorage.encryptString(normalizedKey);
      payload.encrypted = true;
      payload.data = encrypted.toString("base64");
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");

    return {
      persistedApiKey: Boolean(normalizedKey) && Boolean(payload.encrypted),
      storageMode: this.safeStorage?.isEncryptionAvailable?.() ? "encrypted-file" : "memory-only"
    };
  }

  clearApiKey({ keepModel = "" } = {}) {
    const normalizedModel = typeof keepModel === "string" ? keepModel.trim() : "";
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(
        {
          version: 1,
          model: normalizedModel
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

module.exports = {
  AISettingsStore
};
