import SwiftUI

@main
struct HostApp: App {
    init() { BehaviourRegistry.registerFonts() }
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.environment["MARKSWIFT_TABLE_PROBE"] == "1" { TableProbe() }
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
