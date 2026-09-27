import { str } from "../../../src/swift/format.ts";
import type { InteractionPlan, InteractionStep } from "./types.ts";

/** XCUI gestures cross the process boundary; no UIKit properties or generated state are set. */
export function interactionTests(plans: readonly InteractionPlan[]): string {
  return `import XCTest
import CoreGraphics

@MainActor final class CorpusInteractionUITests: XCTestCase {
    private var app: XCUIApplication!
${plans.filter(plan => plan.steps.length).map(plan => `
    func ${plan.testName}() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--fixture", ${str(plan.fixture)}]
        app.launch()
        defer { app.terminate() }
        XCTAssertEqual(try required("interaction-host-fixture").label, ${str(plan.fixture)})
${plan.steps.map((step, index) => `        try XCTContext.runActivity(named: ${str(`${String(index + 1).padStart(2, "0")}-${step.kind}-${step.target}`)}) { _ in
${emitStep(step).map(line => `            ${line}`).join("\n")}
            record(${str(`${String(index + 1).padStart(2, "0")}-${step.kind}`)})
        }`).join("\n")}
        XCTAssertEqual(try required("interaction-host-blocked-urls").label, "Blocked URL actions: 0")
    }
`).join("\n")}
    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func required(_ identifier: String, container: String? = nil) throws -> XCUIElement {
        let target = element(identifier)
        if let container {
            let scroller = element(container)
            guard scroller.waitForExistence(timeout: 4) else { throw MissingElement(identifier: container) }
            for direction in ["up", "down"] {
                for _ in 0..<8 {
                    if target.exists && target.isHittable { return target }
                    if direction == "up" { scroller.swipeUp() } else { scroller.swipeDown() }
                }
            }
        }
        guard target.waitForExistence(timeout: 4) else {
            record("missing-" + identifier)
            throw MissingElement(identifier: identifier)
        }
        return target
    }

    private func assertValue(_ target: XCUIElement, _ value: String) {
        let predicate = NSPredicate { _, _ in (target.value as? String) == value }
        let expected = XCTNSPredicateExpectation(predicate: predicate, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [expected], timeout: 4), .completed,
                       "Expected value \\(value), observed \\(String(describing: target.value))")
    }

    private func replaceText(_ target: XCUIElement, text: String) {
        XCTAssertTrue(target.isHittable)
        target.tap()
        let previous = target.value as? String ?? ""
        if !previous.isEmpty {
            target.press(forDuration: 1.1)
            let menu = app.menuItems["Select All"].firstMatch
            let button = app.buttons["Select All"].firstMatch
            if menu.waitForExistence(timeout: 1) { menu.tap(); target.typeText(XCUIKeyboardKey.delete.rawValue) }
            else if button.waitForExistence(timeout: 1) { button.tap(); target.typeText(XCUIKeyboardKey.delete.rawValue) }
            else {
                // Native fallback: place the caret at the field's end, then send keyboard deletes.
                target.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.95)).tap()
                target.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.utf16.count + 8))
            }
        }
        target.typeText(text)
    }

    private func record(_ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = name + "-accessibility"; hierarchy.lifetime = .keepAlways; add(hierarchy)
    }
    private struct MissingElement: Error { let identifier: String }
}
`;
}

function emitStep(step: InteractionStep): string[] {
  if (step.kind === "expectMissing") return [`XCTAssertFalse(element(${str(step.target)}).exists)`];
  if (step.kind === "expectPresent") return step.present
    ? [`XCTAssertTrue(element(${str(step.target)}).waitForExistence(timeout: 4))`]
    : [`let disappeared = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element(${str(step.target)}))`,
       `XCTAssertEqual(XCTWaiter.wait(for: [disappeared], timeout: 4), .completed)`];
  const container = "container" in step && step.container ? `, container: ${str(step.container)}` : "";
  const lines = [`let target = try required(${str(step.target)}${container})`];
  switch (step.kind) {
    case "expectValue": lines.push(`assertValue(target, ${str(step.value)})`); break;
    case "expectExpanded": lines.push('XCTAssertEqual(target.elementType, .button)', `assertValue(target, "${step.expanded ? "expanded" : "collapsed"}")`); break;
    case "expectSelection": lines.push(`assertValue(target, "${step.selected ? "selected" : "unselected"}")`, `XCTAssertEqual(target.isSelected, ${step.selected})`); break;
    case "expectLabel": lines.push(`XCTAssertEqual(target.label, ${str(step.label)})`); break;
    case "expectEnabled": lines.push(`XCTAssertEqual(target.isEnabled, ${step.enabled})`); break;
    case "tap": lines.push("XCTAssertTrue(target.isHittable)", "target.tap()"); break;
    case "tapInert": lines.push("XCTAssertTrue(target.isHittable)", "target.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()"); break;
    case "replaceText": lines.push(`replaceText(target, text: ${str(step.text)})`); break;
    case "scroll": lines.push(`target.${step.direction === "up" ? "swipeUp" : "swipeDown"}()`); break;
  }
  return lines;
}
