/**
 * The `weather_summaries` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createWeatherSummariesCollection, type WeatherSummary } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per station per day, so the screens ask for the window they show.
 *
 * Writable, for the three manual summary commands. The spreadsheet import does
 * not go through here: it is one request carrying up to 5,000 rows and answering
 * a per-row verdict, which no collection mutation can represent.
 */
export const weather_summaries = declareCollection<WeatherSummary>({
	table: 'weather_summaries',
	syncMode: 'on-demand',
	mutations: true,
	create: createWeatherSummariesCollection,
});
