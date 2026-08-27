"use strict";

const { app, BrowserWindow, dialog, Menu, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const PREFERRED_PORT = Number(process.env.CIRCADIA_PORT) || 43147;
const ICON = path.join(__dirname, "icon.png");

/** @type {Electron.UtilityProcess | null} */
let server = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let isQuitting = false;
let appUrl = `http://127.0.0.1:${PREFERRED_PORT}`;

function logPath() {
  return path.join(app.getPath("userData"), "server.log");
}

function logLine(chunk) {
  try {
    fs.appendFileSync(logPath(), chunk);
  } catch {
    /* ignore */
  }
}

function probe(url, timeoutMs = 600) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer(url, timeoutMs = 45_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      probe(url, 400).then((up) => {
        if (up) {
          resolve(undefined);
          return;
        }
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

function pickPort(preferred) {
  return new Promise((resolve, reject) => {
    const tryListen = (port) => {
      const srv = net.createServer();
      srv.unref();
      srv.on("error", () => {
        if (port === preferred) tryListen(0);
        else reject(new Error("No free port"));
      });
      srv.listen(port, "127.0.0.1", () => {
        const address = srv.address();
        const taken = typeof address === "object" && address ? address.port : preferred;
        srv.close(() => resolve(taken));
      });
    };
    tryListen(preferred);
  });
}

function envForServer(port, inbox, serverRoot) {
  const raw = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    LANG: process.env.LANG,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    CIRCADIA_DATA_DIR: inbox,
    CIRCADIA_SERVER_ROOT: serverRoot,
  };
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string"));
}

function startPackagedServer(port) {
  if (server) return;
  const serverRoot = path.join(process.resourcesPath, "server");
  const serverJs = path.join(serverRoot, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Missing server at ${serverJs}`);
  }
  const inbox = path.join(app.getPath("userData"), "study-inbox");
  fs.mkdirSync(inbox, { recursive: true });
  logLine(`\n--- start ${new Date().toISOString()} port ${port} ---\n`);

  const boot = path.join(__dirname, "server-boot.cjs");
  server = utilityProcess.fork(boot, [], {
    stdio: "pipe",
    serviceName: "circadia-web",
    env: envForServer(port, inbox, serverRoot),
  });

  server.stdout?.on("data", (data) => logLine(String(data)));
  server.stderr?.on("data", (data) => logLine(String(data)));
  server.on("exit", (code) => {
    server = null;
    if (isQuitting) return;
    void (async () => {
      if (await probe(appUrl)) return;
      logLine(`server exit ${code}\n`);
      if (!mainWindow || mainWindow.isDestroyed()) return;
      dialog.showErrorBox(
        "Circadia",
        "The local server closed. Quit with Cmd+Q and open Circadia again. If this keeps happening, quit any old npm run app session first.",
      );
    })();
  });
}

async function ensureServer() {
  if (await probe(appUrl)) return;
  if (!app.isPackaged) {
    await waitForServer(appUrl, 8_000);
    return;
  }
  const port = await pickPort(PREFERRED_PORT);
  appUrl = `http://127.0.0.1:${port}`;
  startPackagedServer(port);
  await waitForServer(appUrl, 45_000);
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  try {
    await ensureServer();
  } catch {
    dialog.showErrorBox(
      "Circadia",
      app.isPackaged
        ? `Could not start. Details: ${logPath()}`
        : "This Dock icon is leftover from Terminal. Run npm run dock in rest-ai to install Circadia.app.",
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
    if (url.startsWith(appUrl)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(appUrl);
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
  if (server) server.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (server) server.kill();
    app.quit();
  }
});
