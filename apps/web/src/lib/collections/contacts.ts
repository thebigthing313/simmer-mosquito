/**
 * The `contacts` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type Contact, createContactsCollection } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `on-demand`: The public an agency has heard from, which grows with every service request.
 *
 * This app writes contacts, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const contacts: Collection<Contact, string | number> = createContactsCollection({
	serverUrl: getServerUrl(),
	syncMode: 'on-demand',
	mutations: true,
});

// The contact picker on the service-request form.
contacts.createIndex((row) => row.contact_name, { indexType: BasicIndex });
