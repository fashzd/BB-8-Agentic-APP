const { randomUUID } = require("crypto");
const { NotionServiceError } = require("./notionErrors");

class NotionApprovalStore {
  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this.pending = new Map();
  }

  create(kind, payload) {
    this.cleanupExpired();

    const id = randomUUID();
    const record = {
      id,
      kind,
      payload,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + this.ttlMs
    };

    this.pending.set(id, record);
    return record;
  }

  get(id) {
    this.cleanupExpired();
    return this.pending.get(id) || null;
  }

  consume(id, expectedKind) {
    this.cleanupExpired();

    const record = this.pending.get(id);
    if (!record || record.kind !== expectedKind) {
      throw new NotionServiceError(
        "APPROVAL_REQUIRED",
        "This Notion write preview is missing or expired. Prepare it again before writing."
      );
    }

    this.pending.delete(id);
    return record.payload;
  }

  clear() {
    this.pending.clear();
  }

  cleanupExpired() {
    const now = Date.now();

    for (const [id, record] of this.pending.entries()) {
      if (record.expiresAt <= now) {
        this.pending.delete(id);
      }
    }
  }
}

module.exports = {
  NotionApprovalStore
};
