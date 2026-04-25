import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getHistory, sendMessage } from "./api/assistantApi";
import { clearAIApiKey, getAIStatus, updateAISettings } from "./api/aiApi";
import {
  getFileStatus,
  listFiles,
  pickFolder,
  prepareFileWrite,
  readFile as readLocalFile,
  writeFileAfterApproval
} from "./api/filesApi";
import {
  connect as connectNotion,
  createPageAfterApproval,
  disconnect as disconnectNotion,
  getConnectionStatus,
  prepareCreatePage,
  prepareUpdatePage,
  readPage,
  search as searchNotion,
  testConnection,
  updatePageAfterApproval
} from "./api/notionApi";
import {
  getMemoryState,
  resetUserPreferences,
  updateProjectSummary,
  updateUserPreferences
} from "./api/memoryApi";
import "./styles.css";

const initialMessage = {
  id: "welcome",
  role: "assistant",
  text: "Yo! BB-8 here, your helpful desktop AI assistant. I can chat, remember project context, and use connected Notion pages as sources."
};

function getFileDisplayName(filePath) {
  if (!filePath) {
    return "File";
  }

  return filePath.split(/[/\\]/).filter(Boolean).pop() || filePath;
}

function App() {
  const [activeTab, setActiveTab] = useState("chat");
  const [showSourcePanel, setShowSourcePanel] = useState(true);
  const [messages, setMessages] = useState([initialMessage]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [notionStatus, setNotionStatus] = useState({
    connected: false,
    storageMode: "memory-only",
    workspaceName: null,
    workspaceId: null
  });
  const [notionError, setNotionError] = useState("");
  const [notionBusyAction, setNotionBusyAction] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPage, setSelectedPage] = useState(null);
  const [readError, setReadError] = useState("");
  const [activeSources, setActiveSources] = useState([]);
  const [fileStatus, setFileStatus] = useState({ workspaceRoot: "" });
  const [browseRoot, setBrowseRoot] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [fileResults, setFileResults] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [directFilePath, setDirectFilePath] = useState("");
  const [fileDraft, setFileDraft] = useState({
    relativePath: "",
    content: ""
  });
  const [fileWritePreview, setFileWritePreview] = useState(null);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    parentRef: "",
    body: "",
    propertiesText: ""
  });
  const [updateDraft, setUpdateDraft] = useState({
    pageRef: "",
    title: "",
    body: "",
    propertiesText: "",
    currentContentExcerpt: ""
  });
  const [createPreview, setCreatePreview] = useState(null);
  const [updatePreview, setUpdatePreview] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const [aiStatus, setAiStatus] = useState({
    configured: false,
    model: "",
    provider: "OpenAI",
    mode: "missing-api-key",
    storageMode: "memory-only",
    apiKeySource: "none",
    availableModels: []
  });
  const [aiDraft, setAiDraft] = useState({
    apiKey: "",
    model: ""
  });
  const [memoryState, setMemoryState] = useState({
    projectSummary: "",
    userPreferences: {
      tone: "",
      codingStyle: "",
      workflows: ""
    },
    updatedAt: null
  });
  const [memoryDraft, setMemoryDraft] = useState({
    projectSummary: "",
    tone: "",
    codingStyle: "",
    workflows: ""
  });
  const messagesEndRef = useRef(null);

  useEffect(() => {
    getHistory().then((history) => {
      if (history.length > 0) {
        setMessages(history);
      }
    });

    refreshNotionStatus();
    refreshMemoryState();
    refreshAIStatus();
    refreshFileStatus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const aiModelValue = aiDraft.model || aiStatus.model || "";
  const aiModelOptions = Array.isArray(aiStatus.availableModels) ? aiStatus.availableModels : [];
  const showCurrentModelOption =
    aiModelValue && !aiModelOptions.some((option) => option.value === aiModelValue);

  async function refreshNotionStatus() {
    try {
      const status = await getConnectionStatus();
      setNotionStatus(status);
    } catch (error) {
      setNotionError(error.message || "Could not load Notion status.");
    }
  }

  async function refreshMemoryState() {
    try {
      const state = await getMemoryState();
      setMemoryState(state);
      setMemoryDraft({
        projectSummary: state.projectSummary || "",
        tone: state.userPreferences?.tone || "",
        codingStyle: state.userPreferences?.codingStyle || "",
        workflows: state.userPreferences?.workflows || ""
      });
    } catch (error) {
      setActionMessage(error.message || "Could not load BB-8 memory.");
    }
  }

  async function refreshAIStatus() {
    try {
      const status = await getAIStatus();
      setAiStatus(status);
      setAiDraft((current) => ({
        apiKey: "",
        model: status.model || current.model || ""
      }));
    } catch (error) {
      setActionMessage(error.message || "Could not load BB-8 AI status.");
    }
  }

  async function handleSaveAISettings(event) {
    event.preventDefault();

    try {
      const status = await updateAISettings({
        apiKey: aiDraft.apiKey,
        model: aiDraft.model
      });
      setAiStatus(status);
      setAiDraft((current) => ({
        apiKey: "",
        model: status.model || current.model || ""
      }));
      setActionMessage(
        status.configured
          ? "BB-8 AI settings were saved."
          : "Model was saved. Add an API key to enable live replies."
      );
    } catch (error) {
      setActionMessage(error.message || "Could not save BB-8 AI settings.");
    }
  }

  async function handleClearAIApiKey() {
    try {
      const status = await clearAIApiKey();
      setAiStatus(status);
      setAiDraft((current) => ({
        apiKey: "",
        model: status.model || current.model || ""
      }));
      setActionMessage("The saved OpenAI API key was cleared from BB-8.");
    } catch (error) {
      setActionMessage(error.message || "Could not clear the OpenAI API key.");
    }
  }

  async function refreshFileStatus() {
    try {
      const status = await getFileStatus();
      setFileStatus(status);
      setBrowseRoot("");
      setFileResults([]);
    } catch (error) {
      setActionMessage(error.message || "Could not load BB-8 file status.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isSending) {
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text
    };

    setInput("");
    setActionMessage("");
    setIsSending(true);
    setMessages((currentMessages) => [...currentMessages, userMessage]);

    try {
      const assistantMessage = await sendMessage({
        text,
        sourceContext: activeSources
      });
      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: error.message || "I could not generate a response. Please try again."
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleConnectNotion() {
    setNotionBusyAction("connect");
    setNotionError("");
    setActionMessage("Waiting for Notion authorization in your browser...");

    try {
      const status = await connectNotion();
      setNotionStatus(status);
      setActionMessage("Notion is connected.");
    } catch (error) {
      setNotionError(error.message || "Could not connect to Notion.");
    } finally {
      setNotionBusyAction("");
    }
  }

  async function handleDisconnectNotion() {
    setNotionBusyAction("disconnect");
    setNotionError("");

    try {
      const status = await disconnectNotion();
      setNotionStatus(status);
      setSearchResults([]);
      setSelectedPage(null);
      setActiveSources([]);
      setCreatePreview(null);
      setUpdatePreview(null);
      setActionMessage("Notion was disconnected.");
    } catch (error) {
      setNotionError(error.message || "Could not disconnect Notion.");
    } finally {
      setNotionBusyAction("");
    }
  }

  async function handleTestConnection() {
    setNotionBusyAction("test");
    setNotionError("");

    try {
      const result = await testConnection();
      await refreshNotionStatus();
      setActionMessage(`Connected to ${result.workspace?.name || "your Notion workspace"}.`);
    } catch (error) {
      setNotionError(error.message || "Connection test failed.");
    } finally {
      setNotionBusyAction("");
    }
  }

  async function handleSearch(event) {
    event.preventDefault();

    if (!searchQuery.trim() || !notionStatus.connected) {
      return;
    }

    setIsSearching(true);
    setNotionError("");
    setSelectedPage(null);

    try {
      const response = await searchNotion(searchQuery.trim());
      setSearchResults(response.results);
      if (response.results.length === 0) {
        setActionMessage("No Notion matches found.");
      }
    } catch (error) {
      setNotionError(error.message || "Notion search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleReadPage(reference) {
    setReadError("");
    setActionMessage("");
    setSelectedPage(null);

    try {
      const page = await readPage(reference);
      setSelectedPage(page);
      setUpdateDraft((current) => ({
        ...current,
        pageRef: page.url || page.id,
        currentContentExcerpt: page.content || page.snippet || ""
      }));
    } catch (error) {
      setReadError(error.message || "Could not read that Notion page.");
    }
  }

  function addActiveSource(page) {
    upsertActiveSource(page);
    setActionMessage(`Added "${page.title}" as a source.`);
    setActiveTab("chat");
  }

  function upsertActiveSource(source) {
    setActiveSources((current) => {
      const key = source.id || source.path;
      const next = current.filter((item) => (item.id || item.path) !== key);
      return [...next, { ...source, type: source.type || "notion" }];
    });
  }

  function removeActiveSource(sourceKey) {
    setActiveSources((current) =>
      current.filter((source) => (source.id || source.path) !== sourceKey)
    );
  }

  async function handleSummarizeSelectedPage() {
    if (!selectedPage) {
      return;
    }

    setInput(`Summarize ${selectedPage.title}`);
    addActiveSource(selectedPage);
    setActiveTab("chat");
  }

  async function handleFileSearch(event) {
    event.preventDefault();

    if (!browseRoot) {
      setActionMessage("Choose a folder before searching files.");
      return;
    }

    try {
      const files = await listFiles(fileQuery, browseRoot);
      setFileResults(files);
    } catch (error) {
      setNotionError(error.message || "BB-8 could not search the workspace files.");
    }
  }

  async function handleReadFile(relativePath) {
    try {
      const file = await readLocalFile(relativePath);
      setSelectedFile(file);
      setDirectFilePath(file.absolutePath || file.path);
      setFileDraft({
        relativePath: file.path,
        content: file.content
      });
      upsertActiveSource({
        type: "file",
        id: file.absolutePath || file.path,
        title: getFileDisplayName(file.path),
        path: file.path,
        content: file.content
      });
      setActionMessage(`Opened "${getFileDisplayName(file.path)}" and added it to Knowledge Sources.`);
    } catch (error) {
      setNotionError(error.message || "BB-8 could not read that file.");
    }
  }

  async function handleOpenFolder() {
    try {
      let selectedPath = directFilePath.trim();

      if (!selectedPath) {
        selectedPath = await pickFolder();
      }

      if (!selectedPath) {
        setActionMessage("Open folder was canceled.");
        return;
      }

      setBrowseRoot(selectedPath);
      const files = await listFiles(fileQuery, selectedPath);
      setFileResults(files);
      setDirectFilePath(selectedPath);
      setActionMessage(`Browsing folder "${selectedPath}".`);
    } catch (error) {
      setNotionError(error.message || "BB-8 could not open that folder.");
    }
  }

  function handleUseFileAsSource() {
    if (!selectedFile) {
      return;
    }

    upsertActiveSource({
      type: "file",
      id: selectedFile.absolutePath || selectedFile.path,
      title: getFileDisplayName(selectedFile.path),
      path: selectedFile.path,
      content: selectedFile.content
    });
    setActionMessage(`Added "${getFileDisplayName(selectedFile.path)}" as a local file source.`);
    setActiveTab("chat");
  }

  async function handlePrepareFileWrite() {
    try {
      const preview = await prepareFileWrite(fileDraft);
      setFileWritePreview(preview);
      setActionMessage("File write preview is ready. Approval is still required.");
    } catch (error) {
      setNotionError(error.message || "BB-8 could not prepare that file write.");
    }
  }

  async function handleApproveFileWrite() {
    if (!fileWritePreview) {
      return;
    }

    try {
      const result = await writeFileAfterApproval(fileWritePreview.approvalId);
      setFileWritePreview(null);
      setActionMessage(`Saved "${result.path}".`);
      await handleReadFile(result.path);
    } catch (error) {
      setNotionError(error.message || "BB-8 could not save that file.");
    }
  }

  async function handlePrepareCreate() {
    try {
      const properties = parsePropertiesJson(createDraft.propertiesText);
      const preview = await prepareCreatePage({
        title: createDraft.title,
        parentRef: createDraft.parentRef,
        body: createDraft.body,
        properties
      });
      setCreatePreview(preview);
      setActionMessage("Create preview is ready. Approval is still required.");
    } catch (error) {
      setNotionError(error.message || "Could not prepare the Notion page draft.");
    }
  }

  async function handleApproveCreate() {
    if (!createPreview) {
      return;
    }

    setNotionBusyAction("create");

    try {
      const response = await createPageAfterApproval(createPreview.approvalId);
      setCreatePreview(null);
      setCreateDraft({
        title: "",
        parentRef: "",
        body: "",
        propertiesText: ""
      });
      setActionMessage(`Created "${response.page.title}".`);
      if (response.page.url) {
        setSelectedPage(response.page);
      }
    } catch (error) {
      setNotionError(error.message || "Notion page creation failed.");
    } finally {
      setNotionBusyAction("");
    }
  }

  async function handlePrepareUpdate() {
    try {
      const properties = parsePropertiesJson(updateDraft.propertiesText);
      const preview = await prepareUpdatePage({
        pageRef: updateDraft.pageRef,
        title: updateDraft.title,
        body: updateDraft.body,
        properties,
        currentContentExcerpt: updateDraft.currentContentExcerpt
      });
      setUpdatePreview(preview);
      setActionMessage("Update preview is ready. Approval is still required.");
    } catch (error) {
      setNotionError(error.message || "Could not prepare the Notion update.");
    }
  }

  async function handleSaveProjectSummary() {
    try {
      const state = await updateProjectSummary(memoryDraft.projectSummary);
      setMemoryState(state);
      setMemoryDraft((current) => ({
        ...current,
        projectSummary: state.projectSummary || ""
      }));
      setActionMessage("BB-8 project memory updated.");
    } catch (error) {
      setNotionError(error.message || "Could not save project memory.");
    }
  }

  async function handleSavePreferences() {
    try {
      const state = await updateUserPreferences({
        tone: memoryDraft.tone,
        codingStyle: memoryDraft.codingStyle,
        workflows: memoryDraft.workflows
      });
      setMemoryState(state);
      setActionMessage("BB-8 preferences updated.");
    } catch (error) {
      setNotionError(error.message || "Could not save BB-8 preferences.");
    }
  }

  async function handleResetPreferences() {
    try {
      const state = await resetUserPreferences();
      setMemoryState(state);
      setMemoryDraft((current) => ({
        ...current,
        tone: "",
        codingStyle: "",
        workflows: ""
      }));
      setActionMessage("BB-8 preferences reset.");
    } catch (error) {
      setNotionError(error.message || "Could not reset BB-8 preferences.");
    }
  }

  async function handleApproveUpdate() {
    if (!updatePreview) {
      return;
    }

    setNotionBusyAction("update");

    try {
      const response = await updatePageAfterApproval(updatePreview.approvalId);
      setUpdatePreview(null);
      setActionMessage(`Updated "${response.page.title}".`);
      setSelectedPage(response.page);
    } catch (error) {
      setNotionError(error.message || "Notion page update failed.");
    } finally {
      setNotionBusyAction("");
    }
  }

  return (
    <main className="app-shell">
      <header className="title-bar">
        <div className="drag-region">
          <span className="status-dot" />
          <div>
            <h1>BB-8</h1>
            <p>Cyberpunk Jedi Philosophy</p>
          </div>
        </div>
        <nav className="top-nav">
          <button
            className={activeTab === "chat" ? "active" : ""}
            onClick={() => setActiveTab("chat")}
            type="button"
          >
            Chat
          </button>
          <button
            className={activeTab === "sources" ? "active" : ""}
            onClick={() => setActiveTab("sources")}
            type="button"
          >
            Sources
          </button>
          <button
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => setActiveTab("settings")}
            type="button"
          >
            Settings
          </button>
        </nav>
        <div className="window-actions">
          <button aria-label="Minimize window" onClick={window.desktopWindow.minimize}>
            -
          </button>
          <button aria-label="Close window" onClick={window.desktopWindow.close}>
            x
          </button>
        </div>
      </header>

      <section className="content-area">
        {notionError ? <p className="notice error">{notionError}</p> : null}
        {actionMessage ? <p className="notice">{actionMessage}</p> : null}

        {activeTab === "chat" ? (
          <div className="chat-panel">
            <section className={`source-strip ${showSourcePanel ? "" : "collapsed"}`}>
              <div>
                <h2>Knowledge Sources</h2>
                <p>
                  {activeSources.length > 0
                    ? "These files and pages will be used as assistant context."
                    : "No active sources yet."}
                </p>
              </div>
              <div className="inline-actions">
                <button onClick={() => setShowSourcePanel((current) => !current)} type="button">
                  {showSourcePanel ? "Minimize" : "Show"}
                </button>
                <button onClick={() => setActiveTab("sources")} type="button">
                  Manage
                </button>
              </div>
            </section>

            {activeSources.length > 0 ? (
              <div className={`source-chip-list ${showSourcePanel ? "" : "collapsed"}`}>
                {activeSources.map((source) => (
                  <div className="source-chip" key={source.id || source.path}>
                    <span>{source.type === "file" ? `File: ${source.title}` : source.title}</span>
                    <button onClick={() => removeActiveSource(source.id || source.path)} type="button">
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <section className="messages" aria-live="polite">
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <span>{message.role === "user" ? "You" : "Assistant"}</span>
                  <div className="message-body">{message.text}</div>
                  {Array.isArray(message.sources) && message.sources.length > 0 ? (
                    <div className="message-sources">
                      {message.sources.map((source) => (
                        source.url ? (
                          <a
                            href={source.url}
                            key={`${message.id}-${source.id || source.title || source.path}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {source.title}
                          </a>
                        ) : (
                          <span
                            className="message-source-label"
                            key={`${message.id}-${source.id || source.title || source.path}`}
                            title={source.path || source.title}
                          >
                            {source.title || source.path}
                          </span>
                        )
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {isSending && (
                <article className="message assistant">
                  <span>Assistant</span>
                  <div className="message-body thinking-bubble" aria-label="BB-8 is thinking">
                    <div className="thinking-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="thinking-text">Thinking</div>
                  </div>
                </article>
              )}
              <div ref={messagesEndRef} />
            </section>
          </div>
        ) : null}

        {activeTab === "sources" ? (
          <div className="panel-scroll">
            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>Workspace Files</h2>
                  <p>Read local files safely and save changes through an approval step.</p>
                </div>
              </div>

              {browseRoot ? (
                <p className="workspace-path">
                  <strong>Selected folder:</strong> {browseRoot}
                </p>
              ) : null}

              <form
                className="search-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleOpenFolder();
                }}
              >
                <input
                  onChange={(event) => setDirectFilePath(event.target.value)}
                  placeholder="Open a folder by absolute path..."
                  value={directFilePath}
                />
                <button type="submit">Open Folder</button>
              </form>

              <form className="search-form" onSubmit={handleFileSearch}>
                <input
                  onChange={(event) => setFileQuery(event.target.value)}
                  placeholder="Search files in the selected folder..."
                  value={fileQuery}
                />
                <button type="submit">Search</button>
              </form>

              <div className="result-list">
                {fileResults.map((relativePath) => (
                  <article className="result-card" key={relativePath}>
                    <div>
                      <h3>{relativePath}</h3>
                      <p>Local folder file</p>
                    </div>
                    <button
                      onClick={() =>
                        handleReadFile(
                          browseRoot && browseRoot !== fileStatus.workspaceRoot
                            ? `${browseRoot}/${relativePath}`
                            : relativePath
                        )
                      }
                      type="button"
                    >
                      Read file
                    </button>
                  </article>
                ))}
              </div>

              {selectedFile ? (
                <article className="page-reader">
                  <div className="section-heading">
                    <div>
                      <h2>{selectedFile.path}</h2>
                      <p>Local file source</p>
                    </div>
                    <div className="inline-actions">
                      <button onClick={handleUseFileAsSource} type="button">
                        Use as Source
                      </button>
                    </div>
                  </div>
                  <pre>{selectedFile.content}</pre>
                </article>
              ) : null}

              <div className="form-grid">
                <label>
                  <span>File path</span>
                  <input
                    onChange={(event) =>
                      setFileDraft((current) => ({ ...current, relativePath: event.target.value }))
                    }
                    value={fileDraft.relativePath}
                  />
                </label>
                <label className="full-width">
                  <span>File content</span>
                  <textarea
                    onChange={(event) =>
                      setFileDraft((current) => ({ ...current, content: event.target.value }))
                    }
                    rows="8"
                    value={fileDraft.content}
                  />
                </label>
              </div>

              <div className="inline-actions">
                <button onClick={handlePrepareFileWrite} type="button">
                  Prepare File Save
                </button>
              </div>

              {fileWritePreview ? (
                <article className="preview-card">
                  <h3>Ready to Save File</h3>
                  <p>This action still requires approval.</p>
                  <dl className="preview-list">
                    <div>
                      <dt>Path</dt>
                      <dd>{fileWritePreview.preview.relativePath}</dd>
                    </div>
                    <div>
                      <dt>Before</dt>
                      <dd>
                        <pre>{fileWritePreview.preview.before || "File is new or empty."}</pre>
                      </dd>
                    </div>
                    <div>
                      <dt>After</dt>
                      <dd>
                        <pre>{fileWritePreview.preview.after}</pre>
                      </dd>
                    </div>
                  </dl>
                  <div className="inline-actions">
                    <button onClick={handleApproveFileWrite} type="button">
                      Approve and Save
                    </button>
                    <button onClick={() => setFileWritePreview(null)} type="button">
                      Cancel
                    </button>
                  </div>
                </article>
              ) : null}
            </section>

            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>Notion Search</h2>
                  <p>Search your connected Notion workspace and open a page as a source.</p>
                </div>
                {!notionStatus.connected ? (
                  <button onClick={handleConnectNotion} type="button">
                    Connect Notion
                  </button>
                ) : null}
              </div>

              <form className="search-form" onSubmit={handleSearch}>
                <input
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={notionStatus.connected ? "Search Notion pages and databases..." : "Connect Notion to search"}
                  value={searchQuery}
                />
                <button disabled={!notionStatus.connected || isSearching || !searchQuery.trim()} type="submit">
                  {isSearching ? "Searching" : "Search"}
                </button>
              </form>

              <div className="result-list">
                {searchResults.map((result) => (
                  <article className="result-card" key={result.id}>
                    <div>
                      <h3>{result.title}</h3>
                      <p>{result.snippet || result.metadata || "No preview available."}</p>
                      {result.url ? (
                        <a href={result.url} rel="noreferrer" target="_blank">
                          {result.url}
                        </a>
                      ) : null}
                    </div>
                    <button onClick={() => handleReadPage(result.reference || result.url || result.id)} type="button">
                      Read page
                    </button>
                  </article>
                ))}
              </div>

              {readError ? <p className="notice error">{readError}</p> : null}

              {selectedPage ? (
                <article className="page-reader">
                  <div className="section-heading">
                    <div>
                      <h2>{selectedPage.title}</h2>
                      <p>Read action</p>
                    </div>
                    <div className="inline-actions">
                      <button onClick={() => addActiveSource(selectedPage)} type="button">
                        Use as Source
                      </button>
                      <button onClick={handleSummarizeSelectedPage} type="button">
                        Summarize in Chat
                      </button>
                    </div>
                  </div>
                  {selectedPage.url ? (
                    <a href={selectedPage.url} rel="noreferrer" target="_blank">
                      Open Notion page
                    </a>
                  ) : null}
                  <pre>{selectedPage.content || selectedPage.snippet || "No page content returned."}</pre>
                </article>
              ) : null}
            </section>

            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>Create Page</h2>
                  <p>Write action requiring approval</p>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  <span>Title</span>
                  <input
                    onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
                    value={createDraft.title}
                  />
                </label>
                <label>
                  <span>Parent page or data source</span>
                  <input
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, parentRef: event.target.value }))
                    }
                    placeholder="Optional page URL, page ID, or collection://..."
                    value={createDraft.parentRef}
                  />
                </label>
                <label className="full-width">
                  <span>Body markdown</span>
                  <textarea
                    onChange={(event) => setCreateDraft((current) => ({ ...current, body: event.target.value }))}
                    rows="7"
                    value={createDraft.body}
                  />
                </label>
                <label className="full-width">
                  <span>Properties JSON</span>
                  <textarea
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, propertiesText: event.target.value }))
                    }
                    placeholder='Optional. Example: {"Status":"Draft"}'
                    rows="4"
                    value={createDraft.propertiesText}
                  />
                </label>
              </div>

              <div className="inline-actions">
                <button disabled={!notionStatus.connected} onClick={handlePrepareCreate} type="button">
                  Prepare Preview
                </button>
              </div>

              {createPreview ? (
                <article className="preview-card">
                  <h3>Ready to Create</h3>
                  <p>This action still requires approval.</p>
                  <dl className="preview-list">
                    <div>
                      <dt>Title</dt>
                      <dd>{createPreview.preview.title}</dd>
                    </div>
                    <div>
                      <dt>Parent</dt>
                      <dd>{createPreview.preview.parentRef || "Private top-level page"}</dd>
                    </div>
                    <div>
                      <dt>Body</dt>
                      <dd>
                        <pre>{createPreview.preview.body || "No body content."}</pre>
                      </dd>
                    </div>
                    <div>
                      <dt>Properties</dt>
                      <dd>{JSON.stringify(createPreview.preview.properties || {}, null, 2)}</dd>
                    </div>
                  </dl>
                  <div className="inline-actions">
                    <button
                      disabled={notionBusyAction === "create"}
                      onClick={handleApproveCreate}
                      type="button"
                    >
                      Approve and Create
                    </button>
                    <button onClick={() => setCreatePreview(null)} type="button">
                      Cancel
                    </button>
                  </div>
                </article>
              ) : null}
            </section>

            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>Update Page</h2>
                  <p>Write action requiring approval</p>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  <span>Page URL or ID</span>
                  <input
                    onChange={(event) => setUpdateDraft((current) => ({ ...current, pageRef: event.target.value }))}
                    value={updateDraft.pageRef}
                  />
                </label>
                <label>
                  <span>New title</span>
                  <input
                    onChange={(event) => setUpdateDraft((current) => ({ ...current, title: event.target.value }))}
                    value={updateDraft.title}
                  />
                </label>
                <label className="full-width">
                  <span>Replacement body markdown</span>
                  <textarea
                    onChange={(event) => setUpdateDraft((current) => ({ ...current, body: event.target.value }))}
                    rows="7"
                    value={updateDraft.body}
                  />
                </label>
                <label className="full-width">
                  <span>Properties JSON</span>
                  <textarea
                    onChange={(event) =>
                      setUpdateDraft((current) => ({ ...current, propertiesText: event.target.value }))
                    }
                    placeholder='Optional. Example: {"Status":"In Progress"}'
                    rows="4"
                    value={updateDraft.propertiesText}
                  />
                </label>
              </div>

              <div className="inline-actions">
                <button disabled={!notionStatus.connected} onClick={handlePrepareUpdate} type="button">
                  Prepare Preview
                </button>
              </div>

              {updatePreview ? (
                <article className="preview-card">
                  <h3>Ready to Update</h3>
                  <p>This action still requires approval.</p>
                  <dl className="preview-list">
                    <div>
                      <dt>Page</dt>
                      <dd>{updatePreview.preview.pageRef}</dd>
                    </div>
                    <div>
                      <dt>Before</dt>
                      <dd>
                        <pre>{updatePreview.preview.currentContentExcerpt || "No existing excerpt captured."}</pre>
                      </dd>
                    </div>
                    <div>
                      <dt>After</dt>
                      <dd>
                        <pre>{updatePreview.preview.body || "No body change."}</pre>
                      </dd>
                    </div>
                    <div>
                      <dt>Properties</dt>
                      <dd>{JSON.stringify(updatePreview.preview.properties || {}, null, 2)}</dd>
                    </div>
                  </dl>
                  <div className="inline-actions">
                    <button
                      disabled={notionBusyAction === "update"}
                      onClick={handleApproveUpdate}
                      type="button"
                    >
                      Approve and Update
                    </button>
                    <button onClick={() => setUpdatePreview(null)} type="button">
                      Cancel
                    </button>
                  </div>
                </article>
              ) : null}
            </section>
          </div>
        ) : null}

        {activeTab === "settings" ? (
          <div className="panel-scroll">
            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>BB-8 AI</h2>
                  <p>Live OpenAI integration</p>
                </div>
              </div>

              <article className="status-card">
                <p>
                  <strong>Provider:</strong> {aiStatus.provider}
                </p>
                <p>
                  <strong>Status:</strong> {aiStatus.configured ? "Configured" : "Missing API key"}
                </p>
                <p>
                  <strong>Model:</strong> {aiStatus.model || "Not set"}
                </p>
                <p>
                  <strong>API key source:</strong>{" "}
                  {aiStatus.apiKeySource === "stored-securely"
                    ? "Saved securely in BB-8"
                    : aiStatus.apiKeySource === "session-only"
                      ? "Loaded for this session only"
                      : aiStatus.apiKeySource === "environment"
                        ? "Loaded from environment"
                        : "Not configured"}
                </p>
                <p>
                  <strong>Storage:</strong>{" "}
                  {aiStatus.storageMode === "encrypted-file"
                    ? "Encrypted local storage"
                    : "Memory only"}
                </p>
              </article>

              <form className="stacked-form" onSubmit={handleSaveAISettings}>
                <label className="form-label" htmlFor="openai-api-key">
                  OpenAI API key
                </label>
                <input
                  id="openai-api-key"
                  onChange={(event) =>
                    setAiDraft((current) => ({
                      ...current,
                      apiKey: event.target.value
                    }))
                  }
                  placeholder={
                    aiStatus.configured
                      ? "Saved already. Paste a new key only if you want to replace it."
                      : "Paste your OpenAI API key"
                  }
                  type="password"
                  value={aiDraft.apiKey}
                />

                <label className="form-label" htmlFor="openai-model">
                  Model
                </label>
                <select
                  id="openai-model"
                  onChange={(event) =>
                    setAiDraft((current) => ({
                      ...current,
                      model: event.target.value
                    }))
                  }
                  value={aiModelValue}
                >
                  {!aiModelValue ? <option value="">Select a model</option> : null}
                  {showCurrentModelOption ? (
                    <option value={aiModelValue}>{`Current: ${aiModelValue}`}</option>
                  ) : null}
                  {aiModelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <button onClick={refreshAIStatus} type="button">
                  Refresh AI Status
                </button>
                <button type="submit">Save AI Settings</button>
                <button onClick={handleClearAIApiKey} type="button">
                  Clear Saved API Key
                </button>
              </form>
            </section>

            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>BB-8 Memory</h2>
                  <p>Persistent project context and preferences</p>
                </div>
              </div>

              <article className="status-card">
                <p>
                  <strong>Project summary:</strong>{" "}
                  {memoryState.projectSummary || "No saved project summary yet"}
                </p>
                <p>
                  <strong>Tone:</strong> {memoryState.userPreferences?.tone || "Not set"}
                </p>
                <p>
                  <strong>Coding style:</strong> {memoryState.userPreferences?.codingStyle || "Not set"}
                </p>
                <p>
                  <strong>Workflows:</strong> {memoryState.userPreferences?.workflows || "Not set"}
                </p>
              </article>

              <div className="form-grid">
                <label className="full-width">
                  <span>Project summary</span>
                  <textarea
                    onChange={(event) =>
                      setMemoryDraft((current) => ({ ...current, projectSummary: event.target.value }))
                    }
                    rows="5"
                    value={memoryDraft.projectSummary}
                  />
                </label>
              </div>

              <div className="inline-actions">
                <button onClick={handleSaveProjectSummary} type="button">
                  Save Project Memory
                </button>
              </div>
            </section>

            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>BB-8 Preferences</h2>
                  <p>Stable assistant behavior you want BB-8 to remember</p>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  <span>Tone</span>
                  <input
                    onChange={(event) => setMemoryDraft((current) => ({ ...current, tone: event.target.value }))}
                    placeholder="Example: concise and practical"
                    value={memoryDraft.tone}
                  />
                </label>
                <label>
                  <span>Coding style</span>
                  <input
                    onChange={(event) =>
                      setMemoryDraft((current) => ({ ...current, codingStyle: event.target.value }))
                    }
                    placeholder="Example: small modular files"
                    value={memoryDraft.codingStyle}
                  />
                </label>
                <label className="full-width">
                  <span>Preferred workflows</span>
                  <textarea
                    onChange={(event) =>
                      setMemoryDraft((current) => ({ ...current, workflows: event.target.value }))
                    }
                    placeholder="Example: explain plan briefly, then implement"
                    rows="4"
                    value={memoryDraft.workflows}
                  />
                </label>
              </div>

              <div className="inline-actions">
                <button onClick={handleSavePreferences} type="button">
                  Save Preferences
                </button>
                <button onClick={handleResetPreferences} type="button">
                  Reset Preferences
                </button>
              </div>
            </section>

            <section className="panel-section">
              <div className="section-heading">
                <div>
                  <h2>Notion</h2>
                  <p>Settings</p>
                </div>
              </div>

              <article className="status-card">
                <p>
                  <strong>Status:</strong> {notionStatus.connected ? "Connected" : "Not connected"}
                </p>
                <p>
                  <strong>Workspace:</strong> {notionStatus.workspaceName || "Not connected"}
                </p>
                <p>
                  <strong>Session storage:</strong> {notionStatus.storageMode}
                </p>
                <p>
                  <strong>Available tools:</strong>{" "}
                  {notionStatus.availableTools?.length > 0
                    ? notionStatus.availableTools.join(", ")
                    : "Unknown until tested"}
                </p>
              </article>

              <div className="inline-actions">
                <button
                  disabled={notionBusyAction === "connect"}
                  onClick={handleConnectNotion}
                  type="button"
                >
                  Connect Notion
                </button>
                <button
                  disabled={!notionStatus.connected || notionBusyAction === "test"}
                  onClick={handleTestConnection}
                  type="button"
                >
                  Test Connection
                </button>
                <button
                  disabled={!notionStatus.connected || notionBusyAction === "disconnect"}
                  onClick={handleDisconnectNotion}
                  type="button"
                >
                  Disconnect Notion
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          aria-label="Message"
          autoFocus
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the assistant..."
          value={input}
        />
        <button disabled={isSending || input.trim().length === 0} type="submit">
          Send
        </button>
      </form>
    </main>
  );
}

function parsePropertiesJson(value) {
  if (!value.trim()) {
    return null;
  }

  const parsed = JSON.parse(value);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Properties must be a JSON object.");
  }

  return parsed;
}

createRoot(document.getElementById("root")).render(<App />);
