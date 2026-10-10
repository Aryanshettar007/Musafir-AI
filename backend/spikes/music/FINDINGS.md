# Spike 4 — Music in Musafir: research and decision

> Desk research, 2026-10-10. No code kept. A Spotify Web API probe was written, but the run was interrupted before
> login (the machine was low on memory) and the approach was dropped. Decision is in `docs/ARCHITECTURE.md` §5.4a.

## Goal
Play real songs (not AI-generated) between stories, with an RJ introducing them, like a radio show.

## Options checked

| Option | Verdict | Why |
|---|---|---|
| Spotify Web API | ❌ dropped | Playback control is Premium-only. Since 2026, apps in development mode need a Premium owner and allow **5 users**; extended quota needs an organisation with 250k+ MAU. Can't stream audio through our app. |
| Apple Music (MusicKit) | ❌ | Official (incl. Android), but every listener needs a subscription, plus a $99/yr Apple developer account. |
| JioSaavn | ❌ | No public API. API policy (11 Aug 2026) says unauthorised access "will be legally pursued". Unofficial GitHub APIs are scrapers. |
| Wynk | ❌ | Shut down December 2024 (Airtel moved to Apple Music). |
| Gaana | ❌ | 2014 developer programme no longer active. Only unofficial wrappers. |
| YouTube Music | ❌ | No playback API. Audio-only/background playback violates YouTube API policies (e.g. Musi was pulled). |
| B2B licensed catalogues (7digital/MassiveMusic, feed.fm, Tuned Global) | ❌ for now | Paid contracts, catalogues aimed at the West, no confirmed Bollywood or regional rights. |
| Jamendo (Creative Commons) | ⚠️ | Free, full tracks, but attribution + backlinks per track, commercial use needs a quote, little Indian music. |
| Google Lyria 3.5 (AI music) | ❌ rejected | Works and fits offline packs, but the product owner wants real songs, not AI music. |

Underlying reason: Indian labels (T-Series, Saregama, YRF…) license catalogues only to streaming platforms through
direct deals. No service offers free licensed streaming to third-party apps.

## Chosen approach: control the user's own music app through system media sessions
- **Android:** `MediaSessionManager.getActiveSessions(componentName)` needs the app to have an enabled
  `NotificationListenerService`, i.e. the user grants *Notification access* in Settings. It returns a
  `MediaController` per active player: `getMetadata()` (title, artist, album), `getPlaybackState()`, and
  `getTransportControls()` (`pause`, `play`, `skipToNext`). Works with any app that publishes a media session, which
  all major music apps do. Needs a native module, so an Expo development build, not Expo Go.
- **iOS:** no API to read or control other apps' playback. Use the audio session: `expo-audio`
  `setAudioModeAsync({ interruptionMode: 'duckOthers' | 'doNotMix' })`. Expo docs don't cover whether other apps
  resume after we finish, so test on a device.
- No licensing problem: the user plays their own music in their own app; we only pause/resume it and speak between songs.

## To verify (teammate, on real devices)
1. Android module: list active sessions, read metadata, pause/resume/skip for JioSaavn, Spotify, YouTube Music.
2. How long until the music app actually pauses, so we know how early to cut before a story trigger.
3. iOS: ducking vs pause, and whether Spotify/Apple Music/JioSaavn resume after our audio ends.
4. Google Play policy and disclosure text for the Notification Listener permission.

## Sources
- Spotify 2026 dev-mode changes: https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/ ,
  https://vorplabs.com/agent-tools/spotify-api-changes , Premium requirement:
  https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- JioSaavn API policy: https://www.jiosaavn.com/corporate/api-policy
- Wynk shutdown: https://en.wikipedia.org/wiki/Wynk_Music
- Gaana 2014 programme: https://www.medianama.com/2014/02/223-gaana-developer-api/
- YouTube/Musi: https://www.digitalmusicnews.com/?p=302470
- Jamendo API terms: https://devportal.jamendo.com/api_terms_of_use
- Expo audio interruption modes: https://docs.expo.dev/versions/latest/sdk/audio/
