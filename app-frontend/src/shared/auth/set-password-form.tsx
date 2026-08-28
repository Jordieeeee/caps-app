import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { passwordProblem } from '@/shared/auth/password-policy';
import { setPassword } from '@/shared/auth/credential';
import { Icon } from '@/shared/components/icon';
import { PasswordChecklist } from '@/shared/components/password-checklist';
import { PasswordRevealToggle } from '@/shared/components/password-reveal-toggle';
import { ScreenSection } from '@/shared/components/screen-container';
import { TwdButton } from '@/shared/components/twd-button';
import { TwdTextField } from '@/shared/components/twd-text-field';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { AuthError } from '@/shared/types/auth';
import { Radius, Spacing } from '@/shared/theme/twd';

/**
 * Set a password, so Google stops being the only way in.
 *
 * Someone who signed in with Google has no password anywhere in TWD's systems. The
 * sign-in screen offers them an email and password box that can never work, and
 * the day their phone loses the Google account — a reset handset, a school address
 * that gets closed, a shared phone — they are locked out. This is the way back in.
 *
 * ⚠️ It is a second CREDENTIAL, not a second account. The password is stored
 * against the same identity the Google sign-in uses, so both open the same session
 * and reach the same records. See app-backend/models/MobileCredential.js for what
 * would break if it were ever stored as a new profile document instead — the short
 * version is that the person would sign in successfully and find an empty app.
 *
 * ONE form for both roles, because it is one credential and one endpoint. The
 * screens differ only in which profile they read the identity from and in the
 * stakes they describe: a consumer locked out loses sight of their bills, while a
 * collector locked out is holding a phone full of readings the district has not
 * received. `note` is where each screen says its own version of that.
 */
export function SetPasswordForm({
  email,
  hasPassword,
  note,
  onDone,
}: {
  /** The address this credential will be looked up by — the Google one. */
  email: string | null;
  /** Whether one is already set: decides every label on the screen. */
  hasPassword: boolean;
  /** Role-specific consequence, shown under the success message. */
  note?: string;
  onDone: () => void;
}) {
  const theme = useTwdTheme();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<{ next?: string; confirm?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    const found: typeof errors = {};
    const problem = passwordProblem(next);
    if (problem) found.next = problem;
    if (confirm !== next) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await setPassword({
        password: next,
        // Sent only when there is one to prove. The server asks for it only when a
        // password exists AND this session was opened with it — a Google-verified
        // session is allowed to replace a forgotten password, which is the whole
        // recovery story for this credential.
        ...(hasPassword && current ? { currentPassword: current } : {}),
      });
      setDone(true);
    } catch (error) {
      /**
       * The server's own sentence, not a paraphrase. It distinguishes "your
       * current password is incorrect" from "your password needs: a number" from a
       * network failure, and every one of those points at a different next action.
       */
      setFailure(
        error instanceof AuthError
          ? error.message
          : 'Your password could not be saved. Check your connection and try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ScreenSection gap={Spacing.four}>
        <View
          style={[styles.note, { borderColor: theme.success }]}
          accessible
          accessibilityRole="summary"
          accessibilityLiveRegion="polite">
          <Icon name="check" size={20} color={theme.success} />
          <View style={styles.noteText}>
            <ThemedText type="defaultBold" style={{ color: theme.success }}>
              {hasPassword ? 'Password changed' : 'Password set'}
            </ThemedText>
            {/* The email is stated because it is the half of the credential nobody
                chooses and everybody has to remember. It is the Google address,
                which is not obvious to someone who has only ever pressed a button
                to sign in. */}
            <ThemedText type="small" themeColor="textSecondary">
              You can now sign in with {email ?? 'your email address'} and this password,
              or keep using Continue with Google. Both open the same account.
            </ThemedText>
            {note ? (
              <ThemedText type="small" themeColor="textSecondary">
                {note}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <TwdButton label="Done" onPress={onDone} />
      </ScreenSection>
    );
  }

  return (
    <ScreenSection gap={Spacing.four}>
      <ThemedText type="small" themeColor="textSecondary">
        {hasPassword
          ? 'Change the password you use to sign in without Google. Continue with Google keeps working either way.'
          : 'Set a password so you can sign in without Google. You can still use Continue with Google whenever you like — both open the same account.'}
      </ThemedText>

      <View style={[styles.emailRow, { borderColor: theme.border }]}>
        <Icon name="user" size={18} color={theme.textSecondary} />
        <View style={styles.noteText}>
          <ThemedText type="small" themeColor="textSecondary">
            Your sign-in email
          </ThemedText>
          <ThemedText type="defaultBold">{email ?? 'Not on file'}</ThemedText>
        </View>
      </View>

      {/* Only when there is a password to prove, and even then the server may not
          ask for it — a session Google has just verified can replace a forgotten
          one. Shown regardless in that case: someone changing a password they
          remember expects to be asked for it, and a field that appears only
          sometimes reads as a bug. */}
      {hasPassword && (
        <TwdTextField
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          hint="Leave blank if you have forgotten it and signed in with Google."
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          editable={!busy}
        />
      )}

      <TwdTextField
        label={hasPassword ? 'New password' : 'Password'}
        value={next}
        onChangeText={setNext}
        error={errors.next}
        // No `hint`: the checklist below states every rule and answers each one
        // live, so a static "at least 8 characters" under the field would be the
        // same sentence twice, one of them permanently out of date.
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!busy}
        // The same control the sign-in screen uses, so the gesture that reveals a
        // password is identical everywhere one is typed.
        trailingAccessory={
          <PasswordRevealToggle
            revealed={reveal}
            onToggle={() => setReveal((shown) => !shown)}
            disabled={busy}
          />
        }
      />

      {/* A confirmation field, unlike the sign-in form, because this password is
          typed once and used weeks later. A typo on the sign-in screen costs one
          retry; a typo here is discovered on the day Google has stopped working,
          which is the day it must not be discovered. */}
      <TwdTextField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!busy}
      />

      {/* Under BOTH fields rather than under the first one, because the last item
          it checks is whether the two agree. Above the button, which is the order
          someone reads in when deciding whether they can press it. */}
      <PasswordChecklist password={next} confirm={confirm} />

      {failure && (
        <View
          style={[styles.note, { borderColor: theme.danger }]}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite">
          <Icon name="alert-triangle" size={20} color={theme.danger} />
          <ThemedText type="small" style={[styles.noteText, { color: theme.danger }]}>
            {failure}
          </ThemedText>
        </View>
      )}

      <TwdButton
        label={hasPassword ? 'Change password' : 'Set password'}
        busy={busy}
        busyLabel="Saving…"
        onPress={() => void save()}
      />
    </ScreenSection>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  noteText: { flex: 1, gap: Spacing.half },
});
