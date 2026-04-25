const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { FileService } = require("../src/main/services/fileService");

test("file service lists and reads workspace files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-files-"));
  fs.writeFileSync(path.join(tempDir, "notes.txt"), "hello", "utf8");
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "app.js"), "console.log('bb8')", "utf8");

  const service = new FileService({ workspaceRoot: tempDir });
  const files = service.listFiles("app");

  assert.deepEqual(files, ["src/app.js"]);
  assert.equal(service.readFile("notes.txt").content, "hello");
});

test("file service blocks paths outside the workspace", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-files-"));
  const service = new FileService({ workspaceRoot: tempDir });

  assert.throws(
    () => service.prepareWrite({ relativePath: "../secret.txt", content: "nope" }),
    /inside this workspace/
  );
});

test("file service can read an absolute path outside the workspace", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-files-"));
  const outsideFile = path.join(os.tmpdir(), `bb8-outside-${Date.now()}.txt`);
  fs.writeFileSync(outsideFile, "outside hello", "utf8");

  const service = new FileService({ workspaceRoot: tempDir });
  const file = service.readFile(outsideFile);

  assert.equal(file.absolutePath, outsideFile);
  assert.equal(file.path, outsideFile);
  assert.equal(file.content, "outside hello");

  fs.unlinkSync(outsideFile);
});

test("file service can search inside a selected external folder", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-files-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-outside-dir-"));
  fs.writeFileSync(path.join(outsideDir, "IMPLEMENTATION.md"), "folder search", "utf8");

  const service = new FileService({ workspaceRoot: tempDir });
  const files = service.listFiles("implement", outsideDir);

  assert.deepEqual(files, ["IMPLEMENTATION.md"]);
});

test("file service requires approval before saving", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb8-files-"));
  const service = new FileService({ workspaceRoot: tempDir });
  const preview = service.prepareWrite({
    relativePath: "draft.txt",
    content: "hello bb-8"
  });

  assert.equal(fs.existsSync(path.join(tempDir, "draft.txt")), false);
  const result = service.writeAfterApproval(preview.approvalId);

  assert.equal(result.path, "draft.txt");
  assert.equal(fs.readFileSync(path.join(tempDir, "draft.txt"), "utf8"), "hello bb-8");
});
