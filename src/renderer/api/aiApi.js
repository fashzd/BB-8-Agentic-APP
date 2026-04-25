export function getAIStatus() {
  return window.ai.getStatus();
}

export function updateAISettings(payload) {
  return window.ai.updateSettings(payload);
}

export function clearAIApiKey() {
  return window.ai.clearApiKey();
}
