import type { FeedbackType } from '@/consumer/types';
import type { IconName } from '@/shared/components/icon';

/**
 * The four things feedback can be about, and how each is worded to a consumer.
 *
 * Shared rather than declared on the form, because the history screen has to name
 * the same four things and two lists would drift: `system-issue` is "App problem"
 * on the form, and if the history spelled it "System issue" the consumer would be
 * shown a category they never picked. The `id`s are the wire values the backend
 * enum accepts — the titles are presentation and can be rewritten freely.
 */
export interface FeedbackOption {
  id: FeedbackType;
  title: string;
  description: string;
  icon: IconName;
}

export const FEEDBACK_OPTIONS: FeedbackOption[] = [
  {
    id: 'billing',
    title: 'Billing concern',
    description: 'Charges, payments, or something wrong on your statement',
    icon: 'banknote',
  },
  {
    id: 'service-quality',
    title: 'Service quality',
    description: 'Water quality, pressure, or interruptions',
    icon: 'gauge',
  },
  {
    id: 'system-issue',
    title: 'App problem',
    description: 'Something in this app is broken or confusing',
    icon: 'alert-triangle',
  },
  {
    id: 'other',
    title: 'Something else',
    description: 'Anything not covered above',
    icon: 'message-square',
  },
];

const BY_ID = new Map(FEEDBACK_OPTIONS.map((option) => [option.id, option]));

/**
 * The option for a stored `type`, or undefined if the backend enum has grown a
 * value this build predates. Callers fall back to the raw value rather than
 * rendering a blank where a category should be.
 */
export function feedbackOption(type: FeedbackType): FeedbackOption | undefined {
  return BY_ID.get(type);
}
