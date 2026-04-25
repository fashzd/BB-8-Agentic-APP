require("dotenv").config();

const net = require("net");
const { spawn } = require("child_process");
const waitOn = require("wait-on");

const DEFAULT_PORT = 5173;
const MAX_PORT = 65535;
const START_PORT = sanitizePort(process.env.VITE_PORT, DEFAULT_PORT);
const HOST = "127.0.0.1";

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function getRunner(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, HOST);
  });
}

async function getAvailablePort(startPort) {
  let port = startPort;

  while (port <= MAX_PORT && !(await canListen(port))) {
    port += 1;
  }

  if (port > MAX_PORT) {
    throw new Error(`Could not find an open port between ${startPort} and ${MAX_PORT}.`);
  }

  return port;
}

function sanitizePort(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_PORT) {
    return parsed;
  }

  return fallback;
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  viteProcess?.kill();
  electronProcess?.kill();
  process.exit(code);
}

async function main() {
  const port = await getAvailablePort(START_PORT);
  const appUrl = `http://${HOST}:${port}`;

  viteProcess = spawn(
    getRunner("npx"),
    ["vite", "--host", HOST, "--port", String(port), "--strictPort"],
    {
      stdio: "inherit",
      env: process.env
    }
  );

  viteProcess.on("exit", (code) => {
    if (!shuttingDown) {
      shutdown(code || 0);
    }
  });

  await waitOn({
    resources: [appUrl],
    timeout: 30_000
  });

  electronProcess = spawn(getRunner("npx"), ["electron", "."], {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_START_URL: appUrl
    }
  });

  electronProcess.on("exit", (code) => {
    if (!shuttingDown) {
      shutdown(code || 0);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((error) => {
  console.error(error.message || error);
  shutdown(1);
});
