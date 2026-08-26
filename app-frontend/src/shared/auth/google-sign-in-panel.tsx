import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GoogleSignInButton } from '@/shared/components/google-sign-in-button';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';
import {
  GOOGLE_FAILURE_BODIES,
  GOOGLE_FAILURE_TITLES,
  type GoogleSignInController,
} from '@/shared/auth/use-google-sign-in';

/**
 * The Google button plus everything that has to appear around it: its failure
 * banner and its progress line.
 *
 * Packaged together because the three are one control in practice. The button
 * alone cannot report a cancelled browser, and a screen that renders the
 * button without the banner produces exactly the silent no-op the spec
 * forbids. Making them one component means a future third caller cannot
 * accidentally ship the button on its own.
 */
export function GoogleSignInPanel({
  controller,
  disabled = false,
}: {
  controller: GoogleSignInController;
  /** The host screen is busy with its own submission (e.g. password sign-in). */
  disabled?: boolean;
}) {
  const theme = useTwdTheme();
  const { failure, submitting, ready, start } = controller;

  // A cancelled sign-in is not a failure worth a red banner — the user chose
  // it. Amber matches how the rest of the app tones "nothing is broken".
  const tone = failure?.kind === 'cancelled' ? theme.warning : theme.danger;
  const toneSurface =
    failure?.kind === 'cancelled' ? theme.warningSurface : theme.dangerSurface;

  return (
    <View style={styles.wrap}>
      {failure && (
        <View
          style={[styles.banner, { backgroundColor: toneSurface, borderColor: tone }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive">
          <ThemedText type="defaultBold" style={{ color: tone }}>
            {GOOGLE_FAILURE_TITLES[failure.kind]}
          </ThemedText>
          <ThemedText type="small" style={{ color: tone }}>
            {GOOGLE_FAILURE_BODIES[failure.kind]}
          </ThemedText>
        </View>
      )}

      {/* `ready` is false until the PKCE material finishes generating; a tap
          before then would open nothing. Disabled rather than hidden so the
          layout doesn't jump mid-generation. */}
      <GoogleSignInButton
        busy={submitting}
        disabled={disabled || !ready}
        onPress={() => void start()}
        accessibilityHint="Opens Google to sign you in to your Tanauan City Water District account"
      />

      {/* The button's own label is fixed by Google's branding rules, so the
          progress message lives here. Reserved height rather than a
          conditional row: the button must not shift the instant it is tapped,
          which on a slow browser launch reads as "nothing happened, tap
          again". */}
      <View style={styles.statusSlot}>
        {submitting && (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.centered}
            accessibilityLiveRegion="polite">
            Opening Google… this can take a few seconds.
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/**
 * "──── or ────". A labelled rule, not a bare line: the label is what tells
 * someone the two halves are alternatives rather than steps to do in order.
 * Hidden from screen readers, which get the same fact from the two buttons'
 * own labels and would otherwise hear a decorative word out of context.
 */
export function OrDivider({ label = 'or' }: { label?: string }) {
  const theme = useTwdTheme();

  return (
    <View style={styles.divider} importantForAccessibility="no-hide-descendants">
      <View style={[styles.rule, { backgroundColor: theme.border }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={[styles.rule, { backgroundColor: theme.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  banner: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  statusSlot: { minHeight: 20, justifyContent: 'center' },
  centered: { textAlign: 'center' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
});
