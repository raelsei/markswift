/** Native rows and the same pure transitions used by their emitted actions. */
export const SELECT_LIST_RUNTIME = `
struct MarkswiftSelectChoice: Identifiable, Sendable {
    let id: Int
    let value: String
    let label: String
    let disabled: Bool
    let hidden: Bool
    var invisible = false
    var groupID: Int? = nil
    var groupLabel: String? = nil
    var groupInvisible = false
}

nonisolated func markswiftToggleSelect(_ current: Set<Int>, choice: MarkswiftSelectChoice, disabled: Bool = false) -> Set<Int> {
    guard !disabled && !choice.disabled && !choice.hidden && !choice.invisible else { return current }
    var next = current
    if next.contains(choice.id) { next.remove(choice.id) }
    else { next.insert(choice.id) }
    return next
}

nonisolated func markswiftSelectOne(_ current: Int, choice: MarkswiftSelectChoice, disabled: Bool = false) -> Int {
    guard !disabled && !choice.disabled && !choice.hidden && !choice.invisible else { return current }
    return choice.id
}

struct MarkswiftSelectRowAppearance {
    let height: CGFloat
    let padding: SwiftUI.EdgeInsets
    let font: SwiftUI.Font
    let color: SwiftUI.Color
    let background: SwiftUI.Color
    var initiallySelected = false
}

struct MarkswiftSelectRowPaint {
    let color: SwiftUI.Color
    let background: SwiftUI.Color
    var highlight: SwiftUI.Color = .clear
}

nonisolated func markswiftSelectRowPaint(_ paint: MarkswiftSelectRowAppearance, selected: Bool) -> MarkswiftSelectRowPaint {
    if selected == paint.initiallySelected { return MarkswiftSelectRowPaint(color: paint.color, background: paint.background) }
    return MarkswiftSelectRowPaint(color: paint.color, background: selected ? paint.background : .clear,
                                  highlight: selected ? .accentColor.opacity(0.18) : .clear)
}

struct MarkswiftSelectionList: SwiftUI.View {
    var identifier = ""
    let choices: [MarkswiftSelectChoice]
    let selected: Set<Int>
    var appearance: [Int: MarkswiftSelectRowAppearance] = [:]
    var groupAppearance: [Int: MarkswiftSelectRowAppearance] = [:]
    var disabled = false
    var interactive = true
    var activate: (MarkswiftSelectChoice) -> Void = { _ in }
    @SwiftUI.Environment(\\.isEnabled) private var isEnabled

    private var visibleChoices: [MarkswiftSelectChoice] { choices.filter { !$0.hidden } }

    var body: some SwiftUI.View {
        SwiftUI.ScrollView(.vertical) {
            SwiftUI.LazyVStack(alignment: .leading, spacing: 0) {
                SwiftUI.ForEach(visibleChoices) { choice in
                    if let groupID = choice.groupID,
                       visibleChoices.first(where: { $0.groupID == groupID })?.id == choice.id {
                        heading(choice.groupLabel ?? "", groupID: groupID)
                            .opacity(choice.groupInvisible ? 0 : 1)
                            .accessibilityHidden(choice.groupInvisible)
                    }
                    if choice.invisible {
                        invisibleRow(choice)
                    } else if interactive && isEnabled && !disabled && !choice.disabled {
                        SwiftUI.Button {
                            guard isEnabled && !disabled && !choice.disabled && !choice.hidden && !choice.invisible else { return }
                            activate(choice)
                        } label: {
                            row(choice)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected.contains(choice.id) ? .isSelected : [])
                        .accessibilityIdentifier(identifier + "/option/" + String(choice.id))
                        .accessibilityValue(selected.contains(choice.id) ? "selected" : "unselected")
                    } else {
                        row(choice)
                            .accessibilityAddTraits(selected.contains(choice.id) ? .isSelected : [])
                            .accessibilityIdentifier(identifier + "/option/" + String(choice.id))
                            .accessibilityValue(selected.contains(choice.id) ? "selected" : "unselected")
                    }
                }
            }
        }
        .clipped()
    }

    @SwiftUI.ViewBuilder
    private func invisibleRow(_ choice: MarkswiftSelectChoice) -> some SwiftUI.View {
        if let paint = appearance[choice.id] {
            SwiftUI.Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: paint.height)
                .accessibilityHidden(true)
                .allowsHitTesting(false)
        } else {
            // Legacy rows still reserve their native intrinsic height, without AX metadata.
            row(choice).hidden().accessibilityHidden(true).allowsHitTesting(false)
        }
    }

    @SwiftUI.ViewBuilder
    private func row(_ choice: MarkswiftSelectChoice) -> some SwiftUI.View {
        if let paint = appearance[choice.id] {
            let resolved = markswiftSelectRowPaint(paint, selected: selected.contains(choice.id))
            SwiftUI.Text(verbatim: choice.label)
                .font(paint.font)
                .foregroundStyle(resolved.color)
                .lineLimit(1)
                .frame(height: max(0, paint.height - paint.padding.top - paint.padding.bottom), alignment: .leading)
                .padding(paint.padding)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .frame(height: paint.height, alignment: .topLeading)
                .background {
                    SwiftUI.ZStack {
                        resolved.background
                        resolved.highlight
                    }
                }
                .contentShape(SwiftUI.Rectangle())
                .clipped()
        } else {
            SwiftUI.HStack(spacing: 6) {
                SwiftUI.Text(verbatim: choice.label)
                    .frame(maxWidth: .infinity, alignment: .leading)
                SwiftUI.Image(systemName: "checkmark")
                    .opacity(selected.contains(choice.id) ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 5)
            .frame(minHeight: 28)
            .contentShape(SwiftUI.Rectangle())
            .background(selected.contains(choice.id) ? SwiftUI.Color.accentColor.opacity(0.18) : SwiftUI.Color.clear)
        }
    }

    @SwiftUI.ViewBuilder
    private func heading(_ label: String, groupID: Int) -> some SwiftUI.View {
        if let paint = groupAppearance[groupID] {
            SwiftUI.Text(verbatim: label)
                .font(paint.font)
                .foregroundStyle(paint.color)
                .lineLimit(1)
                .frame(height: max(0, paint.height - paint.padding.top - paint.padding.bottom), alignment: .leading)
                .padding(paint.padding)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .frame(height: paint.height, alignment: .topLeading)
                .background(paint.background)
                .clipped()
        } else {
            SwiftUI.Text(verbatim: label)
                .fontWeight(.semibold)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
`;
