import AppKit
import AudioToolbox
import CoreAudio
import Defaults

/// How hard the music is hitting right now (0 to 1), so the colors can dance.
/// By default it is a beat that follows the song's own timeline. If the person allows it, it follows the real
/// volume of the sound the Mac is playing instead. Only the volume is measured: no audio is recorded or stored.
final class BeatPulse: @unchecked Sendable {
    static let shared = BeatPulse()

    private let lock = NSLock()
    private var realLevel: Float = 0
    private var lastLoud = Date.distantPast
    private var tap: AnyObject?

    /// Level at this moment, from 0 (quiet) to 1 (a hit).
    @MainActor
    func sample(at date: Date = Date()) -> Double {
        if Defaults[.realAudioBeat] {
            lock.lock()
            let level = realLevel
            let heard = date.timeIntervalSince(lastLoud) < 6
            lock.unlock()
            // No sound reaching the tap for a while (permission denied, or something it cannot hear): use the simulated beat.
            if heard { return Double(min(1, level * 5)) }
        }
        return simulated(at: date)
    }

    @MainActor
    private func simulated(at date: Date) -> Double {
        let music = MusicManager.shared
        let position = music.estimatedPlaybackPosition(at: date)
        let beats = position * tempo(for: music.songTitle + music.artistName) / 60
        let phase = beats - floor(beats)
        let kick = exp(-phase * 5.2)
        let half = beats * 2
        let halfPhase = half - floor(half)
        let hat = Int(floor(half)) % 2 == 1 ? 0.42 * exp(-halfPhase * 8) : 0
        let swell = 0.82 + 0.18 * sin(beats / 4 * 2 * .pi)
        return min(1, max(kick, hat) * swell)
    }

    /// A steady tempo for each song (86 to 133 BPM), the same every time that song plays.
    private func tempo(for key: String) -> Double {
        var hash: UInt64 = 5381
        for byte in key.utf8 { hash = (hash &* 33) &+ UInt64(byte) }
        return 86 + Double(hash % 48)
    }

    // MARK: Real sound (optional)

    /// Starts or stops the system sound level according to the setting.
    @MainActor
    func applyPreference() {
        if Defaults[.realAudioBeat] {
            guard tap == nil, #available(macOS 14.2, *) else { return }
            let audio = SystemAudioTap()
            let ok = audio.start { [weak self] rms in
                guard let self else { return }
                self.lock.lock()
                self.realLevel = max(rms, self.realLevel * 0.88)
                if rms > 0.002 { self.lastLoud = Date() }
                self.lock.unlock()
            }
            if ok { tap = audio }
        } else if #available(macOS 14.2, *) {
            (tap as? SystemAudioTap)?.stop()
            tap = nil
        }
    }
}

/// Measures the volume of everything the Mac plays, using a Core Audio process tap (macOS 14.2 and later).
@available(macOS 14.2, *)
final class SystemAudioTap {
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggregateID = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?
    private let queue = DispatchQueue(label: "dim.audio.level", qos: .userInteractive)

    func start(onLevel: @escaping @Sendable (Float) -> Void) -> Bool {
        let description = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        description.name = "Dynamic Island Music"
        description.isPrivate = true
        description.muteBehavior = .unmuted
        guard AudioHardwareCreateProcessTap(description, &tapID) == noErr else { return false }

        let aggregate: [String: Any] = [
            kAudioAggregateDeviceNameKey: "Dynamic Island Music level",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceTapListKey: [[
                kAudioSubTapUIDKey: description.uuid.uuidString,
                kAudioSubTapDriftCompensationKey: true,
            ]],
        ]
        guard AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &aggregateID) == noErr else {
            stop()
            return false
        }
        let status = AudioDeviceCreateIOProcIDWithBlock(&procID, aggregateID, queue) { _, input, _, _, _ in
            let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
            var sum: Float = 0
            var count = 0
            for buffer in buffers {
                guard let data = buffer.mData else { continue }
                let samples = data.assumingMemoryBound(to: Float.self)
                let n = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
                for i in 0..<n { sum += samples[i] * samples[i] }
                count += n
            }
            if count > 0 { onLevel((sum / Float(count)).squareRoot()) }
        }
        guard status == noErr, let procID, AudioDeviceStart(aggregateID, procID) == noErr else {
            stop()
            return false
        }
        return true
    }

    func stop() {
        if let procID {
            AudioDeviceStop(aggregateID, procID)
            AudioDeviceDestroyIOProcID(aggregateID, procID)
        }
        procID = nil
        if aggregateID != kAudioObjectUnknown {
            AudioHardwareDestroyAggregateDevice(aggregateID)
            aggregateID = AudioObjectID(kAudioObjectUnknown)
        }
        if tapID != kAudioObjectUnknown {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = AudioObjectID(kAudioObjectUnknown)
        }
    }
}
