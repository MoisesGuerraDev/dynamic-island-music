import AppKit
import Foundation

/// Reads the model of this Mac and the real size of each screen. Nothing leaves the Mac.
enum SystemInfo {
    static func sysctlString(_ name: String) -> String? {
        var size = 0
        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return nil }
        var buffer = [CChar](repeating: 0, count: size)
        guard sysctlbyname(name, &buffer, &size, nil, 0) == 0 else { return nil }
        return String(cString: buffer)
    }

    static var modelID: String { sysctlString("hw.model") ?? "Mac" }
    static var chip: String { sysctlString("machdep.cpu.brand_string") ?? "—" }
    static var osVersion: String { ProcessInfo.processInfo.operatingSystemVersionString }

    /// Marketing name for the models we know for sure; otherwise a generic description.
    static var friendlyModel: String {
        let known: [String: String] = [
            "Mac14,2": "MacBook Air 13\" (M2)",
            "Mac14,15": "MacBook Air 15\" (M2)",
            "Mac15,12": "MacBook Air 13\" (M3)",
            "Mac15,13": "MacBook Air 15\" (M3)",
        ]
        if let n = known[modelID] { return n }
        let hasBuiltIn = NSScreen.screens.contains { $0.safeAreaInsets.top > 0 || $0.localizedName.lowercased().contains("built-in") || $0.localizedName.lowercased().contains("integrad") }
        return hasBuiltIn ? "MacBook (\(modelID))" : "Mac (\(modelID))"
    }

    struct ScreenInfo: Identifiable {
        let id: String
        let name: String
        let points: CGSize
        let pixels: CGSize
        let scale: CGFloat
        let hz: Int
        let notch: CGSize?
        let capacity: CGFloat
    }

    @MainActor
    static func screens() -> [ScreenInfo] {
        NSScreen.screens.map { s in
            var notch: CGSize?
            if s.safeAreaInsets.top > 0,
               let l = s.auxiliaryTopLeftArea?.width, let r = s.auxiliaryTopRightArea?.width {
                notch = CGSize(width: s.frame.width - l - r, height: s.safeAreaInsets.top)
            }
            let uuid = s.displayUUID ?? UUID().uuidString
            return ScreenInfo(
                id: uuid, name: s.localizedName, points: s.frame.size,
                pixels: CGSize(width: s.frame.width * s.backingScaleFactor, height: s.frame.height * s.backingScaleFactor),
                scale: s.backingScaleFactor, hz: s.maximumFramesPerSecond, notch: notch,
                capacity: LayoutManager.shared.capacity(for: uuid))
        }
    }
}
