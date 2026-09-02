import UIKit
import WebKit
import Capacitor

enum CircadiaSurface {
    static let pingJs =
        "(function(){window.__CIRCADIA_SURFACE__=true;window.dispatchEvent(new Event('circadia-surface'));})();"

    static func nudge() {
        CircadiaOpenWindow.arm()
    }

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
                if window.windowLevel >= UIWindow.Level.alert { continue }
                if let view = window.rootViewController?.view {
                    walk(view)
                }
            }
        }
    }
}

/// Phone open is a second UIWindow, not CSS inside WKWebView.
///
/// Capacitor's view *is* the webview (`loadView` is final). Opacity CSS in that
/// document never faded on device (0.8.13–0.8.17). A night subview on the same
/// window as the webview only covered the diary until a JS handshake, then
/// yanked — the identity never lived in UIKit, so the user never saw a fade.
///
/// This window is shown in scene connect, above the webview, with the wordmark
/// already opaque. LaunchScreen is the same frame. Recede (`UIView.animate` on
/// this window's root alpha) starts after the scene is active, so it cannot
/// finish under the splash. It does not wait for JS to *show* Circadia.
final class CircadiaOpenWindow {
    static var shared: CircadiaOpenWindow?

    private let overlay: UIWindow
    private let identity = UIStackView()
    private var armed = false
    private var receded = false

    static func install(on scene: UIWindowScene) {
        if let existing = shared {
            existing.bringForward()
            return
        }
        shared = CircadiaOpenWindow(scene: scene)
    }

    static func arm() {
        shared?.arm()
    }

    private init(scene: UIWindowScene) {
        overlay = UIWindow(windowScene: scene)
        overlay.windowLevel = UIWindow.Level.alert
        overlay.backgroundColor = Self.night
        overlay.frame = scene.coordinateSpace.bounds
        overlay.isHidden = false
        overlay.isUserInteractionEnabled = true
        overlay.accessibilityViewIsModal = true

        let root = UIViewController()
        root.view.backgroundColor = Self.night
        buildIdentity(in: root.view)
        overlay.rootViewController = root
        identity.alpha = 1
        overlay.makeKeyAndVisible()
    }

    private func bringForward() {
        overlay.windowLevel = UIWindow.Level.alert
        overlay.isHidden = false
        overlay.alpha = 1
        overlay.rootViewController?.view.alpha = 1
        identity.alpha = 1
        overlay.makeKeyAndVisible()
    }

    private func arm() {
        guard !armed, !receded else { return }
        armed = true
        let hold: TimeInterval = UIAccessibility.isReduceMotionEnabled ? 0.28 : 0.4
        DispatchQueue.main.asyncAfter(deadline: .now() + hold) { [weak self] in
            self?.waitForDiaryThenRecede()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) { [weak self] in
            self?.recede()
        }
    }

    private func waitForDiaryThenRecede() {
        waitForDiaryTick(ticks: 0)
    }

    private func waitForDiaryTick(ticks: Int) {
        if receded { return }
        if ticks > 20 {
            recede()
            return
        }
        guard let web = diaryWebView() else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.waitForDiaryTick(ticks: ticks + 1)
            }
            return
        }
        web.evaluateJavaScript("document.readyState") { [weak self] result, _ in
            DispatchQueue.main.async {
                let state = result as? String
                if state == "complete" || state == "interactive" {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                        self?.recede()
                    }
                } else {
                    self?.waitForDiaryTick(ticks: ticks + 1)
                }
            }
        }
    }

    private func diaryWebView() -> WKWebView? {
        var found: WKWebView?
        func walk(_ view: UIView) {
            if found != nil { return }
            if let web = view as? WKWebView { found = web; return }
            for child in view.subviews { walk(child) }
        }
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows where window !== overlay {
                if let view = window.rootViewController?.view {
                    walk(view)
                }
            }
        }
        return found
    }

    private func recede() {
        guard !receded else { return }
        receded = true
        overlay.isUserInteractionEnabled = false
        let duration: TimeInterval = UIAccessibility.isReduceMotionEnabled ? 0.2 : 1.1
        UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseInOut, .beginFromCurrentState]) {
            self.overlay.rootViewController?.view.alpha = 0
            self.overlay.alpha = 0
        } completion: { _ in
            self.overlay.isHidden = true
            self.overlay.isUserInteractionEnabled = false
            self.overlay.rootViewController = nil
            if let scene = self.overlay.windowScene {
                for window in scene.windows where window !== self.overlay {
                    window.makeKeyAndVisible()
                    break
                }
            }
            CircadiaOpenWindow.shared = nil
            CircadiaSurface.ping()
        }
    }

    private func buildIdentity(in host: UIView) {
        let title = UILabel()
        title.text = "Circadia"
        title.textColor = UIColor(white: 0.98, alpha: 1)
        title.textAlignment = .center
        title.font = Self.wordmarkFont()
        title.adjustsFontForContentSizeCategory = false

        let line = UILabel()
        line.text = "For falling asleep. For staying asleep. For a clock that holds."
        line.textColor = UIColor(red: 161 / 255.0, green: 161 / 255.0, blue: 170 / 255.0, alpha: 1)
        line.textAlignment = .center
        line.numberOfLines = 0
        line.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        line.adjustsFontForContentSizeCategory = false

        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let build = UILabel()
        build.text = version
        build.textColor = UIColor(white: 0.44, alpha: 1)
        build.textAlignment = .center
        build.font = UIFont.systemFont(ofSize: 11, weight: .regular)
        build.adjustsFontForContentSizeCategory = false

        identity.axis = .vertical
        identity.alignment = .center
        identity.spacing = 20
        identity.translatesAutoresizingMaskIntoConstraints = false
        identity.addArrangedSubview(title)
        identity.setCustomSpacing(20, after: title)
        identity.addArrangedSubview(line)
        identity.setCustomSpacing(32, after: line)
        identity.addArrangedSubview(build)
        host.addSubview(identity)
        NSLayoutConstraint.activate([
            identity.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            identity.centerYAnchor.constraint(equalTo: host.centerYAnchor),
            identity.leadingAnchor.constraint(greaterThanOrEqualTo: host.leadingAnchor, constant: 32),
            identity.trailingAnchor.constraint(lessThanOrEqualTo: host.trailingAnchor, constant: -32),
            line.widthAnchor.constraint(lessThanOrEqualToConstant: 352),
        ])
    }

    private static let night = UIColor(red: 5.0 / 255.0, green: 4.0 / 255.0, blue: 10.0 / 255.0, alpha: 1)

    private static func wordmarkFont() -> UIFont {
        if let georgia = UIFont(name: "Georgia", size: 42) { return georgia }
        let base = UIFont.systemFont(ofSize: 42, weight: .regular)
        guard let descriptor = base.fontDescriptor.withDesign(.serif) else { return base }
        return UIFont(descriptor: descriptor, size: 42)
    }
}

class CircadiaBridgeViewController: CAPBridgeViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // LaunchScreen can still be up here. Arming then recedes under the
        // splash — the diary appears with no open. Only arm while active.
        if UIApplication.shared.applicationState == .active {
            CircadiaOpenWindow.arm()
        }
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
        CircadiaOpenWindow.install(on: windowScene)

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        if let windowScene = scene as? UIWindowScene {
            CircadiaOpenWindow.install(on: windowScene)
        }
        // One runloop after active so LaunchScreen has yielded to the overlay.
        DispatchQueue.main.async {
            CircadiaOpenWindow.arm()
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
