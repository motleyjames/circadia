"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("circadiaDesktop", { native: true });
