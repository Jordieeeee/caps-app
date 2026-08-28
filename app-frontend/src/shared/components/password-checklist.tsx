import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PASSWORD_RULES } from '@/shared/auth/password-policy';
import { Icon } from '@/shared/components/icon';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Spacing } from '@/shared/theme/twd';

/**
 * The password rules, ticking off as they are met.
 *
 * What it replaces: a single line of grey hint text under the field, and an error
 * that only appeared after the button was pressed. That is a guessing game — the
 * rule was stated once, in the past tense of "at least 8 characters", and nothing
 * on screen ever said whether the thing being typed had got there. On a phone,
 * where the password is dots and the keyboard covers half the screen, someone
 * counting characters in their head is the app's failure, not theirs.
 *
 * ## Three states, and the third one is the point
 *
 * A rule is *unmet*, *met*, or *not yet judged*. Before anything is typed, every
 * rule is drawn in neutral grey with an empty circle: an untouched field has not
 * failed anything, and opening a form to a list of red crosses reads as an
 * accusation. Once there is a character in the box, the same list starts answering
 * — met rules turn green with a tick, unmet ones stay neutral.
 *
 * Unmet rules stay NEUTRAL rather than turning red, even mid-typing. A password
 * being built is not a password that is wrong: red belongs to the moment someone
 * submits, which is the field-level error's job. The tick is the whole signal, and
 * it is a shape as well as a colour — this app is read outdoors by people across a
 * wide range of eyesight, and colour alone fails both sunlight and colour-blindness
 * (the same argument as the notice badges in status-badge.tsx).
 *
 * The whole list is one live region, announced as "3 of 3 requirements met" rather
 * than as three separate rows changing under the cursor. A screen-reader user
 * typing into a password field should hear progress, not a stream of checkbox
 * events.
 */
export function PasswordChecklist({
  password,
  /**
   * Also check that a confirmation matches.
   *
   * Part of the same list because it is the same question — "can I press the
   * button yet?" — and a match indicator floating somewhere else is one more thing
   * to hunt for. Omitted where there is no confirmation field.
   */
  confirm,
}: {
  password: string;
  confirm?: string;
}) {
  const theme = useTwdTheme();
  const started = password.length > 0;

  const rules = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(password),
  }));

  if (confirm !== undefined) {
    rules.push({
      id: 'match',
      label: 'Both passwords match',
      // An empty confirmation is not a match, however empty the password is.
      // Otherwise two blank fields would tick this rule green on a form nobody
      // has touched.
      met: password.length > 0 && password === confirm,
    });
  }

  const met = rules.filter((rule) => rule.met).length;

  return (
    <View
      style={styles.list}
      accessible
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        started
          ? `${met} of ${rules.length} password requirements met: ${rules
              .map((rule) => `${rule.label}, ${rule.met ? 'met' : 'not yet'}`)
              .join('. ')}`
          : `Password requirements: ${rules.map((rule) => rule.label).join(', ')}.`
      }>
      {rules.map((rule) => (
        <View key={rule.id} style={styles.row}>
          {/* The marker occupies the same box in both states, so nothing shifts
              sideways as rules are met — a list that reflows while you type is a
              list you stop reading. */}
          <View style={styles.marker}>
            {rule.met ? (
              <Icon name="check" size={16} color={theme.success} />
            ) : (
              <View style={[styles.pending, { borderColor: theme.textSecondary }]} />
            )}
          </View>
          <ThemedText
            type="small"
            style={{ color: rule.met ? theme.success : theme.textSecondary }}>
            {rule.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  marker: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
});
