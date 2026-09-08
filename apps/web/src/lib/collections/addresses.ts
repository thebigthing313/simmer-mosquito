/**
 * The `addresses` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type Address, createAddressesCollection } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
import { declareCollection } from './registry';

/**
 * `on-demand`: An organization's address book grows with its service requests, so the
 * pickers fetch what they search for.
 *
 * This app writes addresses, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const addresses = declareCollection<Address>({
	table: 'addresses',
	syncMode: 'on-demand',
	mutations: true,
	create: createAddressesCollection,

	// The address pickers on the service-request and habitat forms.
	index: (collection) => {
		collection.createIndex((row) => row.display_name, { indexType: BasicIndex });
	},
});
