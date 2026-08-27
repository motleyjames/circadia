"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { listen } = require("./static-server.cjs");

const DEV_URL = "http://127.0.0.1:43147";
const ICON = path.join(__dirname, "icon.png");

/** @type {import('node:http').Server | null} */
let httpServer = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;
let appUrl = DEV_URL;

function failureHtml(message) {
  const safe = String(message)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Circadia</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #07060f; color: #e4e4e7; font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
      main { max-width: 36rem; padding: 4rem 2rem; }
      h1 { font-weight: 560; letter-spacing: -0.03em; }
      p { color: #a1a1aa; }
      pre { white-space: pre-wrap; color: #c4b5fd; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Circadia could not open the diary.</h1>
      <p>The window is up. The UI is not. Quit with Cmd+Q, then from the rest-ai folder run <code>npm run dock</code> again.</p>
      <pre>${safe}</pre>
    </main>
  </body>
</html>`;
}

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForUrl(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      probe(url).then((up) => {
        if (up) {
          resolve(undefined);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Nothing answered at ${url}`));
          return;
        }
        setTimeout(tick, 200);
      });
    };
    tick();
  });
}

async function startPackagedUi() {
  const uiRoot = path.join(process.resourcesPath, "ui");
  const index = path.join(uiRoot, "index.html");
  if (!fs.existsSync(index)) {
    throw new Error(`Packaged UI missing: ${index}`);
  }
  const inbox = path.join(app.getPath("userData"), "study-inbox");
  fs.mkdirSync(inbox, { recursive: true });
  const started = await listen({
    root: uiRoot,
    inbox,
    port: 0,
    ingest: process.env.STUDY_INGEST_URL,
    ingestToken: process.env.STUDY_INGEST_TOKEN,
  });
  httpServer = started.server;
  appUrl = started.url;
}

async function ensureUi() {
  if (app.isPackaged) {
    await startPackagedUi();
    return;
  }
  appUrl = DEV_URL;
  await waitForUrl(DEV_URL, 20_000);
}

function openWindow(url) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#05040a",
    title: "Circadia",
    show: true,
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

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(appUrl)) return { action: "allow" };
    shell.openExternal(target);
    return { action: "deny" };
  });

  win.webContents.on("did-fail-load", (_event, code, desc, failedUrl) => {
    if (code === -3) return;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failureHtml(`${desc} (${code}) ${failedUrl || ""}`))}`);
  });

  void win.loadURL(url);
  return win;
}

async function boot() {
  try {
    await ensureUi();
    openWindow(appUrl);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    openWindow(`data:text/html;charset=utf-8,${encodeURIComponent(failureHtml(message))}`);
  }
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
  app.whenReady().then(() => {
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
    return boot();
  });
  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      return;
    }
    void boot();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  if (httpServer) httpServer.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (httpServer) httpServer.close();
    app.quit();
  }
});
