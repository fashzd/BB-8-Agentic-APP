const fs = require("fs");
const path = require("path");

const DEFAULT_STATE = {
  projectSummary: "",
  userPreferences: {
    tone: "",
    codingStyle: "",
    workflows: ""
  },
  updatedAt: null
};

class MemoryService {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.state = null;
  }

  loadState() {
    if (this.state) {
      return this.getState();
    }

    if (!fs.existsSync(this.filePath)) {
      this.state = cloneDefaultState();
      return this.getState();
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.state = {
        projectSummary: sanitizeText(raw?.projectSummary),
        userPreferences: {
          tone: sanitizeText(raw?.userPreferences?.tone),
          codingStyle: sanitizeText(raw?.userPreferences?.codingStyle),
          workflows: sanitizeText(raw?.userPreferences?.workflows)
        },
        updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : null
      };
    } catch {
      this.state = cloneDefaultState();
    }

    return this.getState();
  }

  getState() {
    if (!this.state) {
      return this.loadState();
    }

    return {
      projectSummary: this.state.projectSummary,
      userPreferences: { ...this.state.userPreferences },
      updatedAt: this.state.updatedAt
    };
  }

  updateProjectSummary(projectSummary) {
    this.loadState();
    this.state.projectSummary = sanitizeText(projectSummary);
    this.touch();
    this.persist();
    return this.getState();
  }

  updateUserPreferences(userPreferences = {}) {
    this.loadState();
    this.state.userPreferences = {
      tone: sanitizeText(userPreferences.tone),
      codingStyle: sanitizeText(userPreferences.codingStyle),
      workflows: sanitizeText(userPreferences.workflows)
    };
    this.touch();
    this.persist();
    return this.getState();
  }

  resetUserPreferences() {
    this.loadState();
    this.state.userPreferences = {
      tone: "",
      codingStyle: "",
      workflows: ""
    };
    this.touch();
    this.persist();
    return this.getState();
  }

  maybeRefreshProjectSummaryFromMessage(text) {
    const trimmed = sanitizeText(text);
    if (!trimmed) {
      return this.getState();
    }

    this.loadState();

    if (this.state.projectSummary) {
      return this.getState();
    }

    if (trimmed.length < 24) {
      return this.getState();
    }

    this.state.projectSummary = trimmed.slice(0, 400);
    this.touch();
    this.persist();
    return this.getState();
  }

  touch() {
    this.state.updatedAt = new Date().toISOString();
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

module.exports = {
  MemoryService
};
