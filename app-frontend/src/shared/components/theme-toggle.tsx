import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/shared/components/icon';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { useThemePreference, type ThemePreference } from '@/shared/theme/theme-preference';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

interface Option {
  id: ThemePreference;
  label: string;
  icon: IconName;
  /** Read aloud after the label; explains what the option actually does. */
  hint: string;
}

const OPTIONS: Option[] = [
  {
    id: 'system',
    label: 'System',
    icon: 'smartphone',
    hint: 'Follows your phone’s own light and dark schedule',
  },
  { id: 'light', label: 'Light', icon: 'sun', hint: 'Always light — easiest to read in sunlight' },
  { id: 'dark', label: 'Dark', icon: 'moon', hint: 'Always dark — easier at night' },
];

/**
 * A segmented control, not a switch.
 *
 * A two-state switch cannot express "follow the phone", and that is the state most
 * people are in and should stay in — so a switch would force everyone who touched
 * it into a manual choice they then have to remember to undo when the season, the
 * shift, or the phone's schedule changes. Three segments make the default visible
 * and reversible.
 *
 * Icon above label, all three visible at once, no dropdown: this gets tapped once
 * or twice in a device's life, so it should cost no discovery — a picker would
 * hide two of the three options behind a tap and a modal for no gain.
 *
 * Selection is carried by fill *and* weight *and* the icon's colour, matching
 * FilterChips. One selected-state language across the app is worth more than a
 * bespoke treatment here.
 */
export function ThemeToggle() {
  const theme = useTwdTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <View
      style={[styles.group, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
      accessibilityRole="radiogroup"
      accessibilityLabel="App appearance">
      {OPTIONS.map((option) => {
        const selected = preference === option.id;

        return (
          <Pressable
            key={option.id}
            onPress={() => setPreference(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            accessibilityLabel={option.label}
            accessibilityHint={option.hint}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected
                  ? theme.primary
                  : pressed
                    ? theme.backgroundSelected
                    : 'transparent',
              },
            ]}>
            <Icon
              name={option.icon}
              size={20}
              color={selected ? theme.onPrimary : theme.textSecondary}
            />
            <ThemedText
              type={selected ? 'smallBold' : 'small'}
              style={selected ? { color: theme.onPrimary } : { color: theme.textSecondary }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    borderRadius: Radius.card,
    borderWidth: 1,
    // Insets each segment's fill so the selected pill floats inside the track
    // rather than colliding with the group's own rounded border.
    padding: Spacing.half,
    gap: Spacing.half,
  },
  option: {
    flex: 1,
    minHeight: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.two,
    borderRadius: Radius.field,
  },
});
