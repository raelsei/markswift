/**
 * Runtime helpers the emitted controls call; appended to MarkswiftRuntime.swift — always as the
 * tail of that file, never inside another declaration, so the import below stays at file scope.
 * It is first in the block because that is the nearest thing to the file's import list this
 * module owns; Swift accepts an import declaration anywhere at file scope, and `bun run
 * generate` typechecks the file every run, so a future append cannot break it silently.
 */

export const CONTROL_RUNTIME = `
// \`UTType\` (the file importer's content types) is not re-exported by SwiftUI or Foundation.
import UniformTypeIdentifiers

/// A URL from a design's \`href\`. Anything the design left unresolvable (an in-page anchor, a
/// relative path, a malformed URL) becomes \`about:blank\` rather than trapping at runtime.
nonisolated func markswiftURL(_ s: String) -> URL {
    URL(string: s) ?? URL(string: "about:blank")!
}

/// The types an \`<input type="file" accept>\` list names. The tokens are the attribute's own
/// forms — \`.png\`, \`image/png\`, \`image/*\` — and only the running system knows what they mean,
/// so they are resolved here rather than at generation time. A token the system does not
/// recognise is dropped, and a list that resolves to nothing means "any file".
nonisolated func markswiftContentTypes(_ accept: String) -> [UTType] {
    var out: [UTType] = []
    for token in accept.split(separator: ",") {
        let name = String(token.filter { !$0.isWhitespace }).lowercased()
        if name.isEmpty { continue }
        let type: UTType?
        if name.hasPrefix(".") {
            type = UTType(filenameExtension: String(name.dropFirst()))
        } else if name.hasSuffix("/*") {
            switch String(name.dropLast(2)) {
            case "image": type = .image
            case "audio": type = .audio
            case "video": type = .movie
            case "text": type = .text
            default: type = .item
            }
        } else {
            type = UTType(mimeType: name)
        }
        if let type, !out.contains(type) { out.append(type) }
    }
    return out.isEmpty ? [.item] : out
}

/// The checkbox and radio HTML draws: a small square or circle that fills with the tint when on.
/// iOS has no native checkbox, and a switch does not fit the box the design measured.
@MainActor struct MarkswiftMarkToggleStyle: ToggleStyle {
    enum Mark { case check, dot }
    let mark: Mark
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            ZStack {
                box(on: configuration.isOn)
                if configuration.isOn { fill }
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func box(on: Bool) -> some View {
        let face = on ? tint : Color(uiColor: .systemBackground)
        let line = on ? tint : Color(uiColor: .systemGray2)
        switch mark {
        case .check:
            RoundedRectangle(cornerRadius: 2, style: .circular)
                .fill(face)
                .overlay(RoundedRectangle(cornerRadius: 2, style: .circular).strokeBorder(line, lineWidth: 1))
        case .dot:
            Circle()
                .fill(on ? Color.clear : face)
                .overlay(Circle().strokeBorder(line, lineWidth: on ? 2 : 1))
        }
    }

    @ViewBuilder private var fill: some View {
        switch mark {
        case .check:
            Image(systemName: "checkmark")
                .resizable()
                .scaledToFit()
                .fontWeight(.bold)
                .foregroundStyle(Color(uiColor: .systemBackground))
                .padding(2)
        case .dot:
            Circle().fill(tint).padding(3)
        }
    }
}

/// The bar a browser paints for \`<progress>\`/\`<meter>\`: a rounded track with the completed part
/// filled, centred in the element's box.
nonisolated struct MarkswiftBar: View {
    let fraction: Double
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(tint).frame(width: geo.size.width * min(max(fraction, 0), 1))
            }
            .overlay(Capsule().strokeBorder(edge, lineWidth: 1))
            .frame(height: height)
            .frame(maxHeight: .infinity, alignment: .center)
        }
    }
}

nonisolated struct MarkswiftBarProgressStyle: ProgressViewStyle {
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    func makeBody(configuration: Configuration) -> some View {
        // No value: the browser draws a short pulse near the start of the track.
        MarkswiftBar(fraction: configuration.fractionCompleted ?? 0.25, height: height, tint: tint, track: track, edge: edge)
    }
}

nonisolated struct MarkswiftBarGaugeStyle: GaugeStyle {
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    func makeBody(configuration: Configuration) -> some View {
        MarkswiftBar(fraction: configuration.value, height: height, tint: tint, track: track, edge: edge)
    }
}

/// A range input as the browser paints it: a half-height track filled up to the value, with a
/// round thumb on it. \`ImageRenderer\` cannot rasterise a live \`Slider\`, so the fidelity views
/// use this to verify the design's geometry.
nonisolated struct MarkswiftSliderTrack: View {
    let fraction: Double
    let height: CGFloat
    let tint: Color
    let track: Color
    let edge: Color

    var body: some View {
        GeometryReader { geo in
            let thumb = height * 0.875
            let usable = max(geo.size.width - thumb, 0)
            ZStack(alignment: .leading) {
                MarkswiftBar(fraction: fraction, height: height / 2, tint: tint, track: track, edge: edge)
                Circle()
                    .fill(tint)
                    .frame(width: thumb, height: thumb)
                    .offset(x: usable * min(max(fraction, 0), 1))
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
    }
}
`;
