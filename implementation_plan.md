# Implementation Plan

## Phase 1: Runnable Desktop Chat MVP

Goal: Create a small always-on-top desktop assistant window with local placeholder chat behavior.

Tasks:
- Scaffold Electron, React, Vite, and Node.js project files.
- Create an Electron main process that opens a small floating window.
- Keep the window always on top.
- Add a preload bridge for safe renderer-to-main communication.
- Build a simple ChatGPT-style React chat UI.
- Add placeholder assistant response logic.
- Store session chat messages in memory while the app is open.
- Add `npm run dev` and `npm start` scripts.
- Document setup and run instructions in `README.md`.

Status: Complete.

## Phase 2: Project Summary Memory

Goal: Remember a compact summary of the user's current project across sessions.

Tasks:
- Add a local persistence layer, such as a JSON file in Electron `app.getPath("userData")`.
- Store chat history separately from long-lived memory.
- Add a `projectSummary` field.
- Add summary update logic after important user messages.
- Show or inspect the current project summary from the UI.
- Include the summary when real AI prompt construction is added.

Status: Complete.

## Phase 3: Notion MCP Integration

Goal: Connect the desktop assistant to Notion through the hosted MCP server with approval-gated writes.

Tasks:
- Add an Electron main-process Notion service layer.
- Implement OAuth with PKCE against the hosted Notion MCP server.
- Store session data securely with encrypted local storage when available.
- Add IPC handlers for Notion connection, search, read, and approval-based writes.
- Add renderer-side Notion settings, search, reading, and source-selection UI.
- Add preview-based page creation and page update flows.
- Add focused tests for approval gating, token-safe status shaping, and helpful error mapping.
- Update repository docs and agent instructions with Notion safety rules.

Status: Complete.

## Phase 4: User Preferences Memory

Goal: Remember stable user preferences across sessions.

Tasks:
- Add a `userPreferences` field to the local memory store.
- Track preferences such as tone, coding conventions, and common workflows.
- Add UI controls for viewing, editing, and clearing preferences.
- Keep preference updates explicit in the first version.
- Include preferences in future AI prompt construction.

Status: Complete.

## Phase 5: Real AI Integration

Goal: Replace placeholder logic with a real AI provider while keeping the renderer secure.

Tasks:
- Add server-side API client logic in the Electron main process.
- Read API credentials from environment variables or secure storage.
- Build prompt construction using session memory, project summary, and preferences.
- Add loading, error, retry, and timeout states.
- Add tests or smoke checks for message flow.

Status: In Progress.

Completed so far:
- Added a server-side OpenAI client in the Electron main process.
- Read API credentials from environment variables.
- Swapped chat replies from placeholder logic to live Responses API calls.
- Included session memory, project summary memory, user preferences, and active Notion sources in the request context.

Still useful:
- Add loading, retry, and timeout polish.
- Add streaming responses.
- Add focused tests around live request error handling.

Progress update:
- Added timeout handling and one retry for retryable OpenAI request failures.

## Phase 6: Desktop Polish

Goal: Make the overlay feel more like a native assistant.

Tasks:
- Add keyboard shortcut support.
- Add show/hide behavior.
- Add tray or menu bar access.
- Add position persistence.
- Add optional transparency and compact mode.

Status: In Progress.

Completed so far:
- Added window position and size persistence between launches.

Also added:
- Local workspace file reading.
- Approval-gated local file saves.
- Local files can be used as BB-8 chat sources alongside Notion sources.
