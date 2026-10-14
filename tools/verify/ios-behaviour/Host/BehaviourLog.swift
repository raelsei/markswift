import Observation

/// Names of the action closures the generated views called, shown in the `markswift.log` text for the UI test.
@Observable final class BehaviourLog {
    static let shared = BehaviourLog()
    var hits: [String] = []
    func hit(_ name: String) { hits.append(name) }
}
