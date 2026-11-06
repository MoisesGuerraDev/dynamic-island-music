//
//  HelperProcessGuard.swift
//  DynamicIslandMusic
//
//  Keeps track of the helper processes the app starts (the Perl MediaRemote adapter, mainly) so none
//  outlives the app. A helper that survives its parent keeps streaming into a dead pipe forever, and
//  enough of them leave the next launch waiting on adapters that never answer.
//

import AppKit
import Foundation

enum HelperProcessGuard {
    private static let lock = NSLock()
    private static var processes: [ObjectIdentifier: Process] = [:]
    private static var signalSources: [DispatchSourceSignal] = []
    private static var installed = false
    private static var cleanedOrphans = false

    /// Idempotent: hooks app termination and the usual kill signals so every registered helper dies with us.
    static func install() {
        lock.lock()
        defer { lock.unlock() }
        guard !installed else { return }
        installed = true

        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification, object: nil, queue: nil
        ) { _ in terminateAll() }

        for sig in [SIGTERM, SIGINT, SIGHUP] {
            signal(sig, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: sig, queue: .global(qos: .utility))
            source.setEventHandler {
                terminateAll()
                // Cleanup done: die the way the signal asked.
                signal(sig, SIG_DFL)
                kill(getpid(), sig)
            }
            source.resume()
            signalSources.append(source)
        }
    }

    /// A helper that should not outlive the app.
    static func register(_ process: Process) {
        lock.lock()
        processes[ObjectIdentifier(process)] = process
        lock.unlock()
    }

    static func unregister(_ process: Process) {
        lock.lock()
        processes.removeValue(forKey: ObjectIdentifier(process))
        lock.unlock()
    }

    /// Terminates every registered helper without waiting on them: safe to call from the main thread.
    static func terminateAll() {
        lock.lock()
        let all = Array(processes.values)
        lock.unlock()
        for process in all where process.isRunning {
            process.terminate()
        }
    }

    /// Perl adapters whose parent died (crash, force quit, build & run again) are adopted by launchd and
    /// keep running forever. Kills them once per launch so old sessions cannot pile up. Only touches
    /// processes running OUR bundled script that no longer have a parent.
    static func killOrphanedAdapterProcesses(scriptPath: String) {
        lock.lock()
        if cleanedOrphans {
            lock.unlock()
            return
        }
        cleanedOrphans = true
        lock.unlock()

        DispatchQueue.global(qos: .utility).async {
            let ps = Process()
            ps.executableURL = URL(fileURLWithPath: "/bin/ps")
            ps.arguments = ["-axo", "pid=,ppid=,args="]
            let pipe = Pipe()
            ps.standardOutput = pipe
            ps.standardError = FileHandle.nullDevice
            do {
                try ps.run()
            } catch {
                return
            }
            let output = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let text = String(data: output, encoding: .utf8) else { return }

            let selfPID = getpid()
            for line in text.split(separator: "\n") {
                let parts = line.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
                guard parts.count == 3,
                      let pid = Int32(parts[0]),
                      let ppid = Int32(parts[1]),
                      pid != selfPID,
                      parts[2].contains(scriptPath),
                      // Orphaned children are re-parented to launchd. Helpers of a living parent stay.
                      ppid == 1
                else { continue }
                kill(pid, SIGTERM)
            }
        }
    }
}
