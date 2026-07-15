import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FeedbackType = 'billing' | 'service-quality' | 'system-issue' | 'other';

interface FeedbackOption {
  id: FeedbackType;
  title: string;
  description: string;
  icon: string;
}

const feedbackOptions: FeedbackOption[] = [
  {
    id: 'billing',
    title: 'Billing Concern',
    description: 'Report issues with charges, payments, or billing statements',
    icon: '💰',
  },
  {
    id: 'service-quality',
    title: 'Service Quality',
    description: 'Provide feedback on water quality, pressure, or service reliability',
    icon: '💧',
  },
  {
    id: 'system-issue',
    title: 'System Issue',
    description: 'Report technical problems with the app or online services',
    icon: '🔧',
  },
  {
    id: 'other',
    title: 'Other',
    description: 'General feedback or other concerns not covered above',
    icon: '📝',
  },
];

export default function FeedbackScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  const handleSubmit = () => {
    // Handle feedback submission logic here
    console.log('Feedback submitted:', {
      type: selectedType,
      subject,
      message,
      accountNumber,
    });
    // Reset form
    setSelectedType(null);
    setSubject('');
    setMessage('');
    setAccountNumber('');
  };

  const isFormValid = selectedType && subject.trim() && message.trim();

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Submit Feedback</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            We value your feedback. Help us improve our services.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.formWrapper}>
          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Feedback Type
          </ThemedText>
          <ThemedView style={styles.optionsContainer}>
            {feedbackOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.optionCard,
                  selectedType === option.id && {
                    backgroundColor: theme.backgroundElement,
                    borderWidth: 2,
                    borderColor: theme.text,
                  },
                ]}
                onPress={() => setSelectedType(option.id)}>
                <ThemedText style={styles.optionIcon}>{option.icon}</ThemedText>
                <ThemedView style={styles.optionText}>
                  <ThemedText type="defaultBold" style={styles.optionTitle}>
                    {option.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {option.description}
                  </ThemedText>
                </ThemedView>
              </TouchableOpacity>
            ))}
          </ThemedView>

          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Account Number (Optional)
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.inputContainer}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Enter your account number"
              placeholderTextColor={theme.textSecondary}
              value={accountNumber}
              onChangeText={setAccountNumber}
            />
          </ThemedView>

          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Subject
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.inputContainer}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Brief description of your feedback"
              placeholderTextColor={theme.textSecondary}
              value={subject}
              onChangeText={setSubject}
            />
          </ThemedView>

          <ThemedText type="defaultBold" style={styles.sectionTitle}>
            Detailed Feedback
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.textAreaContainer}>
            <TextInput
              style={[styles.textArea, { color: theme.text }]}
              placeholder="Please provide detailed information about your feedback..."
              placeholderTextColor={theme.textSecondary}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </ThemedView>

          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor: isFormValid ? theme.backgroundElement : theme.textSecondary + '40',
              },
            ]}
            onPress={handleSubmit}
            disabled={!isFormValid}>
            <ThemedText
              type="defaultBold"
              style={[
                styles.submitButtonText,
                { color: isFormValid ? theme.text : theme.textSecondary },
              ]}>
              Submit Feedback
            </ThemedText>
          </TouchableOpacity>

          <ThemedText type="small" style={styles.disclaimerText} themeColor="textSecondary">
            By submitting this form, you agree that your feedback may be used to improve our services.
            Personal information will be handled according to our privacy policy.
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
  formWrapper: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
  },
  optionsContainer: {
    gap: Spacing.three,
  },
  optionCard: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionIcon: {
    fontSize: 32,
    marginRight: Spacing.three,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
  },
  inputContainer: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  input: {
    fontSize: 16,
  },
  textAreaContainer: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  textArea: {
    fontSize: 16,
    minHeight: 120,
  },
  submitButton: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  submitButtonText: {
    fontSize: 16,
  },
  disclaimerText: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
