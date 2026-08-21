/**
 * The `genera` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either. The console answers
 * both differently from `apps/web`, which is the point: there, genera are
 * read-only reference data; here, maintaining them is the job.
 */

import { createGeneraCollection, type Genus } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { getServerUrl } from '../../api';

/**
 * `eager`: the whole global taxonomy, which is a few dozen rows and is listed in
 * full on the page that owns it. There is no subset worth asking for.
 *
 * `mutations: true` posts to `/commands/genera`, the same operator-floor endpoint
 * `apps/web` is refused at. Nothing here decides that — the server does; declaring
 * it only stops the console offering a write API it could not use.
 *
 * The type is written out here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves. If it is ever
 * removed, the check is that `collection.id` (a `string`) is refused where a
 * `number` is wanted.
 */
export const genera: Collection<Genus, string | number> = createGeneraCollection({
	serverUrl: getServerUrl(),
	syncMode: 'eager',
	mutations: true,
});

/**
 * The join index.
 *
 * A live query that joins this table collects the join keys the driving side
 * produced and asks for exactly those rows — which it can only do when the join
 * column is indexed. Without it the console logs a warning and loads the whole
 * table instead. Always `id`: every table is joined by its primary key, because
 * that is what the foreign keys point at.
 */
genera.createIndex((row) => row.id, { indexType: BasicIndex });
