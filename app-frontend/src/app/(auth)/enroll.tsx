import { EnrollScreen } from '@/shared/auth/enroll-screen';

/**
 * Route file only.
 *
 * Enrolment sits in shared/auth rather than consumer/ because it must be reachable
 * pre-login, when no role exists yet — a route under consumer/ would be behind the
 * consumer guard and therefore unreachable by exactly the people who need it.
 * What makes it consumer-only is the endpoint it posts to, which cannot create
 * anything but a Consumer.
 */
export default EnrollScreen;
