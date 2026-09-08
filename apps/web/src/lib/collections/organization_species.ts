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
import { declareCollection } from './registry';

/**
 * `eager`: Which species an organization actually records — a short list, and the
 * one that orders every key-entry grid.
 *
 * This app writes organization_species, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const organization_species = declareCollection<OrganizationSpecies>({
	table: 'organization_species',
	syncMode: 'eager',
	mutations: true,
	create: createOrganizationSpeciesCollection,
});
