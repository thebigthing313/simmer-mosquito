/**
 * The `biocontrol_actions` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { type BiocontrolAction, createBiocontrolActionsCollection } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `on-demand`: One row per action taken, so the explorers ask for a date window rather than
 * the season.
 *
 * This app writes biocontrol_actions, so the collection carries the three
 * mutation handlers and every write through it names the command it means.
 */
export const biocontrol_actions = declareCollection<BiocontrolAction>({
	table: 'biocontrol_actions',
	syncMode: 'on-demand',
	mutations: true,
	create: createBiocontrolActionsCollection,
});
