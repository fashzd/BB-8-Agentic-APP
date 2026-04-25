export function getConnectionStatus() {
  return window.notion.getConnectionStatus();
}

export function connect() {
  return window.notion.connect();
}

export function disconnect() {
  return window.notion.disconnect();
}

export function testConnection() {
  return window.notion.testConnection();
}

export function search(query) {
  return window.notion.search(query);
}

export function readPage(reference) {
  return window.notion.readPage(reference);
}

export function prepareCreatePage(payload) {
  return window.notion.prepareCreatePage(payload);
}

export function createPageAfterApproval(approvalId) {
  return window.notion.createPageAfterApproval(approvalId);
}

export function prepareUpdatePage(payload) {
  return window.notion.prepareUpdatePage(payload);
}

export function updatePageAfterApproval(approvalId) {
  return window.notion.updatePageAfterApproval(approvalId);
}
