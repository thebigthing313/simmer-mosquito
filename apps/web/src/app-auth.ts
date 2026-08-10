import { createAppAuthController } from '@simmer-mosquito/auth/browser';
import { getAuthMe } from './auth';

/**
 * This app's session snapshot. The controller itself lives in
 * `@simmer-mosquito/auth/browser` — the operator console keeps the same one over
 * its own `/auth/me` — so what stays here is the binding and the fact that there
 * is exactly one of it.
 */
export const appAuthController = createAppAuthController({ getAuthMe });
