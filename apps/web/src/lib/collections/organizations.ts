/**
 * The `organizations` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createOrganizationsCollection, type Organization } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The organization's own record. One row, and the shell reads it
 * before anything else can draw.
 *
 * `mutations: true` since ADR 0013's first slice, and that covers exactly one
 * of the eight things a Profile can change about the organization: its details,
 * which are columns and travel as `identity.updateOrganizationDetails`. The
 * other seven are `organizationSettings.*` commands writing a JSON document, so
 * which of the seven a write means cannot be read off a column diff and each
 * keeps its own route. `hooks/mutations/organization-writes.ts` is what carries
 * those.
 */
export const organizations = declareCollection<Organization>({
	table: 'organizations',
	syncMode: 'eager',
	mutations: true,
	create: createOrganizationsCollection,
});
