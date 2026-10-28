// Throwaway CI probe for #25: where does SwiftUI place a UIKit view (and a nested host) requested at fractional points?
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const probe = `import SwiftUI
import UIKit

final class ProbeUIView: UIView {
    var tag2 = ""
    override func layoutSubviews() {
        super.layoutSubviews()
        let f = convert(bounds, to: nil)
        let line = "\\(tag2) frame=\\(frame) window=\\(f) scale=\\(window?.screen.scale ?? 0)\\n"
        if let h = FileHandle(forWritingAtPath: "/tmp/markswift-probe.txt") { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); h.closeFile() }
        else { try? line.write(toFile: "/tmp/markswift-probe.txt", atomically: true, encoding: .utf8) }
    }
}
struct ProbeRep: UIViewRepresentable {
    let tag: String
    func makeUIView(context: Context) -> ProbeUIView { let v = ProbeUIView(); v.tag2 = tag; return v }
    func updateUIView(_ v: ProbeUIView, context: Context) {}
}
final class ProbeHostVC: UIViewController {
    override func loadView() { let v = ProbeUIView(); v.tag2 = "host-container"; view = v
        let h = UIHostingController(rootView: ProbeRep(tag: "inner-in-host").frame(width: 40, height: 10).offset(x: 0.25, y: 0.25))
        h.safeAreaRegions = []
        addChild(h); h.view.frame = v.bounds; h.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]; v.addSubview(h.view); h.didMove(toParent: self) }
}
struct ProbeVCRep: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> ProbeHostVC { ProbeHostVC() }
    func updateUIViewController(_ c: ProbeHostVC, context: Context) {}
}
struct Probe: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.frame(height: 10.25)
            ProbeRep(tag: "rep-y10.25").frame(width: 100.4, height: 20.5)
            Color.clear.frame(height: 0.17)
            ProbeVCRep().frame(width: 100, height: 30.33)
        }
        .padding(.leading, 3.3)
    }
}
`;
const result = {
  name: "Probe",
  files: { "Probe.swift": probe, "MarkswiftRuntime.swift": SWIFT_RUNTIME },
  assets: {},
  layout: { size: { w: 200, h: 120 }, canvas: "white", combo: { screen: "probe", theme: "light" } },
} as unknown as RenderResult;
await Bun.write("/tmp/markswift-probe.txt", "");
const device = await ensureSimulator();
const errors = await renderIos([{ result, output: "/tmp/markswift-probe.png" }], "/tmp/markswift-probe-work", device.udid);
console.log("render errors:", [...errors.values()]);
console.log(await Bun.file("/tmp/markswift-probe.txt").text());
