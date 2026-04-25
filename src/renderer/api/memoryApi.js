export function getMemoryState() {
  return window.memory.getState();
}

export function updateProjectSummary(projectSummary) {
  return window.memory.updateProjectSummary(projectSummary);
}

export function updateUserPreferences(userPreferences) {
  return window.memory.updateUserPreferences(userPreferences);
}

export function resetUserPreferences() {
  return window.memory.resetUserPreferences();
}
