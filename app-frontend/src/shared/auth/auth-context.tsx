import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { restoreSession } from '@/shared/auth/session-restore';
import * as api from '@/shared/services/api-client';
import { decodeAccessToken, isAccessTokenExpired } from '@/shared/services/jwt';
import { secureTokenStore } from '@/shared/services/secure-token-store';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import {
  AuthError,
  AuthErrorCode,
  ClientErrorCode,
  isSupportedRole,
  type AuthState,
  type SessionSync,
  type SignedOutReason,
  type StoredSession,
  type SupportedRole,
} from '@/shared/types/auth';

/**
 * Auth state lives in Context + useReducer rather than Redux Toolkit or Zustand.
 *
 * The store is one small state machine read by a handful of consumers, so a
 * dependency would buy us devtools and little else; and the thing that genuinely
 * needs to be readable outside React — the tokens — deliberately does not live in
 * React state at all (see secure-token-store / api-client), which is the usual
 * reason reach for Zustand's getState() here. If auth state later grows selectors
 * and cross-cutting subscribers, Zustand is the migration I'd make.
 */

type Action =
  | { type: 'restored'; state: AuthState }
  | { type: 'authenticating' }
  | { type: 'signedIn'; session: StoredSession; role: SupportedRole; sync: SessionSync }
  | { type: 'signedOut'; reason: SignedOutReason }
  | { type: 'syncChanged'; sync: SessionSync }
  | { type: 'sessionRotated'; session: StoredSession };

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case 'restored':
      return action.state;
    case 'authenticating':
      return { status: 'authenticating' };
    case 'signedIn':
      return {
        status: 'signedIn',
        session: action.session,
        role: action.role,
        sync: action.sync,
      };
    case 'signedOut':
      return { status: 'signedOut', reason: action.reason };
    case 'syncChanged':
      // Return the SAME object when nothing actually changed. Effects below depend
      // on `state`, so handing back a fresh object for a no-op edit would retrigger
      // the very effect that dispatched it — an infinite render loop.
      if (state.status !== 'signedIn' || state.sync === action.sync) return state;
      return { ...state, sync: action.sync };
    case 'sessionRotated':
      if (state.status !== 'signedIn' || state.session === action.session) return state;
      return { ...state, session: action.session };
    default:
      return state;
  }
}

interface AuthContextValue {
  state: AuthState;
  /** Live authentication. Always hits the network — for both roles. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Consumer self-enrolment. The account created is always a Consumer. */
  enroll: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-run restore — used by the "Try again" affordance on the no-connection state. */
  retryRestore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: 'restoring' } as AuthState);
  const { isOnline, isResolved } = useConnectivity();

  // Read connectivity from a ref inside callbacks so they don't need it as a dep
  // and go stale.
  const isOnlineRef = useRef<boolean | null>(isOnline);
  isOnlineRef.current = isOnline;

  const runRestore = useCallback(async (online: boolean) => {
    const outcome = await restoreSession(online);
    dispatch(
      outcome.kind === 'enter'
        ? {
            type: 'restored',
            state: {
              status: 'signedIn',
              session: outcome.session,
              role: outcome.role,
              sync: outcome.sync,
            },
          }
        : { type: 'restored', state: { status: 'signedOut', reason: outcome.reason } }
    );
  }, []);

  // Restore once connectivity is known. Waiting for the first NetInfo answer
  // matters: restoring with a guessed "offline" would send a consumer to the
  // blocked state on every cold start, and restoring with a guessed "online"
  // would make a collector wait on a doomed network call before entering.
  const hasRestored = useRef(false);
  useEffect(() => {
    if (!isResolved || hasRestored.current) return;
    hasRestored.current = true;
    void runRestore(isOnline === true);
  }, [isResolved, isOnline, runRestore]);

  // Keep React state in step with rotations performed by the API client.
  useEffect(
    () =>
      api.onSessionChange((session) => {
        if (session) dispatch({ type: 'sessionRotated', session });
        else dispatch({ type: 'signedOut', reason: { kind: 'session-expired' } });
      }),
    []
  );

  /**
   * Connectivity came back. Two different jobs, split by role — same reason the
   * restore paths are split.
   *
   * Fires only on a genuine offline -> online transition, not merely whenever we
   * happen to be online. This effect depends on `state` and also dispatches, so
   * without the transition check it would retrigger itself: a consumer whose
   * retry lands on "still unreachable" would loop straight back into another
   * retry, hammering the API from a handset with bad signal — the worst possible
   * place to do it. Tracking the previous value also skips the mount case, which
   * the initial restore above already covers.
   */
  const previouslyOnline = useRef<boolean | null>(null);
  useEffect(() => {
    const wasOnline = previouslyOnline.current;
    previouslyOnline.current = isOnline;

    if (isOnline !== true || wasOnline !== false) return;

    // Collector already inside on a stale token: refresh opportunistically and
    // clear the unsynced indicator. They keep working throughout; this is
    // background repair, not a gate.
    if (state.status === 'signedIn' && state.role === 'Collector' && state.sync !== 'online') {
      void (async () => {
        try {
          if (isAccessTokenExpired(state.session.accessToken)) {
            await api.refreshSession();
          }
          dispatch({ type: 'syncChanged', sync: 'online' });
        } catch {
          // Still unreachable, or the token is dead. If it is dead, the
          // onSessionChange listener above has already signed them out.
        }
      })();
      return;
    }

    // Consumer held at the no-connection state with a cached session: now that we
    // can make the live call their path requires, retry it for them.
    if (state.status === 'signedOut' && state.reason.kind === 'initial') {
      void runRestore(true);
    }
  }, [isOnline, state, runRestore]);

  // A signed-in collector who loses signal should see it reflected immediately.
  useEffect(() => {
    if (isOnline !== false) return;
    if (state.status !== 'signedIn' || state.sync === 'unsynced') return;
    dispatch({
      type: 'syncChanged',
      sync: isAccessTokenExpired(state.session.accessToken) ? 'unsynced' : 'offline',
    });
  }, [isOnline, state]);

  const adopt = useCallback((session: StoredSession) => {
    const claims = decodeAccessToken(session.accessToken);
    // Trust the token's claim, not the response body's user object. They should
    // agree; if they ever don't, the signed artefact is the one that counts.
    const role = claims?.role;
    if (!role || !isSupportedRole(role)) {
      void secureTokenStore.clear();
      throw new AuthError(
        ClientErrorCode.ROLE_UNSUPPORTED,
        'This account has no mobile app. Please use the TWD Admin Portal.'
      );
    }
    dispatch({ type: 'signedIn', session, role, sync: 'online' });
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: 'authenticating' });
      try {
        const session = await api.login(email, password);
        await secureTokenStore.save(session);
        adopt(session);
      } catch (error) {
        dispatch({ type: 'signedOut', reason: { kind: 'initial' } });
        throw error;
      }
    },
    [adopt]
  );

  const enroll = useCallback(
    async (name: string, email: string, password: string) => {
      dispatch({ type: 'authenticating' });
      try {
        const session = await api.register(name, email, password);
        await secureTokenStore.save(session);
        adopt(session);
      } catch (error) {
        dispatch({ type: 'signedOut', reason: { kind: 'initial' } });
        throw error;
      }
    },
    [adopt]
  );

  const signOut = useCallback(async () => {
    const session = state.status === 'signedIn' ? state.session : await secureTokenStore.load();
    if (session) await api.logout(session.refreshToken);
    await secureTokenStore.clear();
    dispatch({ type: 'signedOut', reason: { kind: 'signed-out' } });
  }, [state]);

  const retryRestore = useCallback(async () => {
    dispatch({ type: 'restored', state: { status: 'restoring' } });
    await runRestore(isOnlineRef.current === true);
  }, [runRestore]);

  const value = useMemo(
    () => ({ state, signIn, enroll, signOut, retryRestore }),
    [state, signIn, enroll, signOut, retryRestore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** Convenience for screens that are only reachable while signed in. */
export function useSession() {
  const { state } = useAuth();
  if (state.status !== 'signedIn') {
    throw new Error('useSession called outside a signed-in route.');
  }
  return state;
}

export { AuthError, AuthErrorCode };
