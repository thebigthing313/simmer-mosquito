import type { WorkOS } from '@workos-inc/node';

/**
 * The two SDK namespaces the WorkOS boundary calls. Injectable so a suite can
 * stand the object up over a double without mocking the vendor module.
 */
export type WorkOsClient = Pick<WorkOS, 'organizations' | 'userManagement'>;
