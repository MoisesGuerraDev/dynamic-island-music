import Defaults
import SwiftUI

/// Notes component of the open notch.
struct NotesView: View {
    @ObservedObject var notes = NotesManager.shared
    @State private var draft = ""
    @State private var asTask = true
    @FocusState private var focused: Bool

    private var items: [NoteItem] { notes.visibleItems }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Text("¿Qué tienes en mente?")
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if items.count > 3 {
                    Text("\(items.count)")
                        .font(.system(size: 9.5, weight: .semibold).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.75))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color.white.opacity(0.12), in: Capsule())
                        .help("\(items.count) en total. Desliza para ver todas")
                }
                Image(systemName: notes.isICloud ? "icloud" : "internaldrive")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(red: 0.43, green: 0.66, blue: 1))
                    .help(notes.statusText)
            }

            ScrollList {
                ForEach(items) { item in
                    NoteRow(item: item)
                }
            }

            if notes.adding {
                TextField(asTask ? "Nueva tarea…" : "Nueva nota…", text: $draft)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                    .focused($focused)
                    .onSubmit(commit)
                    .onExitCommand { finish() }
                    .onAppear {
                        KeyboardFocus.shared.request()
                        DispatchQueue.main.async { focused = true }
                    }
            } else {
                // "Ver todo" opens the Agenda tab; in a narrow component it shows only its icon.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 6) { addButton; seeAllButton(compact: false) }
                    HStack(spacing: 6) { addButton; seeAllButton(compact: true) }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var addButton: some View {
        Button {
            notes.adding = true
        } label: {
            Label("Añadir", systemImage: "plus")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.8))
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .fixedSize()
        }
        .buttonStyle(.plain)
        .islandGlass(Capsule())
    }

    private func seeAllButton(compact: Bool) -> some View {
        Button {
            withAnimation(.smooth) { IslandViewCoordinator.shared.currentView = .agenda }
        } label: {
            Group {
                if compact { Image(systemName: "checklist") } else { Label("Ver todo", systemImage: "checklist") }
            }
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.white.opacity(0.8))
            .padding(.horizontal, compact ? 7 : 9)
            .padding(.vertical, 4)
            .fixedSize()
        }
        .buttonStyle(.plain)
        .islandGlass(Capsule())
        .help("Ver todas las notas, tareas y eventos")
    }

    private func commit() {
        notes.add(text: draft, task: asTask)
        draft = ""
        finish()
    }

    private func finish() {
        notes.adding = false
        KeyboardFocus.shared.release()
    }
}

/// Shows every row. When they do not fit, they scroll without a bar and fade out at the bottom edge.
struct ScrollList<Content: View>: View {
    var spacing: CGFloat = 5
    @ViewBuilder var content: Content

    var body: some View {
        ViewThatFits(in: .vertical) {
            stack
            ScrollView(.vertical, showsIndicators: false) { stack }
                .mask(
                    LinearGradient(
                        stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.82), .init(color: .clear, location: 1)],
                        startPoint: .top, endPoint: .bottom))
        }
    }

    private var stack: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct NoteRow: View {
    let item: NoteItem
    @ObservedObject var notes = NotesManager.shared
    @Default(.notesShowAge) var showAge

    var body: some View {
        Button {
            notes.toggle(item)
        } label: {
            HStack(alignment: .top, spacing: 6) {
                if item.isTask {
                    Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 13))
                        .foregroundStyle(item.done ? Color.blue : Color.gray)
                } else {
                    Image(systemName: "circle.fill")
                        .font(.system(size: 5))
                        .foregroundStyle(.yellow)
                        .padding(.top, 5)
                        .padding(.horizontal, 4)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.text)
                        .font(.system(size: 11.5))
                        .strikethrough(item.done)
                        .foregroundStyle(item.done ? Color.gray : Color.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let due = item.due, !item.done {
                        Label(Reminders.whenText(due), systemImage: "bell.fill")
                            .font(.system(size: 9.5))
                            .foregroundStyle(due < Date() ? Color.red.opacity(0.85) : Color(red: 0.43, green: 0.66, blue: 1))
                    } else if showAge {
                        Text(NotesManager.age(item.created))
                            .font(.system(size: 9.5))
                            .foregroundStyle(item.done ? Color.red.opacity(0.75) : Color.gray)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Mostrar en Finder") { NSWorkspace.shared.activateFileViewerSelecting([item.url]) }
            Button("Mover a la papelera", role: .destructive) { notes.delete(item) }
        }
    }
}

/// "+" button next to the calendar: quick add of a task, a note or an event through a popover (it takes the keyboard by itself).
/// Tasks and events can warn some minutes before.
struct QuickAddButton: View {
    private enum Kind { case task, note, event }

    @State private var open = false
    @State private var text = ""
    @State private var kind: Kind = .task
    @State private var remind = false
    @State private var when = QuickAddButton.nextHalfHour()
    @State private var lead = Defaults[.remindLead]
    @State private var error: String?

    private static func nextHalfHour() -> Date {
        let now = Date()
        let minute = Calendar.current.component(.minute, from: now)
        let add = minute < 30 ? 30 - minute : 60 - minute
        return Calendar.current.date(byAdding: .minute, value: add, to: now).map { Calendar.current.date(bySetting: .second, value: 0, of: $0) ?? $0 } ?? now
    }

    var body: some View {
        Button { open.toggle() } label: {
            Image(systemName: "plus")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .contentShape(RoundedRectangle(cornerRadius: 11))
        }
        .buttonStyle(.plain)
        .islandGlass(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .popover(isPresented: $open, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                Picker("", selection: $kind) {
                    Text("Tarea").tag(Kind.task)
                    Text("Nota").tag(Kind.note)
                    Text("Evento").tag(Kind.event)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                TextField(kind == .event ? "Reunión, cita, cumpleaños…" : kind == .task ? "¿Qué tienes que hacer?" : "Escribe tu nota", text: $text)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 260)
                    .onSubmit(save)
                if kind == .task {
                    Toggle("Recordármelo", isOn: $remind)
                }
                if kind == .event || (kind == .task && remind) {
                    DatePicker("Cuándo", selection: $when, displayedComponents: [.date, .hourAndMinute])
                    Picker("Avisar", selection: $lead) {
                        ForEach(Reminders.leads, id: \.minutes) { Text($0.label).tag($0.minutes) }
                    }
                }
                if let error {
                    Text(error).font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true).frame(width: 260, alignment: .leading)
                }
                HStack {
                    Text(kind == .event ? "Se guarda en tu calendario" : NotesManager.shared.isICloud ? "Se guarda en iCloud Drive" : "Se guarda en tu Mac")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Añadir", action: save)
                        .keyboardShortcut(.defaultAction)
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(14)
            .onChange(of: kind) { _, _ in error = nil }
            .onAppear { SharingStateManager.shared.hold("quickadd", true) }
            .onDisappear { SharingStateManager.shared.hold("quickadd", false) }
        }
    }

    private func save() {
        let title = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        switch kind {
        case .event:
            let start = when, minutes = lead
            Task { @MainActor in
                if let message = await Reminders.addEvent(title: title, start: start, lead: minutes) {
                    error = message
                } else {
                    finish()
                    await CalendarManager.shared.reloadCalendarAndReminderLists()
                }
            }
            return
        case .task:
            NotesManager.shared.add(text: title, task: true, due: remind ? when : nil, lead: lead)
        case .note:
            NotesManager.shared.add(text: title, task: false)
        }
        finish()
    }

    private func finish() {
        text = ""
        error = nil
        remind = false
        when = QuickAddButton.nextHalfHour()
        lead = Defaults[.remindLead]
        open = false
    }
}
