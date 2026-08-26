import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useResolvedScheme } from '@/shared/theme/theme-preference';
import { MIN_TAP_TARGET, Spacing } from '@/shared/theme/twd';

/**
 * Google's sign-in button, per the Sign in with Google branding guidelines.
 *
 * This is deliberately NOT a TwdButton with the word "Google" in it. Google's
 * terms treat the button as their brand asset, not ours: the mark, the two
 * approved colour schemes, the wording, and the minimum sizes are theirs to
 * specify. A brand-blue TWD pill reading "Continue with Google" is the exact
 * thing the guidelines prohibit, and it also costs users the single most
 * recognisable affordance on the screen — people look for the four-colour G,
 * not for a sentence.
 *
 * What is fixed by the guidelines and must not be "improved":
 *   - The G is the official four-colour mark, drawn from Google's own path
 *     data. Never recoloured, never monochrome, never on a coloured fill.
 *   - Light scheme #FFFFFF / #1F1F1F text / #747775 border; dark scheme
 *     #131314 / #E3E3E3 / #8E918F. Those hex values are Google's, which is
 *     why they are literals here instead of TWD theme tokens — the button is
 *     supposed to look the same in every app that uses it.
 *   - Wording comes from the approved list ("Continue with Google",
 *     "Sign in with Google", "Sign up with Google"), so `label` is a union
 *     rather than a free string. A caller cannot invent "Log in via Google".
 *
 * Where we scale rather than copy: Google specifies a 40dp button with an
 * 18dp mark and 14sp Roboto Medium. This app's floor is MIN_TAP_TARGET (48dp)
 * because TWD consumers are largely older people tapping outdoors, so the
 * button is 48dp and the mark and text are scaled with it (20dp / 16sp) —
 * which the guidelines allow, and which keeps the proportions right. Roboto
 * itself is not bundled (no custom fonts load in this app at all), so the
 * platform's own UI font stands in; adding @expo-google-fonts/roboto is the
 * only way to be literal about the typeface and it did not seem worth a
 * dependency for one button. Say the word if you want it exact.
 */

/** The approved wordings. Anything else is off-guidelines, so it isn't typable. */
type GoogleButtonLabel = 'Continue with Google' | 'Sign in with Google' | 'Sign up with Google';

interface GoogleSignInButtonProps {
  onPress: () => void;
  label?: GoogleButtonLabel;
  /** Spinner in the mark's slot; blocks input. The LABEL never changes — see below. */
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/** Google's own scheme colours, quoted exactly. Not theme tokens — by design. */
const GOOGLE_LIGHT = { surface: '#FFFFFF', pressed: '#F2F2F2', border: '#747775', text: '#1F1F1F' };
const GOOGLE_DARK = { surface: '#131314', pressed: '#1E1F20', border: '#8E918F', text: '#E3E3E3' };

export function GoogleSignInButton({
  onPress,
  label = 'Continue with Google',
  busy = false,
  disabled = false,
  style,
  accessibilityHint,
}: GoogleSignInButtonProps) {
  // useResolvedScheme, not the OS hook: the app has its own theme toggle and
  // the Google button must follow it like every other control.
  const scheme = useResolvedScheme();
  const palette = scheme === 'dark' ? GOOGLE_DARK : GOOGLE_LIGHT;
  const inert = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy }}
      style={style}>
      {({ pressed }) => (
        <View
          style={[
            styles.body,
            {
              backgroundColor: pressed && !inert ? palette.pressed : palette.surface,
              borderColor: palette.border,
              // Material's disabled treatment. The mark dims with the button
              // rather than being swapped for a greyed one — recolouring it is
              // what the guidelines forbid, reducing opacity is not.
              opacity: inert ? 0.38 : 1,
            },
          ]}>
          <View style={styles.markSlot}>
            {busy ? (
              // The mark's slot becomes the busy slot, so the label does not
              // shift sideways when the browser starts opening.
              <ActivityIndicator size="small" color={palette.text} />
            ) : (
              <GoogleMark size={MARK_SIZE} />
            )}
          </View>
          {/*
            The label stays fixed even while busy. "Opening Google…" is clearer
            copy but it is no longer one of the approved wordings, so the
            progress message lives beside the button on the login screen
            instead. Branding keeps the button; the user still gets told.
          */}
          <ThemedText style={[styles.label, { color: palette.text }]}>{label}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const MARK_SIZE = 20;

/**
 * The official four-colour G, as path data from Google's own asset on a 48
 * viewBox. Kept as vector rather than a PNG so it stays crisp at any density
 * and cannot be accidentally re-exported at the wrong size or tint.
 */
function GoogleMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityRole="image">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  body: {
    minHeight: MIN_TAP_TARGET,
    // Google's spec is a 4dp radius or a fully rounded pill; both are approved.
    // The pill matches every other control in this app, so the screen does not
    // look like it borrowed a button from somewhere else.
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    // Clear space around the mark is part of the guidelines, not padding taste.
    gap: Spacing.three,
  },
  markSlot: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    // 16 rather than Google's 14, scaled with the 48dp button — see the header.
    fontSize: 16,
    lineHeight: 20,
    // Roboto Medium is the specified face; without it bundled, the platform's
    // medium weight is the closest honest stand-in.
    fontWeight: Platform.OS === 'ios' ? '500' : '600',
  },
});
