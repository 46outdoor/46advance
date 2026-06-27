# 46 Advance — Native Mobile App

Native iOS/Android client for 46 Entertainment, built with Expo + React Native.
Shares the same Firebase backend as `pwa/`.

> **Status:** Planned — **not yet built**. This directory is documentation-only;
> there is no Expo/RN application code yet. The stack below is the chosen foundation
> (reused from a mature sibling project); the product use case and screen set are
> **TBD** and resolved during planning. Items marked `<!-- TBD -->` are placeholders.
> The shared callable contracts both apps will consume already exist, backend-owned,
> at `pwa/functions/src/contracts/callables/` (see `../pwa/AGENTS.md`).

> **See `../AGENTS.md` for shared/workspace rules**: cross-app coordination
> (especially Firestore document shapes and Cloud Function callables that both
> apps consume), Firebase backend config, secrets, git workflow, plan-mode
> approval, parallel-agent safety. This file covers mobile-only concerns:
> Expo/RN stack, native build, expo-router layout, and platform-specific patterns.

## Tech Stack

- **Runtime**: Expo SDK 54, React Native 0.81, React 19.1
- **Language**: TypeScript 5.9 (strict)
- **Routing**: `expo-router` v6 (file-based, typed routes enabled)
- **Navigation primitives**: `@react-navigation/bottom-tabs`, `@react-navigation/native`
- **Firebase**: `@react-native-firebase/*` (app, app-check, auth, firestore) — NOT the web SDK
- **Auth providers**: `@react-native-google-signin/google-signin`, `expo-apple-authentication`
- **Server state**: TanStack Query v5 (same as web)
- **Styling**: NativeWind 4.x + Tailwind CSS 3.4
- **Storage**: `expo-secure-store` for sensitive values
- **Build/distribution**: EAS Build; internal distribution for dev/preview, TestFlight/Play Store for production

### Why this can't use Expo Go

`@react-native-firebase/*` requires native modules. Always run in a **development
build** (EAS-built dev client), not Expo Go. Configure static linking for the RNFB
libraries via `expo-build-properties` in `app.json`.

## Project Structure

The target structure mirrors the sibling project's proven layout. Screens and
features are created as the design firms up.

```text
app/                          # expo-router file-based routes
├── _layout.tsx              # Root layout (providers, AuthGate)
├── (tabs)/                  # Tab navigator group
└── modal.tsx                # Modal route

src/
├── config/                  # App config (e.g., google-sign-in.ts)
├── features/                # Feature modules (parallel to web convention)
│   ├── auth/                # AuthGate, SignInScreen, auth-context, auth-service
│   ├── push/                # Expo push token registration, notification routing
│   └── shell/               # Tab screens, scaffolds, error boundary
├── lib/                     # Utilities (errors.ts, logger.ts, sentry.ts)
├── providers/               # app-providers.tsx wraps React Query, Auth, etc.
└── services/                # firebase.ts, app-check.ts

assets/                       # Icons, splash, fonts
GoogleService-Info.plist      # iOS Firebase config (references the shared project)
google-services.json          # Android Firebase config (references the shared project)
app.json                      # Expo config (bundle IDs, plugins, intent filters)
eas.json                      # EAS Build profiles
```

### Routing conventions (expo-router)

- File paths in `app/` map directly to routes (`app/things/[id].tsx` → `/things/:id`)
- Layouts (`_layout.tsx`) wrap their directory's routes
- Use `<Link href="/things/[id]" params={{ id }}>` with typed routes
- Deep links / universal links configured in `app.json` <!-- TBD: scheme + associated domains during planning -->

### Feature module layout

- One directory per feature under `src/features/<name>/`
- Co-locate screens (`*Screen.tsx`), components, hooks, services, and context
- Use named exports
- Tab-destination screens live in `src/features/shell/` and are referenced from `app/(tabs)/`

## Essential Commands

```bash
cd mobile

# Dev
npm run start:dev           # Metro for installed dev client (preferred)
npm run start:tunnel        # Tunnel mode if phone can't reach local network
npm run android             # Open in Android (dev client must be installed)
npm run ios                 # Open in iOS (dev client must be installed)

# Quality
npm run lint                # expo lint
npm run typecheck           # tsc --noEmit

# Dependency hygiene
npx expo install --check    # Verify SDK-compatible versions
npx expo config --type public  # Inspect resolved Expo config
```

### Builds (EAS)

```bash
eas build --profile development --platform <ios|android>   # dev client (install on device)
eas build --profile ios-simulator --platform ios          # faster iteration, no signing
eas build --profile preview --platform <ios|android>       # internal distribution
eas build --profile production --platform <ios|android>     # App Store / Play Store
eas submit --profile production --platform <ios|android>
```

The EAS project ID lives in `app.json` (`extra.eas.projectId`). <!-- TBD: provision EAS project + Expo org during planning -->

### When to rebuild the dev client

Anytime you change native config — adding a plugin, changing `app.json`
plugins/permissions, bumping a package with native code. JS/TS changes do **not**
require a rebuild; Metro live-reloads them.

## Firebase Patterns (Native)

The native SDK behaves differently from the web SDK in important ways:

### Initialization

`@react-native-firebase/app` auto-initializes from `GoogleService-Info.plist` /
`google-services.json`. Don't pass a config object — call `getApp()` and pass it
to other services:

```typescript
import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
```

### Timestamps

Native SDK returns `FirebaseFirestoreTypes.Timestamp`. Convert at read time — but
**do not import the web app's `src/lib/firestore/timestamps.ts`** (it's
web-SDK-typed). If timestamp helpers are extracted to a shared package, both apps
should switch to that.

### Offline persistence

Enabled by default in the native SDK. Don't wire up service workers / IndexedDB —
that's a web concern.

### App Check

`@react-native-firebase/app-check` should be configured (see `src/services/app-check.ts`).
Production builds use App Attest (iOS) / Play Integrity (Android); debug builds use
the debug provider.

### Auth

- Google Sign-In: `@react-native-google-signin/google-signin` returns an ID token → `auth().signInWithCredential(GoogleAuthProvider.credential(idToken))`
- Apple Sign-In: `expo-apple-authentication` returns an identity token → exchange similarly
- Secure persistence: `expo-secure-store` for refresh artifacts; never AsyncStorage for sensitive values

## Styling (NativeWind)

NativeWind compiles Tailwind class strings to React Native styles. Most utilities
work; some web-only ones (hover, certain CSS-grid features) do not.

```tsx
<View className="flex-1 items-center justify-center bg-zinc-950 p-4">
  <Text className="text-zinc-50 text-lg">Hello</Text>
</View>
```

Touch targets: minimum 44pt iOS / 48dp Android. Use `hitSlop` for small elements.

## Cross-App Discipline

This app reads/writes the **same Firestore documents** and calls the **same Cloud
Functions** as `pwa/`. Before changing:

- A Firestore document shape → grep `../pwa/src/` for read/write sites and update both
- A callable contract (`../pwa/contracts/schemas/callables/`) → update both apps and the schema together
- A security rule (`../pwa/firestore.rules`, `storage.rules`) → verify both apps still pass
- Auth custom claims / RBAC roles → update both apps' permission checks together

See `../AGENTS.md` § Cross-App Coordination for the full checklist.

### What lives in `pwa/` but is shared

- `../pwa/functions/` — Cloud Functions (shared backend)
- `../pwa/contracts/schemas/callables/` — callable input/output Zod schemas
- `../pwa/firestore.rules`, `../pwa/storage.rules` — security rules

If a Cloud Function is mobile-only, still put it in `../pwa/functions/` until a
dedicated functions package is justified.

## Important Rules

- ALWAYS run `npm run typecheck` and `npm run lint` before committing
- ALWAYS use the dev client for runtime — never expect Expo Go to work
- ALWAYS run `npx expo install <pkg>` (not `npm install <pkg>`) for Expo SDK packages — it pins SDK-compatible versions
- ALWAYS rebuild the dev client when changing `app.json` plugins/permissions or adding a package with native code
- ALWAYS check `pwa/` when modifying a Firestore shape or callable contract (see Cross-App Discipline)
- NEVER commit `GoogleService-Info.plist` / `google-services.json` that reference a different Firebase project than the shared one
- NEVER store sensitive values in AsyncStorage — use `expo-secure-store`
- NEVER use the Firebase web SDK (`firebase/*`) — always `@react-native-firebase/*`
- ALWAYS use `createLogger('Namespace')` from `src/lib/logger.ts` for logging — never `console.*` directly. `.error(msg, err)` should report to Sentry.
- For explicit error capture outside React boundaries, use `captureExceptionToSentry` from `src/lib/sentry.ts`
- Prefer file-based routes (`app/`) over manual `@react-navigation` config for new screens
- Co-locate feature screens in `src/features/<name>/` and reference them from `app/`

## Decided Patterns (carried from the sibling project)

These are the recommended defaults for when the corresponding feature is built.

- **Push notifications — Hybrid**: foreground via Firestore `onSnapshot` (same data shape as web); background/killed via Expo push tokens stored at `users/{uid}/fcmTokens/{tokenId}` with `type: "expo"`, delivered by shared Cloud Functions. Keep token document shape coordinated with `../pwa/`.
- **Error capture — Sentry**: `@sentry/react-native` initialized from `src/lib/sentry.ts`, called from `app/_layout.tsx`. The `@sentry/react-native/expo` plugin handles source maps, debug symbols, and release tagging at EAS build time. PII policy: `sendDefaultPii: false`; user context role-only.
- **Logging — `createLogger()`** mirrors the web logger API; `initSentry()` wires `setGlobalLogSink(...)` so `.error` → `Sentry.captureException` and `.info/.debug/.warn` → breadcrumbs.
- **E2E testing — defer; pre-pick Maestro** (YAML flows, no native config, works against the dev client). Until then rely on typecheck, lint, and manual dev-client testing.
