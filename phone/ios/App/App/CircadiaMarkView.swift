import UIKit

/// The Circadia clock mark from `src/components/mark.tsx`, drawn in Core Animation.
///
/// WKWebView never faded CSS on the iPhone (0.8.13–0.8.17), so the open lives in
/// UIKit. This is the same 128-unit geometry as the SVG: a ring, three ticks at
/// 3 / 6 / 9, a crescent at 12, two hands, a pivot. `play()` draws it — ring
/// strokes in from 12, ticks blink, hands sweep from 12 and settle with a small
/// overshoot, the moon fades up, the halo breathes once. `settle()` shows the
/// finished mark with no motion (Reduce Motion).
///
/// Pace: about three seconds. 0.8.20 ran this in 1.45s and it read as a flicker —
/// a clock should be watched, not glimpsed. Keep every beat here in step with
/// the `mark-*` keyframes in `src/app/globals.css`.
final class CircadiaMarkView: UIView {
    /// Wall-clock length of `play()`. The open window recedes no earlier than this.
    static let playDuration: TimeInterval = 3.1

    private let unit: CGFloat
    private let halo = CAGradientLayer()
    private let orbit = CAShapeLayer()
    private let ring = CAShapeLayer()
    private let ticks: [CAShapeLayer] = [CAShapeLayer(), CAShapeLayer(), CAShapeLayer()]
    private let moon = CAShapeLayer()
    private let minuteHand = CALayer()
    private let hourHand = CALayer()
    private let pivot = CAShapeLayer()
    private let pivotDot = CAShapeLayer()

    /// SVG `rotate(60)` and `rotate(305)`. Screen-clockwise in both SVG and Core Animation.
    private static let minuteAngle = CGFloat(60) * .pi / 180
    private static let hourAngle = CGFloat(-55) * .pi / 180

    /// - Parameter size: rendered mark diameter in points (the Dock uses 5.25rem = 84).
    init(size: CGFloat) {
        unit = size / 128
        super.init(frame: CGRect(x: 0, y: 0, width: size, height: size))
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: size),
            heightAnchor.constraint(equalToConstant: size),
        ])
        buildLayers(size: size)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("CircadiaMarkView is code-only")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let size = bounds.width
        let center = CGPoint(x: size / 2, y: size / 2)
        let haloInset = 38.4 * (size / 84)
        halo.frame = bounds.insetBy(dx: -haloInset, dy: -haloInset)
        let orbitInset = 13.6 * (size / 84)
        orbit.frame = bounds.insetBy(dx: -orbitInset, dy: -orbitInset)
        orbit.path = UIBezierPath(ovalIn: orbit.bounds.insetBy(dx: 0.5, dy: 0.5)).cgPath
        // Transformed layers: bounds + position, never frame.
        ring.bounds = bounds
        ring.position = center
        for tick in ticks {
            tick.bounds = bounds
            tick.position = center
        }
        moon.position = CGPoint(x: center.x, y: 24.5 * unit)
        minuteHand.position = center
        hourHand.position = center
        pivot.position = center
        pivotDot.position = center
    }

    // MARK: - Geometry

    private func buildLayers(size: CGFloat) {
        let u = unit

        halo.type = .radial
        halo.colors = [
            UIColor(red: 167 / 255.0, green: 139 / 255.0, blue: 250 / 255.0, alpha: 0.28).cgColor,
            UIColor(red: 167 / 255.0, green: 139 / 255.0, blue: 250 / 255.0, alpha: 0).cgColor,
        ]
        halo.locations = [0, 0.72]
        halo.startPoint = CGPoint(x: 0.5, y: 0.5)
        halo.endPoint = CGPoint(x: 1, y: 1)
        layer.addSublayer(halo)

        orbit.fillColor = UIColor.clear.cgColor
        orbit.strokeColor = UIColor(red: 196 / 255.0, green: 181 / 255.0, blue: 253 / 255.0, alpha: 0.22).cgColor
        orbit.lineWidth = 1
        layer.addSublayer(orbit)

        // Ring r=46. Start the stroke at 12, not 3.
        let ringRect = CGRect(x: size / 2 - 46 * u, y: size / 2 - 46 * u, width: 92 * u, height: 92 * u)
        ring.path = UIBezierPath(ovalIn: ringRect).cgPath
        ring.fillColor = UIColor.clear.cgColor
        ring.strokeColor = UIColor(red: 125 / 255.0, green: 211 / 255.0, blue: 252 / 255.0, alpha: 0.42).cgColor
        ring.lineWidth = 1.5 * u
        ring.lineCap = .round
        ring.setAffineTransform(CGAffineTransform(rotationAngle: -.pi / 2))
        layer.addSublayer(ring)

        // Ticks at 3, 6, 9 — from r=40 to r=34.
        let tickAngles: [CGFloat] = [90, 180, 270]
        for (tick, degrees) in zip(ticks, tickAngles) {
            let path = UIBezierPath()
            path.move(to: CGPoint(x: size / 2, y: size / 2 - 40 * u))
            path.addLine(to: CGPoint(x: size / 2, y: size / 2 - 34 * u))
            tick.path = path.cgPath
            tick.strokeColor = UIColor(red: 228 / 255.0, green: 228 / 255.0, blue: 231 / 255.0, alpha: 0.7).cgColor
            tick.lineWidth = 1.5 * u
            tick.lineCap = .round
            tick.fillColor = UIColor.clear.cgColor
            tick.setAffineTransform(CGAffineTransform(rotationAngle: degrees * .pi / 180))
            layer.addSublayer(tick)
        }

        // Crescent at translate(64 22). Outer disc minus an offset disc.
        let moonBox = CGRect(x: 0, y: 0, width: 14 * u, height: 14 * u)
        let crescent = UIBezierPath(ovalIn: CGRect(x: 0.4 * u, y: 1.2 * u, width: 12.6 * u, height: 12.6 * u))
        crescent.append(UIBezierPath(ovalIn: CGRect(x: 3.6 * u, y: -0.6 * u, width: 11.4 * u, height: 11.4 * u)))
        crescent.usesEvenOddFillRule = true
        moon.bounds = moonBox
        moon.path = crescent.cgPath
        moon.fillRule = .evenOdd
        moon.fillColor = UIColor(red: 196 / 255.0, green: 181 / 255.0, blue: 253 / 255.0, alpha: 1).cgColor
        layer.addSublayer(moon)

        // Minute hand: x -1.1..1.1, y -32..3. Pivot sits 32/35 down the bar.
        minuteHand.bounds = CGRect(x: 0, y: 0, width: 2.2 * u, height: 35 * u)
        minuteHand.anchorPoint = CGPoint(x: 0.5, y: 32.0 / 35.0)
        minuteHand.cornerRadius = 1.1 * u
        minuteHand.backgroundColor = UIColor(red: 228 / 255.0, green: 228 / 255.0, blue: 231 / 255.0, alpha: 1).cgColor
        layer.addSublayer(minuteHand)

        // Hour hand: x -1.5..1.5, y -23..3.
        hourHand.bounds = CGRect(x: 0, y: 0, width: 3 * u, height: 26 * u)
        hourHand.anchorPoint = CGPoint(x: 0.5, y: 23.0 / 26.0)
        hourHand.cornerRadius = 1.5 * u
        hourHand.backgroundColor = UIColor(red: 196 / 255.0, green: 181 / 255.0, blue: 253 / 255.0, alpha: 1).cgColor
        layer.addSublayer(hourHand)

        pivot.bounds = CGRect(x: 0, y: 0, width: 6.8 * u, height: 6.8 * u)
        pivot.path = UIBezierPath(ovalIn: pivot.bounds).cgPath
        pivot.fillColor = UIColor(red: 125 / 255.0, green: 211 / 255.0, blue: 252 / 255.0, alpha: 1).cgColor
        layer.addSublayer(pivot)

        pivotDot.bounds = CGRect(x: 0, y: 0, width: 2.4 * u, height: 2.4 * u)
        pivotDot.path = UIBezierPath(ovalIn: pivotDot.bounds).cgPath
        pivotDot.fillColor = UIColor(red: 7 / 255.0, green: 6 / 255.0, blue: 15 / 255.0, alpha: 1).cgColor
        layer.addSublayer(pivotDot)

        settleModel()
    }

    /// Model values are always the finished mark. Animations only describe the way in,
    /// so a backgrounded app (which drops in-flight animations) still lands on the right frame.
    private func settleModel() {
        halo.opacity = 1
        orbit.opacity = 1
        ring.strokeStart = 0
        ring.strokeEnd = 1
        for tick in ticks { tick.opacity = 1 }
        moon.opacity = 1
        minuteHand.opacity = 1
        hourHand.opacity = 1
        pivot.opacity = 1
        pivotDot.opacity = 1
        minuteHand.setAffineTransform(CGAffineTransform(rotationAngle: Self.minuteAngle))
        hourHand.setAffineTransform(CGAffineTransform(rotationAngle: Self.hourAngle))
        pivot.transform = CATransform3DIdentity
        pivotDot.transform = CATransform3DIdentity
    }

    // MARK: - Choreography

    /// Finished mark, no motion.
    func settle() {
        layer.removeAllAnimations()
        for sub in layer.sublayers ?? [] { sub.removeAllAnimations() }
        settleModel()
    }

    /// Draw the mark. Total length is `playDuration`.
    func play() {
        settle()
        let now = CACurrentMediaTime()
        let easeOut = CAMediaTimingFunction(name: .easeOut)
        let easeInOut = CAMediaTimingFunction(name: .easeInEaseOut)
        let softOut = CAMediaTimingFunction(controlPoints: 0.22, 1, 0.36, 1)

        // 0.0–1.4  ring strokes in from 12. Slow enough to watch it travel.
        ring.add(basic("strokeEnd", from: 0, to: 1, at: now, duration: 1.4, timing: easeInOut), forKey: "draw")
        orbit.add(basic("opacity", from: 0, to: 1, at: now + 0.2, duration: 1.2, timing: easeOut), forKey: "in")

        // 0.6–1.5  pivot lands.
        pivot.add(basic("opacity", from: 0, to: 1, at: now + 0.6, duration: 0.4, timing: easeOut), forKey: "in")
        pivot.add(basic("transform.scale", from: 0.2, to: 1, at: now + 0.6, duration: 0.9, timing: softOut), forKey: "pop")
        pivotDot.add(basic("opacity", from: 0, to: 1, at: now + 0.9, duration: 0.4, timing: easeOut), forKey: "in")

        // 0.9–1.7  ticks blink in, 3 → 6 → 9.
        for (i, tick) in ticks.enumerated() {
            tick.add(basic("opacity", from: 0, to: 1, at: now + 0.9 + Double(i) * 0.2, duration: 0.4, timing: easeOut), forKey: "in")
        }

        // 0.8–2.6  hands sweep from 12 and settle with a small overshoot.
        minuteHand.add(basic("opacity", from: 0, to: 1, at: now + 0.8, duration: 0.35, timing: easeOut), forKey: "in")
        hourHand.add(basic("opacity", from: 0, to: 1, at: now + 0.8, duration: 0.35, timing: easeOut), forKey: "in")
        minuteHand.add(
            sweep(to: Self.minuteAngle, overshoot: 6 * .pi / 180, at: now + 0.8, duration: 1.8),
            forKey: "sweep"
        )
        hourHand.add(
            sweep(to: Self.hourAngle, overshoot: -4 * .pi / 180, at: now + 0.8, duration: 1.7),
            forKey: "sweep"
        )

        // 1.7–2.5  moon rises into place.
        moon.add(basic("opacity", from: 0, to: 1, at: now + 1.7, duration: 0.8, timing: easeOut), forKey: "in")
        moon.add(basic("transform.translation.y", from: 3 * unit, to: 0, at: now + 1.7, duration: 0.9, timing: softOut), forKey: "rise")

        // 1.9–3.1  halo breathes in once.
        halo.add(basic("opacity", from: 0, to: 1, at: now + 1.9, duration: 1.2, timing: easeOut), forKey: "in")
        let breath = CAKeyframeAnimation(keyPath: "transform.scale")
        breath.values = [0.94, 1.03, 1.0]
        breath.keyTimes = [0, 0.6, 1]
        breath.timingFunctions = [easeOut, easeInOut]
        breath.beginTime = now + 1.9
        breath.duration = 1.2
        breath.fillMode = .backwards
        halo.add(breath, forKey: "breathe")
    }

    private func basic(
        _ keyPath: String,
        from: CGFloat,
        to: CGFloat,
        at beginTime: CFTimeInterval,
        duration: CFTimeInterval,
        timing: CAMediaTimingFunction
    ) -> CABasicAnimation {
        let anim = CABasicAnimation(keyPath: keyPath)
        anim.fromValue = from
        anim.toValue = to
        anim.beginTime = beginTime
        anim.duration = duration
        anim.timingFunction = timing
        anim.fillMode = .backwards
        return anim
    }

    private func sweep(to angle: CGFloat, overshoot: CGFloat, at beginTime: CFTimeInterval, duration: CFTimeInterval) -> CAKeyframeAnimation {
        let anim = CAKeyframeAnimation(keyPath: "transform.rotation.z")
        anim.values = [0, angle + overshoot, angle]
        anim.keyTimes = [0, 0.78, 1]
        anim.timingFunctions = [
            CAMediaTimingFunction(controlPoints: 0.2, 0.8, 0.3, 1),
            CAMediaTimingFunction(name: .easeInEaseOut),
        ]
        anim.beginTime = beginTime
        anim.duration = duration
        anim.fillMode = .backwards
        return anim
    }
}
