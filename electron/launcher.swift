import AppKit
import Foundation
import WebKit

/// Native Dock shell. Production `next start` on 43148 — never `next dev`.
/// Turbopack's overlay was covering Tonight with Safari's "Load failed".

struct Install: Decodable {
  let node: String
  let repo: String
  let path: String?
  let port: Int?
  let version: String?
}

let defaultPort = 43148
var activeURL = URL(string: "http://127.0.0.1:43148/")!
var nextProcess: Process?

func installPort(_ install: Install?) -> Int {
  install?.port ?? defaultPort
}

func makeDiaryURL(_ install: Install?) -> URL {
  let stamp = install?.version ?? "0.4.4"
  return URL(string: "http://127.0.0.1:\(installPort(install))/?v=\(stamp)")!
}
let logURL: URL = {
  let logs = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Logs", isDirectory: true)
  try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
  return logs.appendingPathComponent("Circadia.log")
}()

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
  let serve = (install.repo as NSString).appendingPathComponent("electron/serve-dock.cjs")
  guard FileManager.default.isExecutableFile(atPath: install.node) else {
    throw NSError(domain: "Circadia", code: 1, userInfo: [
      NSLocalizedDescriptionKey: "Node is gone.\n\(install.node)\nRun npm run dock from rest-ai again.",
    ])
  }
  guard FileManager.default.fileExists(atPath: serve) else {
    throw NSError(domain: "Circadia", code: 2, userInfo: [
      NSLocalizedDescriptionKey: "This Circadia.app is stale. From rest-ai run:\nnpm run dock",
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
    let js = "document.documentElement.classList.add('circadia-native');"
    config.userContentController.addUserScript(
      WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )
    return WKWebView(frame: .zero, configuration: config)
  }()
  let splash = NSTextField(labelWithString: "Starting the night clock…")

  func applicationDidFinishLaunching(_ notification: Notification) {
    logLine("native launcher started")
    NSApp.setActivationPolicy(.regular)
    if let png = Bundle.main.url(forResource: "icon", withExtension: "png"),
       let image = NSImage(contentsOf: png) {
      NSApp.applicationIconImage = image
    }

    window.title = "Circadia"
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
      self?.boot()
    }
  }

  func boot() {
    let install = readInstall()
    activeURL = makeDiaryURL(install)
    guard let install else {
      fail("This Circadia.app has no project pointer.\nFrom the rest-ai folder run:\nnpm run dock")
      return
    }
    if !FileManager.default.fileExists(atPath: install.repo) {
      fail("The rest-ai folder moved.\nLast seen:\n\(install.repo)\nOpen that clone and run npm run dock again.")
      return
    }
    do {
      try startNext(install)
    } catch {
      fail(error.localizedDescription)
      return
    }
    if waitForDiary(timeout: 180) {
      loadDiary()
      return
    }
    fail("The diary did not start on port \(installPort(install)).\nRead ~/Library/Logs/Circadia.log")
  }

  func loadDiary() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.splash.stringValue = "Opening Tonight…"
      self.web.load(URLRequest(url: activeURL))
    }
  }

  func fail(_ message: String) {
    logLine("boot failure \(message)")
    DispatchQueue.main.async { [weak self] in
      self?.splash.stringValue = message
      let alert = NSAlert()
      alert.messageText = "Circadia is running. The diary is not."
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
    let appName = "Circadia"
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
