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

private final class MarkswiftTableHost<Content: View>: UIViewController {
    let hosting: UIHostingController<Content>
    let container: UIView
    init(container: UIView, content: Content) {
        self.container = container
        hosting = UIHostingController(rootView: content)
        // A nested host is placed by SwiftUI; insetting its content by the window's safe area shifted every cell under
        // the status bar or a navigation bar.
        hosting.safeAreaRegions = []
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
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
    func measure(_ proposal: ProposedViewSize) -> CGSize {
        hosting.sizeThatFits(in: CGSize(width: proposal.width ?? UIView.layoutFittingExpandedSize.width,
                                       height: proposal.height ?? UIView.layoutFittingCompressedSize.height))
    }
}

private struct MarkswiftNativeTable<Content: View>: UIViewControllerRepresentable {
    let rows: Int
    let columns: Int
    let content: Content
    func makeCoordinator() -> MarkswiftTableRegistry { MarkswiftTableRegistry() }
    func makeUIViewController(context: Context) -> MarkswiftTableHost<AnyView> {
        MarkswiftTableHost(container: MarkswiftDataTableView(registry: context.coordinator, rows: rows, columns: columns),
                           content: hosted(context))
    }
    private func hosted(_ context: Context) -> AnyView {
        AnyView(content.environment(\.markswiftTableRegistry, context.coordinator).environment(\.self, context.environment))
    }
    func updateUIViewController(_ controller: MarkswiftTableHost<AnyView>, context: Context) {
        if let table = controller.container as? MarkswiftDataTableView { table.rows = rows; table.columns = columns }
        controller.hosting.rootView = hosted(context)
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiViewController: MarkswiftTableHost<AnyView>, context: Context) -> CGSize? {
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
    final class Coordinator {
        weak var registry: MarkswiftTableRegistry?
        var id = ""
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIViewController(context: Context) -> MarkswiftTableHost<AnyView> {
        let cell = MarkswiftDataCellView(id: id, row: row, column: column, rowSpan: rowSpan, columnSpan: columnSpan, header: header)
        return MarkswiftTableHost(container: cell, content: AnyView(content.environment(\.self, context.environment)))
    }
    func updateUIViewController(_ controller: MarkswiftTableHost<AnyView>, context: Context) {
        guard let cell = controller.container as? MarkswiftDataCellView else { return }
        if context.coordinator.id != id || context.coordinator.registry !== registry { context.coordinator.registry?.cells.removeValue(forKey: context.coordinator.id) }
        context.coordinator.id = id; context.coordinator.registry = registry
        cell.id = id; cell.row = row; cell.column = column; cell.rowSpan = rowSpan; cell.columnSpan = columnSpan; cell.header = header
        cell.headerRows = headerRows
        registry?.cells[id] = MarkswiftWeakTableCell(cell)
        controller.hosting.rootView = AnyView(content.environment(\.self, context.environment))
    }
    static func dismantleUIViewController(_ controller: MarkswiftTableHost<AnyView>, coordinator: Coordinator) {
        if coordinator.registry?.cells[coordinator.id]?.value === controller.container { coordinator.registry?.cells.removeValue(forKey: coordinator.id) }
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiViewController: MarkswiftTableHost<AnyView>, context: Context) -> CGSize? {
        uiViewController.measure(proposal)
    }
}
#endif

struct MarkswiftAccessibleTable<Content: View>: View {
    let rows: Int
    let columns: Int
    @ViewBuilder let content: () -> Content
    var body: some View {
        #if os(iOS)
        MarkswiftNativeTable(rows: rows, columns: columns, content: content())
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
    #endif
    var body: some View {
        #if os(iOS)
        MarkswiftNativeCell(id: id, row: row, column: column, rowSpan: rowSpan, columnSpan: columnSpan, header: header, headerRows: headerRows, content: content(), registry: registry)
        #else
        content()
        #endif
    }
}
