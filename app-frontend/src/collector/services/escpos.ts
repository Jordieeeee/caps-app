/**
 * ESC/POS byte encoding for the GOOJPRT PT-210.
 *
 * Split out from PrinterService because it is pure — strings in, bytes out — and
 * the transport around it is not testable without hardware in a bag. Everything
 * here can be checked at a desk.
 */

const ESC = 0x1b;

/** ESC @ — reset. Clears whatever mode the last job left the unit in. */
const INIT = [ESC, 0x40];
/** ESC a n — 0 left, 1 centre. Layout is done in text, so we pin it to left. */
const ALIGN_LEFT = [ESC, 0x61, 0x00];
/** ESC ! n — 0 selects Font A, the 32-char-per-line font the layout assumes. */
const FONT_A = [ESC, 0x21, 0x00];
/**
 * ESC d n — feed n lines.
 *
 * The PT-210 has no cutter, only a tear bar, and the bar sits roughly four lines
 * above the print head. Without this the last line of the receipt is still inside
 * the mechanism when the collector tries to tear it off. `GS V` (cut) is
 * deliberately absent: the unit has no blade to actuate and firmware revisions
 * differ on whether they ignore the command or print it as garbage.
 */
const FEED_TO_TEAR = [ESC, 0x64, 0x04];

/**
 * Non-ASCII → ASCII, before the bytes are built.
 *
 * The PT-210 renders a single-byte codepage selected by `ESC t n`, and which
 * codepage a given unit defaults to is not consistent across the firmware
 * revisions sold under this model number. "Niño" sent as UTF-8 becomes two bytes
 * the printer draws as two unrelated glyphs; sent as CP437 it is correct only if
 * the unit happens to be in CP437. Folding to ASCII prints "Nino" on every unit,
 * every time.
 *
 * This is a real loss — a consumer's name is spelled wrong on their receipt — and
 * it is the lesser of the two, because the alternative is mojibake that is wrong
 * *and* unreadable. Revisit by pinning `ESC t` once TWD standardises on a unit.
 */
const TRANSLITERATE: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', Á: 'A', À: 'A', Â: 'A', Ä: 'A', Ã: 'A',
  é: 'e', è: 'e', ê: 'e', ë: 'e', É: 'E', È: 'E', Ê: 'E', Ë: 'E',
  í: 'i', ì: 'i', î: 'i', ï: 'i', Í: 'I', Ì: 'I', Î: 'I', Ï: 'I',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', Ó: 'O', Ò: 'O', Ô: 'O', Ö: 'O', Õ: 'O',
  ú: 'u', ù: 'u', û: 'u', ü: 'u', Ú: 'U', Ù: 'U', Û: 'U', Ü: 'U',
  ñ: 'n', Ñ: 'N', ç: 'c', Ç: 'C',
  '₱': 'PHP ', '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...',
};

export function toAscii(text: string): string {
  let out = '';
  for (const ch of text) {
    const mapped = TRANSLITERATE[ch];
    if (mapped !== undefined) out += mapped;
    else if (ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) <= 0x7e) out += ch;
    // Anything else is dropped rather than sent as a byte the printer would draw
    // as noise.
  }
  return out;
}

/**
 * Receipt lines → the exact byte stream to hand the printer.
 *
 * `\n` (0x0A) terminates each line; the PT-210 prints on line feed and does not
 * need a carriage return.
 */
export function encodeReceipt(lines: string[]): number[] {
  const bytes: number[] = [...INIT, ...ALIGN_LEFT, ...FONT_A];

  for (const line of lines) {
    for (const ch of toAscii(line)) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  }

  bytes.push(...FEED_TO_TEAR);
  return bytes;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Bytes → base64, which is the only value type react-native-ble-plx accepts for a
 * characteristic write.
 *
 * Hand-rolled for the same reason `formatPeso` is: `Buffer` is a Node global that
 * only exists in React Native if something shims it, and `btoa` is not guaranteed
 * on Hermes. Neither is a dependency worth taking for twelve lines that cannot
 * drift.
 */
export function toBase64(bytes: number[]): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const has1 = b1 !== undefined;
    const has2 = b2 !== undefined;

    const triple = (b0 << 16) | ((has1 ? b1 : 0) << 8) | (has2 ? b2 : 0);

    out += B64_ALPHABET[(triple >> 18) & 0x3f];
    out += B64_ALPHABET[(triple >> 12) & 0x3f];
    out += has1 ? B64_ALPHABET[(triple >> 6) & 0x3f] : '=';
    out += has2 ? B64_ALPHABET[triple & 0x3f] : '=';
  }

  return out;
}

/** Split into writes of at most `size` bytes. */
export function chunk(bytes: number[], size: number): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.slice(i, i + size));
  return chunks;
}
