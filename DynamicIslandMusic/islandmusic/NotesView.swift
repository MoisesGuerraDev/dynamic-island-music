import Defaults
import SwiftUI

/// Notes component of the open notch.
struct NotesView: View {
    @ObservedObject var notes = NotesManager.shared
    @State private var draft = ""
    @State private var asTask = true
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Text("¿Qué tienes en mente?")
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: notes.isICloud ? "icloud" : "internaldrive")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(red: 0.43, green: 0.66, blue: 1))
                    .help(notes.statusText)
            }

            ForEach(notes.visibleItems.prefix(3)) { item in
                NoteRow(item: item)
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
                Button {
                    notes.adding = true
                } label: {
                    Label("Añadir", systemImage: "plus")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.8))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                .islandGlass(Capsule())
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
                    if showAge {
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

/// "+" button next to the calendar: quick add of a task or a note through a popover (it takes the keyboard by itself).
struct QuickAddButton: View {
    @State private var open = false
    @State private var text = ""
    @State private var asTask = true

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
                Picker("", selection: $asTask) {
                    Text("Tarea").tag(true)
                    Text("Nota").tag(false)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                TextField(asTask ? "¿Qué tienes que hacer?" : "Escribe tu nota", text: $text)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 240)
                    .onSubmit(save)
                HStack {
                    Text(NotesManager.shared.isICloud ? "Se guarda en iCloud Drive" : "Se guarda en tu Mac")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Añadir", action: save)
                        .keyboardShortcut(.defaultAction)
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(14)
            .onAppear { SharingStateManager.shared.preventNotchClose = true }
            .onDisappear { SharingStateManager.shared.preventNotchClose = false }
        }
    }

    private func save() {
        NotesManager.shared.add(text: text, task: asTask)
        text = ""
        open = false
    }
}
