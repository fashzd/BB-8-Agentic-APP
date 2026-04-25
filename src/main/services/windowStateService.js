const fs = require("fs");
const path = require("path");

class WindowStateService {
  constructor({ filePath, defaultState }) {
    this.filePath = filePath;
    this.defaultState = defaultState;
    this.state = null;
    this.writeTimer = null;
  }

  load() {
    if (this.state) {
      return { ...this.state };
    }

    if (!fs.existsSync(this.filePath)) {
      this.state = { ...this.defaultState };
      return { ...this.state };
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.state = {
        width: Number(raw?.width) || this.defaultState.width,
        height: Number(raw?.height) || this.defaultState.height,
        x: Number.isFinite(raw?.x) ? raw.x : undefined,
        y: Number.isFinite(raw?.y) ? raw.y : undefined
      };
    } catch {
      this.state = { ...this.defaultState };
    }

    return { ...this.state };
  }

  remember(bounds) {
    this.state = {
      width: Math.max(420, Math.round(bounds.width)),
      height: Math.max(560, Math.round(bounds.height)),
      x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : undefined,
      y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : undefined
    };

    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.persist(), 150);
  }

  persist() {
    if (!this.state) {
      return;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}

module.exports = {
  WindowStateService
};
