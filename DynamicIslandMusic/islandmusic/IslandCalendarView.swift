import SwiftUI

/// Calendar component laid out like the design: month on top, the day's events (or "Sin eventos") in the middle,
/// and three days at the bottom.
struct IslandCalendarView: View {
    @EnvironmentObject var vm: IslandViewModel
    @ObservedObject private var calendarManager = CalendarManager.shared
    @State private var selectedDate = Date()

    private var cal: Calendar { Calendar.current }

    var body: some View {
        let events = EventListView.filteredEvents(events: calendarManager.events)
        VStack(alignment: .leading, spacing: 0) {
            Text(selectedDate.formatted(.dateTime.month(.abbreviated)).capitalized)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)

            Spacer(minLength: 4)
            if events.isEmpty {
                Text("Sin eventos")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(maxWidth: .infinity)
            } else {
                ScrollList {
                    ForEach(events) { event in eventRow(event) }
                }
            }
            Spacer(minLength: 4)

            HStack(spacing: 0) {
                ForEach(-1...1, id: \.self) { offset in
                    dayCell(offset)
                }
            }
        }
        .padding(.top, 6)
        .padding(.bottom, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onChange(of: selectedDate) {
            Task { await calendarManager.updateCurrentDate(selectedDate) }
        }
        .onChange(of: vm.notchState) { _, _ in
            Task {
                await calendarManager.updateCurrentDate(Date.now)
                selectedDate = Date.now
            }
        }
        .onAppear {
            Task {
                await calendarManager.updateCurrentDate(Date.now)
                selectedDate = Date.now
            }
        }
    }

    private func eventRow(_ event: EventModel) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(nsColor: event.calendar.color))
                .frame(width: 3, height: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(event.title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(event.isAllDay ? "Todo el día" : event.start.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.55))
            }
        }
    }

    private func dayCell(_ offset: Int) -> some View {
        let today = cal.startOfDay(for: Date())
        let date = cal.date(byAdding: .day, value: offset, to: today) ?? today
        let selected = cal.isDate(date, inSameDayAs: selectedDate)
        return Button {
            withAnimation(.smooth(duration: 0.2)) { selectedDate = date }
        } label: {
            VStack(spacing: 1) {
                Text(date.formatted(.dateTime.weekday(.abbreviated)).lowercased())
                    .font(.system(size: 11))
                Text(date.formatted(.dateTime.day()))
                    .font(.system(size: 15, weight: selected ? .semibold : .regular))
            }
            .foregroundStyle(selected ? Color.white : Color.white.opacity(0.5))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color.white.opacity(0.16))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Three bars that dance while the music plays.
struct EqualizerBars: View {
    var color: Color
    var active: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 0.1, paused: !active)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(0..<3, id: \.self) { i in
                    let h = active ? 0.3 + 0.7 * abs(sin(t * (3.1 + Double(i) * 1.3) + Double(i))) : 0.3
                    Capsule().fill(color).frame(width: 3, height: 15 * h)
                }
            }
            .frame(width: 13, height: 15, alignment: .bottom)
        }
    }
}
