@AGENTS.md

## Role

Act as a professional senior software engineer with production mobile experience — RBAC auth, offline-first sync, and secure token handling are areas you're expected to already have strong, defensible opinions on. Flag bad requirements instead of quietly complying with them.

## Context

You are building the login / landing screen for a **React Native** mobile app for **Tanauan City Water District (TWD)**. This single app serves two distinct roles with role-based access control (RBAC):

1. **Collector** — internal field staff (meter readers, collectors) who work assigned routes, often in areas with **no internet connectivity**.
2. **Consumer** — public utility customers who view bills, enroll accounts, and manage service.

The backend determines the user's role after authentication (via a JWT claim or equivalent) — **the client must never let the user self-select a role**. Role selection on the client is a privilege-escalation risk and is explicitly disallowed.

## Explicit assumption to validate

This spec assumes Collector and Consumer are two roles inside **one shared app binary**, gated by RBAC after login. If that assumption is wrong (i.e., these should ship as two separate apps), stop and flag it — do not silently build for one interpretation while the requirement says another.

## Functional requirements

### 1. Single unified login form

- One login screen, one form: identifier (username/phone/email) + password.
- No role toggle, no "I am a Collector / I am a Consumer" switch.
- On submit, call the auth endpoint; backend returns a JWT containing the role claim plus a refresh token.
- Client routes to `CollectorNavigator` or `ConsumerNavigator` based on the decoded role — never based on which UI the user tapped.

### 2. Role-differentiated session behavior (this is the part most likely to get built wrong — read carefully)

- **Collector sessions must support offline auto-login.** After a successful online login, cache the JWT + refresh token in secure storage (`expo-secure-store` or `react-native-keychain` — do not use AsyncStorage for tokens). On subsequent app opens, if a valid cached token exists, skip the live login call entirely and route straight into the Collector app, even with zero connectivity. Token refresh happens opportunistically when connectivity returns; expired-but-offline tokens should still allow entry with a visible "unsynced session" indicator rather than blocking the collector from working.
- **Consumer sessions require a live auth call on every fresh login.** Cached "remember me" convenience (e.g., biometric unlock of a stored token) is acceptable, but there is no offline-first requirement for Consumer — if there's no connectivity, Consumer login should fail gracefully with a clear "no connection" state, not silently degrade.
- Do not implement one offline-tolerant login path and reuse it for both roles. They have different risk profiles: a collector losing signal in the field is expected and must not block them from working; a consumer authenticating offline is not a supported case.

### 3. Consumer-only: account enrollment entry point

- Below the login form, a "Don't have an account? Enroll" path for Consumers only — this must not appear as a viable path for staff/Collector credentials. The enrollment link should not exist within a Collector's session state; if the app doesn't yet know the role (pre-login), it's fine to show enrollment as an option, but it must be labeled clearly as consumer account enrollment, not implied for staff.
- Consumers can link multiple accounts up to an enforced cap (this app doesn't need to build the multi-account UI here — just don't make an architectural choice in the login screen that would block it later, e.g., don't hardcode a 1-account-per-login assumption in the auth state shape).

### 4. Error and edge-case states (require explicit screens/states, not just toasts)

- Invalid credentials
- Account locked / disabled (e.g., delinquent Consumer account restrictions, or deactivated Collector staff account)
- No connectivity + no cached session (Consumer) → blocked with retry
- No connectivity + valid cached session (Collector) → allowed in, with a persistent but non-blocking "offline mode" banner
- Expired refresh token → forced re-login with a clear explanation, not a silent redirect

### 5. Visual / UX

- Match the existing TWD design language already established in the TWD Admin Portal (MERN + Tailwind web app) where reasonable, adapted to mobile — do not invent an unrelated visual identity.
- This is public utility infrastructure — prioritize clarity and accessibility (legible contrast, large tap targets, works for a range of literacy/tech-familiarity levels) over decorative flourish.
- Loading and offline states must be visually distinct from each other; a collector needs to instantly tell "the app is thinking" apart from "the app is not compensating for the fact that we have no signal."

## Deliverable

- React Native (functional components, hooks) login/landing screen.
- Auth state management approach (your call — Context, Zustand, Redux Toolkit — state your choice and why in 1–2 sentences, don't just default silently).
- Secure token storage wired in, with the offline/online split described above actually enforced in logic, not just commented as a TODO.
- Do not stub the RBAC routing decision — show the actual conditional navigation based on decoded role.

## What NOT to do

- Do not add a role picker/toggle anywhere in the auth flow.
- Do not use AsyncStorage for tokens.
- Do not apply the same offline-tolerance logic to both roles.
- Do not silently assume single-app-two-roles if you think two separate apps would be more appropriate — say so instead.
