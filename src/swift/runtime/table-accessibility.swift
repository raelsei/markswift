#if os(iOS)
import UIKit

@MainActor
private final class MarkswiftWeakTableCell {
    weak var value: MarkswiftDataCellView?
    init(_ value: MarkswiftDataCellView) { self.value = value }
}
@MainActor
private final class MarkswiftTableRegistry {
    weak var table: MarkswiftDataTableView?
    var cells: [String: MarkswiftWeakTableCell] = [:]
    var ordered: [MarkswiftDataCellView] {
        cells.values.compactMap(\.value).sorted { ($0.row, $0.column, $0.id) < ($1.row, $1.column, $1.id) }
    }
}
private struct MarkswiftTableRegistryKey: EnvironmentKey {
    static let defaultValue: MarkswiftTableRegistry? = nil
}
private extension EnvironmentValues {
    var markswiftTableRegistry: MarkswiftTableRegistry? {
        get { self[MarkswiftTableRegistryKey.self] }
        set { self[MarkswiftTableRegistryKey.self] = newValue }
    }
}

/// The table and cell containers expose UIKit's two-dimensional table protocol; their hosting
/// controllers retain SwiftUI's native text fields, buttons, values and activation actions.
private final class MarkswiftDataTableView: UIView, UIAccessibilityContainerDataTable {
    let registry: MarkswiftTableRegistry
    var rows: Int
    var columns: Int
    init(registry: MarkswiftTableRegistry, rows: Int, columns: Int) {
        self.registry = registry; self.rows = rows; self.columns = columns
        super.init(frame: .zero)
        registry.table = self
        backgroundColor = .clear
        isAccessibilityElement = false
        accessibilityContainerType = .dataTable
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override var accessibilityElements: [Any]? {
        get { registry.ordered }
        set {}
    }
    func accessibilityRowCount() -> Int { rows }
    func accessibilityColumnCount() -> Int { columns }
    func accessibilityDataTableCellElement(forRow row: Int, column: Int) -> (any UIAccessibilityContainerDataTableCell)? {
        registry.ordered.first { NSLocationInRange(row, $0.accessibilityRowRange()) && NSLocationInRange(column, $0.accessibilityColumnRange()) }
    }
    func accessibilityHeaderElements(forRow row: Int) -> [any UIAccessibilityContainerDataTableCell]? {
        registry.ordered.filter { $0.header == "row" && ($0.headerRows.isEmpty ? NSLocationInRange(row, $0.accessibilityRowRange()) : $0.headerRows.contains(row + 1)) }
    }
    func accessibilityHeaderElements(forColumn column: Int) -> [any UIAccessibilityContainerDataTableCell]? {
        registry.ordered.filter { $0.header == "column" && NSLocationInRange(column, $0.accessibilityColumnRange()) }
    }
}
private final class MarkswiftDataCellView: UIView, UIAccessibilityContainerDataTableCell {
    var id: String
    var row: Int
    var column: Int
    var rowSpan: Int
    var columnSpan: Int
    var header: String
    var headerRows: [Int] = []
    init(id: String, row: Int, column: Int, rowSpan: Int, columnSpan: Int, header: String) {
        self.id = id; self.row = row; self.column = column
        self.rowSpan = rowSpan; self.columnSpan = columnSpan; self.header = header
        super.init(frame: .zero)
        backgroundColor = .clear
        isAccessibilityElement = false
        accessibilityContainerType = .semanticGroup
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    func accessibilityRowRange() -> NSRange { NSRange(location: row - 1, length: rowSpan) }
    func accessibilityColumnRange() -> NSRange { NSRange(location: column - 1, length: columnSpan) }
}

/// SwiftUI snaps a platform view's frame to the device pixel grid, while unhosted SwiftUI content keeps fractional
/// points. A host places its content back at the frame SwiftUI asked for, so a hosted table draws like an unhosted one.
@MainActor
private final class MarkswiftPixelCorrection: ObservableObject {
    @Published var offset = CGSize.zero
    @Published var size: CGSize?
}
/// Measures as its content does; places it at `offset` with the requested `size`.
private struct MarkswiftPixelCorrected: Layout {
    let offset: CGSize
    let size: CGSize?
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        subviews.first?.sizeThatFits(proposal) ?? .zero
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: CGPoint(x: bounds.minX + offset.width, y: bounds.minY + offset.height),
                              anchor: .topLeading, proposal: ProposedViewSize(size ?? bounds.size))
    }
}
private struct MarkswiftCorrectedRoot: View {
    @ObservedObject var correction: MarkswiftPixelCorrection
    let content: AnyView
    var body: some View { MarkswiftPixelCorrected(offset: correction.offset, size: correction.size) { content } }
}

private final class MarkswiftTableHost: UIViewController {
    let hosting: UIHostingController<MarkswiftCorrectedRoot>
    let container: UIView
    let correction: MarkswiftPixelCorrection
    /// The frame SwiftUI laid the representable out at, in its global space.
    var requested: CGRect? { didSet { if requested != oldValue { view.setNeedsLayout() } } }
    init(container: UIView, content: AnyView) {
        self.container = container
        let correction = MarkswiftPixelCorrection()
        self.correction = correction
        hosting = UIHostingController(rootView: MarkswiftCorrectedRoot(correction: correction, content: content))
        // A nested host is placed by SwiftUI; insetting its content by the window's safe area shifted every cell under
        // the status bar or a navigation bar.
        hosting.safeAreaRegions = []
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    func update(_ content: AnyView) { hosting.rootView = MarkswiftCorrectedRoot(correction: correction, content: content) }
    override func loadView() {
        view = container
        addChild(hosting)
        hosting.view.backgroundColor = .clear
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hosting.view)
        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        hosting.didMove(toParent: self)
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let requested, let window = view.window else { return }
        let scale = window.screen.scale
        let actual = view.convert(view.bounds, to: nil)
        // SwiftUI's global space and the window differ by whole pixels at most; the remainder is the snapping.
        func residue(_ d: CGFloat) -> CGFloat { d - (d * scale).rounded() / scale }
        let offset = CGSize(width: residue(requested.minX - actual.minX), height: residue(requested.minY - actual.minY))
        if correction.offset != offset { correction.offset = offset }
        if correction.size != requested.size { correction.size = requested.size }
    }
    func measure(_ proposal: ProposedViewSize) -> CGSize {
        // An unspecified width asks for the ideal size: `.infinity` (as SwiftUI proposes it), not UIKit's large finite
        // expanded size, which an auto-layout table would fill.
        hosting.sizeThatFits(in: CGSize(width: proposal.width ?? .infinity,
                                        height: proposal.height ?? UIView.layoutFittingCompressedSize.height))
    }
}

private struct MarkswiftNativeTable<Content: View>: UIViewControllerRepresentable {
    let rows: Int
    let columns: Int
    let content: Content
    let requested: CGRect?
    func makeCoordinator() -> MarkswiftTableRegistry { MarkswiftTableRegistry() }
    func makeUIViewController(context: Context) -> MarkswiftTableHost {
        MarkswiftTableHost(container: MarkswiftDataTableView(registry: context.coordinator, rows: rows, columns: columns),
                           content: hosted(context))
    }
    private func hosted(_ context: Context) -> AnyView {
        AnyView(content.environment(\.markswiftTableRegistry, context.coordinator).environment(\.self, context.environment))
    }
    func updateUIViewController(_ controller: MarkswiftTableHost, context: Context) {
        if let table = controller.container as? MarkswiftDataTableView { table.rows = rows; table.columns = columns }
        controller.update(hosted(context))
        controller.requested = requested
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiViewController: MarkswiftTableHost, context: Context) -> CGSize? {
        uiViewController.measure(proposal)
    }
}
private struct MarkswiftNativeCell<Content: View>: UIViewControllerRepresentable {
    let id: String
    let row: Int
    let column: Int
    let rowSpan: Int
    let columnSpan: Int
    let header: String
    let headerRows: [Int]
    let content: Content
    let registry: MarkswiftTableRegistry?
    let requested: CGRect?
    final class Coordinator {
        weak var registry: MarkswiftTableRegistry?
        var id = ""
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIViewController(context: Context) -> MarkswiftTableHost {
        let cell = MarkswiftDataCellView(id: id, row: row, column: column, rowSpan: rowSpan, columnSpan: columnSpan, header: header)
        return MarkswiftTableHost(container: cell, content: AnyView(content.environment(\.self, context.environment)))
    }
    func updateUIViewController(_ controller: MarkswiftTableHost, context: Context) {
        guard let cell = controller.container as? MarkswiftDataCellView else { return }
        if context.coordinator.id != id || context.coordinator.registry !== registry { context.coordinator.registry?.cells.removeValue(forKey: context.coordinator.id) }
        context.coordinator.id = id; context.coordinator.registry = registry
        cell.id = id; cell.row = row; cell.column = column; cell.rowSpan = rowSpan; cell.columnSpan = columnSpan; cell.header = header
        cell.headerRows = headerRows
        registry?.cells[id] = MarkswiftWeakTableCell(cell)
        controller.update(AnyView(content.environment(\.self, context.environment)))
        controller.requested = requested
    }
    static func dismantleUIViewController(_ controller: MarkswiftTableHost, coordinator: Coordinator) {
        if coordinator.registry?.cells[coordinator.id]?.value === controller.container { coordinator.registry?.cells.removeValue(forKey: coordinator.id) }
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiViewController: MarkswiftTableHost, context: Context) -> CGSize? {
        uiViewController.measure(proposal)
    }
}
#endif

struct MarkswiftAccessibleTable<Content: View>: View {
    let rows: Int
    let columns: Int
    @ViewBuilder let content: () -> Content
    #if os(iOS)
    @State private var requested: CGRect?
    #endif
    var body: some View {
        #if os(iOS)
        MarkswiftNativeTable(rows: rows, columns: columns, content: content(), requested: requested)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { requested = $0 }
        #else
        content()
        #endif
    }
}
struct MarkswiftAccessibleCell<Content: View>: View {
    let id: String
    let row: Int
    let column: Int
    var rowSpan: Int = 1
    var columnSpan: Int = 1
    var header: String = ""
    var headerRows: [Int] = []
    @ViewBuilder let content: () -> Content
    #if os(iOS)
    @Environment(\.markswiftTableRegistry) private var registry
    @Environment(\.displayScale) private var displayScale
    @State private var requested: CGRect?
    #endif
    var body: some View {
        #if os(iOS)
        MarkswiftNativeCell(id: id, row: row, column: column, rowSpan: rowSpan, columnSpan: columnSpan, header: header,
                            headerRows: headerRows, content: content(), registry: registry, requested: requested)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { requested = $0 }
            .layoutValue(key: MarkswiftMeasureGranularityKey.self, value: 1 / displayScale)
        #else
        content()
        #endif
    }
}
