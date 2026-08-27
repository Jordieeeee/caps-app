import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  CollectorProfileService,
  type CollectorProfile,
} from '@/collector/services/collector-profile';
import { Icon } from '@/shared/components/icon';
import { useCollectorIdentity } from '@/collector/collector-identity';
import { ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Edit the one thing a collector may change about themselves.
 *
 * Everything else on the record — name, employee ID, zone, assigned routes, hire
 * date, account status — is absent rather than present-and-disabled. A greyed-out
 * field still reads as "nearly editable", invites tapping, and pushes the
 * explanation into a tooltip nobody opens. The Account screen states plainly which
 * fields are office-only; this form simply does not contain them.
 *
 * The boundary is not cosmetic. `routeIds` stamps every meter reading this phone
 * files, so a collector who could edit it could file work under a route the office
 * never sent them to; `status` is the authentication gate; `employeeId` is what a
 * day's cash is reconciled against. The server enforces all of that independently,
 * twice over — see app-backend/controllers/collectorProfileController.js. This
 * screen is a convenience, not the control.
 */
export default function CollectorEditDetailsScreen() {
  const router = useRouter();
  const { identityKey } = useCollectorIdentity();
  const { state, reload } = useAsync(
    useCallback(() => CollectorProfileService.load(identityKey), [identityKey])
  );

  return (
    <ScreenContainer variant="stack">
      {state.status === 'loading' && (
        <ScreenSection>
          <ListLoading label="Loading your details…" />
        </ScreenSection>
      )}

      {state.status === 'error' && (
        <ScreenSection>
          <ListError
            title="Could not load your details"
            body="TWD could not be reached and this phone has no saved copy of your record. Your readings and collections are unaffected."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && (
        <EditForm
          profile={state.data.profile}
          stale={state.data.fromCache}
          onSaved={() => router.back()}
        />
      )}
    </ScreenContainer>
  );
}

function EditForm({
  profile,
  stale,
  onSaved,
}: {
  profile: CollectorProfile;
  stale: boolean;
  onSaved: () => void;
}) {
  const theme = useTwdTheme();
  const { identityKey } = useCollectorIdentity();

  const [phone, setPhone] = useState(profile.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Mirrors the server's rule and exists only to save a round trip. The server
   * re-validates regardless — it has to, because it also answers requests this
   * screen did not make.
   */
  const validate = (): string | null => {
    const digits = phone.replace(/[\s()-]/g, '');
    if (!digits) return 'Enter your mobile number.';
    if (!/^(09\d{9}|\+?639\d{9})$/.test(digits)) {
      return 'Enter a valid Philippine mobile number, for example 09171234567.';
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await CollectorProfileService.update(identityKey, { phone: phone.trim() });
      onSaved();
    } catch (e) {
      setSaving(false);
      // The server's message is shown as-is: it is the side that actually rejected
      // the value, and it names what it disliked.
      setError(
        e instanceof Error
          ? e.message
          : "Your number could not be saved. Check your connection and try again."
      );
    }
  };

  return (
    <>
      {/* Saving needs the network — unlike a reading, this is not queued offline
          (see CollectorProfileService.update). Saying so before the collector types
          is cheaper than a failed save after they have. */}
      {stale && (
        <ScreenSection>
          <View
            style={[
              styles.notice,
              { borderColor: theme.warning, backgroundColor: theme.warningSurface },
            ]}
            accessible
            accessibilityRole="summary">
            <Icon name="cloud-off" size={18} color={theme.warning} />
            <ThemedText type="small" style={[styles.noticeText, { color: theme.warning }]}>
              These are the details saved on this phone — TWD could not be reached. You need a
              connection to change your number.
            </ThemedText>
          </View>
        </ScreenSection>
      )}

      <ScreenSection gap={Spacing.three}>
        <ThemedText type="defaultBold">Contact number</ThemedText>
        <TwdTextField
          label="Mobile number"
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            if (error) setError(null);
          }}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          editable={!saving}
          hint="How the TWD office reaches you while you are on a route."
        />
      </ScreenSection>

      {/* What is not here, and where to take it. Stated on the form itself rather
          than only on the screen behind it: this is the moment someone is looking
          for the field they want to change. */}
      <ScreenSection gap={Spacing.three}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="defaultBold">Changed at the TWD office</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Your name, employee ID, zone, assigned routes and hire date are employment
            records. They are set by the office, and your assigned routes in particular are
            stamped on every reading you file — so if any of them is wrong, it has to be
            corrected there rather than here.
          </ThemedText>
        </ThemedView>
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        {error && (
          <View
            style={[styles.notice, { borderColor: theme.danger, backgroundColor: theme.dangerSurface }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive">
            <Icon name="alert-triangle" size={18} color={theme.danger} />
            <ThemedText type="small" style={[styles.noticeText, { color: theme.danger }]}>
              {error}
            </ThemedText>
          </View>
        )}

        <TwdButton
          label="Save changes"
          icon="check"
          busy={saving}
          busyLabel="Saving…"
          onPress={() => void save()}
          accessibilityHint="Sends your new mobile number to the TWD office"
        />
      </ScreenSection>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  noticeText: { flex: 1 },
});
