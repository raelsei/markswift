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
        }
    }
}
