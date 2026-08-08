/**
 * Types only — `import type` is erased at compile time and emits no `require`.
 *
 * This is load-bearing, and getting it wrong once already took the whole app
 * down: `expo-print`, `expo-sharing` and `expo-file-system` are native modules
 * that a build predating them cannot resolve, so a *value* import here is
 * evaluated the moment anything reaches this file. Expo Router loads every route
 * module at startup to validate its exports, so one screen importing this file
 * meant the throw happened during route discovery — the route then had no default
 * export, and the router reported `Cannot read property 'ErrorBoundary' of
 * undefined` while the entire app, consumer side included, failed to render.
 *
 * Same rule and same reason as `react-native-ble-plx` in printer-service.ts.
 * Keep the types static and the modules lazy.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

import type * as FileSystemModule from 'expo-file-system';
import type * as PrintModule from 'expo-print';
import type * as SharingModule from 'expo-sharing';

import {
  formatReceiptLines,
  type ReceiptInvoice,
  type RouteAccount,
} from '@/shared/utils/billing-calculator';
import { formatDailyReportLines, type DailyReport } from '@/shared/utils/daily-report';

/**
 * What a collector is told when the native document modules are missing.
 *
 * Names the cause. "Could not create the file" would send someone looking for a
 * full disk or a permissions problem; the real answer is that this build predates
 * the feature and only a new development build adds it.
 */
export const DOWNLOAD_UNAVAILABLE_MESSAGE =
  'Saving documents needs a newer development build of the app. This build cannot ' +
  'create PDFs — printing and everything else works normally.';

/**
 * The names these packages register their native counterparts under.
 *
 * Read off the packages themselves — `expo-print/build/ExponentPrint.js` does
 * `requireNativeModule('ExpoPrint')`, sharing does `'ExpoSharing'`, and
 * `expo-file-system/src/ExpoFileSystem.ts` does `'FileSystem'` (not
 * `'ExpoFileSystem'`, which is the trap). If a package is upgraded and renames
 * its native module, the probe below silently reports "unavailable" and the
 * feature disables itself rather than misbehaving — verify these on upgrade.
 */
const NATIVE_PRINT = 'ExpoPrint';
const NATIVE_SHARING = 'ExpoSharing';
const NATIVE_FILE_SYSTEM = 'FileSystem';

/**
 * Ask the native registry directly, without loading the JS package.
 *
 * This is the whole fix, and a `try`/`catch` around `require()` is NOT a
 * substitute for it. Metro's dev-mode `guardedLoadModule` wraps the outermost
 * module initialisation in its own try/catch:
 *
 *     try { returnValue = loadModuleImplementation(...); }
 *     catch (e) { global.ErrorUtils.reportFatalError(e); }
 *     return returnValue;                       // undefined, never rethrown
 *
 * So when `expo-print/build/ExponentPrint.js` throws `Cannot find native module
 * 'ExpoPrint'` at module scope, Metro reports it as a fatal error — the red
 * screen — and hands the caller `undefined`. The caller's own catch never runs,
 * because nothing was ever rethrown. Guarding the require is therefore useless
 * against the crash; the only way to avoid it is to not require the package.
 *
 * `requireOptionalNativeModule` returns null instead of throwing, and
 * `expo-modules-core` is the foundation every Expo module already sits on, so it
 * is present in any build that runs at all.
 */
function hasNativeModule(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) !== null;
  } catch {
    return false;
  }
}

/**
 * One-shot lazy loader that cannot retry.
 *
 * `attempted` is set *before* the require, and is a separate flag rather than a
 * sentinel on the value. The previous version memoised on `undefined` meaning
 * "not attempted" — and Metro returns exactly `undefined` from a module whose
 * initialisation it swallowed, so the memo never took, every render re-ran the
 * require, and the same red screen fired again and again. That is why the error
 * appeared repeatedly instead of once.
 */
function lazyNativeModule<T>(nativeName: string, load: () => T): () => T | null {
  let resolved: T | null = null;
  let attempted = false;

  return () => {
    if (attempted) return resolved;
    attempted = true;

    if (!hasNativeModule(nativeName)) return null;

    try {
      // `?? null` because Metro hands back undefined for a module it failed to
      // initialise, and undefined must not read as a usable module.
      resolved = load() ?? null;
    } catch {
      resolved = null;
    }
    return resolved;
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadPrint = lazyNativeModule(NATIVE_PRINT, () => require('expo-print') as typeof PrintModule);
const loadSharing = lazyNativeModule(
  NATIVE_SHARING,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('expo-sharing') as typeof SharingModule
);
const loadFileSystem = lazyNativeModule(
  NATIVE_FILE_SYSTEM,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('expo-file-system') as typeof FileSystemModule
);

/** True only when all three natives resolved. Documents need every one of them. */
export function isDocumentModuleAvailable(): boolean {
  return loadPrint() !== null && loadSharing() !== null && loadFileSystem() !== null;
}

/**
 * Softcopy documents — the receipt and the daily report, as shareable PDFs.
 *
 * This exists because paper is the only copy this app has ever produced, and the
 * PT-210 is the single point of failure for all of it: no printer paired, flat
 * battery, out of paper, or simply a consumer who wants the receipt on their
 * phone rather than a till roll that fades. A collector with no printer could
 * record a reading and hand over nothing at all.
 *
 * ── Why the PDF is monospace, and why it is not "designed" ───────────────────
 *
 * The receipt body is `formatReceiptLines()` verbatim — the same function, the
 * same 32-column strings, that the thermal printer receives. A second layout for
 * the PDF would be a second source of truth for a *financial document*, and the
 * two would drift the moment a charge line is added to one and not the other. A
 * consumer holding the paper slip and the emailed PDF must be able to compare
 * them line for line and find them identical, because they are the same receipt.
 *
 * So the PDF is a faithful transcription, not a redesign. It looks like a receipt
 * because it is one.
 *
 * ── Platform notes ──────────────────────────────────────────────────────────
 *
 * `expo-print`, `expo-sharing` and `expo-file-system` are native modules, so a
 * new development build is required after adding them — same constraint the BLE
 * printer already imposes. `isDownloadSupported()` reports whether the share
 * sheet is actually usable so the UI can disable the control rather than fail on
 * tap; see PrintButton for the same pattern applied to the printer.
 */

/** Where a generated document ended up, and what it should be called. */
export interface SoftCopy {
  uri: string;
  filename: string;
}

/**
 * Escapes text before it is interpolated into the print HTML.
 *
 * Not optional politeness: consumer names and addresses come from the district's
 * registry and legitimately contain `&` ("Cruz & Sons") and occasionally angle
 * brackets from bad data entry. Unescaped, `&` silently swallows the following
 * characters as an entity and the receipt quietly prints the wrong name — on a
 * document someone pays against.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wrap pre-formatted lines in a minimal print stylesheet.
 *
 * `white-space: pre` (not `pre-wrap`): every line is already padded to its final
 * width by the receipt formatter, and letting the renderer re-wrap a long line
 * would break the column alignment that puts each amount against its label.
 * `@page` margins give the printable area; the fixed point size is what keeps 32
 * characters inside it on both A4 and US Letter.
 */
function documentHtml(lines: string[]): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { margin: 36pt; }
      body { margin: 0; color: #000; background: #fff; }
      pre {
        margin: 0;
        font-family: "Courier New", Courier, monospace;
        font-size: 11pt;
        line-height: 1.35;
        white-space: pre;
      }
    </style>
  </head>
  <body><pre>${escapeHtml(lines.join('\n'))}</pre></body>
</html>`;
}

/**
 * Strip anything a filesystem or a share target might choke on.
 *
 * Account numbers and dates are the only things interpolated into a filename
 * today, but both come from data rather than from literals, so this is applied
 * regardless — a stray `/` in an account number would otherwise be read as a path
 * separator and the write would land somewhere unintended or fail outright.
 */
function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

/**
 * Render lines to a PDF and give it a name a human can recognise.
 *
 * `printToFileAsync` writes to a cache path with a generated name
 * (`.../Print/8f3a....pdf`), which is what the share sheet and the receiving app
 * would display. A consumer receiving `8f3a....pdf` in their email has no idea
 * what it is, so the file is moved to a named one before it is shared.
 */
async function renderToPdf(lines: string[], filename: string): Promise<SoftCopy> {
  const Print = loadPrint();
  const FileSystem = loadFileSystem();
  if (!Print || !FileSystem) throw new Error(DOWNLOAD_UNAVAILABLE_MESSAGE);

  const printed = await Print.printToFileAsync({ html: documentHtml(lines) });

  const named = safeFilename(filename);
  const source = new FileSystem.File(printed.uri);
  const destination = new FileSystem.File(FileSystem.Paths.cache, named);

  // `move` updates `source.uri` to the new location, so the post-move uri is read
  // back off `source` rather than assumed to equal `destination.uri`.
  await source.move(destination, { overwrite: true });

  return { uri: source.uri, filename: named };
}

/**
 * Whether a softcopy can actually be handed off on this device.
 *
 * Two independent reasons it may not be: the build predates the native modules
 * (checked first, and the common case right after this feature ships), or the
 * share sheet itself is unavailable — missing on some Android configurations and
 * on web. Checked up front so the UI can disable the control with a reason,
 * rather than letting a collector tap "Download" in front of a waiting consumer
 * and get nothing.
 */
export async function isDownloadSupported(): Promise<boolean> {
  if (!isDocumentModuleAvailable()) return false;

  try {
    return await loadSharing()!.isAvailableAsync();
  } catch {
    return false;
  }
}

async function share(doc: SoftCopy, dialogTitle: string): Promise<void> {
  const Sharing = loadSharing();
  if (!Sharing) throw new Error(DOWNLOAD_UNAVAILABLE_MESSAGE);

  await Sharing.shareAsync(doc.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle,
  });
}

/**
 * The consumer's water bill as a PDF, then the share sheet.
 *
 * Body is `formatReceiptLines` unchanged — see the note at the top of this file
 * for why this must not become a second layout.
 */
export async function downloadReceipt(
  invoice: ReceiptInvoice,
  account: RouteAccount
): Promise<SoftCopy> {
  const doc = await renderToPdf(
    formatReceiptLines(invoice, account),
    `TWD-Receipt-${account.accountNumber}-${invoice.date}.pdf`
  );

  await share(doc, `Receipt for ${account.consumerName}`);
  return doc;
}

export async function downloadDailyReport(report: DailyReport): Promise<SoftCopy> {
  const doc = await renderToPdf(
    formatDailyReportLines(report),
    `TWD-Daily-Report-${report.date}.pdf`
  );

  await share(doc, `Daily report — ${report.date}`);
  return doc;
}
