const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
const MAX_FILE_BYTES = 1024 * 256;

class FileServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FileServiceError";
    this.code = code;
  }
}

class FileService {
  constructor({ workspaceRoot }) {
    this.workspaceRoot = workspaceRoot;
    this.pendingWrites = new Map();
  }

  getStatus() {
    return {
      workspaceRoot: this.workspaceRoot,
      allowExternalRead: true
    };
  }

  listFiles(query = "", rootPath = this.workspaceRoot) {
    const searchRoot = this.resolveSearchRoot(rootPath);
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const results = [];

    walkWorkspace(searchRoot, searchRoot, (relativePath) => {
      if (!normalizedQuery || relativePath.toLowerCase().includes(normalizedQuery)) {
        results.push(relativePath);
      }
    });

    return results.slice(0, 200);
  }

  readFile(filePath) {
    const targetPath = this.resolveReadablePath(filePath);
    const stat = fs.statSync(targetPath);

    if (!stat.isFile()) {
      throw new FileServiceError("INVALID_FILE", "Choose a file before trying to read it.");
    }

    if (stat.size > MAX_FILE_BYTES) {
      throw new FileServiceError("FILE_TOO_LARGE", "This file is too large for the current BB-8 reader.");
    }

    return {
      path: this.toDisplayPath(targetPath),
      absolutePath: targetPath,
      size: stat.size,
      content: fs.readFileSync(targetPath, "utf8")
    };
  }

  prepareWrite({ relativePath, content }) {
    const safeRelativePath = sanitizeRelativePath(relativePath);
    if (!safeRelativePath) {
      throw new FileServiceError("INVALID_PATH", "Enter a file path inside the project workspace.");
    }

    const targetPath = this.resolveWorkspacePath(safeRelativePath, { allowMissing: true });
    const approvalId = randomUUID();
    const before = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
    const after = typeof content === "string" ? content : "";

    this.pendingWrites.set(approvalId, {
      relativePath: safeRelativePath,
      targetPath,
      content: after
    });

    return {
      approvalId,
      preview: {
        relativePath: safeRelativePath,
        before,
        after
      }
    };
  }

  writeAfterApproval(approvalId) {
    const pending = this.pendingWrites.get(approvalId);
    if (!pending) {
      throw new FileServiceError(
        "APPROVAL_REQUIRED",
        "Prepare the BB-8 file write preview again before saving."
      );
    }

    this.pendingWrites.delete(approvalId);
    fs.mkdirSync(path.dirname(pending.targetPath), { recursive: true });
    fs.writeFileSync(pending.targetPath, pending.content, "utf8");

    return {
      ok: true,
      path: pending.relativePath
    };
  }

  resolveWorkspacePath(relativePath, { allowMissing = false } = {}) {
    const normalizedPath = sanitizeRelativePath(relativePath);
    if (!normalizedPath) {
      throw new FileServiceError("INVALID_PATH", "Enter a file path inside the project workspace.");
    }

    const targetPath = path.resolve(this.workspaceRoot, normalizedPath);
    const relativeToRoot = path.relative(this.workspaceRoot, targetPath);

    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      throw new FileServiceError("OUTSIDE_WORKSPACE", "BB-8 can only access files inside this workspace.");
    }

    if (!allowMissing && !fs.existsSync(targetPath)) {
      throw new FileServiceError("NOT_FOUND", "That file does not exist in the workspace.");
    }

    return targetPath;
  }

  resolveReadablePath(filePath) {
    if (typeof filePath !== "string" || !filePath.trim()) {
      throw new FileServiceError("INVALID_PATH", "Enter a file path before trying to read it.");
    }

    const normalizedPath = filePath.replace(/\\/g, "/").trim();
    const targetPath = path.isAbsolute(normalizedPath)
      ? path.resolve(normalizedPath)
      : this.resolveWorkspacePath(normalizedPath);

    if (!fs.existsSync(targetPath)) {
      throw new FileServiceError("NOT_FOUND", "That file could not be found.");
    }

    return targetPath;
  }

  resolveSearchRoot(rootPath) {
    if (!rootPath || rootPath === this.workspaceRoot) {
      return this.workspaceRoot;
    }

    if (typeof rootPath !== "string" || !rootPath.trim()) {
      throw new FileServiceError("INVALID_PATH", "Choose a folder before searching files.");
    }

    const targetPath = path.resolve(rootPath.trim());
    if (!fs.existsSync(targetPath)) {
      throw new FileServiceError("NOT_FOUND", "That folder could not be found.");
    }

    if (!fs.statSync(targetPath).isDirectory()) {
      throw new FileServiceError("INVALID_PATH", "Choose a folder before searching files.");
    }

    return targetPath;
  }

  toDisplayPath(targetPath) {
    const relativeToRoot = path.relative(this.workspaceRoot, targetPath);
    if (relativeToRoot && !relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot)) {
      return relativeToRoot;
    }

    return targetPath;
  }
}

function walkWorkspace(rootPath, currentPath, onFile) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) {
        continue;
      }

      walkWorkspace(rootPath, path.join(currentPath, entry.name), onFile);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));
    onFile(relativePath);
  }
}

function sanitizeRelativePath(relativePath) {
  if (typeof relativePath !== "string") {
    return "";
  }

  return relativePath.replace(/\\/g, "/").trim().replace(/^\.\/+/, "");
}

module.exports = {
  FileService,
  FileServiceError
};
