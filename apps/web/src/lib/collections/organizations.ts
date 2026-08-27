/**
 * The `organizations` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createOrganizationsCollection, type Organization } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { syncClientOptions } from './client-options';

/**
 * `eager`: The agency's own record. One row, and the shell reads it before anything
 * else can draw.
 *
 * `mutations: true` since ADR 0013's first slice, and that covers exactly one of
 * the eight things a Profile can change about the agency: its details, which are
 * columns and travel as `identity.updateOrganizationDetails`. The other seven are
 * `organizationSettings.*` commands writing a JSON document, so which of the
 * seven a write means cannot be read off a column diff and each keeps its own
 * route. `hooks/mutations/organization-writes.ts` is what carries those.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const organizations: Collection<Organization, string | number> =
	createOrganizationsCollection({
		...syncClientOptions,
		syncMode: 'eager',
		mutations: true,
	});

/**
 * The join index.
 *
 * A live query that joins this table loads it lazily — it collects the join keys
 * the driving side produces and asks for exactly those rows. It can only do that
 * when the join column is indexed. Without this it says so in a console warning
 * and loads the whole table instead, which on an on-demand collection is the one
 * thing the mode exists to avoid.
 *
 * Always `id`: every table is joined by its primary key, because that is what the
 * foreign keys point at.
 */
organizations.createIndex((row) => row.id, { indexType: BasicIndex });
