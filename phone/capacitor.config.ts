import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.circadia.diary",
  appName: "Circadia",
  webDir: "../out",
  ios: {
    contentInset: "never",
    backgroundColor: "#05040a",
    preferredContentMode: "mobile",
    scheme: "Circadia",
  },
  includePlugins: [
    "@capacitor/filesystem",
    "@capacitor/keyboard",
    "@capacitor/status-bar",
    "circadia-keychain",
  ],
  plugins: {
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
