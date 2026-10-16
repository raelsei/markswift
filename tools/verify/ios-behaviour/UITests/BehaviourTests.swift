import CryptoKit
import XCTest

/// Records what iOS exposes for every generated view in `cases.json`; `tools/verify/ios-behaviour.ts` judges it.
final class BehaviourTests: XCTestCase {
    struct Case: Decodable {
        struct Picker: Decodable { let current: String; let next: String }
        let view: String
        let pickers: [Picker]
        /// Every picker's options: a menu picker is a button whose value is its selection, never tapped as a plain button.
        let pickerValues: [String]
        /// Texts of the `<label>`s whose tap focuses a text field.
        let labels: [String]
        /// Labels of text fields whose focused look has a CSS transition.
        let focusLooks: [String]
        let actions: [String]
        /// In-flow layers: tapping the button labelled `trigger` shows the text `shows`; a second tap hides it.
        /// Presentations (`kind` "presentation", 060): the trigger (long-pressed when `longPress`) shows `shows`; `closers`
        /// close it; a tap at the root's normalised `outsidePoint` may; `buttons` are tapped so their actions log.
        struct Layer: Decodable {
            let id: String; let kind: String; let trigger: String; let shows: String
            let closers: [String]?; let buttons: [String]?; let longPress: Bool?; let outsidePoint: [Double]?
        }
        let layers: [Layer]
        /// `live`: some node animates; `reduced`: something still animates under Reduce Motion.
        struct Motion: Decodable { let live: Bool; let reduced: Bool }
        let motion: Motion
    }

    @MainActor
    func testBehaviour() throws {
        continueAfterFailure = true
        let dir = try XCTUnwrap(ProcessInfo.processInfo.environment["MARKSWIFT_BEHAVIOUR_DIR"], "MARKSWIFT_BEHAVIOUR_DIR is not set")
        let cases = try JSONDecoder().decode([Case].self, from: Data(contentsOf: URL(fileURLWithPath: dir).appendingPathComponent("cases.json")))
        for item in cases {
            var launches: [String: Any] = [:]
            var errors: [String] = []
            func run(_ name: String, _ body: () throws -> [String: Any]) {
                do { launches[name] = try body() } catch { errors.append("\(name): \(error)") }
            }
            run("large") {
                let app = launch(item.view, "UICTContentSizeCategoryL")
                let tree = dump(try app.snapshot())
                return [
                    "tree": tree, "audit": try audit(app), "rootHeight": rootHeight(app), "interactions": interact(app, item),
                    "layers": layers(app, item),
                ]
            }
            run("rtl") { ["tree": dump(try launch(item.view, "UICTContentSizeCategoryL", rtl: true).snapshot())] }
            run("xSmall") { ["audit": try audit(launch(item.view, "UICTContentSizeCategoryXS"))] }
            run("ax5") { ["audit": try audit(launch(item.view, "UICTContentSizeCategoryAccessibilityXXXL"))] }
            // `.accessibilityExtraLarge` = DynamicTypeSize.accessibility3 (`AccessibilityL` is accessibility2).
            run("ax3") { ["rootHeight": rootHeight(launch(item.view, "UICTContentSizeCategoryAccessibilityXL"))] }
            if item.motion.live {
                run("motion") { ["frames": frames(launch(item.view, "UICTContentSizeCategoryL", motion: "live"))] }
                run("motionReduced") { ["frames": frames(launch(item.view, "UICTContentSizeCategoryL", motion: "live", reduce: true))] }
            }
            if !item.focusLooks.isEmpty {
                run("focusReduced") { ["focusLooks": focusLooks(launch(item.view, "UICTContentSizeCategoryL", reduce: true), item)] }
            }
            let data = try JSONSerialization.data(withJSONObject: ["launches": launches, "errors": errors], options: [.sortedKeys])
            try data.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(item.view).json"))
        }
        for item in cases {
            XCTAssertTrue(FileManager.default.fileExists(atPath: URL(fileURLWithPath: dir).appendingPathComponent("\(item.view).json").path), item.view)
        }
    }
}

@MainActor
private func launch(_ view: String, _ category: String, rtl: Bool = false, motion: String? = nil, reduce: Bool = false) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["MARKSWIFT_VIEW"] = view
    if rtl { app.launchEnvironment["MARKSWIFT_RTL"] = "1" }
    if let motion { app.launchEnvironment["MARKSWIFT_MOTION"] = motion }
    if reduce { app.launchEnvironment["MARKSWIFT_REDUCE_MOTION"] = "1" }
    app.launchArguments = ["-UIPreferredContentSizeCategoryName", category]
    app.launch()
    return app
}

/// SHA-256 of two `markswift.root` screenshots 300 ms apart (after 500 ms): equal = nothing moved.
@MainActor
private func frames(_ app: XCUIApplication) -> [String] {
    let root = app.otherElements["markswift.root"].firstMatch
    var digests: [String] = []
    for pause in [0.5, 0.3] {
        Thread.sleep(forTimeInterval: pause)
        digests.append(SHA256.hash(data: root.screenshot().pngRepresentation).map { String(format: "%02x", $0) }.joined())
    }
    return digests
}

@MainActor
private func typeName(_ type: XCUIElement.ElementType) -> String {
    switch type {
    case .button: "button"
    case .link: "link"
    case .staticText: "staticText"
    case .image: "image"
    case .switch: "switch"
    case .toggle: "toggle"
    case .textField: "textField"
    case .secureTextField: "secureTextField"
    case .searchField: "searchField"
    case .textView: "textView"
    case .slider: "slider"
    case .progressIndicator: "progressIndicator"
    case .picker: "picker"
    case .popUpButton: "popUpButton"
    default: "other"
    }
}

@MainActor
private func valueText(_ value: Any?) -> String {
    value.map { "\($0)" } ?? ""
}

@MainActor
private func dump(_ s: XCUIElementSnapshot) -> [String: Any] {
    [
        "type": typeName(s.elementType),
        "label": s.label,
        "identifier": s.identifier,
        "value": valueText(s.value),
        "selected": s.isSelected,
        "frame": [s.frame.minX, s.frame.minY, s.frame.width, s.frame.height].map { Double($0) },
        "children": s.children.map(dump),
    ]
}

@MainActor
private func audit(_ app: XCUIApplication) throws -> [[String: String]] {
    let names: [(XCUIAccessibilityAuditType, String)] = [
        (.dynamicType, "dynamicType"), (.textClipped, "textClipped"), (.hitRegion, "hitRegion"),
        (.sufficientElementDescription, "sufficientElementDescription"), (.trait, "trait"),
    ]
    var issues: [[String: String]] = []
    try app.performAccessibilityAudit(for: [.dynamicType, .textClipped, .hitRegion, .sufficientElementDescription, .trait]) { issue in
        issues.append([
            "type": names.first { $0.0 == issue.auditType }?.1 ?? "other",
            "label": issue.element?.label ?? "",
            "description": issue.compactDescription,
        ])
        return true
    }
    return issues
}

@MainActor
private func rootHeight(_ app: XCUIApplication) -> Double {
    let root = app.otherElements["markswift.root"].firstMatch
    return root.exists ? Double(root.frame.height) : -1
}

/// Interactions inside `markswift.root` (never the keyboard or system chrome). Disabled elements are skipped: the design
/// disables them, and typing into one is a fatal XCUITest failure. Labels and fields come last, in fresh launches after the
/// log is read: their keyboard cannot cover the buttons, and a sheet a button presented (a file importer) cannot cover
/// them. Each label is tapped in its own launch, so no earlier keyboard covers it.
@MainActor
private func interact(_ app: XCUIApplication, _ item: BehaviourTests.Case) -> [String: Any] {
    let root = app.otherElements["markswift.root"].firstMatch
    var switches: [[String: String]] = []
    for element in root.switches.allElementsBoundByIndex where element.isHittable && element.isEnabled {
        let before = valueText(element.value)
        element.tap()
        switches.append(["label": element.label, "before": before, "after": valueText(element.value)])
    }
    var pickers: [[String: Any]] = []
    for picker in item.pickers {
        let current = root.buttons.matching(NSPredicate(format: "label == %@ OR value == %@", picker.current, picker.current)).firstMatch
        var reached = false
        if current.exists && current.isHittable && current.isEnabled {
            current.tap()
            let next = app.buttons[picker.next].firstMatch
            if next.waitForExistence(timeout: 2) {
                next.tap()
                reached = root.buttons.matching(NSPredicate(format: "label == %@ OR value == %@", picker.next, picker.next)).firstMatch
                    .waitForExistence(timeout: 2)
            }
        }
        pickers.append(["current": picker.current, "next": picker.next, "reached": reached])
    }
    // A presentation's trigger would cover the screen with its content: `layers` opens it in launches of its own.
    let triggers = item.layers.filter { $0.kind == "presentation" }.map(\.trigger)
    let skip = Set(item.pickers.flatMap { [$0.current, $0.next] } + item.pickerValues + triggers)
    var tapped: [String] = []
    for query in [root.buttons, root.links] {
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            guard element.exists, element.isHittable, element.isEnabled, !skip.contains(element.label), !skip.contains(valueText(element.value)) else { continue }
            tapped.append(element.label)
            element.tap()
        }
    }
    let log = app.staticTexts["markswift.log"].firstMatch
    let hits = log.exists ? log.label : ""
    var labels: [[String: Any]] = []
    for text in item.labels {
        app.launch()
        let label = root.staticTexts.matching(NSPredicate(format: "label == %@", text)).firstMatch
        var focused = false
        if label.waitForExistence(timeout: 2) && label.isHittable {
            label.tap()
            let field = root.descendants(matching: .any).matching(NSPredicate(format: "hasKeyboardFocus == true AND label == %@", text)).firstMatch
            focused = field.waitForExistence(timeout: 2)
        }
        labels.append(["label": text, "focused": focused])
    }
    let looks = focusLooks(app, item)
    app.launch()
    var fields: [[String: String]] = []
    for query in [root.textFields, root.secureTextFields, root.textViews] {
        for element in query.allElementsBoundByIndex where element.isHittable && element.isEnabled {
            element.tap()
            let focused = NSPredicate(format: "hasKeyboardFocus == true")
            if XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: focused, object: element)], timeout: 2) == .completed {
                element.typeText("mk")
            }
            fields.append(["type": typeName(element.elementType), "label": element.label, "value": valueText(element.value)])
        }
    }
    return [
        "switches": switches, "fields": fields, "pickers": pickers, "labels": labels, "focusLooks": looks, "tapped": tapped,
        "log": hits,
    ]
}

/// Each transitioned focus look in a fresh launch: the field's top edge (its border; never the caret or text) before
/// and 0.4 s after its tap (longest corpus focus transition 150 ms + margin) must differ.
@MainActor
private func focusLooks(_ app: XCUIApplication, _ item: BehaviourTests.Case) -> [[String: Any]] {
    let root = app.otherElements["markswift.root"].firstMatch
    func edge(_ element: XCUIElement) -> Data? {
        let image = element.screenshot().image
        let strip = CGRect(x: 0, y: 0, width: image.size.width * image.scale, height: 2 * image.scale)
        return image.cgImage?.cropping(to: strip).flatMap { UIImage(cgImage: $0).pngData() }
    }
    var looks: [[String: Any]] = []
    for label in item.focusLooks {
        app.launch()
        let field = [root.textFields, root.secureTextFields, root.textViews].map { $0[label] }.first { $0.exists }
        var changed = false
        if let field, field.isHittable {
            let rest = edge(field)
            field.tap()
            Thread.sleep(forTimeInterval: 0.4)
            changed = rest != nil && rest != edge(field)
        }
        looks.append(["label": label, "changed": changed])
    }
    return looks
}

/// Each in-flow layer in a fresh launch: its text is absent, the trigger's tap shows it, a second tap hides it.
@MainActor
private func layers(_ app: XCUIApplication, _ item: BehaviourTests.Case) -> [[String: Any]] {
    let root = app.otherElements["markswift.root"].firstMatch
    let gone = NSPredicate(format: "exists == false")
    return item.layers.map { layer in
        if layer.kind == "presentation" { return presentation(app, layer) }
        app.launch()
        let shows = root.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", layer.shows)).firstMatch
        let trigger = root.buttons.matching(NSPredicate(format: "label == %@", layer.trigger)).firstMatch
        var opened = false
        var closed = false
        if !shows.exists && trigger.waitForExistence(timeout: 2) && trigger.isHittable {
            trigger.tap()
            opened = shows.waitForExistence(timeout: 2)
            if opened {
                trigger.tap()
                closed = XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: gone, object: shows)], timeout: 2) == .completed
            }
        }
        return ["id": layer.id, "opened": opened, "closed": closed]
    }
}

/// A drawn presentation (060), each probe in a fresh launch: open (tap, or long-press), whether the trigger stays
/// exposed while it is open, each closer, an outside tap, then every other content button so its action logs.
@MainActor
private func presentation(_ app: XCUIApplication, _ layer: BehaviourTests.Case.Layer) -> [String: Any] {
    let root = app.otherElements["markswift.root"].firstMatch
    let gone = NSPredicate(format: "exists == false")
    let named = NSPredicate(format: "label == %@", layer.trigger)
    let shows = root.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", layer.shows)).firstMatch
    var log: [String] = []
    func trigger() -> XCUIElement {
        let button = root.buttons.matching(named).firstMatch
        return button.exists ? button : root.links.matching(named).firstMatch
    }
    func open() -> Bool {
        app.launch()
        let t = trigger()
        guard !shows.exists, t.waitForExistence(timeout: 2), t.isHittable else { return false }
        if layer.longPress == true { t.press(forDuration: 1.0) } else { t.tap() }
        return shows.waitForExistence(timeout: 2)
    }
    func closes(_ act: () -> Void) -> Bool {
        act()
        let closed = XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: gone, object: shows)], timeout: 2) == .completed
        let hits = app.staticTexts["markswift.log"].firstMatch
        if hits.exists { log.append(hits.label) }
        return closed
    }
    let opened = open()
    let triggerExposed = opened && trigger().exists
    var closers: [String: Bool] = [:]
    for label in layer.closers ?? [] {
        closers[label] = open() && closes { root.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch.tap() }
    }
    var outside = false
    if let p = layer.outsidePoint, p.count == 2, open() {
        outside = closes { root.coordinate(withNormalizedOffset: CGVector(dx: p[0], dy: p[1])).tap() }
    }
    for label in layer.buttons ?? [] where open() {
        let button = root.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
        _ = closes { if button.isHittable { button.tap() } }
    }
    return [
        "id": layer.id, "opened": opened, "triggerExposed": triggerExposed, "closers": closers, "outside": outside,
        "log": log.joined(separator: ","),
    ]
}
