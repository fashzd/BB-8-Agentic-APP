const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("assistant", {
  getHistory: () => ipcRenderer.invoke("assistant:get-history"),
  sendMessage: (payload) => ipcRenderer.invoke("assistant:send-message", payload)
});

contextBridge.exposeInMainWorld("desktopWindow", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close")
});

contextBridge.exposeInMainWorld("notion", {
  connect: () => ipcRenderer.invoke("notion:connect"),
  disconnect: () => ipcRenderer.invoke("notion:disconnect"),
  getConnectionStatus: () => ipcRenderer.invoke("notion:getConnectionStatus"),
  testConnection: () => ipcRenderer.invoke("notion:testConnection"),
  search: (query) => ipcRenderer.invoke("notion:search", query),
  readPage: (reference) => ipcRenderer.invoke("notion:readPage", reference),
  prepareCreatePage: (preview) => ipcRenderer.invoke("notion:prepareCreatePage", preview),
  createPageAfterApproval: (approvalId) => ipcRenderer.invoke("notion:createPageAfterApproval", approvalId),
  prepareUpdatePage: (preview) => ipcRenderer.invoke("notion:prepareUpdatePage", preview),
  updatePageAfterApproval: (approvalId) => ipcRenderer.invoke("notion:updatePageAfterApproval", approvalId)
});

contextBridge.exposeInMainWorld("memory", {
  getState: () => ipcRenderer.invoke("memory:getState"),
  updateProjectSummary: (projectSummary) => ipcRenderer.invoke("memory:updateProjectSummary", projectSummary),
  updateUserPreferences: (userPreferences) => ipcRenderer.invoke("memory:updateUserPreferences", userPreferences),
  resetUserPreferences: () => ipcRenderer.invoke("memory:resetUserPreferences")
});

contextBridge.exposeInMainWorld("ai", {
  getStatus: () => ipcRenderer.invoke("ai:getStatus"),
  updateSettings: (payload) => ipcRenderer.invoke("ai:updateSettings", payload),
  clearApiKey: () => ipcRenderer.invoke("ai:clearApiKey")
});

contextBridge.exposeInMainWorld("files", {
  getStatus: () => ipcRenderer.invoke("files:getStatus"),
  list: (payload) => ipcRenderer.invoke("files:list", payload),
  read: (relativePath) => ipcRenderer.invoke("files:read", relativePath),
  pick: () => ipcRenderer.invoke("files:pick"),
  pickFolder: () => ipcRenderer.invoke("files:pickFolder"),
  prepareWrite: (payload) => ipcRenderer.invoke("files:prepareWrite", payload),
  writeAfterApproval: (approvalId) => ipcRenderer.invoke("files:writeAfterApproval", approvalId)
});
