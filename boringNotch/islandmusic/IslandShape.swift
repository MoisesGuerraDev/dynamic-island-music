import SwiftUI

/// Outline of the notch: every corner is rounded with continuous curvature, so there are no flares or sharp edges.
struct IslandShape: Shape {
    var topRadius: CGFloat
    var bottomRadius: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { .init(topRadius, bottomRadius) }
        set {
            topRadius = newValue.first
            bottomRadius = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        let top = max(0, min(topRadius, rect.height / 2, rect.width / 2))
        let bottom = max(0, min(bottomRadius, rect.height / 2, rect.width / 2))
        return UnevenRoundedRectangle(
            cornerRadii: .init(topLeading: top, bottomLeading: bottom, bottomTrailing: bottom, topTrailing: top),
            style: .continuous
        ).path(in: rect)
    }
}

/// Corner radii of the notch outline.
let islandCorners: (opened: (top: CGFloat, bottom: CGFloat), closed: (top: CGFloat, bottom: CGFloat)) = (
    opened: (top: 20, bottom: 34), closed: (top: 9, bottom: 16)
)
