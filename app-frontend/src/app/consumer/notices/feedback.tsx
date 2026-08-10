import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FEEDBACK_OPTIONS, feedbackOption } from '@/consumer/feedback-options';
import { submitFeedback, type FeedbackType } from '@/consumer/services/consumer-data';
import { useTheme } from '@/hooks/use-theme';
import { Icon } from '@/shared/components/icon';
import { ScreenContainer, ScreenSection } from '@/shared/components/screen-container';
import { TwdButton } from '@/shared/components/twd-button';
import { useTwdTheme } from '@/shared/hooks/use-twd-theme';
import { MIN_TAP_TARGET, Radius, Spacing } from '@/shared/theme/twd';

type Status = 'editing' | 'sending' | 'sent';

/**
 * Feedback. Title comes from the navigation header.
 *
 * The old submit handler was `console.log('Feedback submitted:', {...})` followed
 * by clearing the form. Nothing left the device, and the cleared fields read as
 * success — a consumer reporting a billing error would have believed TWD received
 * it. This posts to the real endpoint and says which of the three things happened,
 * exactly as the skill's highest-severity form guidance requires ("Show loading
 * then success/error / Don't: no feedback after submit").
 */
/**
 * Optional prefill, so another screen can open this form already pointed at its
 * subject — "This isn't my account" on the Account tab is the first caller.
 *
 * Prefilled and editable rather than posted behind a confirmation dialog: the
 * message goes to the district in the consumer's name, so they see the wording and
 * can correct it. `type` is validated against the real option list before it is
 * trusted — a param is a string from a URL, and setting state to a value no option
 * matches would leave every radio unselected with no way to tell why.
 */
function usePrefill() {
  const params = useLocalSearchParams<{ type?: string; subject?: string; message?: string }>();
  const type = params.type as FeedbackType | undefined;

  return {
    type: type && feedbackOption(type) ? type : null,
    subject: params.subject ?? '',
    message: params.message ?? '',
  };
}

export default function ConsumerFeedbackScreen() {
  const theme = useTheme();
  const twd = useTwdTheme();
  const router = useRouter();
  const prefill = usePrefill();

  // Initial state only. Re-reading the params on every render would fight the
  // consumer for the field: each keystroke re-renders, and a prefill that reasserts
  // itself is a form you cannot edit.
  const [type, setType] = useState<FeedbackType | null>(prefill.type);
  const [subject, setSubject] = useState(prefill.subject);
  const [message, setMessage] = useState(prefill.message);
  const [status, setStatus] = useState<Status>('editing');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);

    // Named, not implied. The old form disabled its button until valid and never
    // said what was missing — a dead grey rectangle is not an error message.
    const missing: string[] = [];
    if (!type) missing.push('a feedback type');
    if (!subject.trim()) missing.push('a subject');
    if (!message.trim()) missing.push('a message');
    if (missing.length || !type) {
      setError(`Add ${missing.join(', ')} before sending.`);
      return;
    }

    setStatus('sending');
    try {
      await submitFeedback({ type, subject: subject.trim(), message: message.trim() });
      setStatus('sent');
    } catch {
      setStatus('editing');
      setError(
        "We couldn't send your feedback just now. Check your connection and try again — your message is still here."
      );
    }
  };

  if (status === 'sent') {
    return (
      <ScreenContainer variant="stack">
        <ScreenSection gap={Spacing.three}>
          <View
            style={[
              styles.sentCard,
              { borderColor: twd.success, backgroundColor: theme.backgroundElement },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            <Icon name="check" size={32} color={twd.success} />
            <ThemedText type="defaultBold" style={styles.centered}>
              Feedback sent
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              Thank you. TWD has received your message and will review it. Urgent water
              service problems are best reported by phone to the district office.
            </ThemedText>
          </View>
          <TwdButton label="Done" onPress={() => router.back()} />
          {/* `replace`, not `push`: the form has done its job, and leaving it on the
              stack means backing out of the history lands on a spent success card
              offering to send the message again. */}
          <TwdButton
            label="View your feedback"
            variant="secondary"
            onPress={() => router.replace('/consumer/notices/feedback-history')}
            accessibilityHint="Shows everything you have sent TWD and its status"
          />
          <TwdButton
            label="Send another"
            variant="secondary"
            onPress={() => {
              setType(null);
              setSubject('');
              setMessage('');
              setStatus('editing');
            }}
          />
        </ScreenSection>
      </ScreenContainer>
    );
  }

  const busy = status === 'sending';

  return (
    <ScreenContainer variant="stack">
      <ScreenSection gap={Spacing.three}>
        <ThemedText type="defaultBold">What is this about?</ThemedText>

        <View style={styles.options}>
          {FEEDBACK_OPTIONS.map((option) => {
            const selected = type === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  setType(option.id);
                  if (error) setError(null);
                }}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityLabel={`${option.title}. ${option.description}`}
                accessibilityState={{ selected, disabled: busy }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: selected ? twd.primary : twd.border,
                    backgroundColor: selected
                      ? twd.primarySubtle
                      : pressed
                        ? twd.backgroundSelected
                        : twd.backgroundElement,
                  },
                ]}>
                {/* 💰💧🔧📝 at fontSize 32 previously. */}
                <Icon
                  name={option.icon}
                  size={24}
                  color={selected ? twd.primary : twd.textSecondary}
                />
                <View style={styles.optionText}>
                  <ThemedText
                    type="defaultBold"
                    style={selected ? { color: twd.primary } : undefined}>
                    {option.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {option.description}
                  </ThemedText>
                </View>
                {selected && <Icon name="check" size={20} color={twd.primary} />}
              </Pressable>
            );
          })}
        </View>

        <Field
          label="Subject"
          placeholder="Brief description"
          value={subject}
          onChangeText={(t) => {
            setSubject(t);
            if (error) setError(null);
          }}
          editable={!busy}
        />

        <Field
          label="Message"
          placeholder="Tell us what happened, and include your account number if it's about a specific bill."
          value={message}
          onChangeText={(t) => {
            setMessage(t);
            if (error) setError(null);
          }}
          editable={!busy}
          multiline
        />

        {error && (
          <View
            style={[styles.error, { borderColor: twd.danger, backgroundColor: twd.dangerSurface }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive">
            <Icon name="alert-triangle" size={18} color={twd.danger} />
            <ThemedText type="small" style={[styles.errorText, { color: twd.danger }]}>
              {error}
            </ThemedText>
          </View>
        )}

        {/* Never disabled. A button that greys out without saying why leaves the
            consumer poking a dead rectangle; this one always responds, and names
            what is missing. */}
        <TwdButton
          label="Send feedback"
          busy={busy}
          busyLabel="Sending…"
          onPress={() => void send()}
        />

        <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
          Your feedback is handled according to TWD&apos;s privacy policy. For a water
          emergency, call the district office instead — this form is not monitored around
          the clock.
        </ThemedText>
      </ScreenSection>
    </ScreenContainer>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  editable,
  multiline,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  editable: boolean;
  multiline?: boolean;
}) {
  const theme = useTheme();
  const twd = useTwdTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <ThemedText type="defaultBold">{label}</ThemedText>
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: focused ? twd.primary : twd.border,
          },
        ]}>
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline, { color: theme.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline={multiline}
          numberOfLines={multiline ? 6 : 1}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MIN_TAP_TARGET,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  optionText: { flex: 1, gap: Spacing.half },
  field: { gap: Spacing.two },
  inputWrap: {
    borderRadius: Radius.field,
    borderWidth: 2,
  },
  input: {
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 120 },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  errorText: { flex: 1 },
  sentCard: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
    borderRadius: Radius.card,
    borderWidth: 2,
  },
  centered: { textAlign: 'center' },
  disclaimer: { lineHeight: 20, textAlign: 'center' },
});
