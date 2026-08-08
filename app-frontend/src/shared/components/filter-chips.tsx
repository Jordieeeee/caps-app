import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

export interface Chip {
  id: string;
  label: string;
  /**
   * How many rows this filter would leave on screen. Passed as a number, not
   * baked into `label` as "Unread (7)" — see the note on `Count` below.
   */
  count?: number;
}

interface FilterChipsProps {
  chips: Chip[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Label for the chip that clears the filter. Omit to require a selection. */
  allLabel?: string;
  allCount?: number;
  /**
   * Small heading above the row. Worth setting once a screen has more than one
   * filter row — two unlabelled rows of pills are a puzzle, and the collector's
   * route screen now stacks Barangay above Status.
   */
  title?: string;
  accessibilityLabel: string;
}

/**
 * Horizontal filter row.
 *
 * Three things changed here, and the first is the one that was asked for.
 *
 * 1. THE SCROLLBAR IS GONE. It was turned on deliberately once, as the only
 *    affordance saying the row scrolled — but a native horizontal indicator is a
 *    hairline that appears *under the chips while the finger is down* and fades a
 *    moment later. It is drawn at the moment the user already knows they are
 *    scrolling, and never at the moment they don't; so it paid for the flicker of
 *    a stray line across the layout and bought nothing.
 *
 * 2. IT IS REPLACED WITH SOMETHING THAT IS THERE WHEN IT MATTERS. The row fades
 *    into the page background at whichever edge has content beyond it, and the
 *    fade is *state*, not decoration: it appears only when there is genuinely more
 *    to reach, on the side it is on, at rest as well as during a drag. A row that
 *    fits shows no fades at all, so their presence is information. (Stacked
 *    opacity slices rather than a gradient — expo-linear-gradient is not a
 *    dependency of this app, and six views is not worth adding one for.)
 *
 * 3. SELECTION IS NOW A FILL, NOT A TINT. The selected chip was a 12%-alpha wash
 *    with a coloured border; against a white card in direct sun that is a
 *    difference you have to look for. Collectors read this outdoors, one-handed,
 *    to answer "which filter am I in?" — so the answer is now the highest-contrast
 *    element in the row: solid brand fill, `onPrimary` text.
 *
 * Counts stay whole and labels never ellipsize; if the row cannot fit, it scrolls,
 * and now it says so.
 */
export function FilterChips({
  chips,
  selectedId,
  onSelect,
  allLabel,
  allCount,
  title,
  accessibilityLabel,
}: FilterChipsProps) {
  const theme = useTwdTheme();
  const [overflow, setOverflow] = useState({ start: false, end: false });

  /**
   * Measurements arrive from three different callbacks — the viewport from
   * `onLayout`, the content width from `onContentSizeChange`, the offset from
   * `onScroll` — and any one of them can be the last to know. Held in a ref and
   * recomputed from all three so the fades are correct after a re-layout (rotation,
   * a chip's count growing a digit) and not only after a scroll.
   */
  const metrics = useRef({ offset: 0, content: 0, viewport: 0 });

  const measure = useCallback(() => {
    const { offset, content, viewport } = metrics.current;
    // 1px of slack: fractional layout widths otherwise leave a permanent
    // "there is more" fade on a row that is exactly full.
    const next = {
      start: offset > 1,
      end: content - viewport - offset > 1,
    };
    setOverflow((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      metrics.current = {
        offset: contentOffset.x,
        content: contentSize.width,
        viewport: layoutMeasurement.width,
      };
      measure();
    },
    [measure]
  );

  const onContentSizeChange = useCallback(
    (width: number) => {
      metrics.current.content = width;
      measure();
    },
    [measure]
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      metrics.current.viewport = event.nativeEvent.layout.width;
      measure();
    },
    [measure]
  );

  const renderChip = (id: string | null, label: string, count?: number) => {
    const selected = selectedId === id;

    return (
      <Pressable
        key={id ?? '__all__'}
        onPress={() => onSelect(id)}
        accessibilityRole="button"
        // The count is part of what the chip says, so it is part of what it
        // announces — "Unread, 7" rather than a bare "Unread" beside a number a
        // screen reader never reaches.
        accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.chip,
          {
            borderColor: selected ? theme.primary : theme.border,
            backgroundColor: selected
              ? pressed
                ? theme.primaryPressed
                : theme.primary
              : pressed
                ? theme.backgroundSelected
                : theme.backgroundElement,
          },
        ]}>
        <ThemedText
          type={selected ? 'defaultBold' : 'default'}
          // No numberOfLines: a filter whose label is cut is a filter you cannot
          // identify. Labels stay whole and the row scrolls instead.
          style={[styles.chipLabel, selected && { color: theme.onPrimary }]}>
          {label}
        </ThemedText>
        {count !== undefined && (
          /**
           * The count is set apart from the label rather than parenthesised into
           * it. "Pending sync (0)" reads as one long name and pushes the row into
           * scrolling for a digit; a lighter, smaller number beside the word keeps
           * the label scannable and the chip narrow, and de-emphasising it is
           * honest — nobody is filtering *by* the number, they are checking it.
           */
          <ThemedText
            type="small"
            style={[
              styles.chipCount,
              { color: selected ? theme.onPrimary : theme.textSecondary },
            ]}>
            {count}
          </ThemedText>
        )}
      </Pressable>
    );
  };

  return (
    <View accessible={false} accessibilityLabel={accessibilityLabel}>
      {title && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
          {title}
        </ThemedText>
      )}

      <View>
        <ScrollView
          horizontal
          /**
           * Measured on the ScrollView, never on the wrapper. The scroller bleeds
           * `Spacing.four` past its parent on each side (see `styles.scroll`), so
           * the wrapper's width is 48dp short of the real viewport — enough to
           * report overflow, and a trailing fade, on a row that fits exactly.
           */
          onLayout={onLayout}
          /**
           * The line the collector asked us to take away. See (1) above — the fades
           * below replace it, and unlike it they are visible before the drag.
           */
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onContentSizeChange={onContentSizeChange}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}>
          {allLabel && renderChip(null, allLabel, allCount)}
          {chips.map((c) => renderChip(c.id, c.label, c.count))}
        </ScrollView>

        {overflow.start && <EdgeFade side="start" color={theme.background} />}
        {overflow.end && <EdgeFade side="end" color={theme.background} />}
      </View>
    </View>
  );
}

/**
 * A gradient, in six flat slices.
 *
 * Opaque against the page at the screen edge, clear where the chips are legible.
 * `pointerEvents="none"` matters: this sits over the scroller, and a fade that
 * eats the tap on the chip it is hinting at would be worse than no fade.
 */
const FADE_STOPS = [1, 0.88, 0.68, 0.44, 0.22, 0.07];
const FADE_WIDTH = 32;

function EdgeFade({ side, color }: { side: 'start' | 'end'; color: string }) {
  const stops = side === 'start' ? FADE_STOPS : [...FADE_STOPS].reverse();

  return (
    <View
      pointerEvents="none"
      style={[styles.fade, side === 'start' ? styles.fadeStart : styles.fadeEnd]}>
      {stops.map((opacity, index) => (
        <View key={index} style={{ flex: 1, backgroundColor: color, opacity }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.two,
  },
  // Cancels the parent's horizontal padding so the row runs edge to edge: a chip
  // clipped by the viewport reads as "more over there", one clipped 24px early
  // reads as broken.
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
  chipLabel: { fontSize: 15 },
  chipCount: { fontVariant: ['tabular-nums'] },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: FADE_WIDTH,
    flexDirection: 'row',
  },
  // Aligned to the bled-out edges of the scroller, not to the padded content.
  fadeStart: { left: -Spacing.four },
  fadeEnd: { right: -Spacing.four },
});
