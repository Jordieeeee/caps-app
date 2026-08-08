import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  DOWNLOAD_UNAVAILABLE_MESSAGE,
  isDocumentModuleAvailable,
  isDownloadSupported,
  type SoftCopy,
} from '@/collector/services/document-service';

/**
 * Every softcopy download goes through this hook — the counterpart to usePrint.
 *
 * Same shape and the same rule about honesty on failure: a collector who cannot
 * tell "the PDF wasn't produced" apart from "the reading wasn't saved" will go
 * back and re-enter the reading, and a duplicate record is worse than a missing
 * document. So every message here ends by saying the record is safe, exactly as
 * the print failures do.
 *
 * Unlike printing there is no hardware to lose mid-flow, so there is no live
 * preflight — only a one-time capability probe. `Sharing.isAvailableAsync()` is
 * async, so `canDownload` starts null (unknown) and resolves; callers should
 * treat null as "not yet" rather than "no", which is why it is not a bare boolean.
 */
export function useDownload() {
  const [downloading, setDownloading] = useState(false);
  const [canDownload, setCanDownload] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void isDownloadSupported().then((supported) => {
      if (active) setCanDownload(supported);
    });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Run a document job, reporting the one failure the collector can act on.
   *
   * A cancelled share sheet is NOT a failure — the user dismissing the sheet
   * rejects on some platforms and resolves on others, and alerting "could not
   * download" because someone changed their mind would be a lie. There is no
   * reliable cancellation signal to branch on, so the alert is worded to cover
   * both: it states what is true either way (nothing was lost) and offers a retry
   * rather than asserting that something broke.
   */
  const download = useCallback(async (job: () => Promise<SoftCopy>) => {
    async function attempt(): Promise<void> {
      setDownloading(true);
      try {
        await job();
      } catch {
        Alert.alert(
          'Could not create the file',
          'The document could not be generated on this phone. Nothing has been lost — the record is still saved and you can try again.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Try again', onPress: () => void attempt() },
          ]
        );
      } finally {
        setDownloading(false);
      }
    }

    await attempt();
  }, []);

  return {
    download,
    downloading,
    /** Null while the capability probe is still running. */
    canDownload,
    /**
     * Short inline reason a download control is disabled. Null when it isn't.
     *
     * Distinguishes the two causes, because only one of them is fixable and they
     * point at different people: an old build is resolved by installing a new one,
     * while a missing share sheet is a property of the device that nothing in this
     * app can change. Saying "needs a newer build" to someone whose Android simply
     * has no share target would send them chasing an install that changes nothing.
     */
    downloadBlockedReason:
      canDownload !== false
        ? null
        : !isDocumentModuleAvailable()
          ? DOWNLOAD_UNAVAILABLE_MESSAGE
          : 'Sharing is not available on this device',
  };
}
