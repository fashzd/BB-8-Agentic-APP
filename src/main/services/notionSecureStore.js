const fs = require("fs");
const path = require("path");

class NotionSecureStore {
  constructor({ filePath, safeStorage }) {
    this.filePath = filePath;
    this.safeStorage = safeStorage;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (!raw?.encrypted || typeof raw?.data !== "string") {
      return null;
    }

    if (!this.safeStorage?.isEncryptionAvailable?.()) {
      return null;
    }

    const decrypted = this.safeStorage.decryptString(Buffer.from(raw.data, "base64"));
    return JSON.parse(decrypted);
  }

  save(payload) {
    if (!this.safeStorage?.isEncryptionAvailable?.()) {
      return false;
    }

    const encrypted = this.safeStorage.encryptString(JSON.stringify(payload));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify({
        version: 1,
        encrypted: true,
        data: encrypted.toString("base64")
      }),
      "utf8"
    );

    return true;
  }

  clear() {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}

module.exports = {
  NotionSecureStore
};
