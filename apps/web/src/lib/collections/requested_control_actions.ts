/**
 * The `requested_control_actions` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import {
	createRequestedControlActionsCollection,
	type RequestedControlAction,
} from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per action a mission asks for.
 *
 * This app writes requested_control_actions, so the collection carries the
 * three mutation handlers and every write through it names the command it
 * means.
 */
export const requested_control_actions = declareCollection<RequestedControlAction>({
	table: 'requested_control_actions',
	syncMode: 'on-demand',
	mutations: true,
	create: createRequestedControlActionsCollection,
});
