import AppKit
import Defaults
import Foundation
import IOKit
import SwiftUI

/// Reads CPU, GPU, memory and thermal state from this Mac only. Nothing is sent anywhere.
/// It only polls while a view that shows it is on screen.
@MainActor
final class PerformanceMonitor: ObservableObject {
    static let shared = PerformanceMonitor()

    @Published private(set) var cpu: Double = 0           // 0...1
    @Published private(set) var gpu: Double?              // 0...1, nil when the Mac does not report it
    @Published private(set) var ramUsedGB: Double = 0
    @Published private(set) var ramPercent: Double = 0
    @Published private(set) var thermal: String = "Normal"
    @Published private(set) var refreshHz: Int = 60

    private var timer: Timer?
    private var users = 0
    private var lastTicks: (user: UInt64, system: UInt64, idle: UInt64, nice: UInt64)?

    func acquire() {
        users += 1
        if timer == nil {
            sample()
            let t = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.sample() }
            }
            RunLoop.main.add(t, forMode: .common)
            timer = t
        }
    }

    func release() {
        users = max(0, users - 1)
        if users == 0 {
            timer?.invalidate()
            timer = nil
        }
    }

    private func sample() {
        cpu = Self.readCPU(last: &lastTicks)
        gpu = Self.readGPU()
        let (used, pct) = Self.readRAM()
        ramUsedGB = used
        ramPercent = pct
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: thermal = "Normal"
        case .fair: thermal = "Templado"
        case .serious: thermal = "Caliente"
        case .critical: thermal = "Crítico"
        @unknown default: thermal = "—"
        }
        refreshHz = NSScreen.main?.maximumFramesPerSecond ?? 60
    }

    private static func readCPU(last: inout (user: UInt64, system: UInt64, idle: UInt64, nice: UInt64)?) -> Double {
        var load = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &load) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return 0 }
        let now = (user: UInt64(load.cpu_ticks.0), system: UInt64(load.cpu_ticks.1), idle: UInt64(load.cpu_ticks.2), nice: UInt64(load.cpu_ticks.3))
        defer { last = now }
        guard let prev = last else { return 0 }
        let user = Double(now.user &- prev.user), sys = Double(now.system &- prev.system)
        let idle = Double(now.idle &- prev.idle), nice = Double(now.nice &- prev.nice)
        let total = user + sys + idle + nice
        return total > 0 ? (user + sys + nice) / total : 0
    }

    private static func readRAM() -> (Double, Double) {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return (0, 0) }
        var pageSize: vm_size_t = 0
        host_page_size(mach_host_self(), &pageSize)
        let used = Double(UInt64(stats.active_count) + UInt64(stats.wire_count) + UInt64(stats.compressor_page_count)) * Double(pageSize)
        let total = Double(ProcessInfo.processInfo.physicalMemory)
        return (used / 1_073_741_824, total > 0 ? used / total : 0)
    }

    private static func readGPU() -> Double? {
        guard let matching = IOServiceMatching("IOAccelerator") else { return nil }
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, matching, &iterator) == KERN_SUCCESS else { return nil }
        defer { IOObjectRelease(iterator) }
        var best: Double?
        var service = IOIteratorNext(iterator)
        while service != 0 {
            defer { IOObjectRelease(service); service = IOIteratorNext(iterator) }
            var props: Unmanaged<CFMutableDictionary>?
            guard IORegistryEntryCreateCFProperties(service, &props, kCFAllocatorDefault, 0) == KERN_SUCCESS,
                  let dict = props?.takeRetainedValue() as? [String: Any],
                  let perf = dict["PerformanceStatistics"] as? [String: Any] else { continue }
            if let v = perf["Device Utilization %"] as? NSNumber {
                best = max(best ?? 0, v.doubleValue / 100)
            }
        }
        return best
    }
}

// MARK: - Views

struct PerformanceComponentView: View {
    @ObservedObject var perf = PerformanceMonitor.shared
    @Default(.perfShowCPU) var showCPU
    @Default(.perfShowGPU) var showGPU
    @Default(.perfShowRAM) var showRAM
    @Default(.perfShowRefresh) var showHz
    @Default(.perfShowThermal) var showThermal
    @Default(.perfDiscreet) var discreet
    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: discreet ? 3 : 6) {
            HStack {
                Label("Rendimiento", systemImage: "bolt").font(.system(size: discreet ? 10 : 12, weight: .semibold))
                Spacer(minLength: 0)
                if showHz {
                    Text("\(perf.refreshHz) Hz").font(.system(size: discreet ? 8.5 : 10, weight: .semibold, design: .monospaced))
                        .padding(.horizontal, 6).padding(.vertical, 2).islandGlass(Capsule(), interactive: false)
                }
            }
            if showCPU { bar("CPU", perf.cpu, "\(Int(perf.cpu * 100))%") }
            if showGPU, let g = perf.gpu { bar("GPU", g, "\(Int(g * 100))%") }
            if showRAM { bar("RAM", perf.ramPercent, String(format: "%.1f GB", perf.ramUsedGB)) }
            if showThermal {
                Text("Temperatura: \(perf.thermal)").font(.system(size: discreet ? 9 : 10.5)).foregroundStyle(.gray)
            }
            if !showCPU && !showGPU && !showRAM && !showThermal && !showHz {
                Text("Nada que mostrar. Actívalo en Ajustes › Rendimiento.").font(.system(size: 11)).foregroundStyle(.gray)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // Discreet: small and dim, clear only while the pointer is over it.
        .opacity(discreet && !hovering ? 0.38 : 1)
        .animation(.easeOut(duration: 0.2), value: hovering)
        .onHover { hovering = $0 }
        .onAppear { perf.acquire() }
        .onDisappear { perf.release() }
    }

    private func bar(_ name: String, _ value: Double, _ label: String) -> some View {
        HStack(spacing: 6) {
            Text(name).font(.system(size: discreet ? 9 : 10.5, weight: .medium)).foregroundStyle(.gray).frame(width: discreet ? 24 : 30, alignment: .leading)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.14))
                    Capsule().fill(LinearGradient(colors: [Color(nsColor: MusicManager.shared.glowColor), .white.opacity(0.9)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(3, g.size.width * min(1, value)))
                }
            }
            .frame(height: discreet ? 3 : 5)
            Text(label).font(.system(size: discreet ? 9 : 10.5, weight: .semibold, design: .monospaced)).frame(width: discreet ? 40 : 46, alignment: .trailing)
        }
    }
}
