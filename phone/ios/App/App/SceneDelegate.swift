import UIKit
import WebKit
import Capacitor

enum CircadiaSurface {
    static let pingJs =
        "(function(){window.__CIRCADIA_SURFACE__=true;window.dispatchEvent(new Event('circadia-surface'));})();"
    static let readyJs =
        "(function(){try{return window.__CIRCADIA_OPEN_READY__===true?'ready':'wait'}catch(e){return 'wait'}})();"

    static weak var host: CircadiaBridgeViewController?

    static func attach(_ vc: CircadiaBridgeViewController) {
        host = vc
    }

    static func nudge() {
        host?.startHandshake()
    }

    /// Ping every WKWebView actually attached to a window — including a leftover
    /// storyboard CAPBridgeViewController, not a second invisible bridge.
    static func ping() {
        func walk(_ view: UIView) {
            if let web = view as? WKWebView {
                web.evaluateJavaScript(pingJs, completionHandler: nil)
            }
            for child in view.subviews {
                walk(child)
            }
        }
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows {
                if let view = window.rootViewController?.view {
                    walk(view)
                }
            }
        }
    }
}

/// WKWebView's view *is* the webview (Capacitor `loadView` is final). A cover
/// cannot live as a WKWebView subview. We pin a night field on the UIWindow
/// until the diary paints its wait frame and raises `__CIRCADIA_OPEN_READY__`.
///
/// `capacitorDidLoad` runs inside `loadView`, *before* `loadWebView`. A ping
/// then writes the surface flag onto an empty document that navigation wipes.
class CircadiaBridgeViewController: CAPBridgeViewController {
    private let nightCover = UIView()
    private var handshakeTimer: Timer?
    private var revealed = false
    private var handshakeTicks = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        CircadiaSurface.attach(self)
        nightCover.backgroundColor = UIColor(red: 5.0 / 255.0, green: 4.0 / 255.0, blue: 10.0 / 255.0, alpha: 1)
        nightCover.isUserInteractionEnabled = true
        nightCover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        startHandshake()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        pinNightCover()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        CircadiaSurface.attach(self)
        pinNightCover()
        startHandshake()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        pinNightCover()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        CircadiaSurface.attach(self)
        startHandshake()
    }

    deinit {
        handshakeTimer?.invalidate()
    }

    fileprivate func startHandshake() {
        pinNightCover()
        guard !revealed else { return }
        handshakeTimer?.invalidate()
        handshakeTicks = 0
        tickHandshake()
        handshakeTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            self?.tickHandshake()
        }
    }

    private func pinNightCover() {
        guard !revealed else { return }
        guard let window = view.window else { return }
        if nightCover.superview !== window {
            nightCover.removeFromSuperview()
            window.addSubview(nightCover)
        }
        nightCover.frame = window.bounds
        window.bringSubviewToFront(nightCover)
    }

    private func tickHandshake() {
        guard !revealed else { return }
        handshakeTicks += 1
        if handshakeTicks > 40 {
            revealAndPing()
            return
        }
        guard let web = webView else { return }
        web.evaluateJavaScript(CircadiaSurface.readyJs) { [weak self] result, _ in
            DispatchQueue.main.async {
                if (result as? String) == "ready" {
                    self?.revealAndPing()
                }
            }
        }
    }

    private func revealAndPing() {
        guard !revealed else { return }
        revealed = true
        handshakeTimer?.invalidate()
        handshakeTimer = nil
        nightCover.removeFromSuperview()
        if let web = webView {
            web.evaluateJavaScript(CircadiaSurface.pingJs, completionHandler: nil)
        }
        CircadiaSurface.ping()
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Info.plist names Main.storyboard. UIKit already created that window.
        // A second CAPBridgeViewController here loaded a second webview the
        // user never saw — pings went to the invisible one.
        window = windowScene.windows.first ?? UIWindow(windowScene: windowScene)
        if window?.windowScene == nil {
            window?.windowScene = windowScene
        }
        if !(window?.rootViewController is CircadiaBridgeViewController) {
            window?.rootViewController = CircadiaBridgeViewController()
        }
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
