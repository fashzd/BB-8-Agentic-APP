const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCreatePageArgs,
  buildReadArgs,
  buildUpdatePageArgs,
  extractSearchResults,
  sanitizeConnectionStatus
} = require("../src/main/services/notionMappers");

test("builds create-page args from a pages wrapper schema", () => {
  const inputSchema = {
    type: "object",
    properties: {
      pages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            markdown: { type: "string" },
            properties: { type: "object" }
          }
        }
      }
    }
  };

  const args = buildCreatePageArgs(inputSchema, {
    title: "Draft PRD",
    body: "# Hello",
    properties: { Status: "Draft" }
  });

  assert.deepEqual(args, {
    pages: [
      {
        title: "Draft PRD",
        markdown: "# Hello",
        properties: { Status: "Draft" }
      }
    ]
  });
});

test("builds create-page args with scalar title properties when schema lacks flat title field", () => {
  const inputSchema = {
    type: "object",
    properties: {
      page: {
        type: "object",
        properties: {
          parent: { type: "object", properties: { page_id: { type: "string" } } },
          properties: { type: "object" },
          markdown: { type: "string" }
        }
      }
    }
  };

  const args = buildCreatePageArgs(inputSchema, {
    title: "BB-8 Test",
    parentRef: "0123456789abcdef0123456789abcdef",
    body: "Hello there"
  });

  assert.deepEqual(args, {
    page: {
      parent: {
        page_id: "01234567-89ab-cdef-0123-456789abcdef"
      },
      properties: {
        title: "BB-8 Test"
      },
      markdown: "Hello there"
    }
  });
});

test("builds flattened update args with replace content", () => {
  const inputSchema = {
    type: "object",
    properties: {
      page_id: { type: "string" },
      title: { type: "string" },
      command: { type: "string", enum: ["replace_content"] },
      new_str: { type: "string" }
    }
  };

  const args = buildUpdatePageArgs(inputSchema, {
    pageRef: "https://www.notion.so/example-0123456789abcdef0123456789abcdef",
    title: "Updated title",
    body: "Updated body"
  });

  assert.deepEqual(args, {
    page_id: "01234567-89ab-cdef-0123-456789abcdef",
    title: "Updated title",
    command: "replace_content",
    new_str: "Updated body"
  });
});

test("builds read args from oneOf schema and normalizes compact notion ids", () => {
  const inputSchema = {
    oneOf: [
      {
        type: "object",
        properties: {
          id: { type: "string" }
        }
      },
      {
        type: "object",
        properties: {
          url: { type: "string" }
        }
      }
    ]
  };

  const args = buildReadArgs(inputSchema, "34d61300e6e28077921fc4ea48d9e711");

  assert.deepEqual(args, {
    id: "34d61300-e6e2-8077-921f-c4ea48d9e711"
  });
});

test("extracts notion search results from structured content with nested values", () => {
  const results = extractSearchResults({
    structuredContent: {
      results: [
        {
          id: "34d61300e6e28077921fc4ea48d9e711",
          title: [
            {
              plain_text: "Welcome to Notion"
            }
          ],
          url: "34d61300e6e28077921fc4ea48d9e711",
          text: "Notion Academy"
        }
      ]
    }
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Welcome to Notion");
  assert.equal(results[0].reference, "34d61300-e6e2-8077-921f-c4ea48d9e711");
  assert.equal(results[0].url, "https://www.notion.so/34d61300e6e28077921fc4ea48d9e711");
  assert.equal(results[0].snippet, "Notion Academy");
});

test("sanitized connection status does not expose tokens", () => {
  const status = sanitizeConnectionStatus({
    connectedAt: "2026-04-25T00:00:00.000Z",
    storageMode: "encrypted-file",
    workspace: { name: "Workspace", id: "ws-1" },
    tokens: { accessToken: "secret", refreshToken: "secret2" }
  });

  assert.equal(status.connected, true);
  assert.equal(status.workspaceName, "Workspace");
  assert.equal("tokens" in status, false);
  assert.equal("accessToken" in status, false);
});
