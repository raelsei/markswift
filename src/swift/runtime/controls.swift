// `UTType` (the file importer's content types) is not re-exported by SwiftUI or Foundation.
import UniformTypeIdentifiers

/// A URL from a design's `href`. Anything the design left unresolvable (an in-page anchor, a
/// relative path, a malformed URL) becomes `about:blank` rather than trapping at runtime.
nonisolated func markswiftURL(_ s: String) -> URL {
    URL(string: s) ?? URL(string: "about:blank")!
}

/// The types an `<input type="file" accept>` list names. The tokens are the attribute's own
/// forms — `.png`, `image/png`, `image/*` — and only the running system knows what they mean,
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

/// One radio of a group: on when the group's selection is this radio's tag; turning it on selects it.
/// A lone radio binds its `Bool` with tag `true`: a tap selects it and nothing clears it.
extension Binding where Value: Equatable & Sendable {
    func markswiftSelects(_ tag: Value) -> Binding<Bool> {
        Binding<Bool>(get: { wrappedValue == tag }, set: { if $0 { wrappedValue = tag } })
    }
}

/// The keyboard, autofill type, capitalisation and Return key iOS Safari gives the same `<input>`.
/// These modifiers exist only on iOS; on other platforms (the macOS render gate) the field is unchanged.
nonisolated enum MarkswiftInputTraits: Sendable { case email, tel, url, number, search, password }

extension View {
    @ViewBuilder func markswiftInputTraits(_ traits: MarkswiftInputTraits? = nil, autofill: String? = nil, inputMode: String? = nil, enterKey: String? = nil) -> some View {
        #if os(iOS)
        let t = MarkswiftKeyboard(traits, autofill: autofill, inputMode: inputMode, enterKey: enterKey)
        keyboardType(t.keyboard).textContentType(t.content).textInputAutocapitalization(t.capitalization).autocorrectionDisabled(t.noAutocorrect).submitLabel(t.submit)
        #else
        self
        #endif
    }
}

#if os(iOS)
/// The resolved keyboard of one field: the input type's defaults, then the design's explicit hints.
nonisolated struct MarkswiftKeyboard {
    var keyboard: UIKeyboardType = .default
    var content: UITextContentType?
    var capitalization: TextInputAutocapitalization?
    var noAutocorrect = false
    var submit: SubmitLabel = .return

    init(_ traits: MarkswiftInputTraits?, autofill: String?, inputMode: String?, enterKey: String?) {
        switch traits {
        case .email: keyboard = .emailAddress; content = .emailAddress; capitalization = .never; noAutocorrect = true
        case .tel: keyboard = .phonePad; content = .telephoneNumber
        case .url: keyboard = .URL; content = .URL; capitalization = .never; noAutocorrect = true
        case .number: keyboard = .decimalPad
        case .search: keyboard = .webSearch; submit = .search
        case .password: content = .password
        case nil: break
        }
        switch inputMode {
        case "text": keyboard = .default
        case "decimal": keyboard = .decimalPad
        case "numeric": keyboard = .numberPad
        case "tel": keyboard = .phonePad
        case "search": keyboard = .webSearch
        case "email": keyboard = .emailAddress
        case "url": keyboard = .URL
        default: break
        }
        switch enterKey {
        case "done": submit = .done
        case "go": submit = .go
        case "next": submit = .next
        case "search": submit = .search
        case "send": submit = .send
        case "enter", "previous": submit = .return
        default: break
        }
        if let autofill, let type = Self.autofill[autofill] { content = type }
    }

    /// WHATWG autofill field names → the system's content types; a name with no counterpart is left to the input type.
    static let autofill: [String: UITextContentType] = [
        "name": .name, "honorific-prefix": .namePrefix, "given-name": .givenName, "additional-name": .middleName,
        "family-name": .familyName, "honorific-suffix": .nameSuffix, "nickname": .nickname,
        "organization-title": .jobTitle, "organization": .organizationName,
        "username": .username, "new-password": .newPassword, "current-password": .password, "one-time-code": .oneTimeCode,
        "street-address": .fullStreetAddress, "address-line1": .streetAddressLine1, "address-line2": .streetAddressLine2,
        "address-level1": .addressState, "address-level2": .addressCity, "address-level3": .sublocality,
        "country-name": .countryName, "postal-code": .postalCode,
        "cc-name": .creditCardName, "cc-given-name": .creditCardGivenName, "cc-additional-name": .creditCardMiddleName,
        "cc-family-name": .creditCardFamilyName, "cc-number": .creditCardNumber, "cc-exp": .creditCardExpiration,
        "cc-exp-month": .creditCardExpirationMonth, "cc-exp-year": .creditCardExpirationYear,
        "cc-csc": .creditCardSecurityCode, "cc-type": .creditCardType,
        "bday": .birthdate, "bday-day": .birthdateDay, "bday-month": .birthdateMonth, "bday-year": .birthdateYear,
        "tel": .telephoneNumber, "tel-national": .telephoneNumber, "email": .emailAddress, "url": .URL,
    ]
}
#endif

/// The checkbox and radio HTML draws: a small square or circle that fills with the tint when on.
/// iOS has no native checkbox, and a switch does not fit the box the design measured.
nonisolated struct MarkswiftMarkToggleStyle: ToggleStyle {
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
        .buttonStyle(PlainButtonStyle())
    }

    @ViewBuilder private func box(on: Bool) -> some View {
        let face = on ? tint : Color.markswiftSystemBackground
        let line = on ? tint : Color.markswiftSystemGray2
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
                .foregroundStyle(Color.markswiftSystemBackground)
                .padding(2)
        case .dot:
            Circle().fill(tint).padding(3)
        }
    }
}

/// The bar a browser paints for `<progress>`/`<meter>`: a rounded track with the completed part
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
/// round thumb on it. `ImageRenderer` cannot rasterise a live `Slider`, so the fidelity views
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

/// `<details>` as the browser draws it: the captured `<summary>` (its `::marker` included) is the
/// whole tap target, the content follows at the measured gap, and there is no system chevron. `open`/`close`: the
/// content's CSS height animation, played as a `MarkswiftReveal`; nil for both = it snaps.
nonisolated struct MarkswiftDisclosureStyle: DisclosureGroupStyle {
    let spacing: CGFloat
    var open: Animation? = nil, close: Animation? = nil

    func makeBody(configuration: Configuration) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            Button {
                withAnimation(configuration.isExpanded ? close : open) { configuration.isExpanded.toggle() }
            } label: {
                configuration.label.contentShape(Rectangle())
            }
            .buttonStyle(PlainButtonStyle())
            .accessibilityValue(configuration.isExpanded ? Text("Expanded") : Text("Collapsed"))
            if configuration.isExpanded {
                if open != nil || close != nil {
                    configuration.content
                        .transition(.modifier(active: MarkswiftReveal(fraction: 0), identity: MarkswiftReveal(fraction: 1)))
                } else {
                    configuration.content
                }
            }
        }
    }
}

extension Date {
    /// A date/time `<input>` value as the wall-clock time the design wrote, in the user's time zone.
    nonisolated static func markswift(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute, second: second)) ?? .now
    }
}

extension View {
    /// `TextEditor` insets its text inside its frame (UITextView: 8 pt above and below, 5 pt line
    /// fragment padding at the sides); the CSS padding already placed it, so the editor overhangs
    /// its frame by exactly those insets.
    // ponytail: UIKit default insets as constants; recalibrate from an iOS render if an SDK changes them.
    @ViewBuilder func markswiftTextEditorInsets() -> some View {
        #if os(iOS)
        padding(EdgeInsets(top: -8, leading: -5, bottom: -8, trailing: -5))
        #else
        self
        #endif
    }

    /// App mode: an editor as tall as `text` laid out at its width and font (CSS `field-sizing: content`), so it grows
    /// with its text and with Dynamic Type; `TextEditor` alone takes whatever height it is offered. A trailing newline
    /// still opens an empty line, as it does in the editor.
    func markswiftFitsText(_ text: String) -> some View {
        Text(verbatim: text.isEmpty || text.hasSuffix("\n") ? text + " " : text)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .hidden()
            .overlay { self }
    }

    /// App mode: CSS `line-height` on a text field or editor whose text is `size` points, scaling like a font
    /// `relativeTo: style`. The leading over the face's natural line (default: SF Pro, 2444 per 2048) spaces an editor's
    /// lines and, as half-leading, pads its text above the first line and below the last (an editor's text starts at its
    /// top, where the browser's first line box does); `face` names an editor's bundled family (nil: the system font).
    /// A field's single line is centred, and at the default size the captured box already holds it (Chrome centres it
    /// in a shorter input, too): only what Dynamic Type adds pads it.
    func markswiftFieldLineHeight(_ lineHeight: CGFloat, size: CGFloat, relativeTo style: Font.TextStyle,
                                  natural: CGFloat = 2444.0 / 2048, editor: Bool = false, face: String? = nil) -> some View {
        modifier(MarkswiftFieldLineHeight(factor: lineHeight / size, natural: natural, base: size, editor: editor, face: face,
                                          relativeTo: style))
    }
}

struct MarkswiftFieldLineHeight: ViewModifier {
    let factor: CGFloat
    let natural: CGFloat
    let base: CGFloat
    let editor: Bool
    let face: String?
    @ScaledMetric private var size: CGFloat

    init(factor: CGFloat, natural: CGFloat, base: CGFloat, editor: Bool, face: String?, relativeTo style: Font.TextStyle) {
        self.factor = factor
        self.natural = natural
        self.base = base
        self.editor = editor
        self.face = face
        _size = ScaledMetric(wrappedValue: base, relativeTo: style)
    }

    func body(content: Content) -> some View {
        let leading = max(0, factor - natural)
        let half = leading * (editor ? size : max(0, size - base)) / 2
        // The editor draws its first line lower by its tall glyphs; the top pad gives that back, the bottom keeps the box.
        let tall = editor ? markswiftTallGlyphs(face, size) : 0
        content.lineSpacing(leading * size).padding(.top, half - tall).padding(.bottom, half + tall)
    }
}

/// How far iOS's text view (`TextEditor`) sets its first baseline below the face's ascent: to the top of the font's
/// bounding box when glyphs rise above the ascent (Geist: 1058 over 1005 per 1000; SF Pro's box stays below it).
// ponytail: rule measured on iOS 27 with Geist (shadcn-textarea) and SF Pro (tw-form); re-measure if a face disagrees.
nonisolated func markswiftTallGlyphs(_ face: String?, _ size: CGFloat) -> CGFloat {
    #if os(iOS)
    let font = face.map {
        CTFontCreateWithFontDescriptor(
            CTFontDescriptorCreateWithAttributes([kCTFontFamilyNameAttribute: $0] as CFDictionary), size, nil)
    } ?? CTFontCreateUIFontForLanguage(.system, size, nil)
    guard let font else { return 0 }
    let box = CTFontGetBoundingBox(font)
    return max(0, box.origin.y + box.size.height - CTFontGetAscent(font))
    #else
    return 0
    #endif
}

/// Interaction states a render harness forces on every element at once (the browser reference forces the same).
nonisolated struct MarkswiftForcedStates: OptionSet, Sendable {
    let rawValue: Int
    static let pressed = MarkswiftForcedStates(rawValue: 1)
    static let focused = MarkswiftForcedStates(rawValue: 2)
    /// Reduce Motion for harnesses (`accessibilityReduceMotion` has no public setter).
    static let reduceMotion = MarkswiftForcedStates(rawValue: 4)
}

extension EnvironmentValues {
    @Entry var markswiftForcedStates: MarkswiftForcedStates = []
}

/// Whether one design element is pressed: the live press (bound by `MarkswiftPressStyle`), or forced by a harness.
@propertyWrapper struct MarkswiftPressed: DynamicProperty {
    @State private var live = false
    @Environment(\.markswiftForcedStates) private var forced
    init() {}
    var wrappedValue: Bool { live || forced.contains(.pressed) }
    var projectedValue: Binding<Bool> { $live }
}

/// Whether one text field has focus: the live focus (bound with `.focused($…)`), or forced by a harness. Setting it
/// moves the live focus (a `<label>` tap).
@propertyWrapper struct MarkswiftFocused: DynamicProperty {
    @FocusState private var live: Bool
    @Environment(\.markswiftForcedStates) private var forced
    init() {}
    var wrappedValue: Bool {
        get { live || forced.contains(.focused) }
        nonmutating set { live = newValue }
    }
    var projectedValue: FocusState<Bool>.Binding { $live }
}

/// A plain button that reports its press, so the label can draw the design's pressed look instead of system dimming.
nonisolated struct MarkswiftPressStyle: ButtonStyle {
    let isPressed: Binding<Bool>
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.onChange(of: configuration.isPressed) { _, pressed in isPressed.wrappedValue = pressed }
    }
}
