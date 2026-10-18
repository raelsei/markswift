    @State private var isEditProfilePresented: Bool
    /// Escape or a tap outside closed edit-profile
    var onEditProfileDismissed: () -> Void = {}
    // …
    init(editProfileItems: [EditProfileItem] = Self.editProfileItems, onClose: @escaping () -> Void = {}, onSaveChanges: @escaping () -> Void = {}, onCancel: @escaping () -> Void = {}, onEditProfile: @escaping () -> Void = {}, isEditProfilePresented: Bool = false, onEditProfileDismissed: @escaping () -> Void = {}) {
    // …
    private var v_root: some View {
        VStack(alignment: .leading, spacing: 0.0) {
            v_0
        }
        .padding(16.0)
        .frame(minWidth: 0.0, maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Palette.canvas, in: Rectangle())
        .markswiftPresentation(isPresented: $isEditProfilePresented, modal: true, dismissOnEscape: true, dismissOnOutside: true, exit: .timingCurve(0.25, 0.1, 0.25, 1.0, duration: 0.1), onDismiss: onEditProfileDismissed) {
            Color.clear
            .frame(width: 390.0, height: 844.0)
            .background(Color.markswift(0.0, 0.0, 0.0, 0.1), in: Rectangle())
            .modifier(MarkswiftAnimation(motions: [MarkswiftMotion(MarkswiftTiming(duration: 0.1), opacity: MarkswiftMotionTrack(0.0, [MarkswiftSegment(1.0, 1.0, .bezier(0.25, 0.1, 0.25, 1.0))]))]))
            .allowsHitTesting(false)
            .offset(x: 0.0, y: 0.0)
            .transition(.asymmetric(insertion: .identity, removal: .modifier(active: MarkswiftExitFrame(value: MarkswiftMotionValue(opacity: 0.0), reduced: MarkswiftMotionValue(opacity: 0.0)), identity: MarkswiftExitFrame()).animation(.timingCurve(0.25, 0.1, 0.25, 1.0, duration: 0.1))))
            v_edit_profile_content
            .markswiftPlaced(.center)
            .transition(.asymmetric(insertion: .identity, removal: .modifier(active: MarkswiftExitFrame(value: MarkswiftMotionValue(opacity: 0.0, scaleX: 0.95, scaleY: 0.95), reduced: MarkswiftMotionValue(opacity: 0.0)), identity: MarkswiftExitFrame()).animation(.timingCurve(0.25, 0.1, 0.25, 1.0, duration: 0.1))))
        }
