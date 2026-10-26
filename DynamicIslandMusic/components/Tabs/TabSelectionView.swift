//
//  TabSelectionView.swift
//  DynamicIslandMusic
//
//  Created by Hugo Persson on 2024-08-25.
//

import SwiftUI

struct TabModel: Identifiable {
    let id = UUID()
    let label: String
    let icon: String
    let view: NotchViews
}

let tabs = [
    TabModel(label: "Inicio", icon: "house.fill", view: .home),
    TabModel(label: "Bandeja", icon: "tray.fill", view: .shelf),
    TabModel(label: "Juego", icon: "gamecontroller.fill", view: .game),
    TabModel(label: "Portapapeles", icon: "doc.on.clipboard.fill", view: .clipboard),
    TabModel(label: "Chat", icon: "sparkles", view: .chat)
]

struct TabSelectionView: View {
    @ObservedObject var coordinator = IslandViewCoordinator.shared
    @Namespace var animation
    var body: some View {
        HStack(spacing: 6) {
            ForEach(tabs) { tab in
                    TabButton(label: tab.label, icon: tab.icon, selected: coordinator.currentView == tab.view) {
                        withAnimation(.smooth) {
                            coordinator.currentView = tab.view
                        }
                    }
                    .frame(height: 26)
                    .foregroundStyle(tab.view == coordinator.currentView ? .white : .gray)
            }
        }
    }
}

#Preview {
    IslandHeader().environmentObject(IslandViewModel())
}
