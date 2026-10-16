import SwiftUI

@main
struct HostApp: App {
    init() { BehaviourRegistry.registerFonts() }
    var body: some Scene {
        WindowGroup {
            let env = ProcessInfo.processInfo.environment
            VStack(spacing: 0) {
                ScrollView {
                    BehaviourRegistry.view(named: env["MARKSWIFT_VIEW"] ?? "")
                        .frame(width: 390, alignment: .topLeading)
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("markswift.root")
                }
                Text(BehaviourLog.shared.hits.joined(separator: ",")).font(.caption)
                    .accessibilityIdentifier("markswift.log")
            }
            .environment(\.layoutDirection, env["MARKSWIFT_RTL"] == "1" ? .rightToLeft : .leftToRight)
            // Animations rest at the settled look unless a motion launch asks for the live clock.
            .environment(\.markswiftMotionTime, env["MARKSWIFT_MOTION"] == "live" ? nil : Double.infinity)
            .environment(\.markswiftForcedStates, env["MARKSWIFT_REDUCE_MOTION"] == "1" ? .reduceMotion : [])
        }
    }
}
