import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

export interface Chip {
  id: string;
  label: string;
}

interface FilterChipsProps {
  chips: Chip[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Label for the chip that clears the filter. Omit to require a selection. */
  allLabel?: string;
  accessibilityLabel: string;
}

/**
 * Horizontal filter row.
 *
 * The chips were never actually truncating — they sat in a horizontal ScrollView
 * that scrolled correctly. The problem was that nothing said so:
 * `showsHorizontalScrollIndicator={false}` removed the only affordance, and the
 * row clipped flush against the parent's 24px padding, so "Residential North"
 * ending at the screen edge read as a text-overflow bug rather than as content
 * continuing offscreen. Hiding a scrollbar on a row that scrolls is a choice that
 * only works when something else signals the overflow, and nothing did.
 *
 * Three fixes, all about making the scroll legible:
 *  - the indicator is back
 *  - the row bleeds to the screen edge and re-pads inside its own content
 *    container, so a partially visible chip is clipped by the viewport rather than
 *    by a padding boundary — a chip cut off at the true edge reads as "more over
 *    there"; one cut off 24px early reads as broken
 *  - chips never ellipsize: a route filter whose label is cut is a filter you
 *    cannot identify, so labels stay whole and the row scrolls instead
 *
 * Selection is carried by fill *and* border weight, not fill alone.
 */
export function FilterChips({
  chips,
  selectedId,
  onSelect,
  allLabel,
  accessibilityLabel,
}: FilterChipsProps) {
  const theme = useTwdTheme();

  const render = (id: string | null, label: string) => {
    const selected = selectedId === id;
    return (
      <Pressable
        key={id ?? '__all__'}
        onPress={() => onSelect(id)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.chip,
          {
            borderColor: selected ? theme.primary : theme.border,
            backgroundColor: selected
              ? theme.primarySubtle
              : pressed
                ? theme.backgroundSelected
                : theme.backgroundElement,
          },
        ]}>
        <ThemedText
          type={selected ? 'defaultBold' : 'default'}
          // No numberOfLines: see above. Labels stay whole; the row scrolls.
          style={[styles.chipLabel, selected && { color: theme.primary }]}>
          {label}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View accessible={false} accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}>
        {allLabel && render(null, allLabel)}
        {chips.map((c) => render(c.id, c.label))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cancels the parent's horizontal padding so the row runs edge to edge.
  scroll: { marginHorizontal: -Spacing.four },
  scrollContent: {
    flexDirection: 'row',
    gap: Spacing.two,
    // ...and restores it inside, so the first and last chip still line up with the
    // content above them at rest.
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.one,
  },
  chip: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
  chipLabel: { fontSize: 15 },
});
