/**
 * The `organizations` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createOrganizationsCollection, type Organization } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `eager`: The agency's own record. One row, and the shell reads it before anything
 * else can draw.
 *
 * `mutations: false`, and it is not a claim that this app does not write it. The
 * agency's own record is written by eight named routes: the seven
 * `organizationSettings.*` commands, whose settings are a JSON document rather
 * than columns — which of the seven a write means cannot be read off a column
 * diff — and the agency's details, which is an identity write until ADR 0013
 * folds it in. Declaring no handlers is what makes a stray
 * `organizations.update(...)` a refusal rather than a request to an endpoint that
 * is not there; `hooks/mutations/organization-writes.ts` opens the transaction
 * that is the only way in.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const organizations: Collection<Organization, string | number> =
	createOrganizationsCollection({
		serverUrl: getServerUrl(),
		syncMode: 'eager',
		mutations: false,
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
