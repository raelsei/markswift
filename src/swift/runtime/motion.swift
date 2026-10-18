/// CSS `steps()` jump positions.
nonisolated enum MarkswiftStepPosition: Sendable, Hashable { case start, end, none, both }

/// A CSS easing function evaluated exactly: cubic-bezier (and its keywords), steps(), linear() points.
nonisolated enum MarkswiftEase: Sendable, Hashable {
    case bezier(Double, Double, Double, Double)
    case steps(Int, MarkswiftStepPosition)
    /// linear(): output values at input positions (0…1, ascending).
    case points([Double], [Double])

    func callAsFunction(_ u: Double) -> Double {
        switch self {
        case let .bezier(x1, y1, x2, y2):
            return UnitCurve.bezier(startControlPoint: UnitPoint(x: x1, y: y1), endControlPoint: UnitPoint(x: x2, y: y2)).value(at: u)
        case let .steps(n, position):
            if u >= 1 { return 1 }
            let (jumps, lead): (Double, Double) = switch position {
                case .start: (Double(n), 1)
                case .end: (Double(n), 0)
                case .none: (Double(n - 1), 0)
                case .both: (Double(n + 1), 1)
            }
            return min((u * Double(n)).rounded(.down) + lead, jumps) / jumps
        case let .points(outputs, inputs):
            guard let i = inputs.indices.dropFirst().first(where: { inputs[$0] >= u }) else { return outputs.last ?? u }
            let span = inputs[i] - inputs[i - 1]
            return span == 0 ? outputs[i] : outputs[i - 1] + (outputs[i] - outputs[i - 1]) * (u - inputs[i - 1]) / span
        }
    }
}

/// CSS animation timing (web-animations-1 §4): delay, iterations, direction, fill. Times in seconds.
nonisolated struct MarkswiftTiming: Sendable {
    nonisolated enum Direction: Sendable { case normal, reverse, alternate, alternateReverse }
    var duration: Double
    var delay = 0.0
    var iterations = 1.0                      // .infinity = infinite
    var direction = Direction.normal
    var fillBackwards = false
    var fillForwards = false

    /// Iteration progress at `t` seconds since the animation started, nil when no keyframe applies.
    /// `t = .infinity`: finite animations at their fill-forwards end, infinite ones off.
    func progress(at t: Double) -> Double? {
        let active = t - delay, end = duration * iterations
        if active < 0 { return fillBackwards ? directed(0, 0) : nil }
        if active >= end {
            guard fillForwards, end.isFinite else { return nil }
            let whole = iterations.rounded(.down)
            return iterations == whole ? directed(1, max(whole - 1, 0)) : directed(iterations - whole, whole)
        }
        let i = (active / duration).rounded(.down)
        return directed(active / duration - i, i)
    }

    var end: Double { delay + duration * iterations }

    private func directed(_ p: Double, _ iteration: Double) -> Double {
        let odd = iteration.truncatingRemainder(dividingBy: 2) == 1
        switch direction {
        case .normal: return p
        case .reverse: return 1 - p
        case .alternate: return odd ? 1 - p : p
        case .alternateReverse: return odd ? p : 1 - p
        }
    }
}

/// One keyframe interval of a channel: value `to` reached at iteration offset `until`, eased by the interval's own function.
nonisolated struct MarkswiftSegment: Sendable {
    let to: Double, until: Double, ease: MarkswiftEase
    init(_ to: Double, _ until: Double, _ ease: MarkswiftEase) { (self.to, self.until, self.ease) = (to, until, ease) }
}

nonisolated struct MarkswiftMotionTrack: Sendable {
    let from: Double, segments: [MarkswiftSegment]
    init(_ from: Double, _ segments: [MarkswiftSegment]) { (self.from, self.segments) = (from, segments) }

    func value(at p: Double) -> Double {
        var start = 0.0, value = from
        for s in segments {
            if p < s.until, s.until > start { return value + (s.to - value) * s.ease((p - start) / (s.until - start)) }
            (start, value) = (s.until, s.to)
        }
        return value
    }
}

nonisolated struct MarkswiftMotionValue: Sendable, Equatable {
    var opacity = 1.0, x = 0.0, y = 0.0, scaleX = 1.0, scaleY = 1.0, degrees = 0.0
}

/// One CSS animation: its timing and the channels it drives (CSS composite replace).
nonisolated struct MarkswiftMotion: Sendable {
    var timing: MarkswiftTiming
    var opacity: MarkswiftMotionTrack? = nil, x: MarkswiftMotionTrack? = nil, y: MarkswiftMotionTrack? = nil
    var scaleX: MarkswiftMotionTrack? = nil, scaleY: MarkswiftMotionTrack? = nil, degrees: MarkswiftMotionTrack? = nil
    init(_ timing: MarkswiftTiming, opacity: MarkswiftMotionTrack? = nil, x: MarkswiftMotionTrack? = nil, y: MarkswiftMotionTrack? = nil,
         scaleX: MarkswiftMotionTrack? = nil, scaleY: MarkswiftMotionTrack? = nil, degrees: MarkswiftMotionTrack? = nil) {
        (self.timing, self.opacity, self.x, self.y, self.scaleX, self.scaleY, self.degrees) = (timing, opacity, x, y, scaleX, scaleY, degrees)
    }

    func apply(at t: Double, to v: inout MarkswiftMotionValue) {
        guard let p = timing.progress(at: t) else { return }
        if let opacity { v.opacity = opacity.value(at: p) }
        if let x { v.x = x.value(at: p) }
        if let y { v.y = y.value(at: p) }
        if let scaleX { v.scaleX = scaleX.value(at: p) }
        if let scaleY { v.scaleY = scaleY.value(at: p) }
        if let degrees { v.degrees = degrees.value(at: p) }
    }
}

extension EnvironmentValues {
    /// Render harnesses: seconds since appearance for every animation (`.infinity` = the settled look capture uses); nil = live.
    @Entry var markswiftMotionTime: Double? = nil
}

/// CSS `@keyframes` on one view. Live: a TimelineView clock from first appearance (stopped when every finite animation
/// ended); harness: the frame at `markswiftMotionTime`; Reduce Motion: `reduced` (nil = same; empty = the base look).
struct MarkswiftAnimation: ViewModifier {
    let motions: [MarkswiftMotion]
    var reduced: [MarkswiftMotion]? = nil
    /// The settled look (capture's computed values of the driven channels).
    var base = MarkswiftMotionValue()
    var anchor = UnitPoint.center
    @Environment(\.markswiftMotionTime) private var time
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.markswiftForcedStates) private var forced
    @State private var start = Date.now
    @State private var finished = false

    func body(content: Content) -> some View {
        let active = systemReduce || forced.contains(.reduceMotion) ? reduced ?? motions : motions
        let end = active.map(\.timing.end).max() ?? 0
        if let time {
            frame(content, active, time)
        } else if active.isEmpty || finished {
            frame(content, active, .infinity)
        } else {
            TimelineView(.animation) { context in frame(content, active, context.date.timeIntervalSince(start)) }
                .task(id: end) {
                    guard end.isFinite else { return }
                    try? await Task.sleep(for: .seconds(max(0, end - Date.now.timeIntervalSince(start))))
                    finished = true
                }
        }
    }

    private func frame(_ content: Content, _ motions: [MarkswiftMotion], _ t: Double) -> some View {
        var v = base
        // `.infinity` is the settled look: the captured values exactly, not a recomputed end keyframe.
        if t.isFinite { for m in motions { m.apply(at: t, to: &v) } }
        return content.modifier(MarkswiftMotionFrame(value: v, anchor: anchor))
    }
}

/// Opacity, scale, rotation and offset of one motion frame (CSS `translate · rotate · scale` order).
struct MarkswiftMotionFrame: ViewModifier {
    var value = MarkswiftMotionValue()
    var anchor = UnitPoint.center
    func body(content: Content) -> some View {
        content
            .opacity(value.opacity)
            .scaleEffect(x: value.scaleX, y: value.scaleY, anchor: anchor)
            .rotationEffect(.degrees(value.degrees), anchor: anchor)
            .offset(x: value.x, y: value.y)
    }
}

/// An overlay root's exit frame inside its removal transition; under Reduce Motion (system or harness-forced) the
/// opacity-only `reduced` frame.
struct MarkswiftExitFrame: ViewModifier {
    var value = MarkswiftMotionValue()
    var reduced = MarkswiftMotionValue()
    var anchor = UnitPoint.center
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.markswiftForcedStates) private var forced
    func body(content: Content) -> some View {
        content.modifier(MarkswiftMotionFrame(value: systemReduce || forced.contains(.reduceMotion) ? reduced : value, anchor: anchor))
    }
}

/// Lays its content out at `fraction` of its height, top-aligned: CSS `height` 0 ↔ auto as a layout change.
struct MarkswiftRevealLayout: Layout {
    var fraction: Double
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let size = subviews.first?.sizeThatFits(proposal) ?? .zero
        return CGSize(width: size.width, height: size.height * fraction)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: nil))
    }
}

/// Disclosure content's insertion/removal: the revealed fraction animates, clipped while partial. `nonisolated`: the
/// `Animatable` conformance must not cross into main-actor code (Swift 6 without MainActor default isolation).
nonisolated struct MarkswiftReveal: ViewModifier, Animatable {
    var fraction: Double
    var animatableData: Double { get { fraction } set { fraction = newValue } }
    func body(content: Content) -> some View {
        if fraction < 1 { MarkswiftRevealLayout(fraction: fraction) { content }.clipped() } else { content }
    }
}

/// CSS steps()/linear() timing for a SwiftUI transition (cubic-bezier uses `Animation.timingCurve`).
nonisolated struct MarkswiftEasing: CustomAnimation {
    let duration: Double
    let ease: MarkswiftEase
    func animate<V: VectorArithmetic>(value: V, time: TimeInterval, context: inout AnimationContext<V>) -> V? {
        time < duration ? value.scaled(by: ease(time / duration)) : nil
    }
}

/// A pressed/focused look's CSS transition: the new state's timing (CSS uses the new style's transition); under
/// Reduce Motion (system or harness-forced) the reduced pair, which the converter already resolved.
struct MarkswiftStateAnimation: ViewModifier {
    let isOn: Bool
    let into: Animation?, back: Animation?, reducedInto: Animation?, reducedBack: Animation?
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.markswiftForcedStates) private var forced

    func body(content: Content) -> some View {
        let reduce = systemReduce || forced.contains(.reduceMotion)
        content.animation(isOn ? (reduce ? reducedInto : into) : (reduce ? reducedBack : back), value: isOn)
    }
}
