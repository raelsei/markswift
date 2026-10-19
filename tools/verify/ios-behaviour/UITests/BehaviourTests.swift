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
        /// Presentations (`kind` "presentation"): the trigger (long-pressed when `longPress`) shows `shows`; `closers`
        /// close it; a tap at the root's normalised `outsidePoint` may; `buttons` are tapped so their actions log.
        struct Layer: Decodable {
            let id: String; let kind: String; let trigger: String; let shows: String
            let closers: [String]?; let buttons: [String]?; let longPress: Bool?; let outsidePoint: [Double]?
        }
        let layers: [Layer]
        /// Native menus: `trigger` (long-pressed when `context`) opens a menu showing the buttons `items`.
        struct Menu: Decodable { let trigger: String; let context: Bool; let items: [String] }
        let menus: [Menu]
        /// `live`: some node animates; `reduced`: something still animates under Reduce Motion.
        struct Motion: Decodable { let live: Bool; let reduced: Bool }
        let motion: Motion
        /// `markswift-breakpoints` widths: every launch frames the view at the first; two or more add the `bands` launch.
        let widths: [Int]
        /// A root as tall as the capture viewport: the host frames it at least this tall (the screen the case models).
        let screenHeight: Double?
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
                let app = launch(item, "UICTContentSizeCategoryL")
                let tree = dump(try app.snapshot())
                return [
                    "tree": tree, "audit": try audit(app), "rootHeight": rootHeight(app), "interactions": interact(app, item),
                    "layers": layers(app, item), "menus": menus(app, item),
                ]
            }
            run("rtl") { ["tree": dump(try launch(item, "UICTContentSizeCategoryL", rtl: true).snapshot())] }
            run("xSmall") { ["audit": try audit(launch(item, "UICTContentSizeCategoryXS"))] }
            run("ax5") { ["audit": try audit(launch(item, "UICTContentSizeCategoryAccessibilityXXXL"))] }
            // `.accessibilityExtraLarge` = DynamicTypeSize.accessibility3 (`AccessibilityL` is accessibility2).
            run("ax3") { ["rootHeight": rootHeight(launch(item, "UICTContentSizeCategoryAccessibilityXL"))] }
            if item.motion.live {
                run("motion") { ["frames": frames(launch(item, "UICTContentSizeCategoryL", motion: "live"))] }
                run("motionReduced") { ["frames": frames(launch(item, "UICTContentSizeCategoryL", motion: "live", reduce: true))] }
            }
            if item.widths.count > 1 {
                run("bands") { try bands(launch(item, "UICTContentSizeCategoryL")) }
            }
            if !item.focusLooks.isEmpty {
                run("focusReduced") { ["focusLooks": focusLooks(launch(item, "UICTContentSizeCategoryL", reduce: true), item)] }
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
private func launch(_ item: BehaviourTests.Case, _ category: String, rtl: Bool = false, motion: String? = nil, reduce: Bool = false) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["MARKSWIFT_VIEW"] = item.view
    if !item.widths.isEmpty { app.launchEnvironment["MARKSWIFT_WIDTHS"] = item.widths.map(String.init).joined(separator: ",") }
    if let h = item.screenHeight { app.launchEnvironment["MARKSWIFT_SCREEN_HEIGHT"] = String(h) }
    if rtl { app.launchEnvironment["MARKSWIFT_RTL"] = "1" }
    if let motion { app.launchEnvironment["MARKSWIFT_MOTION"] = motion }
    if reduce { app.launchEnvironment["MARKSWIFT_REDUCE_MOTION"] = "1" }
    app.launchArguments = ["-UIPreferredContentSizeCategoryName", category]
    app.launch()
    return app
}

/// Band switch: type into the first text field and toggle the first switch, then switch the
/// host's width twice (`markswift.width`). Each snapshot records every text field's and switch's value and how many
/// elements of its type carry its label; the audit runs after the first switch.
@MainActor
private func bands(_ app: XCUIApplication) throws -> [String: Any] {
    let root = app.otherElements["markswift.root"].firstMatch
    let field = root.textFields.firstMatch
    if field.waitForExistence(timeout: 2) && field.isHittable {
        field.tap()
        let focused = NSPredicate(format: "hasKeyboardFocus == true")
        if XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: focused, object: field)], timeout: 2) == .completed {
            field.typeText("mk")
        }
    }
    let toggle = root.switches.firstMatch
    if toggle.exists && toggle.isHittable { toggle.tap() }
    func snapshot() -> [String: Any] {
        var values: [String: String] = [:]
        var counts: [String: Int] = [:]
        for query in [root.textFields, root.switches] {
            for element in query.allElementsBoundByIndex {
                values[element.label] = valueText(element.value)
                counts[element.label] = query.matching(NSPredicate(format: "label == %@", element.label)).count
            }
        }
        return ["values": values, "counts": counts]
    }
    let width = app.buttons["markswift.width"].firstMatch
    var snapshots = [snapshot()]
    width.tap()
    snapshots.append(snapshot())
    let issues = try audit(app)
    width.tap()
    snapshots.append(snapshot())
    return ["snapshots": snapshots, "audit": issues]
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

/// The hosted view's height (the log's value): the `markswift.root` container's frame leaves out the root's padding.
@MainActor
private func rootHeight(_ app: XCUIApplication) -> Double {
    let log = app.staticTexts["markswift.log"].firstMatch
    return log.waitForExistence(timeout: 2) ? Double(valueText(log.value)) ?? -1 : -1
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
    // A presentation's trigger would cover the screen with its content, a menu's opens a popup: `layers` and `menus`
    // open them in launches of their own.
    let triggers = item.layers.filter { $0.kind == "presentation" }.map(\.trigger) + item.menus.map(\.trigger)
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

/// Each transitioned focus look in a fresh launch: the screen rows from 4 pt above the field's top edge to 2 pt below it
/// (its border and 3 pt focus ring; never the caret or text) before and 0.4 s after its tap (longest corpus focus
/// transition 150 ms + margin) must differ. A TextEditor's element is its inner text view, whose top sits on the inside
/// of the border (`markswiftTextEditorInsets`), so the strip reaches above the element.
@MainActor
private func focusLooks(_ app: XCUIApplication, _ item: BehaviourTests.Case) -> [[String: Any]] {
    let root = app.otherElements["markswift.root"].firstMatch
    func edge(_ element: XCUIElement) -> Data? {
        let image = XCUIScreen.main.screenshot().image
        let f = element.frame
        let strip = CGRect(x: f.minX, y: f.minY - 4, width: f.width, height: 6).applying(CGAffineTransform(scaleX: image.scale, y: image.scale))
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

/// Each native menu item in a fresh launch: open the menu (tap, or long-press a context menu's area), wait for
/// the item, tap it, and read the log.
@MainActor
private func menus(_ app: XCUIApplication, _ item: BehaviourTests.Case) -> [[String: Any]] {
    let root = app.otherElements["markswift.root"].firstMatch
    let gone = NSPredicate(format: "exists == false")
    return item.menus.flatMap { menu in
        menu.items.map { label -> [String: Any] in
            app.launch()
            let trigger = root.descendants(matching: .any).matching(NSPredicate(format: "label == %@", menu.trigger)).firstMatch
            var opened = false
            if trigger.waitForExistence(timeout: 2) && trigger.isHittable {
                if menu.context { trigger.press(forDuration: 1.0) } else { trigger.tap() }
                let button = app.buttons[label].firstMatch
                opened = button.waitForExistence(timeout: 2)
                if opened {
                    button.tap()
                    _ = XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: gone, object: button)], timeout: 2)
                }
            }
            let hits = app.staticTexts["markswift.log"].firstMatch
            return ["trigger": menu.trigger, "label": label, "opened": opened, "log": hits.exists ? hits.label : ""]
        }
    }
}

/// A drawn presentation, each probe in a fresh launch: open (tap, or long-press), whether the content sits in a
/// modal container, each closer, an outside tap, then every other content button so its action logs (scrolled to first
/// when it sits below the screen, as on a screen-tall root).
@MainActor
private func presentation(_ app: XCUIApplication, _ layer: BehaviourTests.Case.Layer) -> [String: Any] {
    let root = app.otherElements["markswift.root"].firstMatch
    let gone = NSPredicate(format: "exists == false")
    let named = NSPredicate(format: "label == %@", layer.trigger)
    let showing = NSPredicate(format: "label CONTAINS %@", layer.shows)
    let shows = root.descendants(matching: .any).matching(showing).firstMatch
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
    // XCUITest reports an `.isModal` container as an alert. It keeps the page behind it in its tree either way (neither
    // `.isModal` nor `accessibilityHidden(true)` prunes XCUITest's snapshot), so the container is what it can observe.
    let modal = opened && root.alerts.descendants(matching: .any).matching(showing).firstMatch.exists
    var closers: [String: Bool] = [:]
    for label in layer.closers ?? [] {
        closers[label] = open() && closes { root.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch.tap() }
    }
    var outside = false
    // The root's corner, kept on screen: a screen-tall root reaches below the scroll view's visible part.
    if let p = layer.outsidePoint, p.count == 2, open() {
        let r = root.frame
        let y = min(r.minY + r.height * p[1], app.scrollViews.firstMatch.frame.maxY - 16)
        outside = closes { app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: r.minX + r.width * p[0], dy: y)).tap() }
    }
    for label in layer.buttons ?? [] where open() {
        let button = root.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
        _ = closes {
            if button.exists && !button.isHittable { app.scrollViews.firstMatch.swipeUp() }
            if button.isHittable { button.tap() }
        }
    }
    return [
        "id": layer.id, "opened": opened, "modal": modal, "closers": closers, "outside": outside,
        "log": log.joined(separator: ","),
    ]
}


extension BehaviourTests {
    @MainActor
    func testGreedyTextReflowAndDynamicType() throws {
        let app = XCUIApplication()
        app.launchEnvironment["MARKSWIFT_GREEDY_PROBE"] = "1"
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Deploys, failures and mentions."].exists)
        let normal = try XCTUnwrap(Double(app.staticTexts["greedy-height"].label))
        app.buttons["Resize"].tap()
        let narrow = try XCTUnwrap(Double(app.staticTexts["greedy-height"].label))
        XCTAssertGreaterThan(narrow, normal)
        app.terminate()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Deploys, failures and mentions."].exists)
        let large = try XCTUnwrap(Double(app.staticTexts["greedy-height"].label))
        XCTAssertGreaterThan(large, normal)
    }
}
