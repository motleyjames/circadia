import UIKit

/**
 The night the diary sits on, in UIKit.

 The Dock open is painted on `.night-sky` + `.glow-veil` in `src/app/globals.css`:
 three wide radial washes over `#05040a`, then five small stars. The phone overlay
 used to be flat black, which is most of why it read as the cheaper of the two.

 The launch screen is flat `#05040a` by necessity, so this fades up from nothing
 after the scene is active — the sky wakes rather than popping in.
 */
final class CircadiaSky: UIView {
    static let night = UIColor(red: 5 / 255.0, green: 4 / 255.0, blue: 10 / 255.0, alpha: 1)

    /// One `radial-gradient(ellipse <rx> <ry> at <cx> <cy>, <color>, transparent <stop>)`.
    private struct Wash {
        let color: UIColor
        let center: CGPoint  // fraction of the view
        let radius: CGSize   // fraction of the view
        let stop: CGFloat    // where the colour reaches transparent
    }

    private static let washes: [Wash] = [
        Wash(color: UIColor(red: 88 / 255.0, green: 70 / 255.0, blue: 180 / 255.0, alpha: 0.38),
             center: CGPoint(x: 0.5, y: -0.08), radius: CGSize(width: 0.9, height: 0.55), stop: 0.58),
        Wash(color: UIColor(red: 56 / 255.0, green: 120 / 255.0, blue: 180 / 255.0, alpha: 0.16),
             center: CGPoint(x: 0.82, y: 1.08), radius: CGSize(width: 0.5, height: 0.42), stop: 0.52),
        Wash(color: UIColor(red: 70 / 255.0, green: 50 / 255.0, blue: 130 / 255.0, alpha: 0.14),
             center: CGPoint(x: 0.08, y: 0.88), radius: CGSize(width: 0.42, height: 0.32), stop: 0.55),
    ]

    private struct Star {
        let at: CGPoint
        let size: CGFloat
        let color: UIColor
    }

    private static let stars: [Star] = [
        Star(at: CGPoint(x: 0.12, y: 0.18), size: 2, color: UIColor(white: 1, alpha: 0.35)),
        Star(at: CGPoint(x: 0.28, y: 0.72), size: 2,
             color: UIColor(red: 196 / 255.0, green: 181 / 255.0, blue: 253 / 255.0, alpha: 0.4)),
        Star(at: CGPoint(x: 0.67, y: 0.22), size: 2, color: UIColor(white: 1, alpha: 0.25)),
        Star(at: CGPoint(x: 0.82, y: 0.58), size: 2,
             color: UIColor(red: 125 / 255.0, green: 211 / 255.0, blue: 252 / 255.0, alpha: 0.35)),
        Star(at: CGPoint(x: 0.44, y: 0.40), size: 3, color: UIColor(white: 1, alpha: 0.2)),
    ]

    private let washLayers = CircadiaSky.washes.map { _ in CAGradientLayer() }
    private let veil = CALayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        backgroundColor = Self.night
        for (layer, wash) in zip(washLayers, Self.washes) {
            layer.type = .radial
            layer.colors = [wash.color.cgColor, wash.color.withAlphaComponent(0).cgColor]
            layer.locations = [0, NSNumber(value: Double(wash.stop))]
            layer.startPoint = CGPoint(x: 0.5, y: 0.5)
            layer.endPoint = CGPoint(x: 1, y: 1)
            self.layer.addSublayer(layer)
        }
        veil.opacity = 0.7
        for star in Self.stars {
            let dot = CALayer()
            dot.backgroundColor = star.color.cgColor
            dot.cornerRadius = star.size / 2
            veil.addSublayer(dot)
        }
        layer.addSublayer(veil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("CircadiaSky is code-only")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let w = bounds.width, h = bounds.height
        for (layer, wash) in zip(washLayers, Self.washes) {
            let rx = wash.radius.width * w, ry = wash.radius.height * h
            layer.frame = CGRect(x: wash.center.x * w - rx, y: wash.center.y * h - ry,
                                 width: rx * 2, height: ry * 2)
        }
        veil.frame = bounds
        for (dot, star) in zip(veil.sublayers ?? [], Self.stars) {
            dot.frame = CGRect(x: star.at.x * w - star.size / 2, y: star.at.y * h - star.size / 2,
                               width: star.size, height: star.size)
        }
    }

    /// Wake the sky out of the flat launch-screen night.
    func rise(duration: TimeInterval) {
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.toValue = 1
        fade.duration = duration
        fade.timingFunction = CAMediaTimingFunction(name: .easeOut)
        fade.fillMode = .backwards
        for layer in washLayers { layer.add(fade, forKey: "rise") }
        veil.add(fade, forKey: "rise")
    }

    func settle() {
        for layer in washLayers { layer.removeAllAnimations() }
        veil.removeAllAnimations()
    }
}
