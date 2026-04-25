export function getFileStatus() {
  return window.files.getStatus();
}

export function listFiles(query, rootPath) {
  return window.files.list({ query, rootPath });
}

export function readFile(relativePath) {
  return window.files.read(relativePath);
}

export function pickFile() {
  return window.files.pick();
}

export function pickFolder() {
  return window.files.pickFolder();
}

export function prepareFileWrite(payload) {
  return window.files.prepareWrite(payload);
}

export function writeFileAfterApproval(approvalId) {
  return window.files.writeAfterApproval(approvalId);
}
