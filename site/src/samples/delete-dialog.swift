    init(onDelete: @escaping () -> Void = {}, onCancel: @escaping () -> Void = {}) {
        self.onDelete = onDelete
        self.onCancel = onCancel
    }

    var body: some View {
        MarkswiftBands(edges: [.atLeast(640.0)]) { band in
            v_root(band)
        }
    }

    // root
    private func v_root(_ band: Int) -> some View {
        VStack(alignment: .leading, spacing: 0.0) {
            v_0(band)
        }
        .padding(16.0)
        .frame(minWidth: 0.0, maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // 0
    private func v_0(_ band: Int) -> some View {
        Grid(alignment: .topLeading, horizontalSpacing: 16.0, verticalSpacing: 16.0) {
            GridRow {
                Group {
                    if band >= 1 {
                        v_0_0_sm
                    } else {
                        v_0_0
                    }
                }
            }
            GridRow {
                Group {
                    if band >= 1 {
                        v_0_1_sm
                    } else {
                        v_0_1
                    }
                }
            }
        }
