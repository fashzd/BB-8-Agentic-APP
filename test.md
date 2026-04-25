# BB-8 Testing And Iteration Notes

This document captures how BB-8 was tested and improved during development. It is written as a portfolio-style log of real product iteration: issues surfaced through use, fixes were implemented in small steps, and each change was re-tested before moving on.

## Why This Matters

BB-8 was not built as a static demo. It was developed through an agentic workflow where the app was used continuously, problems were observed in real interactions, and the system was refined across UI, desktop packaging, source handling, Notion integration, and AI behavior.

The development process focused on:

- shipping a runnable product early
- testing real user flows instead of only isolated units
- iterating quickly on failures
- tightening safety boundaries around secrets, file access, and Notion writes
- using tests where practical and manual verification where the product surface was highly interactive

## Testing Approach

BB-8 used a mix of:

- **Manual testing:** desktop window behavior, chat UX, Settings flows, Notion UI, source selection, and packaged app launch behavior
- **Service-level automated tests:** AI response shaping, approval gating, Notion mapping, secure storage behavior, memory persistence, and file access rules
- **Regression fixes:** whenever a bug was found in real use, the cause was narrowed down, patched, and then covered with a focused test if the behavior was stable enough to encode

## Major Test Cases And Iterations

### 1. Desktop Overlay MVP

**Test case**
- The app should open as a small always-on-top floating window with a simple chat UI.

**Initial result**
- Core shell worked, but the product still needed structure, memory, and settings.

**Fix / iteration**
- Built the Electron main window, React renderer, preload bridge, and session-based chat history.
- Added a clean project structure and startup scripts.

**Outcome**
- BB-8 became a runnable desktop MVP instead of a static scaffold.

### 2. Notion MCP Connection

**Test case**
- The app should connect to Notion securely through MCP without exposing credentials to the renderer.

**Issue found**
- Initial Notion connection surfaced a vague failure during the connect flow.

**Fix / iteration**
- Adjusted the connect flow so a successful OAuth session counted as connected even if a follow-up tool probe was imperfect.
- Improved error handling and session handling in the Electron main process.

**Outcome**
- Notion connection succeeded in the app.

### 3. Notion Search And Read Mapping

**Test case**
- Search results should render readable titles and page reads should use valid Notion references.

**Issue found**
- Search results were displaying raw JSON-like output.
- Read page actions failed because the wrong identifiers were being used.

**Fix / iteration**
- Reworked Notion result mapping and reference normalization.
- Added support for more flexible MCP tool schemas.
- Updated renderer usage so read actions used normalized Notion references.

**Outcome**
- Search results became readable and page reads worked reliably.

### 4. Approval-Gated Notion Writes

**Test case**
- Notion page create and update operations must never happen before explicit user approval.

**Issue found**
- Create-page schema assumptions did not match the live Notion tool behavior.
- Title payload shape was initially wrong for the live tool schema.

**Fix / iteration**
- Adapted the create-page payload format to the real schema returned by the hosted Notion MCP server.
- Added approval-token handling so writes only execute after preview and approval.

**Outcome**
- Create and update flows worked safely after explicit approval.

### 5. Real AI Integration

**Test case**
- BB-8 should use a real OpenAI-backed response path from the Electron main process.

**Issue found**
- Initial OpenAI request history formatting used the wrong content type for prior assistant messages.

**Fix / iteration**
- Updated assistant-history formatting to the correct Responses API content type.
- Added tests for request shaping.

**Outcome**
- Live AI replies worked from the desktop app.

### 6. Local File Reading Outside The Project

**Test case**
- BB-8 should be able to read selected local files outside the project directory as source context.

**Issue found**
- External file reading did not work through the original flow.

**Fix / iteration**
- Allowed absolute-path file reads outside the workspace for read-only use.
- Kept writes restricted to the workspace for safety.
- Added native file-picker support.

**Outcome**
- External files could be read and used safely as knowledge sources.

### 7. Folder-Based Source Browsing

**Test case**
- Users should be able to choose a project folder and search files inside it.

**Issue found**
- The original flow leaned too much on a default workspace root and did not feel like a true folder-browser workflow.

**Fix / iteration**
- Removed default-root assumptions from the UI.
- Switched the browsing flow to explicit folder selection.
- Made search operate on the selected folder only.

**Outcome**
- File browsing became clearer and safer.

### 8. Knowledge Sources Not Reaching Chat Reliably

**Test case**
- If several files are shown in Knowledge Sources, BB-8 should be able to reason across all of them.

**Issue found**
- The model often latched onto one file even when multiple files were active.
- Commands like "summarize each file" or "read all the files" sometimes collapsed to a single-source reply.

**Fix / iteration**
- Added deterministic pre-model handling for multi-source counting and summarization.
- Strengthened source selection logic for plural-source prompts.
- Made source chips auto-populate when files were opened.

**Outcome**
- Multi-source prompts behaved far more reliably.

### 9. Source-Based Question Answering

**Test case**
- If a user asks a question from a selected file, BB-8 should answer from the file instead of merely summarizing it or saying it can see it.

**Issue found**
- Prompts such as "check readme" or "tell me how to install the app" sometimes triggered summary behavior instead of question-answer behavior.
- README-based run/install questions often returned headings or generic summaries instead of steps.

**Fix / iteration**
- Added targeted source selection by filename mention like `README`.
- Added content-block extraction so BB-8 searched section blocks, not just isolated lines.
- Expanded question-intent matching to treat phrases like "tell me how", "show me how", and install/run prompts as source questions.

**Outcome**
- README questions began returning actual instructions rather than vague summaries.

### 10. Reply Formatting And Readability

**Test case**
- Source-based replies should be readable, with spacing and visible structure.

**Issue found**
- Multi-file summaries sometimes arrived as dense walls of text.

**Fix / iteration**
- Preserved line breaks in the renderer.
- Reformatted deterministic source summaries into clearer sections and bullet-like blocks.

**Outcome**
- Responses became much easier to scan.

### 11. Thinking State In Chat

**Test case**
- The chat should show a visible in-progress state while BB-8 is generating a reply.

**Issue found**
- The app had no strong conversational loading feedback.

**Fix / iteration**
- Added a styled thinking bubble with animated dots before replies.

**Outcome**
- The app felt more responsive and alive during generation.

### 12. Knowledge Sources Panel And Scroll Behavior

**Test case**
- The user should still be able to scroll to the bottom of chat when the Knowledge Sources panel is visible.

**Issue found**
- The panel consumed too much space and could interfere with scroll behavior.

**Fix / iteration**
- Reworked the chat layout to keep the messages region properly scrollable.
- Added a minimize/show toggle for the Knowledge Sources panel.

**Outcome**
- Chat became usable even with active sources visible.

### 13. Packaged macOS App

**Test case**
- BB-8 should launch as a packaged macOS app from the Desktop.

**Issue found**
- The packaged app launched to a black screen.

**Root cause**
- The built renderer HTML used absolute `/assets/...` paths, which broke inside the packaged `file://` app.

**Fix / iteration**
- Updated Vite to build with relative asset paths.
- Rebuilt the packaged app and replaced the broken Desktop copy.

**Outcome**
- The packaged Apple Silicon app launched correctly.

### 14. API Key Security In App Settings

**Test case**
- The OpenAI API key should be configurable from inside the app without being hardcoded in the repo or exposed to the renderer.

**Issue found**
- The early setup relied on environment variables, which was workable for local development but not ideal for a public GitHub portfolio.

**Fix / iteration**
- Added a secure AI settings panel in `Settings`.
- Stored the key in the Electron main process using encrypted local storage when available.
- Added model selection in-app.

**Outcome**
- BB-8 can now be configured from inside the app without exposing the API key in version-controlled files.

### 15. UI Polish Iterations

**Test case**
- The desktop app should feel consistent and intentionally styled.

**Issues found**
- Buttons and indicators used inconsistent colors.
- Some controls inherited browser-default white button styles.
- Scrollbars and source labels were visually too heavy.

**Fix / iteration**
- Rebranded the app fully as BB-8.
- Changed green accents to orange.
- Added transparent/orange styling for targeted settings buttons.
- Tightened source labels and scrollbar styling.

**Outcome**
- The app now reads as a cohesive product rather than a generic scaffold.

## What This Shows In A Portfolio

This project demonstrates:

- **Agentic iteration:** development was not a single pass; behavior improved through repeated observation, diagnosis, patching, and re-testing
- **Desktop product thinking:** Electron shell, preload boundaries, IPC design, secure storage, packaging, and launcher behavior all mattered
- **Practical AI integration:** model wiring, source-aware prompting, deterministic fallbacks, and secure API key handling
- **Tool integration:** Notion MCP support, local file access, and approval-gated write flows
- **Debugging discipline:** bugs were not just patched visually; they were traced to root causes such as schema mismatch, renderer pathing, source-selection logic, and packaging assumptions
- **Safety-minded engineering:** the app separates read vs write actions, requires approval for risky operations, and keeps secrets out of the renderer

## Suggested Portfolio Summary

If you want a short project summary for a portfolio page, this version works well:

> Built BB-8, a desktop AI assistant with Electron, React, Node.js, OpenAI integration, local file context, and Notion MCP support. Developed it through an agentic iteration loop: testing live workflows, diagnosing failures in source reasoning and packaging, hardening secure storage and approval-gated writes, and turning each issue into a concrete UX or system improvement.
