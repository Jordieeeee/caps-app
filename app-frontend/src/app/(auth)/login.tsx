import { LoginScreen } from '@/shared/auth/login-screen';

/**
 * Route file only. The screen lives in shared/auth because it is genuinely shared:
 * one form serves both roles, and which role is signing in is not knowable until
 * the server answers.
 */
export default LoginScreen;
