import SwiftUI

@MainActor func componentUsage() -> some View {
    VStack {
        TeamCard()
        TeamCard(members: [TeamCard.Member(id: "u1", name: "Lin", role: "Admin")], title: "Crew", onMessage: { member in print(member.name) })
        TeamCard.MemberView(member: TeamCard.members[0], onMessage: {})
        SettingsCard(preferences: SettingsCard.preferences, onSave: {})
        SettingsCard.PreferenceView(preference: .constant(SettingsCard.Preference(id: "u2", title: "Beta", isOn: true)))
    }
}
