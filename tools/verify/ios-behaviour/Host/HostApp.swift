import SwiftUI

@main
struct HostApp: App {
    init() { BehaviourRegistry.registerFonts() }
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.environment["MARKSWIFT_POINTER_PROBE"] == "1" { PointerProbe() }
            else { HostRoot() }
        }
    }
}

/// The hosted view framed at `MARKSWIFT_WIDTHS[widthIndex]` (390 when unset); with two or more widths, the
/// `markswift.width` button next to the log cycles them (a breakpoint view switching bands in place). The log's value is
/// the view's height: the `markswift.root` container's own frame is only its children's union (no root padding).
/// `MARKSWIFT_SCREEN_HEIGHT` gives a screen-filling root the height a window would (the scroll view offers none).
struct HostRoot: View {
    let env = ProcessInfo.processInfo.environment
    @State private var widthIndex = 0
    @State private var height = 0.0
    var body: some View {
        let widths = (env["MARKSWIFT_WIDTHS"] ?? "").split(separator: ",").compactMap { Double($0) }
        VStack(spacing: 0) {
            ScrollView {
                BehaviourRegistry.view(named: env["MARKSWIFT_VIEW"] ?? "")
                    .frame(width: widths.isEmpty ? 390 : widths[widthIndex], alignment: .topLeading)
                    .frame(minHeight: env["MARKSWIFT_SCREEN_HEIGHT"].flatMap { Double($0) }.map { CGFloat($0) }, alignment: .topLeading)
                    .onGeometryChange(for: Double.self) { $0.size.height } action: { height = $0 }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("markswift.root")
            }
            HStack {
                Text(BehaviourLog.shared.hits.joined(separator: ",")).font(.caption)
                    .accessibilityValue(String(height))
                    .accessibilityIdentifier("markswift.log")
                if widths.count > 1 {
                    Button("Width") { widthIndex = (widthIndex + 1) % widths.count }
                        .accessibilityIdentifier("markswift.width")
                }
            }
        }
        .environment(\.layoutDirection, env["MARKSWIFT_RTL"] == "1" ? .rightToLeft : .leftToRight)
        // Animations rest at the settled look unless a motion launch asks for the live clock.
        .environment(\.markswiftMotionTime, env["MARKSWIFT_MOTION"] == "live" ? nil : Double.infinity)
        .environment(\.markswiftForcedStates, env["MARKSWIFT_REDUCE_MOTION"] == "1" ? .reduceMotion : [])
    }
}


/// A live regression for pointer-events descendants and an aria-hidden transparent button.
private struct PointerProbe: View {
    @State private var underneath = 0
    @State private var live = 0
    @State private var hidden = 0
    @State private var narrow = false
    var body: some View {
        VStack {
            ZStack(alignment: .topTrailing) {
                Button { underneath += 1 } label: { Color.gray.frame(height: 140).contentShape(Rectangle()) }
                    .buttonStyle(.plain)
                VStack(alignment: .trailing, spacing: 0) {
                    Button { live += 1 } label: { Text("Live").frame(width: 80, height: 44).contentShape(Rectangle()) }
                        .buttonStyle(.plain).markswiftHitTarget("live")
                    Spacer(minLength: 0)
                }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .background(Color.blue.opacity(0.2))
                    .markswiftHitRegion("overlay", targets: ["live"])
            }.frame(width: narrow ? 220 : 300, height: 140).accessibilityElement(children: .contain).accessibilityIdentifier("pointer-area")
            Button("Resize") { narrow.toggle() }
            HStack {
                Button { hidden += 1 } label: {
                    Text("Hidden").frame(width: 100, height: 44).opacity(0).contentShape(Rectangle())
                }.buttonStyle(.plain).contentShape(Rectangle()).accessibilityHidden(true)
            }.frame(width: 100, height: 44).accessibilityElement(children: .ignore).accessibilityLabel("Hidden area").accessibilityIdentifier("hidden-area")
            Text("under=\(underneath) live=\(live) hidden=\(hidden)").accessibilityIdentifier("pointer-result")
        }
    }
}
