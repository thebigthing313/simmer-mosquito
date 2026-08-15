/**
 * The `addresses` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type Address, createAddressesCollection } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `on-demand`: An agency's address book grows with its service requests, so the pickers
 * fetch what they search for.
 *
 * This app writes addresses, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const addresses: Collection<Address, string | number> = createAddressesCollection({
	serverUrl: getServerUrl(),
	syncMode: 'on-demand',
	mutations: true,
});

// The address pickers on the service-request and habitat forms.
addresses.createIndex((row) => row.display_name, { indexType: BasicIndex });
