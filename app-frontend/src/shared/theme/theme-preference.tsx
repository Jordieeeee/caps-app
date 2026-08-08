import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TwdScheme } from '@/shared/theme/twd';

/**
 * Light, dark, or whatever the phone says — chosen by the person holding it.
 *
 * Until now the app read `useColorScheme()` straight from React Native, so the
 * appearance was the OS setting and nothing else. That is a reasonable default and
 * a poor floor, for two reasons that are specific to this product rather than
 * general taste:
 *
 *   • A collector reads this screen outdoors, in direct sun, for eight hours. Dark
 *     mode is the wrong choice there — a dark surface in sunlight is a mirror —
 *     and it is exactly what the OS hands them if they left the phone on the dark
 *     schedule that suits them indoors. They need to override it for one app, at
 *     the gate, without going to Settings and changing it for everything.
 *   • The reverse, at night: the last rounds of a shift, or a consumer checking a
 *     bill in bed, where the OS's daytime light theme is the harsh one.
 *
 * So the preference is three-valued and `system` remains the default. "System" is
 * not a cosmetic third option — it is the only one that keeps tracking the phone's
 * own day/night schedule, and dropping it (a plain light/dark switch) would
 * silently freeze everyone who relies on that.
 *
 * The choice is per-device, not per-account: it describes the screen in someone's
 * hand and the light it is being read in, and it must survive a sign-out on a
 * shared handset the same way it survives an app restart.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = '@twd_theme_preference';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isPreference(value: string | null): value is ThemePreference {
  return value !== null && (PREFERENCES as readonly string[]).includes(value);
}

interface ThemePreferenceValue {
  preference: ThemePreference;
  /** What `preference` actually resolves to right now, after consulting the OS. */
  scheme: TwdScheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setStored] = useState<ThemePreference>('system');

  /**
   * Read the saved choice once, after first paint.
   *
   * The first frame therefore renders as `system`, and a user who chose the
   * opposite sees one frame of the other theme on a cold start. The alternative is
   * to block the whole app behind an AsyncStorage read, which trades a flash
   * everyone might see for a delay everyone definitely gets — on a screen a
   * collector opens at 7am wanting their route. If the flash ever becomes a
   * complaint, the fix is to hold the splash screen (it is already being managed
   * in app/_layout.tsx) rather than to add a gate here.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isPreference(saved)) setStored(saved);
      } catch {
        // No saved choice, or storage is unreadable. `system` is the right default
        // in both cases and needs no explanation to the user.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    // State first, storage second: the toggle must feel instant, and a failed
    // write costs the choice on next launch rather than the choice right now.
    setStored(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemePreferenceValue>(
    () => ({
      preference,
      scheme: preference === 'system' ? resolveSystem(system) : preference,
      setPreference,
    }),
    [preference, system, setPreference]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

/** `null`/`unspecified` from the OS means "no opinion", which is light. */
function resolveSystem(system: string | null | undefined): TwdScheme {
  return system === 'dark' ? 'dark' : 'light';
}

/** The control's own hook: the choice, and how to change it. */
export function useThemePreference(): ThemePreferenceValue {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used inside <ThemePreferenceProvider>.');
  }
  return context;
}

/**
 * The scheme every themed hook resolves against.
 *
 * Falls back to the OS when no provider is mounted rather than throwing: this is
 * called from `useTheme`/`useTwdTheme`, which run in every component in the app
 * including ones rendered outside the tree in tests. A missing provider should
 * cost the override, not the colours.
 */
export function useResolvedScheme(): TwdScheme {
  const context = useContext(ThemePreferenceContext);
  const system = useColorScheme();
  return context ? context.scheme : resolveSystem(system);
}
