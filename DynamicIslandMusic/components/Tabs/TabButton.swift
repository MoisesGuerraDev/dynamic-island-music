//
//  TabButton.swift
//  boringNotch
//
//  Created by Hugo Persson on 2024-08-24.
//

import SwiftUI

struct TabButton: View {
    let label: String
    let icon: String
    let selected: Bool
    let onClick: () -> Void
    
    var body: some View {
        Button(action: onClick) {
            Image(systemName: icon)
                .font(.system(size: 12.5, weight: .medium))
                .frame(width: 34, height: 26)
                .contentShape(Capsule())
        }
        .buttonStyle(PlainButtonStyle())
        .islandGlass(Capsule(), tint: selected ? Color.white.opacity(0.28) : nil)
    }
}

#Preview {
    TabButton(label: "Home", icon: "tray.fill", selected: true) {
        print("Tapped")
    }
}
