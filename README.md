# BB-8

A small floating desktop assistant built with Electron, React, and Node.js.

## Portfolio Notes

For a portfolio-oriented testing and iteration narrative, see [test.md](./test.md).

## Features

- Small desktop overlay window
- Always-on-top Electron window
- ChatGPT-style React chat UI
- Session chat memory while the app is open
- Persistent BB-8 project summary memory
- Persistent BB-8 user preferences memory
- Real OpenAI-backed chat replies from the Electron main process
- Local file reading, including absolute-path reads outside the workspace, with approval-gated workspace file saves
- Notion MCP integration with browser-based OAuth
- Notion search and page reading
- Notion pages as assistant knowledge sources
- Approval-gated Notion page creation and page updates
- Clean `src/main` and `src/renderer` project structure

## Requirements

- Node.js 18 or newer
- npm

## Run In Development

```bash
npm install
npm run dev
```

This starts Vite for the React renderer and opens the Electron desktop window.

## Install And Run On macOS

### Option 1: Run from source on a Mac

```bash
git clone <your-repo-url>
cd bb-8
npm install
npm run dev
```

Then:

1. Open `Settings`
2. Paste your OpenAI API key into the `BB-8 AI` section
3. Pick a model
4. Click `Save AI Settings`

### Option 2: Use the packaged macOS app

If you already have a packaged `BB-8.app`:

1. Copy `BB-8.app` to your `Applications` folder or Desktop
2. Double-click it to launch
3. If macOS warns that the app is unsigned, right-click the app and choose `Open` once
4. Open `Settings` and add your OpenAI API key and model

BB-8 is built for Apple Silicon (`darwin arm64`) in the current packaged version.

## OpenAI Setup

BB-8 can now store your OpenAI API key from the `Settings` tab so it does not need to live in the repo.

Recommended flow:

1. Start BB-8 with `npm run dev`.
2. Open `Settings`.
3. Paste your OpenAI API key into the `BB-8 AI` section.
4. Pick a model from the dropdown.
5. Click `Save AI Settings`.

If Electron secure storage is available, BB-8 stores the key in encrypted local storage. If encryption is unavailable, BB-8 keeps the key in memory for the current session only.

You can still launch BB-8 with environment variables if you prefer:

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_MODEL="gpt-5-mini"
npm run dev
```

## Run Production Build Locally

```bash
npm install
npm start
```

`npm start` builds the React renderer into `dist` and launches Electron from that build.

## Run Tests

```bash
npm test
```

## Notion Setup And Usage

1. Start the app with `npm run dev`.
2. Open the `Settings` tab.
3. In the `Notion` section, click `Connect Notion`.
4. Complete the OAuth flow in your browser and return to the app.
5. Click `Test Connection` to verify the workspace connection.
6. Open the `Sources` tab to search Notion and read a page.
7. Click `Use as Source` to include a Notion page in chat context.
8. Use `Prepare Preview` before any create or update action, then explicitly approve it.

## Safety Notes

- Notion OAuth and token handling stay in the Electron main process.
- The renderer only talks to Notion through IPC.
- Tokens are never exposed to the renderer.
- Notion write actions require an explicit preview-and-approve step.
- This version does not support Notion delete operations.
- If encrypted storage is unavailable, the app keeps the Notion session in memory only.

## BB-8 Memory

BB-8 now stores two lightweight memory layers locally:

- `Project summary`: a compact description of the current project that persists between launches.
- `User preferences`: tone, coding style, and workflow preferences that BB-8 should keep in mind.

You can edit both from the `Settings` tab. BB-8 now includes this memory context in live OpenAI requests.

## Local File Workflows

BB-8 can now work with local files inside the current project workspace, and it can also open an absolute local file path outside the workspace for read-only use:

- Search workspace files from the `Sources` tab.
- Read a file and add it as a chat source.
- Open a project folder by absolute path and search inside it, or click `Open Folder` with an empty path field to use the native folder picker.
- Prepare a file save preview before anything is written.
- Approve the save explicitly before the write happens.

BB-8 does not delete files in this version. Writes stay inside the current workspace root.

## Project Structure

```text
.
├── AGENTS.md
├── implementation_plan.md
├── index.html
├── package.json
├── src
│   ├── main
│   │   ├── main.js
│   │   ├── preload.js
│   │   └── services
│   │       ├── fileService.js
│   │       ├── aiSettingsStore.js
│   │       ├── memoryService.js
│   │       ├── notionApprovalStore.js
│   │       ├── notionErrors.js
│   │       ├── notionMappers.js
│   │       ├── notionSecureStore.js
│   │       ├── notionService.js
│   │       └── windowStateService.js
│   └── renderer
│       ├── api
│       │   ├── aiApi.js
│       │   ├── assistantApi.js
│       │   ├── filesApi.js
│       │   ├── memoryApi.js
│       │   └── notionApi.js
│       ├── App.jsx
│       └── styles.css
├── test
    ├── aiService.test.js
    ├── fileService.test.js
    ├── memoryService.test.js
    ├── notionApprovalStore.test.js
    ├── notionErrors.test.js
    └── notionMappers.test.js
└── vite.config.js
```

## Current AI Logic

BB-8 sends chat requests from the React renderer to the Electron main process through a safe preload bridge. The main process calls the OpenAI Responses API and includes recent session chat, saved project memory, saved preferences, and any active Notion or file sources as context.

## Manual Testing Checklist

1. Launch the app and confirm the floating window opens and stays on top.
2. Open `Settings` and verify the Notion section shows `Not connected` before OAuth.
3. Click `Connect Notion`, finish OAuth in the browser, then click `Test Connection`.
4. Confirm the connection status updates and no token values appear anywhere in the UI.
5. Open `Sources`, search for a known Notion page, then click `Read page`.
6. Click `Use as Source`, return to `Chat`, ask for a summary, and confirm the assistant reply shows a Notion source link.
7. Prepare a create-page preview and confirm no page is created until `Approve and Create` is clicked.
8. Prepare an update preview and confirm no update happens until `Approve and Update` is clicked.
9. Disconnect Notion and confirm search, read, create, and update actions surface a helpful connection error.
10. Reconnect Notion after revoking or expiring the session and confirm the app shows a reconnect-style auth error.
11. In `Settings`, save a project summary and preferences, restart the app, and confirm both values persist.
12. In `Settings`, paste an OpenAI API key, pick a model, save, and confirm the AI status updates to configured.
13. Ask BB-8 a chat question and confirm you receive a live AI response.
14. Ask a second question after saving project memory and preferences, and confirm the response style or content reflects that saved context.
15. In `Sources`, search a local workspace file, read it, add it as a source, and ask BB-8 a question about it.
16. In `Sources`, open a file outside the workspace by absolute path and confirm it loads as read-only source context.
17. Prepare a local file save and confirm nothing is written until `Approve and Save` is clicked.
18. Move the BB-8 window, restart the app, and confirm it reopens in the saved position.
