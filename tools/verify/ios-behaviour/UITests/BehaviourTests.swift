import XCTest

/// Records what iOS exposes for every generated view in `cases.json`; `tools/verify/ios-behaviour.ts` judges it.
final class BehaviourTests: XCTestCase {
    struct Case: Decodable {
        struct Picker: Decodable { let current: String; let next: String }
        let view: String
        let pickers: [Picker]
        let actions: [String]
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
                return ["tree": tree, "audit": try audit(app), "rootHeight": rootHeight(app), "interactions": interact(app, item)]
            }
            run("rtl") { ["tree": dump(try launch(item.view, "UICTContentSizeCategoryL", rtl: true).snapshot())] }
            run("xSmall") { ["audit": try audit(launch(item.view, "UICTContentSizeCategoryXS"))] }
            run("ax5") { ["audit": try audit(launch(item.view, "UICTContentSizeCategoryAccessibilityXXXL"))] }
            run("ax3") { ["rootHeight": rootHeight(launch(item.view, "UICTContentSizeCategoryAccessibilityL"))] }
            let data = try JSONSerialization.data(withJSONObject: ["launches": launches, "errors": errors], options: [.sortedKeys])
            try data.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(item.view).json"))
        }
        for item in cases {
            XCTAssertTrue(FileManager.default.fileExists(atPath: URL(fileURLWithPath: dir).appendingPathComponent("\(item.view).json").path), item.view)
        }
    }
}

@MainActor
private func launch(_ view: String, _ category: String, rtl: Bool = false) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["MARKSWIFT_VIEW"] = view
    if rtl { app.launchEnvironment["MARKSWIFT_RTL"] = "1" }
    app.launchArguments = ["-UIPreferredContentSizeCategoryName", category]
    app.launch()
    return app
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

@MainActor
private func interact(_ app: XCUIApplication, _ item: BehaviourTests.Case) -> [String: Any] {
    var switches: [[String: String]] = []
    for element in app.switches.allElementsBoundByIndex where element.isHittable {
        let before = valueText(element.value)
        element.tap()
        switches.append(["label": element.label, "before": before, "after": valueText(element.value)])
    }
    var fields: [[String: String]] = []
    for query in [app.textFields, app.secureTextFields, app.textViews] {
        for element in query.allElementsBoundByIndex where element.isHittable {
            element.tap()
            element.typeText("mk")
            fields.append(["type": typeName(element.elementType), "label": element.label, "value": valueText(element.value)])
        }
    }
    var pickers: [[String: Any]] = []
    for picker in item.pickers {
        let current = app.buttons[picker.current].firstMatch
        var reached = false
        if current.exists && current.isHittable {
            current.tap()
            let next = app.buttons[picker.next].firstMatch
            if next.exists {
                next.tap()
                reached = app.buttons[picker.next].exists
            }
        }
        pickers.append(["current": picker.current, "next": picker.next, "reached": reached])
    }
    let skip = Set(item.pickers.flatMap { [$0.current, $0.next] })
    var tapped: [String] = []
    for index in 0..<app.buttons.count {
        let button = app.buttons.element(boundBy: index)
        guard button.exists, button.isHittable, !skip.contains(button.label), button.identifier != "markswift.log" else { continue }
        tapped.append(button.label)
        button.tap()
    }
    let log = app.staticTexts["markswift.log"].firstMatch
    return ["switches": switches, "fields": fields, "pickers": pickers, "tapped": tapped, "log": log.exists ? log.label : ""]
}
