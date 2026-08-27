"use strict";

const { app, BrowserWindow, dialog, Menu, shell } = require("electron");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.CIRCADIA_PORT) || 43147;
const URL = `http://127.0.0.1:${PORT}`;
const ICON = path.join(__dirname, "icon.png");

/** @type {import('node:child_process').ChildProcess | null} */
let server = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;
let serverStarted = false;

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
  if (serverStarted) return;
  serverStarted = true;
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
    serverStarted = false;
    if (code && code !== 0 && !isQuitting) {
      dialog.showErrorBox("Circadia", "The local sleep server stopped unexpectedly.");
    }
  });
}

async function ensureServer() {
  if (app.isPackaged) startPackagedServer();
  try {
    await waitForServer(app.isPackaged ? 45_000 : 8_000);
  } catch {
    dialog.showErrorBox(
      "Circadia",
      app.isPackaged
        ? "Could not start the local server. Quit any other Circadia window (Cmd+Q) and try again."
        : "This Dock icon is a leftover from a terminal session. Run npm run dock in the Circadia folder to install a real Circadia.app.",
    );
    app.quit();
    throw new Error("server");
  }
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  await ensureServer();

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
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  win.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(URL);
}

function installMenu() {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
              ],
            },
          ]
        : []),
      { role: "editMenu" },
      { role: "windowMenu" },
    ]),
  );
}

const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    app.setName("Circadia");
    if (process.platform === "darwin" && app.dock) {
      app.dock.setIcon(ICON);
    }
    app.setAboutPanelOptions({
      applicationName: "Circadia",
      applicationVersion: app.getVersion(),
      copyright: "Local sleep companion. Not medical care.",
    });
    installMenu();
    await createWindow();
  });
  app.on("activate", () => {
    void createWindow();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  if (server && !server.killed) server.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (server && !server.killed) server.kill();
    app.quit();
  }
});
