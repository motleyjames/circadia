"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { listen } = require("./static-server.cjs");

const DEV_URL = "http://127.0.0.1:43147";
const DOCK_PORT = 43148;
const ICON = path.join(__dirname, "icon.png");

/** @type {import('node:http').Server | null} */
let httpServer = null;
/** @type {import('node:child_process').ChildProcess | null} */
let nextChild = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;
let appUrl = DEV_URL;

function logFile() {
  const home = process.env.HOME || app.getPath("home");
  const dir = path.join(home, "Library", "Logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "Circadia.log");
}

function logLine(chunk) {
  try {
    fs.appendFileSync(logFile(), chunk);
  } catch {
    /* ignore */
  }
}

logLine(`\n--- electron ${new Date().toISOString()} ---\nexec ${process.execPath}\n`);

function readInstall() {
  const candidates = [
    path.join(process.resourcesPath, "app", "install.json"),
    path.join(__dirname, "install.json"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed.node === "string" && typeof parsed.repo === "string") return parsed;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function splashHtml(subtitle) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Circadia</title>
    <style>
      html, body { margin: 0; height: 100%; background: #07060f; color: #e4e4e7; font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
      body { display: flex; align-items: center; justify-content: center; }
      .mark { width: 72px; height: 72px; border: 1px solid rgba(125,211,252,.35); border-radius: 50%; }
      h1 { font-weight: 500; letter-spacing: -0.04em; margin: 1.25rem 0 .35rem; }
      p { color: #71717a; margin: 0; }
    </style>
  </head>
  <body>
    <div style="text-align:center">
      <div class="mark"></div>
      <h1>Circadia</h1>
      <p>${subtitle}</p>
    </div>
  </body>
</html>`;
}

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
      main { max-width: 38rem; padding: 4rem 2rem; }
      h1 { font-weight: 560; letter-spacing: -0.03em; }
      p, code { color: #a1a1aa; }
      pre { white-space: pre-wrap; color: #c4b5fd; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Circadia is running. The diary is not.</h1>
      <p>Quit with Cmd+Q. Open <code>~/Library/Logs/Circadia.log</code> if this repeats.</p>
      <pre>${safe}</pre>
    </main>
  </body>
</html>`;
}

function dataUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(400, () => {
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

function startNext(install) {
  const node = install.node;
  const repo = install.repo;
  const nextBin = path.join(repo, "node_modules", "next", "dist", "bin", "next");
  const bound = Number(install.port) > 0 ? Number(install.port) : DOCK_PORT;
  if (!fs.existsSync(node) || !fs.existsSync(nextBin)) {
    throw new Error(`Node or Next missing.\nnode: ${node}\nnext: ${nextBin}`);
  }
  const buildId = path.join(repo, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    throw new Error("Circadia has not been compiled. From rest-ai run: npm run dock");
  }
  logLine(`next start :${bound}\n${node}\n${repo}\n`);
  const nodeDir = path.dirname(node);
  nextChild = spawn(node, [nextBin, "start", "--port", String(bound), "--hostname", "127.0.0.1"], {
    cwd: repo,
    env: {
      ...process.env,
      PATH: `${nodeDir}:${install.path || ""}:${process.env.PATH || ""}`,
    },
  });
  nextChild.stdout?.on("data", (data) => logLine(String(data)));
  nextChild.stderr?.on("data", (data) => logLine(String(data)));
  nextChild.on("exit", (code) => {
    logLine(`next exit ${code}\n`);
    nextChild = null;
  });
}

async function startEmbeddedUi() {
  const uiRoot = path.join(process.resourcesPath, "ui");
  if (!fs.existsSync(path.join(uiRoot, "index.html"))) return false;
  const inbox = path.join(app.getPath("userData"), "study-inbox");
  fs.mkdirSync(inbox, { recursive: true });
  const started = await listen({ root: uiRoot, inbox, port: 0 });
  httpServer = started.server;
  appUrl = started.url;
  return true;
}

async function ensureUi() {
  const install = readInstall();
  if (install) {
    const bound = Number(install.port) > 0 ? Number(install.port) : DOCK_PORT;
    const url = `http://127.0.0.1:${bound}`;
    if (!(await probe(url))) {
      startNext(install);
      await waitForUrl(url, 90_000);
    }
    appUrl = url;
    return;
  }
  if (await probe(DEV_URL)) {
    appUrl = DEV_URL;
    return;
  }
  if (app.isPackaged) {
    const embedded = await startEmbeddedUi();
    if (embedded) return;
    throw new Error("This Circadia.app has no project pointer. Run npm run dock from the rest-ai folder.");
  }
  appUrl = DEV_URL;
  await waitForUrl(DEV_URL, 60_000);
}

function createShell() {
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  return win;
}

async function boot() {
  const win = createShell();
  await win.loadURL(dataUrl(splashHtml("Starting the night clock…")));
  try {
    await ensureUi();
    await win.loadURL(appUrl);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    logLine(`boot failure ${message}\n`);
    await win.loadURL(dataUrl(failureHtml(message)));
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

process.on("uncaughtException", (error) => {
  logLine(`uncaught ${error.stack || error}\n`);
});

try {
  app.setName("Circadia");
  app.setPath("userData", path.join(app.getPath("appData"), "Circadia"));
} catch (error) {
  logLine(`setName ${error}\n`);
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(ICON);
  }
  app.setAboutPanelOptions({
    applicationName: "Circadia",
    applicationVersion: "0.4.1",
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

app.on("before-quit", () => {
  isQuitting = true;
  if (nextChild && !nextChild.killed) nextChild.kill();
  if (httpServer) httpServer.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (nextChild && !nextChild.killed) nextChild.kill();
    if (httpServer) httpServer.close();
    app.quit();
  }
});
