import type { NoticePriority, NoticeType } from '@/shared/components/status-badge';

/**
 * Consumer mock data, in one place.
 *
 * It used to sit inline in each screen, which is how "123 Main Street,
 * Springfield, IL 62701" ended up rendering in a Philippine water district's app
 * in two screens at once — Springfield/IL is the stock US placeholder, and nobody
 * editing one screen saw the other. Addresses below are Tanauan City, Batangas
 * format: house number, street, barangay, city, province.
 *
 * The amounts were the same bug wearing a peso sign. They read ₱45.50, ₱42.30,
 * ₱38.75 — those are plausible *dollar* figures for US municipal water, and about
 * ₱45 is roughly USD 0.78, which is not a month of anyone's water. Philippine
 * residential bills run in the low hundreds: a minimum charge covering the first
 * 10 m³, then a per-m³ rate. The figures below sit in that range for a household
 * using ~15-25 m³.
 *
 * ⚠️ These are illustrative, not TWD's published tariff. Replace them with the
 * real rate table before anyone reads a number here as a quote.
 *
 * ⚠️ Also mock: the backend has GET /accounts, GET /billing/:accountNumber and
 * GET /announcements ready, with response shapes matching these types exactly
 * ({ accounts }, { bills }, { announcements }). Nothing seeds them yet — only
 * seed-users.js exists — so the screens read from here. See consumer-data.ts for
 * the swap.
 */

export interface Account {
  id: string;
  accountNumber: string;
  address: string;
  type: 'residential' | 'commercial';
  status: 'active' | 'inactive';
  linkedDate: string;
}

export interface Bill {
  id: string;
  accountNumber: string;
  billingPeriod: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  paymentDate?: string;
  paymentMethod?: string;
}

export interface Notice {
  id: string;
  title: string;
  type: NoticeType;
  date: string;
  content: string;
  priority: NoticePriority;
}

export const MAX_ACCOUNTS = 5;

export const mockAccounts: Account[] = [
  {
    id: '1',
    accountNumber: 'WD-12345',
    address: '24 Mabini Street, Brgy. Poblacion 3, Tanauan City, Batangas',
    type: 'residential',
    status: 'active',
    linkedDate: '2024-01-15',
  },
  {
    id: '2',
    accountNumber: 'WD-67890',
    address: '117 J.P. Laurel Highway, Brgy. Darasa, Tanauan City, Batangas',
    type: 'commercial',
    status: 'active',
    linkedDate: '2024-03-20',
  },
];

export const mockBills: Bill[] = [
  {
    id: '1',
    accountNumber: 'WD-12345',
    billingPeriod: 'June 2025',
    amount: 486.0,
    dueDate: '2025-07-15',
    status: 'overdue',
  },
  {
    id: '2',
    accountNumber: 'WD-67890',
    billingPeriod: 'June 2025',
    amount: 1248.5,
    dueDate: '2025-07-28',
    status: 'pending',
  },
  {
    id: '3',
    accountNumber: 'WD-12345',
    billingPeriod: 'May 2025',
    amount: 452.75,
    dueDate: '2025-06-15',
    status: 'paid',
    paymentDate: '2025-06-10',
    paymentMethod: 'Field collector',
  },
  {
    id: '4',
    accountNumber: 'WD-12345',
    billingPeriod: 'April 2025',
    amount: 398.25,
    dueDate: '2025-05-15',
    status: 'paid',
    paymentDate: '2025-05-08',
    paymentMethod: 'TWD office',
  },
  {
    id: '5',
    accountNumber: 'WD-67890',
    billingPeriod: 'May 2025',
    amount: 1180.0,
    dueDate: '2025-06-28',
    status: 'paid',
    paymentDate: '2025-06-24',
    paymentMethod: 'Bank transfer',
  },
];

export const mockNotices: Notice[] = [
  {
    id: '1',
    title: 'Scheduled water service interruption',
    type: 'interruption',
    date: '2025-07-20',
    content:
      'Water service will be interrupted on 20 July from 2:00 AM to 6:00 AM in Brgy. Poblacion 1-5 and Brgy. Darasa for scheduled main line maintenance. Please store water in advance.',
    priority: 'high',
  },
  {
    id: '2',
    title: 'Water quality advisory',
    type: 'advisory',
    date: '2025-07-18',
    content:
      'Recent tests show elevated sediment in parts of the Darasa service area. Water remains safe to drink, but clarity may be affected. Crews are flushing the affected lines.',
    priority: 'medium',
  },
  {
    id: '3',
    title: 'Extended office hours this month',
    type: 'service-update',
    date: '2025-07-15',
    content:
      'The TWD main office will stay open until 6:00 PM on weekdays for the rest of July to accommodate bill payments and account enquiries.',
    priority: 'low',
  },
];
