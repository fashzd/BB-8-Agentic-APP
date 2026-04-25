class NotionServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "NotionServiceError";
    this.code = code;
    this.details = details;
  }
}

function ensureNotionError(error, fallbackCode = "NOTION_ERROR", fallbackMessage = "Notion request failed.") {
  if (error instanceof NotionServiceError) {
    return error;
  }

  const message = typeof error?.message === "string" ? error.message : fallbackMessage;
  const lowered = message.toLowerCase();

  if (lowered.includes("approval")) {
    return new NotionServiceError("APPROVAL_REQUIRED", "Approve the Notion write preview before continuing.");
  }

  if (lowered.includes("reconnect") || lowered.includes("expired") || lowered.includes("unauthorized")) {
    return new NotionServiceError("AUTH_EXPIRED", "Your Notion session expired. Reconnect and try again.");
  }

  if (lowered.includes("permission") || lowered.includes("forbidden") || lowered.includes("403")) {
    return new NotionServiceError(
      "INSUFFICIENT_PERMISSIONS",
      "Notion rejected this action because the connection does not have access."
    );
  }

  if (
    lowered.includes("fetch failed") ||
    lowered.includes("network") ||
    lowered.includes("econn") ||
    lowered.includes("enotfound") ||
    lowered.includes("timed out")
  ) {
    return new NotionServiceError("NETWORK_ERROR", "Could not reach Notion. Check your connection and try again.");
  }

  if (lowered.includes("unsupported") || lowered.includes("schema") || lowered.includes("tool result")) {
    return new NotionServiceError(
      "UNSUPPORTED_RESPONSE",
      "Notion returned a response this app does not understand yet."
    );
  }

  if (lowered.includes("cancel")) {
    return new NotionServiceError("USER_CANCELED", "The Notion action was canceled before it was completed.");
  }

  return new NotionServiceError(fallbackCode, fallbackMessage, { cause: message });
}

module.exports = {
  NotionServiceError,
  ensureNotionError
};
