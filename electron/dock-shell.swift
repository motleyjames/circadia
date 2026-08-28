import AppKit
import Foundation
import WebKit

/// Diary Dock shell only. Compiles without optional-self traps.
/// Shows a window immediately, then attaches to Next on 43148 or 43147.

struct Install: Decodable {
  let node: String
  let repo: String
  let path: String?
  let port: Int?
  let serve: String?
  let logFile: String?
  let title: String?
}

let logsDir: URL = {
  let logs = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Logs", isDirectory: true)
  try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
  return logs
}()

var logURL = logsDir.appendingPathComponent("Circadia.log")
var nextProcess: Process?
var activeURL = URL(string: "http://127.0.0.1:43148/")!

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

func diaryIsUp(_ url: URL) -> Bool {
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

func readInstall() -> Install? {
  guard let url = Bundle.main.url(forResource: "install", withExtension: "json") else {
    logLine("install.json missing")
    return nil
  }
  do {
    return try JSONDecoder().decode(Install.self, from: Data(contentsOf: url))
  } catch {
    logLine("install.json unreadable: \(error)")
    return nil
  }
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
    return WKWebView(frame: .zero, configuration: config)
  }()
  let splash = NSTextField(labelWithString: "Starting Circadia…")

  func applicationDidFinishLaunching(_ notification: Notification) {
    logLine("native dock-shell started")
    NSApp.setActivationPolicy(.regular)

    if let png = Bundle.main.url(forResource: "icon", withExtension: "png"),
       let image = NSImage(contentsOf: png) {
      NSApp.applicationIconImage = image
    }

    window.minSize = NSSize(width: 960, height: 640)
    window.title = "Circadia"
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

    let mainMenu = NSMenu()
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "Quit Circadia", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    let appItem = NSMenuItem()
    appItem.submenu = appMenu
    mainMenu.addItem(appItem)
    NSApp.mainMenu = mainMenu

    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      self?.boot()
    }
  }

  func boot() {
    let candidates = [
      URL(string: "http://127.0.0.1:43148/")!,
      URL(string: "http://127.0.0.1:43147/")!,
    ]
    for url in candidates where diaryIsUp(url) {
      logLine("already up \(url.absoluteString)")
      load(url)
      return
    }

    guard let install = readInstall() else {
      fail("Circadia.app has no install.json.")
      return
    }
    do {
      try startNext(install)
    } catch {
      fail(error.localizedDescription)
      return
    }
    let bound = install.port ?? 43148
    let url = URL(string: "http://127.0.0.1:\(bound)/")!
    let deadline = Date().addingTimeInterval(180)
    while Date() < deadline {
      if diaryIsUp(url) {
        load(url)
        return
      }
      Thread.sleep(forTimeInterval: 0.25)
    }
    fail("Nothing answered on port \(bound). Chrome may already be on 43147.")
  }

  func startNext(_ install: Install) throws {
    let serveRel = install.serve ?? "electron/serve-dock.cjs"
    let serve = (install.repo as NSString).appendingPathComponent(serveRel)
    guard FileManager.default.isExecutableFile(atPath: install.node) else {
      throw NSError(domain: "Circadia", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "Node is gone.\n\(install.node)",
      ])
    }
    guard FileManager.default.fileExists(atPath: serve) else {
      throw NSError(domain: "Circadia", code: 2, userInfo: [
        NSLocalizedDescriptionKey: "Missing \(serve)",
      ])
    }
    let bound = install.port ?? 43148
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: install.node)
    proc.arguments = [serve]
    proc.currentDirectoryURL = URL(fileURLWithPath: install.repo)
    var env = ProcessInfo.processInfo.environment
    let nodeDir = URL(fileURLWithPath: install.node).deletingLastPathComponent().path
    env["PATH"] = "\(nodeDir):\(install.path ?? ""):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    env["CIRCADIA_DOCK_PORT"] = String(bound)
    proc.environment = env
    if !FileManager.default.fileExists(atPath: logURL.path) {
      FileManager.default.createFile(atPath: logURL.path, contents: nil)
    }
    let handle = try FileHandle(forWritingTo: logURL)
    handle.seekToEndOfFile()
    proc.standardOutput = handle
    proc.standardError = handle
    logLine("starting serve-dock :\(bound)")
    try proc.run()
    nextProcess = proc
  }

  func load(_ url: URL) {
    activeURL = url
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.splash.stringValue = "Opening Tonight…"
      self.web.load(URLRequest(url: url))
    }
  }

  func fail(_ message: String) {
    logLine("boot failure \(message)")
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.splash.stringValue = message
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
  }
}

let delegate = Shell()
let app = NSApplication.shared
app.delegate = delegate
app.run()
