/**
 * The `weather_summaries` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createWeatherSummariesCollection, type WeatherSummary } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { syncClientOptions } from './client-options';

/**
 * `on-demand`: One row per station per day, so the screens ask for the window they show.
 *
 * Writable, for the three manual summary commands. The spreadsheet import does
 * not go through here: it is one request carrying up to 5,000 rows and answering
 * a per-row verdict, which no collection mutation can represent.
 *
 * On-demand and writable together is the pairing that needs care. A write into a
 * subset nothing is currently querying waits out a txid confirmation that never
 * arrives, so a form that creates a summary has to be querying the station's
 * summaries already, which the detail page it opens from is doing.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const weather_summaries: Collection<WeatherSummary, string | number> =
	createWeatherSummariesCollection({
		...syncClientOptions,
		syncMode: 'on-demand',
		mutations: true,
	});

/**
 * The join index.
 *
 * A live query that joins this table loads it lazily — it collects the join keys
 * the driving side produces and asks for exactly those rows. It can only do that
 * when the join column is indexed. Without this it says so in a console warning
 * and loads the whole table instead, which on an on-demand collection is the one
 * thing the mode exists to avoid.
 *
 * Always `id`: every table is joined by its primary key, because that is what the
 * foreign keys point at.
 */
weather_summaries.createIndex((row) => row.id, { indexType: BasicIndex });
