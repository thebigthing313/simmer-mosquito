/**
 * The `weather_sources` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createWeatherSourcesCollection, type WeatherSource } from '@simmer-mosquito/sync';
import type { Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `eager`: The stations an agency reads from. A short list the weather screens draw
 * from.
 *
 * Read-only here. Declaring it leaves the collection with no
 * `onInsert`/`onUpdate`/`onDelete` at all, so a write is refused before it
 * travels.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const weather_sources: Collection<WeatherSource, string | number> =
	createWeatherSourcesCollection({
		serverUrl: getServerUrl(),
		syncMode: 'eager',
		mutations: false,
	});
