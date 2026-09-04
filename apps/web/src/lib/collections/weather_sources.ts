/**
 * The `weather_sources` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createWeatherSourcesCollection, type WeatherSource } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The stations an agency reads from. A short list the weather screens draw
 * from.
 *
 * Writable: the six `weather.*` station commands land on
 * `/commands/weather_sources`. The role floor is manager, enforced on the server
 * and mirrored in the route guards, a collector or viewer never reaches a form
 * that writes here.
 */
export const weather_sources = declareCollection<WeatherSource>({
	table: 'weather_sources',
	syncMode: 'eager',
	mutations: true,
	create: createWeatherSourcesCollection,
});
