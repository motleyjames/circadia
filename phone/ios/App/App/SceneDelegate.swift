import UIKit
import WebKit
import Capacitor

/// WKWebView will run JS under the native launch screen. We ping the diary
/// after this controller is actually on screen so the open cannot finish
/// as a last keyframe the user never saw.
class CircadiaBridgeViewController: CAPBridgeViewController {
    private var surfaceTimer: Timer?

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startSurfacePings()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        startSurfacePings()
    }

    deinit {
        surfaceTimer?.invalidate()
    }

    private func startSurfacePings() {
        pingSurface()
        surfaceTimer?.invalidate()
        var remaining = 24
        surfaceTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] timer in
            remaining -= 1
            self?.pingSurface()
            if remaining <= 0 {
                timer.invalidate()
            }
        }
    }

    private func pingSurface() {
        webView?.evaluateJavaScript(
            "(function(){window.__CIRCADIA_SURFACE__=true;window.dispatchEvent(new Event('circadia-surface'));})();",
            completionHandler: nil
        )
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CircadiaBridgeViewController()
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
