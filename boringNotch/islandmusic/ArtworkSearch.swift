import Foundation

/// Finds the official cover of a song in Apple's public catalog (iTunes Search, no account or key needed).
/// Used when a player only provides a tiny picture, as browser videos do.
enum ArtworkSearch {
    static func hdCover(title: String, artist: String) async -> Data? {
        let parts = clean(title: title, artist: artist)
        guard parts.song.count >= 2 else { return nil }

        let wantedSong = normalize(parts.song)
        let wantedArtist = normalize(parts.artist)
        func artistMatches(_ found: String) -> Bool {
            let f = normalize(found)
            return wantedArtist.isEmpty || f.contains(wantedArtist) || wantedArtist.contains(f)
                || wantedArtist.split(separator: " ").contains { $0.count > 2 && f.contains($0) }
        }

        var pool = await search("\(parts.artist) \(parts.song)")
        // 1. The song itself.
        for item in pool {
            guard let name = item["trackName"] as? String, let by = item["artistName"] as? String else { continue }
            let found = normalize(name)
            if (found == wantedSong || found.hasPrefix(wantedSong) || wantedSong.hasPrefix(found)) && artistMatches(by),
               let image = await download(item) { return image }
        }
        // 2. Not in the catalog by that name: use the album the video names after the bar ("| Un Verano Sin Ti").
        if !parts.album.isEmpty {
            let wantedAlbum = normalize(parts.album)
            pool += await search("\(parts.artist) \(parts.album)")
            for item in pool {
                guard let by = item["artistName"] as? String, artistMatches(by) else { continue }
                let album = normalize(item["collectionName"] as? String ?? "")
                let track = normalize(item["trackName"] as? String ?? "")
                if (album == wantedAlbum || track == wantedAlbum), let image = await download(item) { return image }
            }
        }
        return nil
    }

    private static func search(_ term: String) async -> [[String: Any]] {
        var comps = URLComponents(string: "https://itunes.apple.com/search")!
        comps.queryItems = [
            URLQueryItem(name: "term", value: term.trimmingCharacters(in: .whitespaces)),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "limit", value: "25"),
        ]
        guard let url = comps.url else { return [] }
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let results = json["results"] as? [[String: Any]] else { return [] }
        return results
    }

    private static func download(_ item: [String: Any]) async -> Data? {
        guard let art = item["artworkUrl100"] as? String,
              let url = URL(string: art.replacingOccurrences(of: "100x100bb", with: "1200x1200bb")),
              let (image, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200, image.count > 2000 else { return nil }
        return image
    }

    /// Turns "Bad Bunny - Yo No Soy Celoso (360° Visualizer) | Un Verano Sin Ti" into song, artist and album hint.
    static func clean(title: String, artist: String) -> (song: String, artist: String, album: String) {
        var song = title
        // Anything in brackets is decoration.
        song = song.replacingOccurrences(of: #"[\(\[\{][^\)\]\}]*[\)\]\}]"#, with: " ", options: .regularExpression)
        var album = ""
        if let bar = song.firstIndex(of: "|") {
            album = String(song[song.index(after: bar)...]).trimmingCharacters(in: .whitespaces)
            song = String(song[..<bar])
        }
        var who = artist
            .replacingOccurrences(of: " - Topic", with: "")
            .replacingOccurrences(of: #"(?i)vevo$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)

        let parts = song.components(separatedBy: " - ")
        if parts.count >= 2 {
            let left = parts[0].trimmingCharacters(in: .whitespaces)
            let right = parts.dropFirst().joined(separator: " - ").trimmingCharacters(in: .whitespaces)
            // "Artist - Song": take the artist from the title when it looks like one.
            if who.isEmpty || normalize(left).contains(normalize(who)) || normalize(who).contains(normalize(left)) || left.count < 30 {
                who = left
                song = right
            }
        }
        for noise in ["official video", "video oficial", "official audio", "audio oficial", "lyric video", "lyrics", "letra", "visualizer",
                      "music video", "videoclip", "video"] {
            song = song.replacingOccurrences(of: noise, with: "", options: [.caseInsensitive])
        }
        song = song.replacingOccurrences(of: #"(?i)\s+(ft\.?|feat\.?|featuring)\s+.*$"#, with: "", options: .regularExpression)
        let clean = song.trimmingCharacters(in: CharacterSet.whitespaces.union(.punctuationCharacters))
        return (clean, who, album)
    }

    private static func normalize(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .lowercased()
            .filter { $0.isLetter || $0.isNumber || $0 == " " }
            .split(separator: " ").joined(separator: " ")
    }
}
