const OpenAI = require("openai");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const MODEL_OPTIONS = [
  { label: "GPT-5.5", value: "gpt-5.5" },
  { label: "GPT-5.4", value: "gpt-5.4" },
  { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" },
  { label: "GPT-4o Mini", value: "gpt-4o-mini" }
];

class AIServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AIServiceError";
    this.code = code;
  }
}

class AIService {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    model = DEFAULT_MODEL,
    apiKeySource = apiKey ? "environment" : "none",
    storageMode = "memory-only"
  } = {}) {
    this.apiKey = "";
    this.model = DEFAULT_MODEL;
    this.client = null;
    this.apiKeySource = "none";
    this.storageMode = storageMode;
    this.applySettings({ apiKey, model, apiKeySource, storageMode });
  }

  getStatus() {
    return {
      configured: Boolean(this.apiKey),
      model: this.model,
      provider: "OpenAI",
      mode: this.apiKey ? "live" : "missing-api-key",
      apiKeySource: this.apiKeySource,
      storageMode: this.storageMode,
      availableModels: MODEL_OPTIONS
    };
  }

  applySettings({ apiKey, model, apiKeySource, storageMode } = {}) {
    if (typeof apiKey === "string") {
      this.apiKey = apiKey.trim();
      this.client = this.apiKey ? new OpenAI({ apiKey: this.apiKey }) : null;
    }

    if (typeof model === "string" && model.trim()) {
      this.model = model.trim();
    }

    if (typeof apiKeySource === "string" && apiKeySource.trim()) {
      this.apiKeySource = apiKeySource.trim();
    }

    if (typeof storageMode === "string" && storageMode.trim()) {
      this.storageMode = storageMode.trim();
    }

    if (!this.apiKey) {
      this.apiKeySource = "none";
    }
  }

  async generateReply({ text, sessionMessages = [], notionContext = [], memoryState = null }) {
    const localSourceReply = buildLocalSourceReply(text, notionContext);
    if (localSourceReply) {
      return localSourceReply;
    }

    if (!this.client) {
      throw new AIServiceError(
        "MISSING_API_KEY",
        "OpenAI is not configured yet. Set OPENAI_API_KEY in your environment and restart BB-8."
      );
    }

    const input = buildResponseInput({
      text,
      sessionMessages,
      notionContext,
      memoryState
    });

    try {
      const response = await this.createResponseWithRetry({
        model: this.model,
        input,
        max_output_tokens: 260
      });

      return buildAssistantReply(response, notionContext);
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }

      const message = typeof error?.message === "string" ? error.message : "AI request failed.";
      if (message.toLowerCase().includes("api key")) {
        throw new AIServiceError(
          "MISSING_API_KEY",
          "OpenAI rejected the API key. Check OPENAI_API_KEY and restart BB-8."
        );
      }

      throw new AIServiceError("API_ERROR", `OpenAI request failed: ${message}`);
    }
  }

  async createResponseWithRetry(params) {
    try {
      return await this.createResponse(params);
    } catch (error) {
      const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
      const retryable =
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("rate limit") ||
        message.includes("overloaded") ||
        message.includes("connection");

      if (!retryable) {
        throw error;
      }

      return this.createResponse(params);
    }
  }

  async createResponse(params) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      return await this.client.responses.create(params, {
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AIServiceError(
          "TIMEOUT",
          "BB-8 timed out while waiting for OpenAI. Please try again."
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildResponseInput({ text, sessionMessages, notionContext, memoryState }) {
  const messages = [];
  const memoryBlock = buildMemoryBlock(memoryState);
  const sourceBlock = buildSourceBlock(notionContext);

  messages.push({
    role: "developer",
    content: [
      {
        type: "input_text",
        text: [
          "You are BB-8, a helpful desktop AI assistant.",
          "Answer clearly and practically.",
          "Keep responses concise by default.",
          "Prefer 2-4 sentences or a short bullet list.",
          "Prefer 120 words or less unless the user explicitly asks for more detail.",
          "If source context is provided, assume you can already see it and use it directly.",
          "Do not tell the user you cannot access files or Notion when source context is already provided.",
          "When multiple sources are provided, treat them as a set and reason across all of them.",
          "If the user asks about sources in plural, count and use every provided source, not just the first one.",
          "If the user asks for a project summary from sources, synthesize across all relevant sources.",
          "Only focus on a single source when the user explicitly asks about one file or page.",
          "Do not produce long menus of options unless the user asks for them.",
          "Ask at most one short clarifying question, and only when it is truly necessary.",
          "If a source is available, ground the answer in it and be direct.",
          memoryBlock,
          sourceBlock
        ]
          .filter(Boolean)
          .join("\n\n")
      }
    ]
  });

  for (const message of normalizeRecentMessages(sessionMessages)) {
    messages.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: message.role === "assistant" ? "output_text" : "input_text",
          text: message.text
        }
      ]
    });
  }

  messages.push({
    role: "user",
    content: [
      {
        type: "input_text",
        text
      }
    ]
  });

  return messages;
}

function normalizeRecentMessages(sessionMessages) {
  if (!Array.isArray(sessionMessages)) {
    return [];
  }

  return sessionMessages
    .filter((message) => message && typeof message.text === "string" && message.text.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      text: message.text.trim()
    }));
}

function buildMemoryBlock(memoryState) {
  if (!memoryState) {
    return "";
  }

  const bits = [];
  const summary = memoryState.projectSummary?.trim();
  const preferences = memoryState.userPreferences || {};

  if (summary) {
    bits.push(`Project summary:\n${summary}`);
  }

  const preferenceLines = [
    preferences.tone ? `Tone: ${preferences.tone}` : "",
    preferences.codingStyle ? `Coding style: ${preferences.codingStyle}` : "",
    preferences.workflows ? `Preferred workflows: ${preferences.workflows}` : ""
  ].filter(Boolean);

  if (preferenceLines.length > 0) {
    bits.push(`User preferences:\n${preferenceLines.join("\n")}`);
  }

  return bits.length > 0 ? bits.join("\n\n") : "";
}

function buildSourceBlock(notionContext) {
  if (!Array.isArray(notionContext) || notionContext.length === 0) {
    return "";
  }

  const sourceLines = notionContext.slice(0, 8).map((source, index) => {
    const snippet = source.content || source.snippet || "";
    return [
      `Source ${index + 1}: ${source.title || source.path || "Untitled source"}`,
      source.type ? `Type: ${source.type}` : "",
      source.url ? `URL: ${source.url}` : "",
      source.path ? `Path: ${source.path}` : "",
      snippet ? `Excerpt:\n${snippet.slice(0, 2000)}` : ""
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [`Knowledge sources count: ${notionContext.length}`, "Knowledge sources:", sourceLines.join("\n\n")]
    .filter(Boolean)
    .join("\n");
}

function buildAssistantReply(response, sourceContext) {
  const outputText = extractOutputText(response);
  const safeText = outputText || buildEmptyResponseFallback(sourceContext);

  return {
    text: safeText,
    sources: Array.isArray(sourceContext)
      ? sourceContext.map((source) => ({
          type: source.type || "context",
          id: source.id || null,
          title: source.title || "Source",
          url: source.url || null,
          path: source.path || null
        }))
      : []
  };
}

function buildLocalSourceReply(text, sourceContext) {
  if (!Array.isArray(sourceContext) || sourceContext.length === 0) {
    return null;
  }

  const normalizedText = String(text || "").trim().toLowerCase();
  if (!normalizedText) {
    return null;
  }

  const targetedSources = selectSourcesForText(normalizedText, sourceContext);

  if (isCountSourcesIntent(normalizedText)) {
    return {
      text: `I can see ${sourceContext.length} source file${sourceContext.length === 1 ? "" : "s"}: ${sourceContext.map((source) => source.title || source.path || "Untitled source").join(", ")}.`,
      sources: buildSourceBadges(sourceContext)
    };
  }

  if (isQuestionFromSourcesIntent(normalizedText)) {
    return {
      text: buildQuestionAnswerFromSources(normalizedText, targetedSources),
      sources: buildSourceBadges(targetedSources)
    };
  }

  const targetedIntentReply = buildTargetedSourceIntentReply(normalizedText, targetedSources);
  if (targetedIntentReply) {
    return {
      text: targetedIntentReply,
      sources: buildSourceBadges(targetedSources)
    };
  }

  if (!isMultiSourceIntent(normalizedText, sourceContext.length)) {
    return null;
  }

  if (normalizedText.includes("each")) {
    return {
      text: buildEachSourceSummary(targetedSources),
      sources: buildSourceBadges(targetedSources)
    };
  }

  return {
    text: buildCombinedSourceSummary(targetedSources),
    sources: buildSourceBadges(targetedSources)
  };
}

function isCountSourcesIntent(text) {
  return /(how many|count|list)/.test(text) && /(sources|files)/.test(text);
}

function isMultiSourceIntent(text, sourceCount) {
  if (sourceCount < 2) {
    return false;
  }

  const mentionsFiles = /(sources|source files|knowledge sources|files)\b/.test(text);
  const asksToReadOrSummarize = /(read|summarize|summarise|learn|compare|review|describe|write)/.test(text);
  const asksForPluralScope = /(all|each|every|across|together)\b/.test(text);

  return (
    /(all files|all sources|each file|each source|from sources|from knowledge sources|read all|summarize all|summarise all|project from sources)/.test(text) ||
    (mentionsFiles && asksToReadOrSummarize && asksForPluralScope) ||
    /(summarize each file|summarise each file|read each file|describe each file|summarize the files|summarise the files|read the files|learn from sources)/.test(text)
  );
}

function isQuestionFromSourcesIntent(text) {
  return (
    /(\?|^how\b|^what\b|^can\b|^is\b|^does\b|^do\b|^where\b|^which\b|^when\b)/.test(text) ||
    /(tell me how|show me how|answer me|walk me through|how to\b|steps to\b|install\b|run\b|start\b|setup\b|launch\b)/.test(
      text
    )
  );
}

function buildEachSourceSummary(sourceContext) {
  return sourceContext
    .map((source) =>
      [
        `${source.title || source.path || "Untitled source"}`,
        summarizeSingleSource(source)
          .split(". ")
          .filter(Boolean)
          .map((line) => `- ${line.trim().replace(/\.$/, "")}.`)
          .join("\n")
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function buildCombinedSourceSummary(sourceContext) {
  const names = sourceContext.map((source) => source.title || source.path || "Untitled source");
  const roleSummary = sourceContext
    .map((source) => inferSourceRole(source.title || source.path || ""))
    .filter(Boolean);

  const uniqueRoles = Array.from(new Set(roleSummary));
  const lead = `I read ${sourceContext.length} source files: ${names.join(", ")}.`;
  const second = uniqueRoles.length
    ? `Together they cover ${joinPhrases(uniqueRoles)}.`
    : "Together they describe different parts of the same project.";
  const third = buildCrossSourceInsight(sourceContext);

  return [lead, second, third].filter(Boolean).join(" ");
}

function buildQuestionAnswerFromSources(text, sourceContext) {
  const keywords = extractKeywords(text);
  const matches = sourceContext
    .map((source) => ({
      source,
      match: findBestSourceMatch(source, keywords)
    }))
    .filter((item) => item.match);

  if (matches.length === 0) {
    const names = sourceContext.map((source) => source.title || source.path || "Untitled source").join(", ");
    return `I looked across ${names}, but I couldn’t find a clear answer to that question in the selected sources.`;
  }

  const best = matches.sort((left, right) => right.match.score - left.match.score)[0];
  const sourceName = best.source.title || best.source.path || "the selected source";
  const answer = best.match.text;

  if (/(install|run|start|setup|launch|build|dev)/.test(text)) {
    return [`${sourceName}`, answer].filter(Boolean).join("\n");
  }

  return `${sourceName}: ${answer}`;
}

function summarizeSingleSource(source) {
  const content = String(source.content || source.snippet || "").trim();
  const heading = extractPrimaryHeading(content);
  const firstSentence = extractFirstSentence(content);
  const role = inferSourceRole(source.title || source.path || "");

  return [role ? `It appears to cover ${role}.` : "", heading ? `Main heading: ${heading}.` : "", firstSentence ? `Key point: ${firstSentence}` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildCrossSourceInsight(sourceContext) {
  const firstSentences = sourceContext
    .map((source) => extractFirstSentence(String(source.content || source.snippet || "").trim()))
    .filter(Boolean)
    .slice(0, 2);

  if (firstSentences.length === 0) {
    return "Ask me to go deeper on one file or to compare the files side by side.";
  }

  return `A quick read suggests: ${firstSentences.join(" ")}`;
}

function findBestSourceMatch(source, keywords) {
  const content = String(source.content || source.snippet || "").trim();
  if (!content) {
    return null;
  }

  const blocks = extractContentBlocks(content).slice(0, 40);

  let best = null;

  for (const block of blocks) {
    const candidateLower = block.searchText.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (candidateLower.includes(keyword)) {
        score += keyword.length > 4 ? 3 : 1;
      }
    }

    if (/install|run|start|setup|launch|dev|build/.test(textFromKeywords(keywords)) && /(install|run|start|setup|launch|npm|pnpm|yarn|bun|build|dev)/.test(candidateLower)) {
      score += 4;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = {
        text: block.displayText,
        score
      };
    }
  }

  return best;
}

function extractContentBlocks(content) {
  const lines = String(content || "")
    .split("\n")
    .map((line) => line.replace(/\r/g, ""));

  const blocks = [];
  let currentHeading = "";
  let currentLines = [];

  function pushCurrent() {
    const cleanedLines = currentLines.map((line) => line.trim()).filter(Boolean);
    if (!currentHeading && cleanedLines.length === 0) {
      return;
    }

    const displayParts = [];
    if (currentHeading) {
      displayParts.push(currentHeading);
    }
    displayParts.push(...buildDisplayLines(cleanedLines));

    const displayText = displayParts.join("\n");
    const searchText = [currentHeading, ...cleanedLines].join(" ");

    if (displayText.trim()) {
      blocks.push({
        displayText: cleanSentence(displayText).replace(/ \- /g, "\n- "),
        searchText
      });
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      pushCurrent();
      currentHeading = line.replace(/^#{1,6}\s+/, "").trim();
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  pushCurrent();

  if (blocks.length === 0) {
    return [
      {
        displayText: cleanSentence(content).slice(0, 280),
        searchText: content
      }
    ];
  }

  return blocks;
}

function extractPrimaryHeading(content) {
  const match = content.match(/^\s*#+\s+(.+)$/m);
  return match ? cleanSentence(match[1]) : "";
}

function extractFirstSentence(content) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  const combined = lines.join(" ");
  if (!combined) {
    return "";
  }

  const sentenceMatch = combined.match(/(.{30,220}?[.!?])(\s|$)/);
  return cleanSentence(sentenceMatch ? sentenceMatch[1] : combined.slice(0, 180));
}

function buildDisplayLines(lines) {
  const output = [];
  let inFence = false;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }

    output.push(line);

    if (!inFence && output.length >= 4) {
      break;
    }

    if (inFence && output.length >= 6) {
      break;
    }
  }

  return output;
}

function cleanSentence(value) {
  return String(value || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractKeywords(text) {
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "it",
    "is",
    "do",
    "does",
    "can",
    "you",
    "i",
    "we",
    "how",
    "what",
    "from",
    "this",
    "that",
    "after"
  ]);

  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word && !stopwords.has(word))
    )
  );
}

function textFromKeywords(keywords) {
  return Array.isArray(keywords) ? keywords.join(" ") : "";
}

function normalizeSourceName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function selectSourcesForText(text, sourceContext) {
  const normalizedText = normalizeSourceName(text);
  const matches = sourceContext.filter((source) => {
    const title = normalizeSourceName(source.title || "");
    const path = normalizeSourceName(source.path || "");

    if (!title && !path) {
      return false;
    }

    return (
      (title && normalizedText.includes(title)) ||
      (path && normalizedText.includes(path)) ||
      (title && title.includes("readme") && normalizedText.includes("readme")) ||
      (title && title.includes("agent") && normalizedText.includes("agent"))
    );
  });

  return matches.length > 0 ? matches : sourceContext;
}

function buildTargetedSourceIntentReply(text, sourceContext) {
  if (!Array.isArray(sourceContext) || sourceContext.length !== 1) {
    return null;
  }

  if (!/(check|read|open|summarize|summarise|review|look at)/.test(text)) {
    return null;
  }

  const source = sourceContext[0];
  return summarizeSingleSourceDetailed(source);
}

function summarizeSingleSourceDetailed(source) {
  const name = source.title || source.path || "Untitled source";
  const content = String(source.content || source.snippet || "").trim();
  const heading = extractPrimaryHeading(content);
  const firstSentence = extractFirstSentence(content);
  const role = inferSourceRole(name);

  return [
    `${name}`,
    role ? `- Focus: ${role}.` : "",
    heading ? `- Main heading: ${heading}.` : "",
    firstSentence ? `- Summary: ${firstSentence}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function inferSourceRole(name) {
  const normalized = String(name || "").toLowerCase();

  if (normalized.includes("implementation")) {
    return "implementation planning";
  }

  if (normalized.includes("product_spec") || normalized.includes("product spec") || normalized.includes("spec")) {
    return "product requirements";
  }

  if (normalized.includes("prompt")) {
    return "prompt design";
  }

  if (normalized.includes("readme")) {
    return "project overview and usage";
  }

  if (normalized.includes("agents")) {
    return "agent behavior and workflow rules";
  }

  return "";
}

function joinPhrases(items) {
  if (items.length <= 1) {
    return items[0] || "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function buildSourceBadges(sourceContext) {
  return Array.isArray(sourceContext)
    ? sourceContext.map((source) => ({
        type: source.type || "context",
        id: source.id || null,
        title: source.title || "Source",
        url: source.url || null,
        path: source.path || null
      }))
    : [];
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
      }

      if (typeof content?.refusal === "string" && content.refusal.trim()) {
        parts.push(content.refusal.trim());
      }
    }
  }

  return parts.join("\n\n").trim();
}

function buildEmptyResponseFallback(sourceContext) {
  if (Array.isArray(sourceContext) && sourceContext.length > 0) {
    const firstSource = sourceContext[0];
    return `I can see ${firstSource.title || firstSource.path || "the selected source"}. Ask me to summarize it, extract key points, or answer a question from it.`;
  }

  return "I’m here and ready. Ask me again in one short sentence and I’ll keep it brief.";
}

module.exports = {
  AIService,
  AIServiceError,
  buildAssistantReply,
  buildLocalSourceReply,
  buildResponseInput
};
