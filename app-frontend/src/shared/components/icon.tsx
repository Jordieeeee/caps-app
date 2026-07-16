import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

import { useTwdTheme } from '@/shared/hooks/use-twd-theme';

/**
 * The TWD icon set.
 *
 * Paths are Lucide (ISC licensed), inlined rather than pulled from
 * `lucide-react-native`. The package ships ~1500 icons and we use twelve; inlining
 * the twelve keeps the bundle honest and means the set cannot drift when the
 * package updates. Every glyph here is drawn on Lucide's 24×24 grid with a 2px
 * stroke, so they stay optically consistent at any size.
 *
 * This exists because emoji were doing this job. Emoji are not icons: they render
 * as a different vendor's artwork on every OS, they carry no `currentColor` so
 * they cannot follow the theme, screen readers announce them by their Unicode name
 * ("money with wings" for a cash payment), and they have no meaningful glyph at
 * small sizes in direct sun.
 */

export type IconName =
  | 'home'
  | 'building'
  | 'gauge'
  | 'wallet'
  | 'file-text'
  | 'menu'
  | 'printer'
  | 'banknote'
  | 'credit-card'
  | 'file-check'
  | 'refresh'
  | 'cloud-off'
  | 'check'
  | 'x'
  | 'alert-triangle'
  | 'info'
  | 'megaphone'
  | 'plus'
  | 'calendar'
  | 'chevron-right'
  | 'message-square'
  | 'log-out'
  | 'inbox'
  | 'bluetooth';

interface IconProps {
  name: IconName;
  /** Square edge length in dp. Defaults to 24 — Lucide's native grid. */
  size?: number;
  /**
   * Stroke colour. Defaults to the current text colour so an icon inherits its
   * context rather than being independently themed at each call site.
   */
  color?: string;
  /**
   * Icons are decorative by default: they sit beside a text label that already
   * says what they mean, and announcing both makes a screen reader repeat itself.
   * Pass a label only for an icon that is the *sole* carrier of meaning.
   */
  label?: string;
}

export function Icon({ name, size = 24, color, label }: IconProps) {
  const theme = useTwdTheme();
  const stroke = color ?? theme.text;

  const common: Common = {
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      // Decorative icons are hidden from the accessibility tree entirely rather
      // than announced as an unlabelled image.
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}>
      {glyph(name, common)}
    </Svg>
  );
}

type Common = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
};

function glyph(name: IconName, c: Common) {
  switch (name) {
    case 'home':
      return (
        <>
          <Path d="M3 9.5 12 3l9 6.5" {...c} />
          <Path d="M5 10v10h14V10" {...c} />
        </>
      );
    case 'building':
      return (
        <>
          <Rect x={4} y={2} width={16} height={20} rx={2} {...c} />
          <Path d="M9 22v-4h6v4" {...c} />
          <Path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" {...c} />
        </>
      );
    // Readings — a dial, not a house. A meter reader recognises a gauge.
    case 'gauge':
      return (
        <>
          <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" {...c} />
          <Path d="M12 12 16 8" {...c} />
          <Path d="M20.5 17a9 9 0 1 0-17 0" {...c} />
        </>
      );
    case 'wallet':
      return (
        <>
          <Path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" {...c} />
          <Path d="M16 12h.01" {...c} />
        </>
      );
    case 'file-text':
      return (
        <>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" {...c} />
          <Path d="M14 2v6h6" {...c} />
          <Path d="M8 13h8M8 17h8M8 9h2" {...c} />
        </>
      );
    case 'menu':
      return (
        <>
          <Path d="M4 6h16M4 12h16M4 18h16" {...c} />
        </>
      );
    case 'printer':
      return (
        <>
          <Path d="M6 9V3h12v6" {...c} />
          <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" {...c} />
          <Rect x={6} y={14} width={12} height={8} rx={1} {...c} />
        </>
      );
    case 'banknote':
      return (
        <>
          <Rect x={2} y={6} width={20} height={12} rx={2} {...c} />
          <Circle cx={12} cy={12} r={2} {...c} />
          <Path d="M6 12h.01M18 12h.01" {...c} />
        </>
      );
    case 'credit-card':
      return (
        <>
          <Rect x={2} y={5} width={20} height={14} rx={2} {...c} />
          <Path d="M2 10h20" {...c} />
        </>
      );
    case 'file-check':
      return (
        <>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" {...c} />
          <Path d="M14 2v6h6" {...c} />
          <Path d="m9 15 2 2 4-4" {...c} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M21 12a9 9 0 1 1-3-6.7L21 8" {...c} />
          <Polyline points="21 3 21 8 16 8" {...c} />
        </>
      );
    case 'cloud-off':
      return (
        <>
          <Path d="M3 3l18 18" {...c} />
          <Path d="M9.5 6.5a6 6 0 0 1 9.9 4.2A4 4 0 0 1 19 18" {...c} />
          <Path d="M6.5 9A4.5 4.5 0 0 0 7 18h9" {...c} />
        </>
      );
    case 'check':
      return <Path d="m5 13 4 4L19 7" {...c} />;
    case 'x':
      return <Path d="M18 6 6 18M6 6l12 12" {...c} />;
    case 'bluetooth':
      return <Path d="m7 7 10 10-5 5V2l5 5L7 17" {...c} />;
    case 'alert-triangle':
      return (
        <>
          <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" {...c} />
          <Path d="M12 9v4M12 17h.01" {...c} />
        </>
      );
    case 'info':
      return (
        <>
          <Circle cx={12} cy={12} r={10} {...c} />
          <Path d="M12 16v-4M12 8h.01" {...c} />
        </>
      );
    case 'megaphone':
      return (
        <>
          <Path d="m3 11 18-5v12L3 14v-3Z" {...c} />
          <Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" {...c} />
        </>
      );
    case 'plus':
      return <Path d="M12 5v14M5 12h14" {...c} />;
    case 'calendar':
      return (
        <>
          <Rect x={3} y={4} width={18} height={18} rx={2} {...c} />
          <Path d="M16 2v4M8 2v4M3 10h18" {...c} />
        </>
      );
    case 'chevron-right':
      return <Path d="m9 18 6-6-6-6" {...c} />;
    case 'message-square':
      return <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" {...c} />;
    case 'log-out':
      return (
        <>
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...c} />
          <Polyline points="16 17 21 12 16 7" {...c} />
          <Path d="M21 12H9" {...c} />
        </>
      );
    case 'inbox':
      return (
        <>
          <Polyline points="22 12 16 12 14 15 10 15 8 12 2 12" {...c} />
          <Path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" {...c} />
        </>
      );
  }
}
