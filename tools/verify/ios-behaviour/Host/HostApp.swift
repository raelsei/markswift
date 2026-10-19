import SwiftUI
import UIKit

@main
struct HostApp: App {
    init() { BehaviourRegistry.registerFonts() }
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.environment["MARKSWIFT_MENU_PRESS"] == "1" { MenuPressProbe() }
            else if ProcessInfo.processInfo.environment["MARKSWIFT_POINTER_PROBE"] == "1" { PointerProbe() }
            else if ProcessInfo.processInfo.environment["MARKSWIFT_GREEDY_PROBE"] == "1" { GreedyProbe() }
            else if ProcessInfo.processInfo.environment["MARKSWIFT_TABLE_PROBE"] == "1" { TableProbe() }
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

/// A real Menu uses the same styles as emitted triggers; sample its rendered pressed label, not a forced state.
struct MenuPressProbe: View {
    @State private var pressed = false
    @State private var frame = CGRect.zero
    @State private var result = "waiting"
    var body: some View {
        VStack {
            Menu { Button("Probe action") {} } label: {
                Text("Press probe").foregroundStyle(.white).frame(width: 180, height: 64)
                    .background(pressed ? Color.red : Color.blue)
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame = $0 }
            }
            .menuStyle(.button)
            .buttonStyle(MarkswiftPressStyle(isPressed: $pressed))
            .accessibilityIdentifier("markswift.menu-press")
            Text(result).accessibilityIdentifier("markswift.menu-press-result")
        }
        .onChange(of: pressed) { _, down in
            guard down else { return }
            // Let the state update reach a display frame while the UI test holds the finger down.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                guard pressed, let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let window = scene.windows.first(where: \.isKeyWindow) else { return }
                let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in
                    window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
                }
                guard let cg = image.cgImage else { result = "no pixels"; return }
                let point = CGPoint(x: (frame.minX + 20) * image.scale, y: frame.midY * image.scale)
                guard let pixel = cg.cropping(to: CGRect(origin: point, size: CGSize(width: 1, height: 1))) else {
                    result = "no label frame"; return
                }
                var rgba = [UInt8](repeating: 0, count: 4)
                let red = rgba.withUnsafeMutableBytes { bytes -> Bool in
                    guard let context = CGContext(data: bytes.baseAddress, width: 1, height: 1,
                        bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
                    context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
                    return bytes[0] > 200 && bytes[1] < 100 && bytes[2] < 100
                }
                result = red ? "pressed frame is red" : "pressed frame is not red: \(rgba), \(frame)"
                if let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                    try? image.pngData()?.write(to: dir.appendingPathComponent("menu-pressed.png"))
                }
            }
        }
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

private struct GreedyProbe: View {
    @ScaledMetric(relativeTo: .subheadline) private var size: CGFloat = 14
    @State private var narrow = false
    @State private var height: CGFloat = 0
    var body: some View {
        VStack {
            MarkswiftGreedyText(text: "Deploys, failures and mentions.", font: .system(size: size), color: .primary,
                size: 14, style: .subheadline, lineHeight: 20, ascent: 1, descent: 0.286, natural: 2444.0 / 2048)
                .frame(width: narrow ? 100 : 240)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            Button("Resize") { narrow.toggle() }
            Text(String(Double(height))).accessibilityIdentifier("greedy-height")
        }
    }
}

private struct TableProbe: View {
    @State private var taps = 0
    @State private var enabled = false
    @State private var value = ""
    @State private var narrow = false
    @State private var report = "pending"
    var body: some View {
        VStack {
            MarkswiftAccessibleTable(rows: 3, columns: 2) {
                MarkswiftTable(widths: [150, 150], heights: [30, 50, 50]) {
                    MarkswiftAccessibleCell(id: "name", row: 1, column: 1, header: "column") { Text("Name").frame(maxWidth: .infinity, minHeight: 30, maxHeight: .infinity) }
                        .markswiftGridCell(column: 1, row: 1)
                    MarkswiftAccessibleCell(id: "status", row: 1, column: 2, header: "column") { Text("Status").frame(maxWidth: .infinity, minHeight: 30, maxHeight: .infinity) }
                        .markswiftGridCell(column: 2, row: 1)
                    MarkswiftAccessibleCell(id: "action", row: 2, column: 1) { Button("Count") { taps += 1 } }
                        .markswiftGridCell(column: 1, row: 2)
                    MarkswiftAccessibleCell(id: "toggle", row: 2, column: 2) { Toggle("Enabled", isOn: $enabled) }
                        .markswiftGridCell(column: 2, row: 2)
                    MarkswiftAccessibleCell(id: "field", row: 3, column: 1, columnSpan: 2) {
                        TextField("Edit", text: $value)
                    }.markswiftGridCell(column: 1, row: 3, columnSpan: 2)
                }
            }.frame(width: narrow ? 240 : 320)
            Button("Resize") { narrow.toggle() }
            Button("Inspect") { report = inspectTable() }
            Text(report).accessibilityIdentifier("table-report")
            Text("taps=\(taps) enabled=\(enabled) value=\(value)").accessibilityIdentifier("table-values")
        }
    }
}

@MainActor
private func inspectTable() -> String {
    func all(_ v: UIView) -> [UIView] { [v] + v.subviews.flatMap(all) }
    let views = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }.flatMap(all)
    guard let table = views.first(where: { $0 is any UIAccessibilityContainerDataTable }) as? (UIView & UIAccessibilityContainerDataTable),
          table.accessibilityRowCount() == 3, table.accessibilityColumnCount() == 2,
          let first = table.accessibilityDataTableCellElement(forRow: 2, column: 0),
          let second = table.accessibilityDataTableCellElement(forRow: 2, column: 1),
          (first as AnyObject) === (second as AnyObject),
          first.accessibilityRowRange() == NSRange(location: 2, length: 1),
          first.accessibilityColumnRange() == NSRange(location: 0, length: 2),
          table.accessibilityHeaderElements?(forColumn: 0)?.count == 1,
          table.accessibilityHeaderElements?(forColumn: 1)?.count == 1,
          table.bounds.height > 60, table.bounds.height < 300
    else {
        let table = views.first(where: { $0 is any UIAccessibilityContainerDataTable })
        let cells = views.filter { $0 is any UIAccessibilityContainerDataTableCell }
        return "invalid table views=\(views.count) table=\(String(describing: table?.bounds)) cells=\(cells.count) registered=\(table?.accessibilityElements?.count ?? -1)"
    }
    return "rows=3 columns=2 span=2 headers=2"
}
