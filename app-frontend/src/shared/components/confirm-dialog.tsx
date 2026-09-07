import { useEffect } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TwdButton } from '@/shared/components/twd-button';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * The app's own confirmation dialog, replacing `Alert.alert` on both platforms.
 *
 * ⚠️ WHY NOT THE NATIVE ALERT, WHICH IS FREE AND FAMILIAR.
 * Because there are two of them and they disagree. iOS renders a centred card
 * with a hairline-divided stack of blue text buttons; Android renders a Material
 * dialog with a left-aligned title and two borderless text buttons pinned bottom
 * right. Same code, two different products — different type, different button
 * order, different sense of which action is dangerous. This app has a design
 * system precise enough to argue about border contrast ratios, and its most
 * consequential moment was the one screen drawn by somebody else.
 *
 * WHAT THE NATIVE ALERT GETS RIGHT, AND THIS HAS TO MATCH:
 *
 *   • It is modal to assistive tech, not merely on top. `accessibilityViewIsModal`
 *     stops VoiceOver from wandering into the screen behind it.
 *   • Android's back gesture dismisses it. `onRequestClose` is that, and it maps
 *     to cancel — never to the destructive action.
 *   • It announces itself. Screen readers get the title and body on open, because
 *     a dialog that appears silently is a dialog a blind user answers blind.
 *
 * THE DESTRUCTIVE ACTION IS NEVER THE EASY ONE. Cancel is first in the reading
 * order and is the default target of the back gesture and a scrim tap. The
 * destructive button is styled `danger` and carries its own verb ("Sign out",
 * not "OK") so the button alone says what will happen — the pattern the receipt
 * printer's notices follow for the same reason.
 *
 * LAYOUT ADAPTS TO THE NUMBER OF CHOICES, and that is not cosmetic. Two actions
 * sit side by side, which reads as a binary. Three or more stack full width: a
 * row of three squeezes labels like "Sign out anyway" to the point of truncation,
 * and the collector's unsent-work dialog is the one place in this app where
 * misreading a button loses somebody's work.
 */

export interface ConfirmAction {
  label: string;
  /** `danger` gets the destructive treatment. `secondary` is the quiet way out. */
  variant?: 'primary' | 'secondary' | 'danger';
  onPress: () => void;
}

const ENTER = Easing.bezier(0.22, 1, 0.36, 1);

export function ConfirmDialog({
  visible,
  title,
  body,
  cancelLabel = 'Cancel',
  actions,
  onCancel,
}: {
  visible: boolean;
  title: string;
  /** Supports blank lines; each paragraph is rendered separately. */
  body?: string;
  cancelLabel?: string;
  /** Everything except Cancel, in the order they should be read. */
  actions: ConfirmAction[];
  onCancel: () => void;
}) {
  const theme = useTwdTheme();

  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      progress.value = 0;
      return;
    }
    // Entrance only. There is no exit animation: `Modal` unmounts its content the
    // moment `visible` flips, so anything played on the way out is played into a
    // view that has already gone. Fading the scrim out would need the dialog to
    // own its own visibility, which would mean two sources of truth for whether
    // it is open — the exact bug class this replaces.
    progress.value = withTiming(1, { duration: 220, easing: ENTER });
    AccessibilityInfo.announceForAccessibility(body ? `${title}. ${body}` : title);
  }, [visible, title, body, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Tight amplitude, paired with opacity. A dialog that springs in from small
    // reads as a toy; 0.96 is enough to feel like it arrived rather than blinked.
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }));

  // Three or more choices cannot share a row without truncating.
  const stacked = actions.length > 1;
  const paragraphs = body ? body.split(/\n{2,}/).filter(Boolean) : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      // Android's back gesture. Maps to cancel — a destructive action must never
      // be reachable by a gesture people make without looking.
      onRequestClose={onCancel}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        {/* The scrim is a dismiss target, same as the bill calendar's. */}
        <Pressable
          style={styles.scrimPress}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}>
          {/* Swallows taps so pressing the card itself does not dismiss it. */}
          <Pressable onPress={() => {}} style={styles.cardPress}>
            <Animated.View style={cardStyle}>
              <ThemedView
                type="backgroundElement"
                accessibilityViewIsModal
                accessibilityRole="alert"
                style={[styles.card, { borderColor: theme.border }]}>
                <ThemedText type="subtitle">{title}</ThemedText>

                {paragraphs.map((p) => (
                  <ThemedText key={p} themeColor="textSecondary">
                    {p}
                  </ThemedText>
                ))}

                <View style={[styles.actions, !stacked && styles.actionsRow]}>
                  {/* Cancel first in the reading order: the safe way out should be
                      the one a screen reader reaches first. Visually it sits left
                      in a row, or last in a stack where the thumb rests. */}
                  {!stacked && (
                    <View style={styles.flex}>
                      <TwdButton label={cancelLabel} variant="secondary" onPress={onCancel} />
                    </View>
                  )}

                  {actions.map((a) => (
                    <View key={a.label} style={!stacked ? styles.flex : undefined}>
                      <TwdButton
                        label={a.label}
                        variant={a.variant ?? 'primary'}
                        onPress={a.onPress}
                      />
                    </View>
                  ))}

                  {stacked && (
                    <TwdButton label={cancelLabel} variant="secondary" onPress={onCancel} />
                  )}
                </View>
              </ThemedView>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    // A plain scrim rather than a theme token, matching bill-calendar: there is no
    // scrim in the palette, and a dimmed ground reads correctly in both themes
    // because the card above carries its own themed surface.
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  scrimPress: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  cardPress: { width: '100%', maxWidth: 380 },
  card: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  actionsRow: { flexDirection: 'row' },
  flex: { flex: 1 },
});
