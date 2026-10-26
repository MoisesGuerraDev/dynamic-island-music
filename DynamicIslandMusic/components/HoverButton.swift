//
//  HoverButton.swift
//  DynamicIslandMusic
//
//  Created by Kraigo on 04.09.2024.
//

import SwiftUI

struct HoverButton: View {
    var icon: String
    var iconColor: Color = .white;
    var scale: Image.Scale = .medium
    var action: () -> Void
    var contentTransition: ContentTransition = .symbolEffect;
    
    @State private var isHovering = false

    var body: some View {
        let size = CGFloat(scale == .large ? 40 : 30)
        
        Button(action: action) {
            Image(systemName: icon)
                .foregroundColor(iconColor)
                .contentTransition(contentTransition)
                .font(scale == .large ? .title : .system(size: 14, weight: .semibold))
                .frame(width: size + (scale == .large ? 6 : 2), height: size + (scale == .large ? 6 : 2))
                .contentShape(Circle())
        }
        .buttonStyle(PlainButtonStyle())
        .islandGlass(Circle())
    }
}
