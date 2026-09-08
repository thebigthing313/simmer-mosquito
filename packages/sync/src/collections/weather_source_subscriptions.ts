/**
 * The `weather_source_subscriptions` collection.
 *
 * Generated, and there is nothing table-specific below the schema import: what one
 * table differs by is either declared in its schema or chosen by the client
 * calling this. See `functions/sync-collection.ts` for what is shared, and
 * `pnpm generate:schemas` before editing this by hand.
 */

import { createCollection } from '@tanstack/db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import {
	type SyncCollectionClientOptions,
	syncCollectionConfig,
} from './functions/sync-collection.js';
import {
	type WeatherSourceSubscription,
	weatherSourceSubscriptionSchema,
} from './tables/weather_source_subscriptions.js';

/**
 * The row, re-exported here so a consumer needs one import rather than reaching
 * past the collection into the schema module for the type of what it holds.
 */
export type { WeatherSourceSubscription };

export function createWeatherSourceSubscriptionsCollection(options: SyncCollectionClientOptions) {
	// The schema is passed here rather than through `syncCollectionConfig` because it
	// has to be concrete for the row type to be inferred from it — see that module.
	return createCollection(
		electricCollectionOptions({
			...syncCollectionConfig<WeatherSourceSubscription>({
				table: 'weather_source_subscriptions',
				...options,
			}),
			schema: weatherSourceSubscriptionSchema,
		}),
	);
}
