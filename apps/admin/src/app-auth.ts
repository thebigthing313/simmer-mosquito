import { createAppAuthController } from '@simmer-mosquito/auth/browser';
import { getAuthMe } from './api';

/**
 * The operator session, as one module-level value the router and the shell both
 * read. The controller itself lives in `@simmer-mosquito/auth/browser`, shared
 * with the agency workspace; this is the console's binding of it.
 */
export const appAuthController = createAppAuthController({ getAuthMe });
