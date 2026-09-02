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
/// already opaque. LaunchScreen is the same frame. Once the scene is active the
/// clock mark draws itself above the wordmark (`CircadiaMarkView.play`) — the
/// wordmark never moves, so LaunchScreen → open is one still picture that comes
/// alive. Recede (`UIView.animate` on this window's root alpha) waits for both
/// the draw and the diary's first frame, so it cannot finish under the splash.
final class CircadiaOpenWindow {
    static var shared: CircadiaOpenWindow?

    /// Hard ceiling. A diary that never reports ready still gets the app.
    private static let recedeCeiling: TimeInterval = 7.0
    /// Finished mark on screen before it starts to go.
    private static let settleBeat: TimeInterval = 0.8

    private let overlay: UIWindow
    private let sky = CircadiaSky()
    private let identity = UIStackView()
    private let mark = CircadiaMarkView(size: 84)
    private let title = UILabel()
    private let line = UILabel()
    private let build = UILabel()
    private var armed = false
    private var receded = false
    private var drawDoneAt: CFTimeInterval = 0

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
        sky.frame = root.view.bounds
        sky.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        root.view.addSubview(sky)
        buildIdentity(in: root.view)
        overlay.rootViewController = root
        // The launch screen is a dark wait now: nothing is on screen until arm()
        // builds the identity, layer by layer, the way the Dock cover does.
        identity.alpha = 1
        title.alpha = 0
        line.alpha = 0
        build.alpha = 0
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

    /// `word-arrive` in globals.css: fade up and settle the last 6pt. Same beats
    /// on both shells — title 1.2s, tagline 1.6s, stamp 2.0s.
    private func arriveWords(moving: Bool) {
        let beats: [(UILabel, TimeInterval, TimeInterval)] = moving
            ? [(title, 1.2, 1.8), (line, 1.6, 1.6), (build, 2.0, 1.4)]
            : [(title, 0.15, 0.7), (line, 0.35, 0.7), (build, 0.55, 0.7)]
        for (label, delay, duration) in beats {
            label.alpha = 0
            label.transform = moving ? CGAffineTransform(translationX: 0, y: 6) : .identity
            UIView.animate(withDuration: duration, delay: delay,
                           options: [.curveEaseOut, .beginFromCurrentState]) {
                label.alpha = 1
                label.transform = .identity
            }
        }
    }

    /**
     Arm only once the app is genuinely active.

     UIKit *completes* animations scheduled while the app is inactive, and Core
     Animation added before the first frame is presented never shows either.
     Capacitor posts `capacitorViewDidAppear` while the launch screen is still up
     and `AppDelegate` forwards it to `nudge()` — arming there ran the whole open
     off-screen, so the identity was simply present and the phone looked like it
     had no animation at all. `viewDidAppear` guarded this; the notification path
     did not. The guard now lives here, where every caller must pass through it.
     Not-yet-active is a retry, never a skip.
     */
    private func arm(retry: Int = 0) {
        guard !armed, !receded else { return }
        guard UIApplication.shared.applicationState == .active else {
            guard retry < 40 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.arm(retry: retry + 1)
            }
            return
        }
        armed = true
        let reduced = UIAccessibility.isReduceMotionEnabled
        if reduced {
            // Reduce Motion asks for no movement — not for no transition. The clock
            // arrives finished and everything cross-fades, which is what the system
            // itself does. Dumping the identity on screen reads as a bug, not care.
            mark.settle()
            sky.settle()
            UIView.animate(withDuration: 0.7, delay: 0, options: [.curveEaseOut]) {
                self.mark.alpha = 1
            }
            sky.rise(duration: 1.0)
            arriveWords(moving: false)
            drawDoneAt = CACurrentMediaTime() + 1.6
        } else {
            mark.alpha = 1
            mark.play()
            // Launch screen is flat night; the sky wakes under the draw so there is no pop.
            sky.rise(duration: 1.8)
            arriveWords(moving: true)
            drawDoneAt = CACurrentMediaTime() + CircadiaMarkView.playDuration
        }
        // Start asking the diary early; recede() itself waits out the draw.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            self?.waitForDiaryThenRecede()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.recedeCeiling) { [weak self] in
            self?.recede(force: true)
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
                    self?.recede()
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

    /// Recede after the mark has finished drawing plus a settle beat. Called
    /// early by the diary-ready poll, it schedules itself for that moment.
    private func recede(force: Bool = false) {
        guard !receded else { return }
        if !force {
            let remaining = (drawDoneAt + Self.settleBeat) - CACurrentMediaTime()
            if remaining > 0.02 {
                DispatchQueue.main.asyncAfter(deadline: .now() + remaining) { [weak self] in
                    self?.recede(force: true)
                }
                return
            }
        }
        receded = true
        overlay.isUserInteractionEnabled = false
        // The diary starts its arrival now, under the lifting scrim — not after it.
        CircadiaSurface.ping()
        if UIAccessibility.isReduceMotionEnabled {
            UIView.animate(withDuration: 0.7, delay: 0, options: [.curveEaseInOut, .beginFromCurrentState]) {
                self.overlay.rootViewController?.view.alpha = 0
            } completion: { _ in
                self.finishRecede()
            }
            return
        }
        // Layered, outgoing before incoming: version and tagline lift, the title
        // follows, the mark dissolves outward, and the night thins to nothing.
        // Total 2.2s — the same beats as `.brand-open-recede` in globals.css.
        let drift = CGAffineTransform(translationX: 0, y: -6)
        overlay.backgroundColor = .clear
        UIView.animate(withDuration: 0.8, delay: 0, options: [.curveEaseInOut, .beginFromCurrentState]) {
            self.build.alpha = 0
            self.build.transform = drift
            self.line.alpha = 0
            self.line.transform = drift
        }
        UIView.animate(withDuration: 0.9, delay: 0.15, options: [.curveEaseInOut, .beginFromCurrentState]) {
            self.title.alpha = 0
            self.title.transform = drift
        }
        mark.lift(delay: 0.3, duration: 1.3)
        UIView.animate(withDuration: 1.3, delay: 0.3, options: [.curveEaseInOut]) {
            self.mark.alpha = 0
            self.mark.transform = CGAffineTransform(scaleX: 1.1, y: 1.1)
        }
        UIView.animate(withDuration: 1.6, delay: 0.2, options: [.curveEaseInOut]) {
            self.sky.alpha = 0
            self.overlay.rootViewController?.view.backgroundColor = Self.night.withAlphaComponent(0)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) { [weak self] in
            self?.finishRecede()
        }
    }

    private func finishRecede() {
        overlay.isHidden = true
        overlay.isUserInteractionEnabled = false
        overlay.rootViewController = nil
        if let scene = overlay.windowScene {
            for window in scene.windows where window !== overlay {
                window.makeKeyAndVisible()
                break
            }
        }
        CircadiaOpenWindow.shared = nil
    }

    private func buildIdentity(in host: UIView) {
        title.attributedText = NSAttributedString(
            string: "Circadia",
            attributes: [
                .font: Self.wordmarkFont(),
                .foregroundColor: UIColor(white: 0.98, alpha: 1),
                // Dock is `tracking-tight`: -0.03em.
                .kern: -0.03 * Self.wordmarkSize,
            ],
        )
        title.textAlignment = .center
        title.adjustsFontForContentSizeCategory = false

        line.text = "For falling asleep. For staying asleep. For a clock that holds."
        line.textColor = UIColor(red: 161 / 255.0, green: 161 / 255.0, blue: 170 / 255.0, alpha: 1)
        line.textAlignment = .center
        line.numberOfLines = 0
        line.font = Self.bodyFont(15)
        line.adjustsFontForContentSizeCategory = false

        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        build.attributedText = NSAttributedString(
            string: version.uppercased(),
            attributes: [
                .font: Self.bodyFont(11),
                // zinc-700, the Dock's stamp colour — not the brighter grey.
                .foregroundColor: UIColor(red: 63 / 255.0, green: 63 / 255.0, blue: 70 / 255.0, alpha: 1),
                .kern: 0.18 * 11,
            ],
        )
        build.textAlignment = .center
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
        // The mark sits above the wordmark, outside the stack, so the stack keeps
        // LaunchScreen's exact position and nothing jumps when the mark appears.
        host.addSubview(mark)
        NSLayoutConstraint.activate([
            identity.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            identity.centerYAnchor.constraint(equalTo: host.centerYAnchor),
            identity.leadingAnchor.constraint(greaterThanOrEqualTo: host.leadingAnchor, constant: 32),
            identity.trailingAnchor.constraint(lessThanOrEqualTo: host.trailingAnchor, constant: -32),
            line.widthAnchor.constraint(lessThanOrEqualToConstant: 352),
            mark.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            mark.bottomAnchor.constraint(equalTo: identity.topAnchor, constant: -40),
        ])
        // Invisible until arm(); LaunchScreen has no mark, so the first frame must match it.
        mark.alpha = 0
    }

    private static let night = CircadiaSky.night

    /// The Dock wordmark is Fraunces at 2.85rem. `CircadiaSerif` is that same face,
    /// pinned to the axis values the browser renders (wght 400, SOFT 50, WONK 0.4)
    /// and bundled in Fonts/. Georgia was never the brand — only the nearest thing
    /// already on the phone.
    static let wordmarkSize: CGFloat = 45.6

    private static func wordmarkFont() -> UIFont {
        if let brand = UIFont(name: "CircadiaSerif-Regular", size: wordmarkSize) { return brand }
        if let georgia = UIFont(name: "Georgia", size: wordmarkSize) { return georgia }
        let base = UIFont.systemFont(ofSize: wordmarkSize, weight: .regular)
        guard let descriptor = base.fontDescriptor.withDesign(.serif) else { return base }
        return UIFont(descriptor: descriptor, size: wordmarkSize)
    }

    /// Body copy is Outfit on the Dock; `CircadiaSans` is that face.
    private static func bodyFont(_ size: CGFloat) -> UIFont {
        UIFont(name: "CircadiaSans-Regular", size: size) ?? UIFont.systemFont(ofSize: size, weight: .regular)
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
