const { createServer } = require("http");
const path = require("path");
const { randomBytes, createHash } = require("crypto");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");
const { NotionApprovalStore } = require("./notionApprovalStore");
const { NotionServiceError, ensureNotionError } = require("./notionErrors");
const {
  buildCreatePageArgs,
  buildReadArgs,
  buildSearchArgs,
  buildUpdatePageArgs,
  extractPageContent,
  extractSearchResults,
  extractToolErrorText,
  extractWorkspaceInfo,
  sanitizeConnectionStatus
} = require("./notionMappers");
const { NotionSecureStore } = require("./notionSecureStore");

const NOTION_STREAMABLE_URL = "https://mcp.notion.com/mcp";
const NOTION_SSE_URL = "https://mcp.notion.com/sse";
const USER_AGENT = "DesktopAIAssistantNotionMcp/0.1.0";

class NotionService {
  constructor({ app, safeStorage, shell }) {
    this.app = app;
    this.safeStorage = safeStorage;
    this.shell = shell;
    this.store = new NotionSecureStore({
      filePath: path.join(app.getPath("userData"), "notion-session.json"),
      safeStorage
    });
    this.approvalStore = new NotionApprovalStore();
    this.session = null;
    this.loaded = false;
    this.connectPromise = null;
  }

  async getConnectionStatus() {
    await this.loadSession();
    return sanitizeConnectionStatus(this.session);
  }

  async connect() {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.runConnect();

    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  async disconnect() {
    await this.loadSession();
    this.session = null;
    this.approvalStore.clear();
    this.store.clear();
    return sanitizeConnectionStatus(null);
  }

  async testConnection() {
    const tools = await this.listTools();
    const selfTool = tools.find((tool) => tool.name === "notion-get-self");

    if (!selfTool) {
      if (this.session) {
        this.session.toolNames = tools.map((tool) => tool.name);
        this.session.lastValidatedAt = new Date().toISOString();
        this.persistSession();
      }

      return {
        ok: true,
        workspace: this.session?.workspace || null,
        message: "Connected to Notion. Workspace details are not exposed by the current MCP tool set."
      };
    }

    const result = await this.callTool(selfTool.name, {});
    const workspace = extractWorkspaceInfo(result);

    if (this.session) {
      this.session.workspace = workspace;
      this.session.lastValidatedAt = new Date().toISOString();
      this.session.toolNames = tools.map((tool) => tool.name);
      this.persistSession();
    }

    return {
      ok: true,
      workspace
    };
  }

  async search(query) {
    if (!query || !query.trim()) {
      return {
        query: "",
        results: []
      };
    }

    const tool = await this.getTool("notion-search", "search");
    const args = buildSearchArgs(tool.inputSchema, query.trim());
    const result = await this.callTool(tool.name, args);

    return {
      query: query.trim(),
      results: extractSearchResults(result)
    };
  }

  async readPage(reference) {
    if (!reference || !reference.trim()) {
      throw new NotionServiceError("INVALID_INPUT", "Choose a Notion page before trying to read it.");
    }

    const tool = await this.getTool("notion-fetch", "fetch");
    const args = buildReadArgs(tool.inputSchema, reference.trim());
    const result = await this.callTool(tool.name, args);

    return extractPageContent(result, reference.trim());
  }

  async prepareCreatePage(previewInput) {
    await this.requireConnected();
    const preview = normalizeCreatePreview(previewInput);

    const approval = this.approvalStore.create("create-page", preview);
    return {
      approvalId: approval.id,
      kind: approval.kind,
      createdAt: approval.createdAt,
      preview
    };
  }

  async createPageAfterApproval(approvalId) {
    const tool = await this.getTool("notion-create-pages");
    const preview = this.approvalStore.consume(approvalId, "create-page");
    const args = buildCreatePageArgs(tool.inputSchema, preview);
    const result = await this.callTool(tool.name, args);
    const createdPage = extractPageContent(result, preview.parentRef || preview.title);

    return {
      ok: true,
      page: createdPage
    };
  }

  async prepareUpdatePage(previewInput) {
    await this.requireConnected();
    const preview = normalizeUpdatePreview(previewInput);

    const approval = this.approvalStore.create("update-page", preview);
    return {
      approvalId: approval.id,
      kind: approval.kind,
      createdAt: approval.createdAt,
      preview
    };
  }

  async updatePageAfterApproval(approvalId) {
    const tool = await this.getTool("notion-update-page");
    const preview = this.approvalStore.consume(approvalId, "update-page");
    const args = buildUpdatePageArgs(tool.inputSchema, preview);
    const result = await this.callTool(tool.name, args);
    const updatedPage = extractPageContent(result, preview.pageRef);

    return {
      ok: true,
      page: updatedPage
    };
  }

  async loadSession() {
    if (this.loaded) {
      return;
    }

    this.session = this.store.load();
    this.loaded = true;
  }

  async runConnect() {
    await this.loadSession();

    const metadata = await discoverOAuthMetadata(NOTION_STREAMABLE_URL);
    const authSession = await createLoopbackAuthSession();
    const clientCredentials = await registerClient(metadata, authSession.redirectUri);
    const codeVerifier = generateCodeVerifier();
    const state = randomBytes(16).toString("hex");
    const authorizationUrl = buildAuthorizationUrl({
      metadata,
      clientId: clientCredentials.client_id,
      redirectUri: authSession.redirectUri,
      codeChallenge: createCodeChallenge(codeVerifier),
      state
    });

    const callbackPromise = authSession.waitForCallback(state);
    const opened = await this.shell.openExternal(authorizationUrl);

    if (opened === false) {
      throw new NotionServiceError(
        "AUTH_FLOW_FAILED",
        "Could not open the browser for Notion authorization."
      );
    }

    const authorizationCode = await callbackPromise;
    const tokenResponse = await exchangeCodeForTokens({
      code: authorizationCode,
      codeVerifier,
      metadata,
      clientId: clientCredentials.client_id,
      clientSecret: clientCredentials.client_secret,
      redirectUri: authSession.redirectUri
    });

    const session = {
      connectedAt: new Date().toISOString(),
      storageMode: "memory-only",
      oauth: {
        clientId: clientCredentials.client_id,
        clientSecret: clientCredentials.client_secret || null,
        redirectUri: authSession.redirectUri,
        tokenEndpoint: metadata.token_endpoint
      },
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || null,
        expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : null,
        scope: tokenResponse.scope || null,
        tokenType: tokenResponse.token_type || "Bearer"
      },
      workspace: null,
      lastValidatedAt: null,
      toolNames: []
    };

    this.session = session;
    session.storageMode = this.persistSession() ? "encrypted-file" : "memory-only";

    try {
      const tools = await this.listTools();
      session.toolNames = tools.map((tool) => tool.name);
      this.persistSession();
    } catch {}

    try {
      const testResult = await this.testConnection();
      session.workspace = testResult.workspace;
      session.lastValidatedAt = new Date().toISOString();
      this.persistSession();
    } catch {}

    return sanitizeConnectionStatus(this.session);
  }

  persistSession() {
    if (!this.session) {
      return false;
    }

    return this.store.save(this.session);
  }

  async requireConnected() {
    await this.loadSession();

    if (!this.session?.tokens?.accessToken) {
      throw new NotionServiceError(
        "NOT_CONNECTED",
        "Notion is not connected yet. Connect your workspace before using Notion tools."
      );
    }
  }

  async ensureFreshSession() {
    await this.requireConnected();

    if (!this.session.tokens.expiresAt || this.session.tokens.expiresAt > Date.now() + 30_000) {
      return this.session;
    }

    if (!this.session.tokens.refreshToken) {
      throw new NotionServiceError("AUTH_EXPIRED", "Your Notion session expired. Reconnect and try again.");
    }

    try {
      const refreshed = await refreshAccessToken({
        refreshToken: this.session.tokens.refreshToken,
        tokenEndpoint: this.session.oauth.tokenEndpoint,
        clientId: this.session.oauth.clientId,
        clientSecret: this.session.oauth.clientSecret
      });

      this.session.tokens.accessToken = refreshed.access_token;
      this.session.tokens.refreshToken = refreshed.refresh_token || this.session.tokens.refreshToken;
      this.session.tokens.expiresAt = refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null;
      this.session.tokens.scope = refreshed.scope || this.session.tokens.scope;
      this.persistSession();
      return this.session;
    } catch (error) {
      this.session = null;
      this.store.clear();
      throw ensureNotionError(error, "AUTH_EXPIRED", "Your Notion session expired. Reconnect and try again.");
    }
  }

  async getToolNames() {
    const tools = await this.listTools();
    return tools.map((tool) => tool.name);
  }

  async getTool(primaryName, fallbackName = null) {
    const tools = await this.listTools();
    const tool =
      tools.find((item) => item.name === primaryName) ||
      (fallbackName ? tools.find((item) => item.name === fallbackName) : null);

    if (!tool) {
      throw new NotionServiceError(
        "UNSUPPORTED_RESPONSE",
        `The connected Notion MCP server does not expose ${primaryName}.`
      );
    }

    return tool;
  }

  async listTools() {
    const { client, transport } = await this.createClientConnection();

    try {
      const result = await client.listTools();
      return result.tools || [];
    } catch (error) {
      throw ensureNotionError(error);
    } finally {
      await closeConnection(client, transport);
    }
  }

  async callTool(toolName, args) {
    const { client, transport } = await this.createClientConnection();

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });

      if (result?.isError) {
        throw new NotionServiceError(
          "NOTION_ERROR",
          extractToolErrorText(result) || "Notion could not complete that request."
        );
      }

      return result;
    } catch (error) {
      throw ensureNotionError(error);
    } finally {
      await closeConnection(client, transport);
    }
  }

  async createClientConnection() {
    const session = await this.ensureFreshSession();
    const headers = {
      Authorization: `Bearer ${session.tokens.accessToken}`,
      "User-Agent": USER_AGENT
    };

    try {
      const client = new Client({
        name: "desktop-ai-assistant-notion",
        version: "0.1.0"
      });
      const transport = new StreamableHTTPClientTransport(new URL(NOTION_STREAMABLE_URL), {
        requestInit: {
          headers
        }
      });

      await client.connect(transport);
      return { client, transport };
    } catch (streamableError) {
      const client = new Client({
        name: "desktop-ai-assistant-notion",
        version: "0.1.0"
      });
      const transport = new SSEClientTransport(new URL(NOTION_SSE_URL), {
        requestInit: {
          headers
        }
      });

      try {
        await client.connect(transport);
        return { client, transport };
      } catch (sseError) {
        throw ensureNotionError(sseError, "NETWORK_ERROR", "Could not connect to Notion over MCP.");
      }
    }
  }
}

function normalizeCreatePreview(input) {
  const title = sanitizePreviewField(input?.title);
  const body = sanitizePreviewField(input?.body);

  if (!title) {
    throw new NotionServiceError("INVALID_INPUT", "Enter a page title before preparing a Notion page draft.");
  }

  return {
    title,
    body,
    parentRef: sanitizePreviewField(input?.parentRef),
    properties: sanitizeProperties(input?.properties)
  };
}

function normalizeUpdatePreview(input) {
  const pageRef = sanitizePreviewField(input?.pageRef);
  const title = sanitizePreviewField(input?.title);
  const body = sanitizePreviewField(input?.body);

  if (!pageRef) {
    throw new NotionServiceError("INVALID_INPUT", "Choose a Notion page before preparing an update.");
  }

  if (!title && !body && !input?.properties) {
    throw new NotionServiceError(
      "INVALID_INPUT",
      "Add a title, content change, or properties before preparing a Notion update."
    );
  }

  return {
    pageRef,
    title,
    body,
    currentContentExcerpt: sanitizePreviewField(input?.currentContentExcerpt),
    properties: sanitizeProperties(input?.properties)
  };
}

function sanitizePreviewField(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeProperties(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function generateCodeVerifier() {
  return base64UrlEncode(randomBytes(32));
}

function createCodeChallenge(codeVerifier) {
  return base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
}

function base64UrlEncode(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function discoverOAuthMetadata(serverUrl) {
  const protectedResourceUrl = new URL("/.well-known/oauth-protected-resource", serverUrl);
  const protectedResourceResponse = await fetch(protectedResourceUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    }
  });

  if (!protectedResourceResponse.ok) {
    throw new NotionServiceError(
      "AUTH_FLOW_FAILED",
      "Could not discover Notion authorization settings."
    );
  }

  const protectedResource = await protectedResourceResponse.json();
  const authServerUrl = protectedResource?.authorization_servers?.[0];

  if (!authServerUrl) {
    throw new NotionServiceError("AUTH_FLOW_FAILED", "Notion did not provide an authorization server.");
  }

  const metadataUrl = new URL("/.well-known/oauth-authorization-server", authServerUrl);
  const metadataResponse = await fetch(metadataUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    }
  });

  if (!metadataResponse.ok) {
    throw new NotionServiceError("AUTH_FLOW_FAILED", "Could not load Notion OAuth metadata.");
  }

  return metadataResponse.json();
}

async function registerClient(metadata, redirectUri) {
  if (!metadata?.registration_endpoint) {
    throw new NotionServiceError(
      "AUTH_FLOW_FAILED",
      "Notion did not expose a dynamic registration endpoint."
    );
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify({
      client_name: "BB-8",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    })
  });

  if (!response.ok) {
    throw new NotionServiceError("AUTH_FLOW_FAILED", "Notion client registration failed.");
  }

  return response.json();
}

function buildAuthorizationUrl({ metadata, clientId, redirectUri, codeChallenge, state }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "consent"
  });

  return `${metadata.authorization_endpoint}?${params.toString()}`;
}

async function exchangeCodeForTokens({
  code,
  codeVerifier,
  metadata,
  clientId,
  clientSecret,
  redirectUri
}) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  if (clientSecret) {
    params.append("client_secret", clientSecret);
  }

  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    body: params.toString()
  });

  if (!response.ok) {
    throw new NotionServiceError("AUTH_FLOW_FAILED", "Notion token exchange failed.");
  }

  return response.json();
}

async function refreshAccessToken({ refreshToken, tokenEndpoint, clientId, clientSecret }) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId
  });

  if (clientSecret) {
    params.append("client_secret", clientSecret);
  }

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT
    },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed with status ${response.status}`);
  }

  return response.json();
}

async function createLoopbackAuthSession() {
  const server = createServer();
  let settled = false;

  const callbackPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new NotionServiceError("AUTH_FLOW_FAILED", "Timed out while waiting for Notion authorization."));
      }
    }, 5 * 60 * 1000);

    server.on("request", (req, res) => {
      if (settled) {
        return;
      }

      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");

      if (error) {
        settled = true;
        clearTimeout(timer);
        server.close();
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Notion authorization failed.</h1><p>You can close this window.</p>");
        reject(new NotionServiceError("AUTH_FLOW_FAILED", "Notion authorization was denied or failed."));
        return;
      }

      if (!code || !state) {
        settled = true;
        clearTimeout(timer);
        server.close();
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Invalid callback.</h1><p>You can close this window.</p>");
        reject(new NotionServiceError("AUTH_FLOW_FAILED", "Notion returned an incomplete authorization callback."));
        return;
      }

      settled = true;
      clearTimeout(timer);
      server.close();
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Notion connected.</h1><p>You can close this window and return to the app.</p>");
      resolve(requestUrl.toString());
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;

  return {
    redirectUri,
    waitForCallback: async (expectedState) => {
      const callbackUrl = await callbackPromise;
      const parsed = new URL(callbackUrl);

      if (parsed.searchParams.get("state") !== expectedState) {
        throw new NotionServiceError("AUTH_FLOW_FAILED", "The Notion authorization state did not match.");
      }

      return parsed.searchParams.get("code");
    }
  };
}

async function closeConnection(client, transport) {
  try {
    if (transport?.terminateSession) {
      await transport.terminateSession();
    }
  } catch {}

  try {
    await transport?.close?.();
  } catch {}

  try {
    await client?.close?.();
  } catch {}
}

module.exports = {
  NotionService
};
