/**
 * The `contacts` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type Contact, createContactsCollection } from '@simmer-mosquito/sync';
import { BasicIndex } from '@tanstack/db';
import { declareCollection } from './registry';

/**
 * `on-demand`: The public an agency has heard from, which grows with every service request.
 *
 * This app writes contacts, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 */
export const contacts = declareCollection<Contact>({
	table: 'contacts',
	syncMode: 'on-demand',
	mutations: true,
	create: createContactsCollection,

	// The contact picker on the service-request form.
	index: (collection) => {
		collection.createIndex((row) => row.contact_name, { indexType: BasicIndex });
	},
});
