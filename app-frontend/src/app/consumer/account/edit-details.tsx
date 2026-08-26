import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { getProfile, updateProfile, type ConsumerProfile } from '@/consumer/services/consumer-data';
import { Icon } from '@/shared/components/icon';
import { ListError, ListLoading } from '@/shared/components/list-states';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useAsync } from '@/shared/hooks/use-async';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Edit the two things a consumer may change about themselves.
 *
 * Everything else the district holds — legal name, date of birth, valid ID,
 * senior-citizen status, consumer number — is deliberately absent rather than
 * present-and-disabled. A greyed-out field still reads as "this is nearly
 * editable", invites tapping, and puts the burden of explanation on a tooltip
 * nobody opens. The details screen states plainly which fields are office-only and
 * this form simply does not contain them.
 *
 * The server enforces the same boundary independently, twice over — see
 * app-backend/controllers/profileController.js. This screen is a convenience, not
 * the control.
 */
export default function ConsumerEditDetailsScreen() {
  const router = useRouter();
  const { state, reload } = useAsync(useCallback(() => getProfile(), []));

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
            body="We couldn't reach Tanauan City Water District just now. Check your connection and try again."
            onRetry={reload}
          />
        </ScreenSection>
      )}

      {state.status === 'ready' && (
        <EditForm profile={state.data} onSaved={() => router.back()} />
      )}
    </ScreenContainer>
  );
}

interface Fields {
  contactNumber: string;
  houseStreet: string;
  barangay: string;
  city: string;
  province: string;
  zip: string;
}

function EditForm({
  profile,
  onSaved,
}: {
  profile: ConsumerProfile;
  onSaved: () => void;
}) {
  const theme = useTwdTheme();

  const [fields, setFields] = useState<Fields>({
    contactNumber: profile.contactNumber ?? '',
    houseStreet: profile.mailingAddress?.houseStreet ?? '',
    barangay: profile.mailingAddress?.barangay ?? '',
    city: profile.mailingAddress?.city ?? '',
    province: profile.mailingAddress?.province ?? '',
    zip: profile.mailingAddress?.zip ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Fields) => (value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  };

  /**
   * Client-side checks mirror the server's, and exist only to save a round trip.
   * The server re-validates everything regardless — it has to, because it also
   * answers requests this screen did not make.
   */
  const validate = (): string | null => {
    const phone = fields.contactNumber.replace(/[\s()-]/g, '');
    if (!phone) return 'Enter your mobile number.';
    if (!/^(09\d{9}|\+?639\d{9})$/.test(phone)) {
      return 'Enter a valid Philippine mobile number, for example 09171234567.';
    }

    const missing = (
      [
        ['houseStreet', 'house/street'],
        ['barangay', 'barangay'],
        ['city', 'city'],
        ['province', 'province'],
      ] as const
    )
      .filter(([key]) => !fields[key].trim())
      .map(([, label]) => label);

    if (missing.length) return `Your mailing address needs ${missing.join(', ')}.`;
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
      await updateProfile({
        contactNumber: fields.contactNumber.trim(),
        mailingAddress: {
          houseStreet: fields.houseStreet.trim(),
          barangay: fields.barangay.trim(),
          city: fields.city.trim(),
          province: fields.province.trim(),
          zip: fields.zip.trim(),
        },
      });
      onSaved();
    } catch (e) {
      setSaving(false);
      // The server's message is shown as-is: it is the side that actually
      // rejected the value, and it names the field it disliked.
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't save your details just now. Check your connection and try again."
      );
    }
  };

  return (
    <>
      <ScreenSection gap={Spacing.three}>
        <ThemedText type="defaultBold">Contact number</ThemedText>
        <TwdTextField
          label="Mobile number"
          value={fields.contactNumber}
          onChangeText={set('contactNumber')}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          editable={!saving}
          hint="TWD uses this to reach you about your water service."
        />
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        <ThemedText type="defaultBold">Mailing address</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Where TWD sends your bills. This is not the same as the service address of
          the meter itself — that is tied to the account and is changed at the office.
        </ThemedText>

        <TwdTextField
          label="House number and street"
          value={fields.houseStreet}
          onChangeText={set('houseStreet')}
          editable={!saving}
        />
        <TwdTextField
          label="Barangay"
          value={fields.barangay}
          onChangeText={set('barangay')}
          editable={!saving}
        />
        <TwdTextField
          label="City or municipality"
          value={fields.city}
          onChangeText={set('city')}
          editable={!saving}
        />
        <TwdTextField
          label="Province"
          value={fields.province}
          onChangeText={set('province')}
          editable={!saving}
        />
        <TwdTextField
          label="ZIP code (optional)"
          value={fields.zip}
          onChangeText={set('zip')}
          keyboardType="number-pad"
          editable={!saving}
        />
      </ScreenSection>

      <ScreenSection gap={Spacing.three}>
        {error && (
          <View
            style={[styles.error, { borderColor: theme.danger, backgroundColor: theme.dangerSurface }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive">
            <Icon name="alert-triangle" size={18} color={theme.danger} />
            <ThemedText type="small" style={[styles.errorText, { color: theme.danger }]}>
              {error}
            </ThemedText>
          </View>
        )}

        <TwdButton
          label="Save changes"
          busy={saving}
          busyLabel="Saving…"
          onPress={() => void save()}
        />

      </ScreenSection>
    </>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  errorText: { flex: 1 },
});
