# `app-frontend/src` structure

## Why this differs from the proposed tree

The spec's tree assumed React Navigation — an `App.tsx` root navigator with a
`CollectorNavigator` and a `ConsumerNavigator`, and role folders at
`app-frontend/collector` / `app-frontend/consumer`. This app is **Expo Router**
(`"main": "expo-router/entry"`), where routes are derived from the filesystem
under `src/app/`. There is no `App.tsx` to write, and moving screens to
`app-frontend/collector/` would silently unregister every route — the router would
stop seeing them.

So the same separation the spec asks for is expressed in the idiom the router
requires. The deviations, and why:

| Spec said | Here | Why |
| --- | --- | --- |
| `App.tsx` root navigator | `src/app/_layout.tsx` | Expo Router owns the root; the layout is the equivalent decision point. |
| `CollectorNavigator` / `ConsumerNavigator` | `src/app/collector/_layout.tsx`, `src/app/consumer/_layout.tsx` | Same role split; file-based routing names them by folder. |
| `collector/screens/` | `src/app/collector/*.tsx` | Screens must live under `src/app` to be routes at all. |
| `collector/{components,hooks,services}` | `src/collector/{components,hooks,services}` | Non-route code must live *outside* `src/app`, or the router treats it as a route. |
| `shared/` | `src/shared/` | Unchanged. |

The one structural cost: each role's code is in two places — routes in
`src/app/<role>/`, everything else in `src/<role>/`. That split is forced by the
router, not chosen. The rule is mechanical: **if it renders as a screen it goes in
`src/app/`, otherwise it goes in `src/<role>/` or `src/shared/`.**

Role routes use plain path segments (`/collector`, `/consumer`) rather than groups
(`(collector)`), because two groups each containing an `index.tsx` would both claim
`/` and collide. Auth is a group — `(auth)` — since it has no index, so `/login`
and `/enroll` stay short.

## Layout

```
src/
├── app/                        # routes ONLY — everything here is a URL
│   ├── _layout.tsx             # root: AuthProvider + the RBAC guards
│   ├── index.tsx               # landing: redirects by decoded role
│   ├── (auth)/                 # login, enroll  (pre-login: role unknown)
│   ├── collector/              # collector screens + tab shell
│   └── consumer/               # consumer screens + tab shell
├── collector/                  # collector-only non-route code
│   ├── navigation/             # collector tab list
│   └── services/               # sync, offline queue, BLE printer
├── consumer/                   # consumer-only non-route code
│   └── navigation/             # consumer tab list
├── shared/
│   ├── auth/                   # login/enroll screens, auth state, restore logic
│   ├── components/             # UI primitives + the shared tab chrome
│   ├── hooks/                  # useConnectivity, useTwdTheme
│   ├── services/               # api client, secure token store, jwt decode
│   ├── theme/                  # TWD brand tokens
│   └── types/                  # auth contract (mirrors the backend)
├── components/                 # pre-existing Expo primitives (ThemedText/View…)
├── constants/                  # pre-existing base theme
└── hooks/                      # pre-existing colour-scheme hooks
```

`src/components`, `src/constants` and `src/hooks` predate this work and are shared
by both roles. They were left where they are: moving them would have churned every
existing import for no functional gain. Treat them as part of `shared/`.

## Rules

- Nothing role-specific in `shared/`. The tab **chrome** is shared
  (`shared/components/app-tabs.tsx`); the tab **triggers** are per-role, because
  they name role-specific routes.
- Nothing shared duplicated into `collector/` or `consumer/`.
- The login screen lives in `shared/auth/` because one form serves both roles —
  pre-login, the role is unknowable by design.
- Enrolment also lives in `shared/auth/`, not `consumer/`: it must be reachable
  before any role exists. It is consumer-only by virtue of the endpoint it calls,
  which cannot create anything else.
- Naming: kebab-case files, `PascalCase` components, named exports for screens
  (route files re-export as default, which Expo Router requires).
