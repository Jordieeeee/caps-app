import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  CollectorProfileService,
  type CollectorProfile,
} from '@/collector/services/collector-profile';
import { useAuth } from '@/shared/auth/auth-context';
import { AuthError } from '@/shared/types/auth';
import { ScreenLoading, ScreenMessage } from '@/shared/components/screen-message';
import { useConnectivity } from '@/shared/hooks/use-connectivity';
import type { SessionSync } from '@/shared/types/auth';

/**
 * WHO the collector is, for either identity system.
 *
 * Every collector screen needs the same five facts — who am I, what is my
 * employee number, which routes am I on — and until now they all read them
 * straight off `useSession().session.user`. That works for a password session,
 * whose JWT carries the employment record, and CRASHES for a Google one:
 * useSession throws unless `status === 'signedIn'`, and an allowlisted Google
 * collector is `googleSignedIn`. Six screens, every one of them, the moment a
 * Google collector reached the collector app:
 *
 *     Render Error: useSession called outside a signed-in route.
 *
 * This is the same bug the consumer side already hit and solved with
 * useIdentity() (see auth-context.tsx) — a screen that only wants to know who
 * the user is should not have to care which system authenticated them.
 *
 * The two branches get their answer from genuinely different places, and that
 * is the whole reason this is a provider rather than a hook:
 *
 *   • PASSWORD — synchronous. The record is already in the session blob, so
 *     there is nothing to wait for and no network call to make.
 *   • GOOGLE — the session carries only { sessionToken, role, email }. The
 *     employment record lives behind GET /profile/collector, which resolves
 *     the Google identity to a collectors document server-side (see
 *     app-backend/middleware/collector-scope.js). That is a load, so it needs
 *     a place to happen once for the whole shell instead of six times.
 */
export interface CollectorIdentity {
  /** `collectors._id` — the id readings and reports are attributed to. */
  id: string;
  /** Never null: the screens print this, and a blank header is worse than a fallback. */
  name: string;
  email: string;
  employeeId: string | null;
  routeIds: string[];
}

interface CollectorIdentityValue {
  collector: CollectorIdentity;
  /**
   * Who this session is, for scoping anything cached on the handset.
   *
   * Password sessions use the collectors._id; Google sessions use the verified
   * email, because that is knowable before the employment record has been
   * fetched. Screens pass this to CollectorProfileService so one collector's
   * cached record can never be served to another on a shared phone.
   */
  identityKey: string;
  /**
   * Password sessions track token staleness and can be 'unsynced'. A Google
   * session has no refresh and therefore no staleness to report — it is online
   * or offline, derived from connectivity. Same rule as the banner in
   * collector/_layout.tsx; see that comment for why inventing a third value
   * here would be a claim the app cannot stand behind.
   */
  sync: SessionSync;
}

const CollectorIdentityContext = createContext<CollectorIdentityValue | null>(null);

/** Local part of an email, as a last-resort display name. */
function nameFromEmail(email: string): string {
  return email.split('@')[0] || 'Collector';
}

function fromProfile(profile: CollectorProfile, fallbackEmail: string): CollectorIdentity {
  const email = profile.email ?? fallbackEmail;
  return {
    id: profile.id,
    name: profile.name ?? nameFromEmail(email),
    email,
    employeeId: profile.employeeId,
    routeIds: profile.routeIds,
  };
}

export function CollectorIdentityProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const { isOnline } = useConnectivity();

  const passwordUser = state.status === 'signedIn' ? state.session.user : null;
  const googleEmail = state.status === 'googleSignedIn' ? state.session.email : null;

  const [googleIdentity, setGoogleIdentity] = useState<CollectorIdentity | null>(null);
  /**
   * Null while fine. When set, it is what to TELL them — and the two cases are
   * not the same problem, so they must not share a message.
   *
   * A 403 here is the office's doing, not the phone's: the email is signed in
   * and Google-verified, but it maps to no active `collectors` record (see
   * app-backend/middleware/collector-scope.js, which sends exactly that
   * sentence). Telling that person to "check your connection" sends them to
   * reboot their router over a problem only an admin can fix. A genuine
   * network failure is the other case, and it is the only one worth retrying
   * on the spot.
   */
  const [failure, setFailure] = useState<{ title: string; body: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!googleEmail) return;
    let cancelled = false;

    void (async () => {
      // Cache first, and shown immediately when present. A collector opening the
      // app at a gate with no signal must not wait on a round trip to learn
      // their own name — the record was cached precisely for that moment.
      const cached = await CollectorProfileService.getCached(googleEmail);
      if (cancelled) return;
      if (cached) setGoogleIdentity(fromProfile(cached.profile, googleEmail));

      try {
        const profile = await CollectorProfileService.pull(googleEmail);
        if (!cancelled) setGoogleIdentity(fromProfile(profile, googleEmail));
      } catch (error) {
        // A refresh failure is only fatal when there was nothing cached to fall
        // back to — that is the first launch, where the app genuinely does not
        // know who this is and must say so rather than guess.
        if (cancelled || cached) return;
        const denied = error instanceof AuthError && error.status === 403;
        setFailure(
          denied
            ? {
                title: 'Your collector access is not set up',
                // The server's own sentence, not a paraphrase: it names the one
                // action that resolves this, and the office is the only party
                // who can take it.
                body: error.message,
              }
            : {
                title: 'Could not load your collector record',
                body: 'Connect to the internet once so TWD can confirm who you are on this phone. Nothing saved on this device has been lost.',
              }
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleEmail, attempt]);

  const value = useMemo<CollectorIdentityValue | null>(() => {
    if (passwordUser) {
      return {
        collector: {
          id: passwordUser.id,
          name: passwordUser.name || nameFromEmail(passwordUser.email),
          email: passwordUser.email,
          employeeId: passwordUser.employeeId ?? null,
          routeIds: passwordUser.routeIds ?? [],
        },
        sync: state.status === 'signedIn' ? state.sync : 'online',
        identityKey: passwordUser.id,
      };
    }
    if (googleIdentity && googleEmail) {
      return {
        collector: googleIdentity,
        sync: isOnline === false ? 'offline' : 'online',
        identityKey: googleEmail,
      };
    }
    return null;
  }, [passwordUser, googleIdentity, googleEmail, isOnline, state]);

  if (!value) {
    if (failure) {
      return (
        <ScreenMessage
          tone="warning"
          title={failure.title}
          body={failure.body}
          action={{ label: 'Try again', onPress: retry }}
        />
      );
    }
    return <ScreenLoading label="Loading your record…" />;
  }

  return (
    <CollectorIdentityContext.Provider value={value}>{children}</CollectorIdentityContext.Provider>
  );
}

/**
 * The signed-in collector, whichever system authenticated them.
 *
 * Use this instead of useSession() on every collector screen. useSession is
 * password-only by construction and throws for a Google collector.
 */
export function useCollectorIdentity(): CollectorIdentityValue {
  const value = useContext(CollectorIdentityContext);
  if (!value) {
    throw new Error('useCollectorIdentity must be used inside <CollectorIdentityProvider>.');
  }
  return value;
}
