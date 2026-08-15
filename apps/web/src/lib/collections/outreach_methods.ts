/**
 * The `outreach_methods` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createOutreachMethodsCollection, type OutreachMethod } from '@simmer-mosquito/sync';
import type { Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `eager`: A method catalogue an agency has dozens of rows of.
 *
 * This app writes outreach_methods, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const outreach_methods: Collection<OutreachMethod, string | number> =
	createOutreachMethodsCollection({
		serverUrl: getServerUrl(),
		syncMode: 'eager',
		mutations: true,
	});
