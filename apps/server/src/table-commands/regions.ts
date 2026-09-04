/**
 * The `region_folders` and `regions` tables, as commands.
 *
 * An agency's geography: named polygons, and the folders it files them under.
 * Eight commands, and the writers are the ones
 * `foundation-geography-commands/` already uses — imported rather than
 * rewritten, so a region written through `/foundation/regions` and one written
 * through `/commands/regions` cannot end up different.
 *
 * ## What the old PATCH inferred
 *
 * `buildRegionUpdateCommands` reads three groups of keys and emits up to three
 * commands from one body: `name`/`description`/`metadata` means
 * `updateRegionDetails`, a `regionFolderId` means `moveRegionToFolder`, a
 * `geometry` means `updateRegionGeometry`. Moving a region between folders and
 * renaming it are genuinely two commands — that part is right — but which two
 * was decided by which keys arrived, so a client that sent a folder id it was
 * not changing filed a move it did not mean. Here the request names both.
 *
 * ## Two acknowledgements the old routes could not withhold
 *
 * `acknowledgedRegionBoundaryChange` and `acknowledgedRegionDelete` were passed
 * `true` at their call sites, hard-coded, and the same for a folder delete's
 * `acknowledgedRegionDetach`. All three go through `acknowledged()` now, where
 * absent still means confirmed. The two on `regions` are guarded — the domain
 * refuses an explicit `false` — and the folder's is recorded rather than
 * guarded, which is the domain's call and not restated here. Redrawing a
 * boundary changes which records a region contains, retroactively, so a client
 * that has not confirmed it should be able to say so and be refused rather than
 * have the confirmation written for it.
 *
 * ## Field names
 *
 * Postgres column names: `region_folder_id`, `name`, `description`, `metadata`.
 *
 * `geometry` is the exception and stays as the domain spells it: the polygon
 * lives in `geom`, which never syncs, and `geojson` is a generated read column
 * nothing writes. So `geometry` names an instruction — the shape to store — not
 * a column, in the same way `locationSource` does on the surveillance tables.
 */

import {
	createRegionCommand,
	createRegionFolderCommand,
	deleteRegionCommand,
	deleteRegionFolderCommand,
	type FoundationCommand,
	moveRegionToFolderCommand,
	updateRegionDetailsCommand,
	updateRegionFolderCommand,
	updateRegionGeometryCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeRegionFolderCommand } from '../foundation-geography-commands/region-folders.js';
import { writeRegionCommand } from '../foundation-geography-commands/regions.js';
import type { RegionFolderRow, RegionRow } from '../foundation-geography-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The boundary to store. Not a column: `geom` never syncs.
 */
type RegionArgument = 'geometry';

export function regionFolderTableCommands(
	db: CommandDb,
): TableCommands<'region_folders', FoundationCommand, RegionFolderRow> {
	return {
		table: 'region_folders',
		run: {
			db,
			write: writeRegionFolderCommand,
			notFound: 'region_folder_not_found',
			key: 'regionFolder',
		},
		intents: {
			'foundation.createRegionFolder': ({ payload, agency, id }) =>
				createRegionFolderCommand({
					...agency,
					regionFolderId: id,
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
				}),

			'foundation.updateRegionFolder': ({ payload, agency, id }) =>
				updateRegionFolderCommand({
					...agency,
					regionFolderId: id,
					...(payload.name !== undefined ? { name: readText(payload.name) ?? '' } : {}),
					...(payload.description !== undefined
						? { description: readNullableText(payload.description) }
						: {}),
				}),

			// Deleting a folder does not delete the regions in it; they come loose.
			// That is what the acknowledgement is about.
			'foundation.deleteRegionFolder': ({ payload, agency, id }) =>
				deleteRegionFolderCommand({
					...agency,
					regionFolderId: id,
					acknowledgedRegionDetach: acknowledged(payload, 'acknowledgedRegionDetach'),
				}),
		},
	};
}

export function regionTableCommands(
	db: CommandDb,
): TableCommands<'regions', FoundationCommand, RegionRow, RegionArgument> {
	return {
		table: 'regions',
		run: { db, write: writeRegionCommand, notFound: 'region_not_found', key: 'region' },
		intents: {
			'foundation.createRegion': ({ payload, agency, id }) =>
				createRegionCommand({
					...agency,
					regionId: id,
					regionFolderId: readNullableText(payload.region_folder_id),
					name: readText(payload.name) ?? '',
					description: readNullableText(payload.description),
					metadata: payload.metadata ?? null,
					// Passed through untyped: which geometries a region accepts is the
					// domain builder's rule, and re-stating it here would be a second copy
					// of it that could disagree.
					geometry: payload.geometry,
				}),

			// The three updates read only what they take. A save that renamed a region
			// and redrew it names both `updateRegionDetails` and `updateRegionGeometry`,
			// and each reads its own half of one payload.
			'foundation.updateRegionDetails': ({ payload, agency, id }) =>
				updateRegionDetailsCommand({
					...agency,
					regionId: id,
					...(payload.name !== undefined ? { name: readText(payload.name) ?? '' } : {}),
					...(payload.description !== undefined
						? { description: readNullableText(payload.description) }
						: {}),
					...(payload.metadata !== undefined ? { metadata: payload.metadata ?? null } : {}),
				}),

			// A move is its own command, so `region_folder_id` is read here and nowhere
			// else. Present-and-null is how a region leaves a folder without joining
			// another, which is why this reads the value rather than its presence.
			'foundation.moveRegionToFolder': ({ payload, agency, id }) =>
				moveRegionToFolderCommand({
					...agency,
					regionId: id,
					regionFolderId: readNullableText(payload.region_folder_id),
				}),

			'foundation.updateRegionGeometry': ({ payload, agency, id }) =>
				updateRegionGeometryCommand({
					...agency,
					regionId: id,
					geometry: payload.geometry,
					acknowledgedRegionBoundaryChange: acknowledged(
						payload,
						'acknowledgedRegionBoundaryChange',
					),
				}),

			'foundation.deleteRegion': ({ payload, agency, id }) =>
				deleteRegionCommand({
					...agency,
					regionId: id,
					acknowledgedRegionDelete: acknowledged(payload, 'acknowledgedRegionDelete'),
				}),
		},
	};
}
