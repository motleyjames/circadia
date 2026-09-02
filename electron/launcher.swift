import AppKit
import Foundation
import Security
import WebKit

/// Native Dock shell. Production `next start` on 43148 — never `next dev`.
/// Turbopack's overlay was covering Tonight with Safari's "Load failed".

struct Install: Decodable {
  let node: String
  let repo: String
  let path: String?
  let port: Int?
  let version: String?
  let title: String?
  let logFile: String?
  let serve: String?
  let surface: String?
}

let defaultPort = 43148
var activeURL = URL(string: "http://127.0.0.1:43148/")!
var nextProcess: Process?

func makeSessionToken() -> String {
  var bytes = [UInt8](repeating: 0, count: 32)
  let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
  if status != errSecSuccess {
    return UUID().uuidString.replacingOccurrences(of: "-", with: "")
      + UUID().uuidString.replacingOccurrences(of: "-", with: "")
  }
  return bytes.map { String(format: "%02x", $0) }.joined()
}

let sessionToken = makeSessionToken()

func jsonString(_ value: String) -> String {
  guard let data = try? JSONEncoder().encode(value),
        let encoded = String(data: data, encoding: .utf8) else {
    return "\"\""
  }
  return encoded
}

func sessionBridgeScript() -> String {
  let token = jsonString(sessionToken)
  return """
  document.documentElement.classList.add('circadia-native');
  (function(){
    var token=\(token);
    function talk(payload){
      var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.circadiaSession;
      if(!h||typeof h.postMessage!=='function') return Promise.resolve(null);
      return Promise.resolve(h.postMessage(payload));
    }
    Object.defineProperty(window,'circadiaDesktop',{value:{
      native:true,
      token:token,
      sessionKey:{
        set:function(login,master){return talk({op:'set',login:String(login||''),master:String(master||'')}).then(function(v){return v===true});},
        get:function(login){return talk({op:'get',login:String(login||'')}).then(function(v){return typeof v==='string'&&v?v:null});},
        delete:function(login){return talk({op:'delete',login:String(login||'')}).then(function(){})}
      }
    },writable:false,enumerable:true,configurable:false});
  })();
  """
}

/// Circadia.app's own Keychain. Node `security` ACL is bound to whichever
/// Node binary wrote the item — a git pull that changes PATH logs the user out.
final class CircadiaSessionStore: NSObject, WKScriptMessageHandlerWithReply {
  private let service = "Circadia"

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage,
    replyHandler: @escaping (Any?, String?) -> Void
  ) {
    guard message.name == "circadiaSession" else {
      replyHandler(nil, "unknown")
      return
    }
    let body = message.body as? [String: Any] ?? [:]
    let op = body["op"] as? String ?? ""
    let login = body["login"] as? String ?? ""
    let master = body["master"] as? String ?? ""
    if login.count < 3 || login.count > 180 || login.contains("\0") {
      replyHandler(op == "get" ? nil : false, nil)
      return
    }
    switch op {
    case "set":
      replyHandler(set(account: login, master: master), nil)
    case "get":
      replyHandler(get(account: login), nil)
    case "delete":
      delete(account: login)
      replyHandler(true, nil)
    default:
      replyHandler(nil, "unknown")
    }
  }

  private func query(account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  private func set(account: String, master: String) -> Bool {
    guard master.count >= 20, master.count <= 200, !master.contains("\0") else { return false }
    guard let data = master.data(using: .utf8) else { return false }
    let base = query(account: account)
    SecItemDelete(base as CFDictionary)
    var add = base
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    if status == errSecDuplicateItem {
      return SecItemUpdate(base as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess
    }
    return status == errSecSuccess
  }

  private func get(account: String) -> String? {
    var copy = query(account: account)
    copy[kSecReturnData as String] = true
    copy[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: AnyObject?
    let status = SecItemCopyMatching(copy as CFDictionary, &out)
    guard status == errSecSuccess, let data = out as? Data else { return nil }
    let value = String(data: data, encoding: .utf8) ?? ""
    return value.isEmpty ? nil : value
  }

  private func delete(account: String) {
    SecItemDelete(query(account: account) as CFDictionary)
  }
}

let circadiaSessionStore = CircadiaSessionStore()

func installPort(_ install: Install?) -> Int {
  install?.port ?? defaultPort
}

func makeDiaryURL(_ install: Install?) -> URL {
  return URL(string: "http://127.0.0.1:\(installPort(install))/")!
}
let logsDir: URL = {
  let logs = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Logs", isDirectory: true)
  try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
  return logs
}()
var logURL = logsDir.appendingPathComponent("Circadia.log")

func logLine(_ message: String) {
  let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
  guard let data = line.data(using: .utf8) else { return }
  if FileManager.default.fileExists(atPath: logURL.path) {
    if let handle = try? FileHandle(forWritingTo: logURL) {
      handle.seekToEndOfFile()
      handle.write(data)
      try? handle.close()
    }
  } else {
    try? data.write(to: logURL)
  }
}

func readInstall() -> Install? {
  guard let url = Bundle.main.url(forResource: "install", withExtension: "json") else {
    logLine("install.json missing in bundle")
    return nil
  }
  do {
    return try JSONDecoder().decode(Install.self, from: Data(contentsOf: url))
  } catch {
    logLine("install.json unreadable: \(error)")
    return nil
  }
}

func diaryIsUp(_ url: URL = activeURL) -> Bool {
  var up = false
  let sem = DispatchSemaphore(value: 0)
  var request = URLRequest(url: url)
  request.timeoutInterval = 0.6
  URLSession.shared.dataTask(with: request) { _, response, error in
    up = error == nil && response != nil
    sem.signal()
  }.resume()
  _ = sem.wait(timeout: .now() + 1)
  return up
}

func startNext(_ install: Install) throws {
  let serveRel = install.serve ?? "electron/serve-dock.cjs"
  let serve = (install.repo as NSString).appendingPathComponent(serveRel)
  guard FileManager.default.isExecutableFile(atPath: install.node) else {
    throw NSError(domain: "Circadia", code: 1, userInfo: [
      NSLocalizedDescriptionKey: "Node is gone.\n\(install.node)\nOpen Circadia.app again after Node is installed.",
    ])
  }
  guard FileManager.default.fileExists(atPath: serve) else {
    throw NSError(domain: "Circadia", code: 2, userInfo: [
      NSLocalizedDescriptionKey: "This app is stale. Open Circadia.app from the clone at github.com/motleyjames/circadia.",
    ])
  }

  let bound = installPort(install)
  let proc = Process()
  proc.executableURL = URL(fileURLWithPath: install.node)
  proc.arguments = [serve]
  proc.currentDirectoryURL = URL(fileURLWithPath: install.repo)
  var env = ProcessInfo.processInfo.environment
  let nodeDir = URL(fileURLWithPath: install.node).deletingLastPathComponent().path
  let captured = install.path ?? ""
  env["PATH"] = "\(nodeDir):\(captured):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
  env["CIRCADIA_DOCK_PORT"] = String(bound)
  env["CIRCADIA_SESSION_TOKEN"] = sessionToken
  if let surface = install.surface, surface == "mod" {
    env["CIRCADIA_SURFACE"] = "mod"
    env["NEXT_PUBLIC_CIRCADIA_SURFACE"] = "mod"
  }
  proc.environment = env

  if !FileManager.default.fileExists(atPath: logURL.path) {
    FileManager.default.createFile(atPath: logURL.path, contents: nil)
  }
  let handle = try FileHandle(forWritingTo: logURL)
  handle.seekToEndOfFile()
  proc.standardOutput = handle
  proc.standardError = handle
  logLine("starting serve-dock :\(bound)\n  node \(install.node)\n  repo \(install.repo)")
  try proc.run()
  nextProcess = proc
}

func waitForDiary(timeout: TimeInterval) -> Bool {
  let deadline = Date().addingTimeInterval(timeout)
  while Date() < deadline {
    if diaryIsUp() { return true }
    Thread.sleep(forTimeInterval: 0.25)
  }
  return false
}

final class Shell: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
  let window = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
    styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
    backing: .buffered,
    defer: false
  )
  let web: WKWebView = {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore.default()
    // HTML5 <audio> is gated; speechSynthesis was not. Empty set = play from a timer.
    config.mediaTypesRequiringUserActionForPlayback = []
    // Inline media playback is an iOS WKWebView flag. macOS WebKit has no such property; setting it fails swiftc.
    if #available(macOS 11.0, *) {
      config.userContentController.addScriptMessageHandler(
        circadiaSessionStore,
        contentWorld: .page,
        name: "circadiaSession"
      )
    }
    let js = sessionBridgeScript()
    config.userContentController.addUserScript(
      WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )
    return WKWebView(frame: .zero, configuration: config)
  }()
  let splash = NSTextField(labelWithString: "Starting the night clock…")
  var appTitle = "Circadia"
  var operatorApp = false

  func applyIdentity(_ install: Install?) {
    if let name = install?.logFile, !name.isEmpty {
      logURL = logsDir.appendingPathComponent(name)
    }
    appTitle = install?.title ?? "Circadia"
    operatorApp = install?.surface == "mod"
    window.title = appTitle
    splash.stringValue = operatorApp ? "Updating the inbox…" : "Updating Circadia…"
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    let install = readInstall()
    applyIdentity(install)
    logLine("native launcher started")
    NSApp.setActivationPolicy(.regular)
    if let png = Bundle.main.url(forResource: "icon", withExtension: "png"),
       let image = NSImage(contentsOf: png) {
      NSApp.applicationIconImage = image
    }

    window.minSize = NSSize(width: 960, height: 640)
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.backgroundColor = NSColor(red: 0.02, green: 0.016, blue: 0.04, alpha: 1)
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.center()

    web.navigationDelegate = self
    web.setValue(false, forKey: "drawsBackground")
    web.translatesAutoresizingMaskIntoConstraints = false

    splash.textColor = NSColor(white: 0.55, alpha: 1)
    splash.alignment = .center
    splash.font = NSFont.systemFont(ofSize: 15)
    splash.translatesAutoresizingMaskIntoConstraints = false

    let root = NSView(frame: window.contentView!.bounds)
    root.autoresizingMask = [.width, .height]
    root.wantsLayer = true
    root.layer?.backgroundColor = window.backgroundColor.cgColor
    root.addSubview(web)
    root.addSubview(splash)
    window.contentView = root
    NSLayoutConstraint.activate([
      web.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      web.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      web.topAnchor.constraint(equalTo: root.topAnchor),
      web.bottomAnchor.constraint(equalTo: root.bottomAnchor),
      splash.centerXAnchor.constraint(equalTo: root.centerXAnchor),
      splash.centerYAnchor.constraint(equalTo: root.centerYAnchor),
    ])

    installMenu()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      self?.boot(install)
    }
  }

  func boot(_ install: Install?) {
    activeURL = makeDiaryURL(install)
    guard let install else {
      fail("This \(appTitle).app has no project pointer.\nClone github.com/motleyjames/circadia and run npm run put-on-dock once.")
      return
    }
    if !FileManager.default.fileExists(atPath: install.repo) {
      fail("The Circadia folder moved.\nLast seen:\n\(install.repo)\nPut that clone back, or run npm run put-on-dock once.")
      return
    }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.splash.stringValue = self.operatorApp ? "Updating the inbox…" : "Updating Circadia…"
    }
    do {
      try startNext(install)
    } catch {
      fail(error.localizedDescription)
      return
    }
    if waitForDiary(timeout: 360) {
      loadDiary()
      return
    }
    fail("\(appTitle) did not start on port \(installPort(install)).\nRead \(logURL.path)")
  }

  func loadDiary() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.splash.stringValue = self.operatorApp ? "Opening the inbox…" : "Opening Tonight…"
      self.web.load(URLRequest(url: activeURL))
    }
  }

  func fail(_ message: String) {
    logLine("boot failure \(message)")
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.splash.stringValue = message
      let alert = NSAlert()
      alert.messageText = self.operatorApp
        ? "Circadia Operator is running. The inbox is not."
        : "Circadia is running. The diary is not."
      alert.informativeText = message
      alert.alertStyle = .warning
      alert.runModal()
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    splash.isHidden = true
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    logLine("nav fail \(error.localizedDescription)")
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
      self?.web.load(URLRequest(url: activeURL))
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    logLine("provisional fail \(error.localizedDescription)")
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
      if diaryIsUp(activeURL) { self?.web.load(URLRequest(url: activeURL)) }
    }
  }

  func windowShouldClose(_ sender: NSWindow) -> Bool {
    sender.orderOut(nil)
    return false
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    window.makeKeyAndOrderFront(nil)
    return true
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }

  func applicationWillTerminate(_ notification: Notification) {
    if let proc = nextProcess, proc.isRunning {
      proc.terminate()
    }
    logLine("quit")
  }

  func installMenu() {
    let mainMenu = NSMenu()
    let appName = appTitle
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    let appItem = NSMenuItem()
    appItem.submenu = appMenu
    mainMenu.addItem(appItem)

    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    edit.addItem(NSMenuItem.separator())
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
    editItem.submenu = edit
    mainMenu.addItem(editItem)

    NSApp.mainMenu = mainMenu
  }
}

let delegate = Shell()
let app = NSApplication.shared
app.delegate = delegate
app.run()
