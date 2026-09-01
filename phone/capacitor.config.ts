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
    // WKWebView bounce is Safari. Diary panes scroll themselves.
    scrollEnabled: false,
    allowsLinkPreview: false,
    zoomEnabled: false,
  },
  includePlugins: [
    "@capacitor/filesystem",
    "@capacitor/keyboard",
    "@capacitor/status-bar",
    "@capacitor/haptics",
    "circadia-keychain",
  ],
  plugins: {
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
