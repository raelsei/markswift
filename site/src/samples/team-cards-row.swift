extension TeamCards {
    /// One row of `inviteATeammateCards`: the content that differs between the repeated elements of the design.
    struct InviteATeammateCard: Identifiable {
        /// Template path of the captured element: stable across regenerations of the same design.
        let id: String
        var fillColor: Color
        var fillColor2: Color
        var backgroundColor: Color
        var title: String
        var text: String
        var text2: String
        var foregroundColor: Color
        var backgroundColor2: Color
        var text3: String
    }

    static let inviteATeammateCards: [InviteATeammateCard] = [
        InviteATeammateCard(id: "1/0", fillColor: Color.markswift(0.145, 0.388, 0.922), fillColor2: Color.markswift(0.859, 0.918, 0.996), backgroundColor: Color.markswift(0.858, 0.918, 0.997), title: "Ada Lovelace", text: "ada@example.com", text2: "Owner", foregroundColor: Palette.emerald700, backgroundColor2: Palette.emerald50, text3: "Full access to billing, members and deploys."),
        InviteATeammateCard(id: "1/1", fillColor: Color.markswift(0.486, 0.227, 0.929), fillColor2: Color.markswift(0.929, 0.914, 0.996), backgroundColor: Color.markswift(0.929, 0.913, 0.997), title: "Grace Hopper", text: "grace@example.com", text2: "Editor", foregroundColor: Palette.slate600, backgroundColor2: Palette.slate100, text3: "Can edit content and open pull requests."),
    ]
