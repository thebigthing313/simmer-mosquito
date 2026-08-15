/**
 * The `organization_species` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	createOrganizationSpeciesCollection,
	type OrganizationSpecies,
} from '@simmer-mosquito/sync';
import type { Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `eager`: Which species an agency actually records — a short list, and the one that
 * orders every key-entry grid.
 *
 * This app writes organization_species, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const organization_species: Collection<OrganizationSpecies, string | number> =
	createOrganizationSpeciesCollection({
		serverUrl: getServerUrl(),
		syncMode: 'eager',
		mutations: true,
	});
