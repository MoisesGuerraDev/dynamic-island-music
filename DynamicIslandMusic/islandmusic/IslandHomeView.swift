import Defaults
import SwiftUI

/// Home of the open notch: a row of components that the user can turn on or off, reorder and resize.
struct IslandHomeView: View {
    @EnvironmentObject var vm: IslandViewModel
    @ObservedObject var layout = LayoutManager.shared
    @ObservedObject var webcamManager = WebcamManager.shared
    @ObservedObject var coordinator = IslandViewCoordinator.shared
    let albumArtNamespace: Namespace.ID

    @State private var wiggle = false

    var body: some View {
        let cap = layout.capacity(for: vm.screenUUID)
        let pageCount = max(1, layout.pages(capacity: cap).count)
        let page = layout.currentPage(capacity: cap)

        VStack(spacing: 6) {
            if page.isEmpty {
                Text("No hay componentes activos. Agrega uno con el lápiz.")
                    .font(.system(size: 13))
                    .foregroundStyle(.gray)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                let s = layout.scale
                let designW = page.reduce(0) { $0 + $1.width } + 2 * LayoutManager.sidePadding
                HStack(spacing: 0) {
                    ForEach(Array(page.enumerated()), id: \.element.id) { index, cfg in
                        cell(cfg, showSeparator: index > 0)
                    }
                }
                .padding(.horizontal, LayoutManager.sidePadding)
                .frame(width: designW, height: LayoutManager.designHeight)
                .scaleEffect(s, anchor: .topLeading)
                .frame(width: designW * s, height: LayoutManager.designHeight * s, alignment: .topLeading)
                .frame(maxWidth: .infinity)
            }

            if layout.editing {
                EditBar(capacity: cap, pageCount: pageCount)
            } else if pageCount > 1 {
                pageDots(pageCount)
            }
        }
        .onChange(of: layout.editing) { _, editing in
            wiggle = false
            if editing {
                withAnimation(.easeInOut(duration: 0.16).repeatForever(autoreverses: true)) { wiggle = true }
            }
        }
    }

    // MARK: Cell

    @ViewBuilder
    private func cell(_ cfg: ComponentConfig, showSeparator: Bool) -> some View {
        let editing = layout.editing
        ZStack(alignment: .topLeading) {
            content(for: cfg.id)
                .padding(.leading, cfg.id == .player ? 0 : 10)
                .padding(.trailing, 10)
                .frame(width: cfg.width, alignment: .topLeading)
                .allowsHitTesting(!editing)

            if editing {
                Button {
                    withAnimation(.smooth) { layout.setEnabled(cfg.id, false) }
                } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 22, height: 22)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .islandGlass(Circle())
                .offset(x: -2, y: -2)

                ResizeHandle(config: cfg)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
        }
        .frame(width: cfg.width)
        .background {
            if editing {
                RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.white.opacity(0.05))
            }
        }
        .overlay(alignment: .leading) {
            if showSeparator && !editing {
                Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1).padding(.vertical, 10)
            }
        }
        .rotationEffect(.degrees(editing ? (wiggle ? 0.6 : -0.6) : 0))
        .onDrag {
            layout.draggedComponent = cfg.id
            return NSItemProvider(object: cfg.id.rawValue as NSString)
        }
        .onDrop(of: [.utf8PlainText, .plainText], delegate: ReorderDelegate(target: cfg.id, layout: layout))
    }

    @ViewBuilder
    private func content(for id: IslandComponent) -> some View {
        switch id {
        case .player:
            MusicPlayerView(albumArtNamespace: albumArtNamespace)
        case .calendar:
            HStack(alignment: .top, spacing: 6) {
                IslandCalendarView()
                    .onHover { vm.isHoveringCalendar = $0 }
                    .environmentObject(vm)
                VStack(spacing: 6) {
                    AIQuickButton()
                    QuickAddButton()
                }
                .padding(.top, 4)
            }
        case .notes:
            NotesView()
        case .pomodoro:
            PomodoroView().padding(.top, 8)
        case .camera:
            CameraComponent()
        case .chat:
            ChatComponentView()
        case .clipboard:
            ClipboardComponentView()
        case .shelf:
            ShelfComponentView()
        case .game:
            GameComponentView()
        case .performance:
            PerformanceComponentView()
        }
    }

    private func pageDots(_ count: Int) -> some View {
        HStack(spacing: 8) {
            ForEach(0..<count, id: \.self) { i in
                Button { withAnimation(.smooth) { layout.pageIndex = i } } label: {
                    Circle().fill(i == layout.pageIndex ? Color.white : Color.white.opacity(0.3)).frame(width: 8, height: 8)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.bottom, 2)
    }
}

// MARK: - Edit mode helpers

private struct ResizeHandle: View {
    let config: ComponentConfig
    @ObservedObject var layout = LayoutManager.shared
    @State private var startWidth: CGFloat?

    var body: some View {
        RoundedCorner()
            .stroke(Color.white.opacity(0.85), style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
            .frame(width: 20, height: 20)
            .padding(6)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        if startWidth == nil { startWidth = config.width }
                        layout.resize(config.id, to: (startWidth ?? config.width) + v.translation.width)
                    }
                    .onEnded { _ in startWidth = nil }
            )
            .help("Arrastra para cambiar el tamaño")
    }
}

private struct RoundedCorner: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - 12))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - 12, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        return p
    }
}

private struct ReorderDelegate: DropDelegate {
    let target: IslandComponent
    let layout: LayoutManager

    func validateDrop(info: DropInfo) -> Bool { layout.editing && layout.draggedComponent != nil }
    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }
    func performDrop(info: DropInfo) -> Bool {
        guard let dragged = layout.draggedComponent else { return false }
        withAnimation(.smooth) { layout.move(dragged, before: target) }
        layout.draggedComponent = nil
        return true
    }
}

struct EditBar: View {
    let capacity: CGFloat
    let pageCount: Int
    @EnvironmentObject var vm: IslandViewModel
    @ObservedObject var layout = LayoutManager.shared

    var body: some View {
        let off = layout.configs.filter { !$0.enabled }
        HStack(spacing: 10) {
            Button("Listo") { withAnimation(.smooth) { layout.editing = false } }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 4)
                .islandGlass(Capsule(), tint: .blue.opacity(0.5))

            Text(pageCount > 1 ? "No caben todos: el resto pasa a la página 2" : "Arrastra para ordenar · esquina = tamaño")
                .font(.system(size: 11, weight: pageCount > 1 ? .medium : .regular))
                .foregroundStyle(pageCount > 1 ? Color.orange : Color.gray)
                .lineLimit(1)
                .fixedSize()

            // Every component that is turned off can be added from here (the row scrolls if they do not all fit).
            if !off.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(off) { c in
                            Button {
                                withAnimation(.smooth) { layout.setEnabled(c.id, true) }
                            } label: {
                                Label(c.id.title, systemImage: "plus")
                                    .font(.system(size: 11, weight: .medium))
                                    .padding(.horizontal, 9).padding(.vertical, 4)
                                    .foregroundStyle(.white)
                                    .fixedSize()
                            }
                            .buttonStyle(.plain)
                            .islandGlass(Capsule())
                        }
                    }
                    .padding(.vertical, 2)
                }
                .frame(maxWidth: .infinity)
            } else {
                Spacer(minLength: 6)
            }

            Text(String(format: "Espacio %.0f%%", layout.usage(for: vm.screenUUID)))
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(layout.usage(for: vm.screenUUID) > 100 ? Color.orange : Color.gray)
                .fixedSize()
        }
        .padding(.horizontal, 12)
        .frame(height: 32)
        .padding(.horizontal, LayoutManager.sidePadding)
    }
}

// MARK: - Small components

struct CameraComponent: View {
    @EnvironmentObject var vm: IslandViewModel
    @ObservedObject var webcamManager = WebcamManager.shared

    var body: some View {
        VStack(spacing: 8) {
            if vm.isCameraExpanded && webcamManager.cameraAvailable {
                CameraPreviewView(webcamManager: webcamManager)
                    .scaledToFill()
                    .frame(width: 100, height: 100)
                    .clipShape(Defaults[.mirrorShape] == .circle ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: 18)))
                    .onTapGesture { vm.toggleCameraPreview() }
            } else {
                Button { vm.toggleCameraPreview() } label: {
                    Image(systemName: "camera")
                        .font(.system(size: 24))
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .islandGlass(Circle())
            }
            Text("Espejo").font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.85))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct ShelfComponentView: View {
    @ObservedObject var tvm = ShelfStateViewModel.shared
    @ObservedObject var coordinator = IslandViewCoordinator.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Bandeja", systemImage: "tray").font(.system(size: 12, weight: .semibold))
            Text(tvm.items.isEmpty ? "Suelta archivos aquí" : "\(tvm.items.count) archivos")
                .font(.system(size: 11)).foregroundStyle(.gray)
            Button {
                withAnimation(.smooth) { coordinator.currentView = .shelf }
            } label: {
                Text("Abrir").font(.system(size: 12, weight: .semibold)).padding(.horizontal, 20).padding(.vertical, 6).foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .islandGlass(Capsule())
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
