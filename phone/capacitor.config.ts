import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "app.circadia.diary",
  appName: "Circadia",
  webDir: "../out",
  ios: {
    contentInset: "never",
    backgroundColor: "#05040a",
    preferredContentMode: "mobile",
    scheme: "Circadia",
    // Capacitor already sets scrollView.bounces = false. Turning WKWebView
    // scrolling off also makes KeyboardPlugin take the scroll delegate and
    // pin contentOffset to zero — swipe dies on the whole diary.
    scrollEnabled: true,
    allowsLinkPreview: false,
    zoomEnabled: false,
  },
  includePlugins: [
    "@capacitor/filesystem",
    "@capacitor/keyboard",
    "@capacitor/status-bar",
    "@capacitor/haptics",
    // Without this the plugin is compiled out of the app entirely: includePlugins is
    // an allowlist, so an unlisted plugin is simply absent at runtime and
    // isPluginAvailable("LocalNotifications") is false. That is the same silent
    // nothing the Web Notification version produced, arrived at a different way.
    "@capacitor/local-notifications",
    "circadia-keychain",
  ],
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
