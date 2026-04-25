require("dotenv").config();

const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const { randomUUID } = require("crypto");
const path = require("path");
const { AIService } = require("./services/aiService");
const { AISettingsStore } = require("./services/aiSettingsStore");
const { FileService } = require("./services/fileService");
const { MemoryService } = require("./services/memoryService");
const { NotionService } = require("./services/notionService");
const { WindowStateService } = require("./services/windowStateService");

const isDev = Boolean(process.env.ELECTRON_START_URL);
const sessionMessages = [];
let notionService;
let memoryService;
let aiService;
let aiSettingsStore;
let fileService;
let windowStateService;
const packagedIconPath = path.join(process.cwd(), "assets", "icon.png");

function createWindow() {
  const savedState = windowStateService.load();
  const window = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
    minWidth: 420,
    minHeight: 560,
    alwaysOnTop: true,
    frame: false,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: "#101214",
    icon: packagedIconPath,
    title: "BB-8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.setAlwaysOnTop(true, "floating");
  window.on("resize", () => windowStateService.remember(window.getBounds()));
  window.on("move", () => windowStateService.remember(window.getBounds()));

  if (isDev) {
    window.loadURL(process.env.ELECTRON_START_URL);
  } else {
    window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

app.whenReady().then(() => {
  notionService = new NotionService({
    app,
    safeStorage,
    shell
  });
  aiSettingsStore = new AISettingsStore({
    filePath: path.join(app.getPath("userData"), "bb8-ai.json"),
    safeStorage
  });
  const storedAISettings = aiSettingsStore.load();
  aiService = new AIService();
  aiService.applySettings({
    apiKey: storedAISettings.apiKey || process.env.OPENAI_API_KEY || "",
    model: storedAISettings.model || process.env.OPENAI_MODEL || undefined,
    apiKeySource: storedAISettings.apiKey
      ? storedAISettings.storageMode === "encrypted-file"
        ? "stored-securely"
        : "session-only"
      : process.env.OPENAI_API_KEY
        ? "environment"
        : "none",
    storageMode: storedAISettings.storageMode
  });
  fileService = new FileService({
    workspaceRoot: process.cwd()
  });
  memoryService = new MemoryService({
    filePath: path.join(app.getPath("userData"), "bb8-memory.json")
  });
  windowStateService = new WindowStateService({
    filePath: path.join(app.getPath("userData"), "bb8-window.json"),
    defaultState: {
      width: 520,
      height: 720,
      x: undefined,
      y: undefined
    }
  });
  memoryService.loadState();

  if (process.platform === "darwin" && app.dock && require("fs").existsSync(packagedIconPath)) {
    app.dock.setIcon(packagedIconPath);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("assistant:get-history", () => {
  return sessionMessages;
});

ipcMain.handle("assistant:send-message", async (_event, payload) => {
  const text = typeof payload === "string" ? payload : payload?.text;
  const sourceContext = Array.isArray(payload?.sourceContext)
    ? payload.sourceContext
    : Array.isArray(payload?.notionContext)
      ? payload.notionContext
      : [];
  const memoryState = memoryService.maybeRefreshProjectSummaryFromMessage(text);
  const userMessage = {
    id: randomUUID(),
    role: "user",
    text,
    createdAt: new Date().toISOString()
  };

  sessionMessages.push(userMessage);

  const assistantReply = await aiService.generateReply({
    text,
    notionContext: sourceContext,
    memoryState,
    sessionMessages: sessionMessages.slice(0, -1)
  });

  const assistantMessage = {
    id: randomUUID(),
    role: "assistant",
    ...assistantReply,
    createdAt: new Date().toISOString()
  };

  sessionMessages.push(assistantMessage);

  return assistantMessage;
});

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("notion:connect", async () => notionService.connect());
ipcMain.handle("notion:disconnect", async () => notionService.disconnect());
ipcMain.handle("notion:getConnectionStatus", async () => notionService.getConnectionStatus());
ipcMain.handle("notion:testConnection", async () => notionService.testConnection());
ipcMain.handle("notion:search", async (_event, query) => notionService.search(query));
ipcMain.handle("notion:readPage", async (_event, reference) => notionService.readPage(reference));
ipcMain.handle("notion:prepareCreatePage", async (_event, preview) => notionService.prepareCreatePage(preview));
ipcMain.handle("notion:createPageAfterApproval", async (_event, approvalId) =>
  notionService.createPageAfterApproval(approvalId)
);
ipcMain.handle("notion:prepareUpdatePage", async (_event, preview) => notionService.prepareUpdatePage(preview));
ipcMain.handle("notion:updatePageAfterApproval", async (_event, approvalId) =>
  notionService.updatePageAfterApproval(approvalId)
);
ipcMain.handle("memory:getState", async () => memoryService.getState());
ipcMain.handle("memory:updateProjectSummary", async (_event, projectSummary) =>
  memoryService.updateProjectSummary(projectSummary)
);
ipcMain.handle("memory:updateUserPreferences", async (_event, userPreferences) =>
  memoryService.updateUserPreferences(userPreferences)
);
ipcMain.handle("memory:resetUserPreferences", async () => memoryService.resetUserPreferences());
ipcMain.handle("ai:getStatus", async () => aiService.getStatus());
ipcMain.handle("ai:updateSettings", async (_event, payload) => {
  const nextModel = typeof payload?.model === "string" && payload.model.trim() ? payload.model.trim() : aiService.model;
  const nextApiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  const keyToPersist =
    nextApiKey || aiService.apiKeySource === "stored-securely"
      ? nextApiKey || aiService.apiKey
      : "";
  const saveResult = aiSettingsStore.save({
    apiKey: keyToPersist,
    model: nextModel
  });

  aiService.applySettings({
    apiKey: nextApiKey || aiService.apiKey,
    model: nextModel,
    apiKeySource: nextApiKey
      ? saveResult.persistedApiKey
        ? "stored-securely"
        : "session-only"
      : aiService.apiKey
        ? aiService.apiKeySource
        : "none",
    storageMode: saveResult.storageMode
  });

  return aiService.getStatus();
});
ipcMain.handle("ai:clearApiKey", async () => {
  aiSettingsStore.clearApiKey({ keepModel: aiService.model });
  aiService.applySettings({
    apiKey: "",
    apiKeySource: "none",
    storageMode: aiSettingsStore.load().storageMode
  });
  return aiService.getStatus();
});
ipcMain.handle("files:getStatus", async () => fileService.getStatus());
ipcMain.handle("files:list", async (_event, payload) =>
  fileService.listFiles(payload?.query, payload?.rootPath)
);
ipcMain.handle("files:read", async (_event, relativePath) => fileService.readFile(relativePath));
ipcMain.handle("files:pick", async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "Open Local File",
    properties: ["openFile"]
  });

  if (result.canceled || !result.filePaths?.length) {
    return null;
  }

  return result.filePaths[0];
});
ipcMain.handle("files:pickFolder", async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "Open Project Folder",
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths?.length) {
    return null;
  }

  return result.filePaths[0];
});
ipcMain.handle("files:prepareWrite", async (_event, payload) => fileService.prepareWrite(payload));
ipcMain.handle("files:writeAfterApproval", async (_event, approvalId) =>
  fileService.writeAfterApproval(approvalId)
);
