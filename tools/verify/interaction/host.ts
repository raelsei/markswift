import { str } from "../../../src/swift/format.ts";
import type { InteractionPlan } from "./types.ts";

/** The host displays actual compiler output. It does not own or mutate generated control state. */
export function interactionHost(plans: readonly InteractionPlan[], bundledFonts: boolean): string {
  return `import SwiftUI

@main struct CorpusInteractionApp: SwiftUI.App {
    init() {
${bundledFonts ? "        MarkswiftBundledFonts.register()" : "        // This batch uses system fonts."}
    }
    var body: some SwiftUI.Scene { SwiftUI.WindowGroup { CorpusInteractionHost() } }
}

struct CorpusInteractionHost: SwiftUI.View {
    @SwiftUI.State private var blockedURLs = 0
    private var fixture: String {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "--fixture"), args.indices.contains(index + 1) else { return "missing" }
        return args[index + 1]
    }
    var body: some SwiftUI.View {
        SwiftUI.VStack(alignment: .leading, spacing: 8) {
            SwiftUI.Text(verbatim: fixture)
                .font(.system(size: 11))
                .accessibilityIdentifier("interaction-host-fixture")
            content
            SwiftUI.Text("Blocked URL actions: \\(blockedURLs)")
                .font(.system(size: 11))
                .accessibilityIdentifier("interaction-host-blocked-urls")
            SwiftUI.Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .environment(\\.openURL, SwiftUI.OpenURLAction { _ in
            blockedURLs += 1
            return .handled
        })
    }
    @SwiftUI.ViewBuilder private var content: some SwiftUI.View {
        switch fixture {
${plans.map(plan => `        case ${str(plan.fixture)}:
            ${plan.viewName}()
                .frame(width: ${plan.width}, height: ${plan.height}, alignment: .topLeading)
                .preferredColorScheme(.${plan.theme})`).join("\n")}
        default:
            SwiftUI.Text("Unknown interaction fixture")
        }
    }
}
`;
}
