# Musafir AI — Mobile app

Expo / React Native app (Expo Router, SDK 57) for Android and iOS. It follows the user's GPS along a trip, plays the
geo-triggered audio stories from the trip pack, and lets them talk to Musafir by voice.

## Run it

```bash
npm install
cp .env.example .env    # EXPO_PUBLIC_BACKEND_URL = your computer's LAN IP, e.g. http://192.168.1.10:3000
npm run android         # or: npm run ios
```

Background location needs a development build (`expo run:*`), not Expo Go. A phone can't reach `localhost` on your
computer, so use its LAN IP. After the first native build, `npm run android:fast` / `npm run ios:fast` starts only the
dev server.

## Layout

| Path | What it holds |
|---|---|
| `src/app/` | Screens (Expo Router): `(auth)` login and sign-up, `(onboarding)`, `(tabs)` home / explore / profile, `trip/[id]`, legal and support pages |
| `src/components/trip/` | Trip view: map, now-playing card, scrubber, bottom sheet, voice record button, simulator, report modal |
| `src/components/explore/` | Partner experiences, creator packs, voice cloning |
| `src/components/ui/` | Shared UI: buttons, inputs, sheets, modals |
| `src/services/` | API calls, background geofencing, audio queue and cache, offline trip storage, auth |
| `src/context/` | Auth and user preferences |
| `src/constants/` | Theme (light and dark), map styles, onboarding options, creator packs, legal text |
| `src/config/` | Firebase and API configuration |
| `plugins/` | Expo config plugins (Android Play Console fixes) |
| `scripts/` | Build helpers (voice avatar extraction, markdown transformer) |

## Builds

```bash
npm run lint
npm run build:android            # EAS production build (also :preview)
npm run build:ios                # EAS production build, auto-submits to TestFlight
npm run submit:android           # upload to the Play Console
```

Backend API reference: [`../docs/API.md`](../docs/API.md). Screen-by-screen guide: [`../docs/FRONTEND_GUIDE.md`](../docs/FRONTEND_GUIDE.md).
Coding conventions for this folder: [`AGENTS.md`](AGENTS.md).
