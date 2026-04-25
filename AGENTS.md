# AGENTS

## Current App Focus

This repository contains a desktop AI assistant MVP built with Electron, React, and Node.js. The current goal is to keep the app runnable, small, and safe while adding assistant memory and external knowledge sources.

## Product Goal

Build a simple desktop AI assistant that runs as a small floating Electron overlay with a React chat UI. The app should feel usable, stay always on top, and remain safe around secrets, file access, and external integrations.

## Current Scope

- Electron main process owns the desktop window.
- React renderer owns the chat interface.
- Preload exposes a small, safe bridge between renderer and main.
- Assistant replies come from the OpenAI Responses API when an API key is configured.
- Session memory is stored in the Electron main process while the app is open.
- Project summary and user preferences persist locally between launches.
- Local file reads can be used as source context, while writes remain approval-gated.
- Window size and position persist between launches.

## Notion MCP Safety Rules

- Connect to Notion only through the hosted MCP server at `https://mcp.notion.com/mcp`.
- Do not hardcode Notion tokens, secrets, or OAuth credentials in source files.
- Keep OAuth, token exchange, refresh, and session storage in the Electron main process.
- Never expose access tokens, refresh tokens, or raw OAuth responses to the renderer.
- Renderer code must use IPC only for Notion actions.
- All Notion create and update actions must require explicit user approval after showing an exact preview.
- Do not implement Notion delete operations in this repository unless the user explicitly changes the requirement.
- Do not log tokens, raw secrets, or full private Notion page contents.
- Keep Notion service code separate from local file logic.

## Implementation Notes

- Use encrypted local storage through Electron safe storage when available.
- Use encrypted local storage for saved AI settings when available.
- If encrypted persistence is unavailable, keep the Notion session in memory only.
- If encrypted persistence is unavailable, keep AI key material in memory only.
- Prefer narrow UI flows that clearly separate read actions from write actions.

## Memory Roadmap

### Phase 1: Session Chat Memory

Keep the current conversation in memory for the active app session.

Status:
- Implemented in `src/main/main.js` with an in-memory session message array.

### Phase 2: Project Summary Memory

Add a lightweight project summary that persists between launches.

Status:
- Implemented with a local JSON store in the Electron main process.
- Editable from the Settings UI.
- Seeded automatically from the first substantial user message if no summary exists yet.

### Phase 3: User Preferences Memory

Persist stable preferences such as tone, coding style, and preferred workflows.

Status:
- Implemented with a `userPreferences` object in the local JSON store.
- Editable and resettable from the Settings UI.

## AI Integration Notes

Status:
- Implemented with a main-process OpenAI service.
- API keys do not reach renderer code.
- BB-8 uses session memory, project summary, user preferences, and active sources to build each request.
- Further refinement is still useful around streaming, retries, and richer source reasoning.
