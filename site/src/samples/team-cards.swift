struct TeamCards: View {
    @ScaledMetric(relativeTo: .caption) private var textSize12: CGFloat = 12.0
    @ScaledMetric(relativeTo: .subheadline) private var textSize14: CGFloat = 14.0
    @ScaledMetric(relativeTo: .body) private var textSize18: CGFloat = 18.0
    @ScaledMetric(relativeTo: .title2) private var textSize24: CGFloat = 24.0

    var inviteATeammateCards: [InviteATeammateCard] = Self.inviteATeammateCards
    /// `<button>` "Message" in the design has no handler; fill in what it does.
    var onMessage: (InviteATeammateCard) -> Void = { _ in }
    /// `<button>` "Manage" in the design has no handler; fill in what it does.
    var onManage: (InviteATeammateCard) -> Void = { _ in }

    init(inviteATeammateCards: [InviteATeammateCard] = Self.inviteATeammateCards, onMessage: @escaping (InviteATeammateCard) -> Void = { _ in }, onManage: @escaping (InviteATeammateCard) -> Void = { _ in }) {
        self.inviteATeammateCards = inviteATeammateCards
        self.onMessage = onMessage
        self.onManage = onManage
    }

    var body: some View {
        v_root
    }
    // …
    // 1
    private var v_1: some View {
        VStack(alignment: .leading, spacing: 16.0) {
            ForEach(inviteATeammateCards) { inviteATeammateCard in
                InviteATeammateCardView(inviteATeammateCard: inviteATeammateCard, onMessage: { onMessage(inviteATeammateCard) }, onManage: { onManage(inviteATeammateCard) })
            }
            v_1_2
        }
        .frame(minWidth: 0.0, maxWidth: .infinity, alignment: .topLeading)
    }
