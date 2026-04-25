const { NotionServiceError } = require("./notionErrors");

function truncateText(value, maxLength = 280) {
  if (!value) {
    return "";
  }

  const text = String(value).trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

function sanitizeConnectionStatus(session) {
  if (!session) {
    return {
      connected: false,
      storageMode: "memory-only",
      workspaceName: null,
      workspaceId: null,
      connectedAt: null,
      lastValidatedAt: null,
      availableTools: []
    };
  }

  return {
    connected: true,
    storageMode: session.storageMode || "memory-only",
    workspaceName: session.workspace?.name || null,
    workspaceId: session.workspace?.id || null,
    connectedAt: session.connectedAt || null,
    lastValidatedAt: session.lastValidatedAt || null,
    availableTools: Array.isArray(session.toolNames) ? session.toolNames : []
  };
}

function buildSearchArgs(inputSchema, query) {
  const key = pickFieldName(getSchemaProperties(inputSchema), [
    "query",
    "q",
    "search_query",
    "term",
    "text",
    "query_text"
  ]);
  if (!key) {
    throw new NotionServiceError(
      "UNSUPPORTED_RESPONSE",
      "The current Notion search tool schema is not supported by this app."
    );
  }

  return {
    [key]: query
  };
}

function buildReadArgs(inputSchema, reference) {
  const properties = getSchemaProperties(inputSchema);
  const key = pickFieldName(properties, ["id", "page_id", "url", "page_url", "uri", "target"]);

  if (!key) {
    throw new NotionServiceError(
      "UNSUPPORTED_RESPONSE",
      "The current Notion fetch tool schema is not supported by this app."
    );
  }

  return {
    [key]: normalizeReferenceForField(key, reference)
  };
}

function buildCreatePageArgs(inputSchema, preview) {
  const properties = getSchemaProperties(inputSchema);

  if (properties.pages?.type === "array") {
    return {
      pages: [buildPagePayload(properties.pages.items || {}, preview)]
    };
  }

  if (properties.page) {
    return {
      page: buildPagePayload(properties.page, preview)
    };
  }

  return buildPagePayload(inputSchema, preview);
}

function buildUpdatePageArgs(inputSchema, preview) {
  const properties = getSchemaProperties(inputSchema);
  const args = {};

  assignIdentifier(args, properties, ["page_id", "id", "url", "page_url", "target"], preview.pageRef);
  assignValue(args, properties, ["title", "name"], preview.title);

  if (preview.properties && properties.properties) {
    args.properties = preview.properties;
  }

  if (preview.body) {
    const commandSchema = properties.command;
    if (commandSchema) {
      args.command = Array.isArray(commandSchema.enum) && commandSchema.enum.includes("replace_content")
        ? "replace_content"
        : "replace_content";
    }

    if (properties.new_str) {
      args.new_str = preview.body;
    } else if (properties.markdown) {
      args.markdown = preview.body;
    } else if (properties.body) {
      args.body = preview.body;
    } else if (properties.content) {
      args.content = preview.body;
    } else if (properties.replace_content?.type === "object") {
      args.replace_content = {
        new_str: preview.body
      };
    }
  }

  if (!Object.keys(args).length || !hasIdentifier(args)) {
    throw new NotionServiceError(
      "UNSUPPORTED_RESPONSE",
      "The current Notion update tool schema is not supported by this app."
    );
  }

  return args;
}

function extractSearchResults(toolResult) {
  const candidates = collectObjects(toolResult);
  const unique = new Map();

  for (const candidate of candidates) {
    const id = normalizeNotionReference(getFirstString(candidate, ["id", "page_id"]));
    const title = getFirstString(candidate, ["title", "name", "page_title"]);
    const url = normalizeExternalUrl(
      getFirstString(candidate, ["url", "page_url", "uri", "href", "browser_url", "public_url"])
    );
    const snippet = getFirstString(candidate, [
      "snippet",
      "preview",
      "summary",
      "excerpt",
      "markdown",
      "text",
      "description"
    ]);
    const reference = url || id || normalizeNotionReference(getFirstString(candidate, ["target", "page", "value"]));

    if (!title && !url && !snippet && !reference) {
      continue;
    }

    const key = reference || `${title}:${snippet}`;
    if (!unique.has(key)) {
      unique.set(key, {
        id: id || extractNotionId(url) || key,
        reference: reference || key,
        title: title || "Untitled Notion item",
        url: url || buildCanonicalNotionUrl(id) || null,
        snippet: truncateText(snippet, 220),
        metadata: truncateText(getFirstString(candidate, ["object", "type", "kind"]), 80)
      });
    }
  }

  if (unique.size === 0) {
    const text = extractTextContent(toolResult);
    if (text) {
      unique.set("fallback", {
        id: "fallback",
        reference: "fallback",
        title: "Search result",
        url: null,
        snippet: truncateText(text, 220),
        metadata: null
      });
    }
  }

  return Array.from(unique.values()).slice(0, 20);
}

function extractPageContent(toolResult, reference) {
  const searchResults = extractSearchResults(toolResult);
  const first = searchResults[0] || null;
  const text = extractTextContent(toolResult);

  return {
    id: first?.id || extractNotionId(reference) || reference,
    reference: first?.reference || normalizeNotionReference(reference) || reference,
    title: first?.title || "Notion page",
    url: first?.url || normalizeExternalUrl(reference) || buildCanonicalNotionUrl(extractNotionId(reference)) || null,
    snippet: first?.snippet || truncateText(text, 220),
    content: truncateText(text, 8000)
  };
}

function extractWorkspaceInfo(toolResult) {
  const candidates = collectObjects(toolResult);

  for (const candidate of candidates) {
    const name =
      getFirstString(candidate, ["workspace_name", "workspaceName", "name", "workspace"]) || null;
    const id = getFirstString(candidate, ["workspace_id", "workspaceId", "id"]) || null;

    if (name || id) {
      return { name, id };
    }
  }

  return {
    name: truncateText(extractTextContent(toolResult), 120) || "Connected workspace",
    id: null
  };
}

function extractTextContent(toolResult) {
  const parts = [];

  if (Array.isArray(toolResult?.content)) {
    for (const item of toolResult.content) {
      if (item?.type === "text" && typeof item.text === "string") {
        parts.push(item.text);
      }

      if (item?.type === "resource_link") {
        parts.push([item.title || item.name, item.uri].filter(Boolean).join(" "));
      }
    }
  }

  if (!parts.length && toolResult?.structuredContent) {
    const structuredText = collectTextValues(toolResult.structuredContent).join("\n\n").trim();
    if (structuredText) {
      parts.push(structuredText);
    } else {
      parts.push(JSON.stringify(toolResult.structuredContent));
    }
  }

  return parts.join("\n\n").trim();
}

function extractToolErrorText(toolResult) {
  const text = extractTextContent(toolResult);
  return text || null;
}

function buildPagePayload(inputSchema, preview) {
  const properties = getSchemaProperties(inputSchema);
  const payload = {};
  const titleFieldName = pickFieldName(properties, ["title", "name"]);

  assignValue(payload, properties, ["title", "name"], preview.title);
  assignValue(payload, properties, ["markdown", "body", "content", "text"], preview.body);

  if (properties.properties) {
    payload.properties = buildCreatePropertiesPayload(preview, titleFieldName);
  }

  if (preview.parentRef) {
    const parentValue = buildParentValue(properties, preview.parentRef);
    if (parentValue !== undefined) {
      if ("parent" in properties) {
        payload.parent = parentValue;
      } else if ("parent_id" in properties) {
        payload.parent_id = extractNotionId(preview.parentRef) || preview.parentRef;
      } else if ("data_source_id" in properties) {
        payload.data_source_id = extractCollectionId(preview.parentRef) || extractNotionId(preview.parentRef);
      }
    }
  }

  if (!Object.keys(payload).length) {
    throw new NotionServiceError(
      "UNSUPPORTED_RESPONSE",
      "The current Notion create tool schema is not supported by this app."
    );
  }

  return payload;
}

function buildCreatePropertiesPayload(preview, titleFieldName) {
  const properties = preview.properties ? { ...preview.properties } : {};

  if (!preview.title || titleFieldName) {
    return Object.keys(properties).length ? properties : undefined;
  }

  const titlePropertyKey = findExistingTitlePropertyKey(properties) || "title";
  if (!properties[titlePropertyKey]) {
    properties[titlePropertyKey] = preview.title;
  }

  return Object.keys(properties).length ? properties : undefined;
}

function findExistingTitlePropertyKey(properties) {
  for (const [key, value] of Object.entries(properties)) {
    if (value?.type === "title" || Array.isArray(value?.title)) {
      return key;
    }
  }

  return null;
}

function buildParentValue(properties, parentRef) {
  if (!properties.parent) {
    return undefined;
  }

  const schema = properties.parent;
  const raw = parentRef.trim();
  const id = extractNotionId(raw);
  const collectionId = extractCollectionId(raw);

  if (schema.type === "string") {
    return normalizeNotionReference(raw) || raw;
  }

  const nested = getSchemaProperties(schema);
  if (!Object.keys(nested).length) {
    return raw;
  }

  if (nested.type && nested.page_id && id) {
    return { type: "page_id", page_id: id };
  }

  if (nested.type && nested.data_source_id && (collectionId || id)) {
    return {
      type: "data_source_id",
      data_source_id: collectionId || id
    };
  }

  if (nested.page_id && id) {
    return { page_id: id };
  }

  if (nested.data_source_id && (collectionId || id)) {
    return { data_source_id: collectionId || id };
  }

  if (nested.id) {
    return { id: id || raw };
  }

  if (nested.url || nested.page_url) {
    return { url: raw };
  }

  return raw;
}

function hasIdentifier(args) {
  return ["page_id", "id", "url", "page_url", "target"].some((key) => Boolean(args[key]));
}

function assignIdentifier(target, properties, keys, value) {
  for (const key of keys) {
    if (!(key in properties)) {
      continue;
    }

    target[key] = normalizeReferenceForField(key, value);
    return;
  }
}

function assignValue(target, properties, keys, value) {
  if (!value) {
    return;
  }

  const key = pickFieldName(properties, keys);
  if (key) {
    target[key] = value;
  }
}

function pickFieldName(properties, preferredKeys) {
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      return key;
    }
  }

  return null;
}

function getSchemaProperties(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return {};
  }

  const merged = {};

  if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
    Object.assign(merged, schema.properties);
  }

  if (schema.properties && typeof schema.properties === "object") {
    Object.assign(merged, schema.properties);
  }

  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key])) {
      for (const variant of schema[key]) {
        Object.assign(merged, getSchemaProperties(variant));
      }
    }
  }

  return merged;
}

function collectObjects(value, results = []) {
  if (!value || typeof value !== "object") {
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjects(item, results);
      collectObjects(tryParseJson(item), results);
    }

    return results;
  }

  const parsed = tryParseJson(value);
  if (parsed) {
    collectObjects(parsed, results);
  }

  if (hasInterestingFields(value)) {
    results.push(value);
  }

  for (const nestedValue of Object.values(value)) {
    collectObjects(nestedValue, results);
  }

  return results;
}

function hasInterestingFields(value) {
  return [
    "id",
    "page_id",
    "title",
    "name",
    "url",
    "page_url",
    "uri",
    "href",
    "browser_url",
    "snippet",
    "summary",
    "markdown",
    "text",
    "plain_text",
    "description"
  ].some((key) => hasStringLikeValue(value[key]));
}

function getFirstString(value, keys) {
  for (const key of keys) {
    const extracted = extractStringValue(value?.[key]);
    if (extracted) {
      return extracted;
    }
  }

  return null;
}

function extractStringValue(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractStringValue(item);
      if (nested) {
        return nested;
      }
    }
  }

  if (value && typeof value === "object") {
    for (const key of ["plain_text", "text", "content", "name", "title", "value"]) {
      const nested = extractStringValue(value[key]);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function hasStringLikeValue(value) {
  return Boolean(extractStringValue(value));
}

function collectTextValues(value, results = []) {
  if (!value) {
    return results;
  }

  if (typeof value === "string") {
    if (value.trim()) {
      results.push(value.trim());
    }

    const parsed = tryParseJson(value);
    if (parsed) {
      collectTextValues(parsed, results);
    }

    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextValues(item, results);
    }

    return results;
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (["id", "page_id", "request_id", "type", "object", "url", "page_url", "uri"].includes(key)) {
        continue;
      }

      collectTextValues(nestedValue, results);
    }
  }

  return results;
}

function extractNotionId(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const match = value.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i);
  return match ? normalizeUuid(match[0]) : null;
}

function extractCollectionId(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (!value.startsWith("collection://")) {
    return null;
  }

  return normalizeUuid(value.slice("collection://".length));
}

function normalizeUuid(value) {
  const compact = value.replace(/-/g, "").toLowerCase();
  if (compact.length !== 32) {
    return value;
  }

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function normalizeReferenceForField(fieldName, value) {
  if (fieldName === "url" || fieldName === "page_url" || fieldName === "uri" || fieldName === "target") {
    return normalizeExternalUrl(value) || normalizeNotionReference(value) || value;
  }

  return normalizeNotionReference(value) || value;
}

function normalizeNotionReference(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return extractNotionId(trimmed) || trimmed;
}

function normalizeExternalUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (looksLikeUrl(trimmed)) {
    return trimmed;
  }

  if (/^[a-z0-9.-]+\.notion\.site\//i.test(trimmed) || /^[a-z0-9.-]+\.notion\.so\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

function buildCanonicalNotionUrl(id) {
  if (!id) {
    return null;
  }

  return `https://www.notion.so/${id.replace(/-/g, "")}`;
}

function tryParseJson(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

module.exports = {
  buildCreatePageArgs,
  buildReadArgs,
  buildSearchArgs,
  buildUpdatePageArgs,
  extractPageContent,
  extractSearchResults,
  extractTextContent,
  extractToolErrorText,
  extractWorkspaceInfo,
  sanitizeConnectionStatus,
  truncateText
};
