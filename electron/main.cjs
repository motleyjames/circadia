"use strict";

const { app, BrowserWindow, dialog, shell } = require("electron");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.CIRCADIA_PORT) || 43147;
const URL = `http://127.0.0.1:${PORT}`;

/** @type {import('node:child_process').ChildProcess | null} */
let server = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;

function waitForServer(timeoutMs = 45_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(URL, (res) => {
        res.resume();
        resolve(undefined);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Circadia’s local server did not start."));
          return;
        }
        setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function startPackagedServer() {
  const serverRoot = path.join(process.resourcesPath, "server");
  const serverJs = path.join(serverRoot, "server.js");
  const inbox = path.join(app.getPath("userData"), "study-inbox");
  server = spawn(process.execPath, [serverJs], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      CIRCADIA_DATA_DIR: inbox,
    },
    stdio: "inherit",
  });
  server.on("exit", (code) => {
    if (code && code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox("Circadia", "The local sleep server stopped unexpectedly.");
    }
  });
}

async function createWindow() {
  if (app.isPackaged) {
    startPackagedServer();
  }

  try {
    await waitForServer(app.isPackaged ? 45_000 : 60_000);
  } catch {
    dialog.showErrorBox(
      "Circadia",
      app.isPackaged
        ? "Could not start the local server. Close any other Circadia window and try again."
        : "The Next.js dev server is not running. Use npm run app from the repo.",
    );
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#05040a",
    title: "Circadia",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 18 },
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("https://")) {
      if (url.startsWith(URL)) return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(URL);
}

const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    app.setName("Circadia");
    return createWindow();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}

app.on("window-all-closed", () => {
  if (server && !server.killed) server.kill();
  app.quit();
});
