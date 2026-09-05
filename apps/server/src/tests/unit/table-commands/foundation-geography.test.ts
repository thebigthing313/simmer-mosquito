/**
 * An agency's geography and its species selection, as translations.
 *
 * `region_folders`, `regions` and `organization_species`. Three things are worth
 * a test here and nothing else is: that a move is its own command rather than
 * something read off a folder id that happened to arrive, that the three
 * acknowledgements the old routes hard-coded to `true` can now be withheld, and
 * that `geometry` stays as the domain spells it while `region_folder_id` does
 * not.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { organizationSpeciesTableCommands } from '../../../table-commands/organization-species.js';
import { regionFolderTableCommands, regionTableCommands } from '../../../table-commands/regions.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const FOLDER = '44444444-4444-4444-8444-444444444444';
const SPECIES = '55555555-5555-4555-8555-555555555555';

const SQUARE = {
	type: 'Polygon',
	coordinates: [
		[
			[-121.5, 38.5],
			[-121.4, 38.5],
			[-121.4, 38.6],
			[-121.5, 38.6],
			[-121.5, 38.5],
		],
	],
};

function request(payload: Record<string, unknown>): IntentRequest<CommandTable, string> {
	return {
		payload,
		organization: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'admin',
		} as unknown as AuthContext,
		id: ROW,
	};
}

/**
 * The paths a builder refused on.
 *
 * `DomainValidationError.message` only names the command; which rule fired is in
 * `issues`, so a test that matched the message would pass on any refusal at all.
 */
function refusedPaths(run: () => unknown): readonly string[] {
	try {
		run();
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return error.issues.map((issue) => issue.path);
		}
		throw error;
	}
	throw new Error('Expected the builder to refuse.');
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<CommandTable, TCommand, unknown, string>,
	intent: OrganizationCommandType,
	intentRequest: IntentRequest<CommandTable, string>,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

const folders = regionFolderTableCommands(undefined as never);
const regions = regionTableCommands(undefined as never);
const organizationSpecies = organizationSpeciesTableCommands(undefined as never);

describe('regions', () => {
	it('reads a region off column names, and the shape off the domain instruction', () => {
		const command = build(
			regions,
			'foundation.createRegion',
			request({
				region_folder_id: FOLDER,
				name: 'North district',
				description: 'North of the causeway',
				metadata: { crew: 'A' },
				geometry: SQUARE,
			}),
		);

		expect(command.payload).toMatchObject({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			regionId: ROW,
			regionFolderId: FOLDER,
			name: 'North district',
			description: 'North of the causeway',
			metadata: { crew: 'A' },
		});
	});

	/*
	 * `buildRegionUpdateCommands` emits a `moveRegionToFolder` for any PATCH whose
	 * body carries `regionFolderId`, whether or not it changed. A rename that
	 * restated the folder it was already in filed a move nobody asked for. Here
	 * the two are separate names over one payload, and a rename reads only its own
	 * half.
	 */
	it('does not turn a rename into a move', () => {
		const renamed = build(
			regions,
			'foundation.updateRegionDetails',
			request({ name: 'South district', region_folder_id: FOLDER }),
		);

		expect(renamed.type).toBe('foundation.updateRegionDetails');
		expect((renamed.payload as { changes: object }).changes).toEqual({ name: 'South district' });
		expect(renamed.payload).not.toHaveProperty('regionFolderId');
	});

	// A region leaves a folder without joining another by moving to null, so this
	// one reads the value rather than its presence. Both directions are checked:
	// null alone would pass against a misspelled column, because a column that is
	// not there reads as null too.
	it('moves a region into a folder, and out of every folder', () => {
		const filed = build(
			regions,
			'foundation.moveRegionToFolder',
			request({ region_folder_id: FOLDER }),
		);
		const loose = build(
			regions,
			'foundation.moveRegionToFolder',
			request({ region_folder_id: null }),
		);

		expect(filed.payload).toMatchObject({ regionId: ROW, regionFolderId: FOLDER });
		expect(loose.payload).toMatchObject({ regionId: ROW, regionFolderId: null });
	});

	it('tells an absent description from one sent as null', () => {
		const untouched = build(regions, 'foundation.updateRegionDetails', request({ name: 'North' }));
		const cleared = build(
			regions,
			'foundation.updateRegionDetails',
			request({ description: null }),
		);

		expect((untouched.payload as { changes: object }).changes).not.toHaveProperty('description');
		expect(cleared.payload).toMatchObject({ changes: { description: null } });
	});

	/*
	 * The old routes passed `acknowledgedRegionBoundaryChange: true` and
	 * `acknowledgedRegionDelete: true` at the call site, so a client could not
	 * withhold either. Redrawing a boundary changes which records a region
	 * contains, retroactively; the guard exists so a client that has not confirmed
	 * that is refused rather than having the confirmation written for it.
	 */
	it('refuses a boundary change the caller explicitly has not confirmed', () => {
		expect(
			refusedPaths(() =>
				build(
					regions,
					'foundation.updateRegionGeometry',
					request({ geometry: SQUARE, acknowledgedRegionBoundaryChange: false }),
				),
			),
		).toContain('acknowledgedRegionBoundaryChange');
	});

	it('takes an absent boundary acknowledgement as confirmed', () => {
		const command = build(
			regions,
			'foundation.updateRegionGeometry',
			request({ geometry: SQUARE }),
		);

		expect(command.payload).toMatchObject({ acknowledgedRegionBoundaryChange: true });
	});

	it('refuses a delete the caller explicitly has not confirmed', () => {
		expect(
			refusedPaths(() =>
				build(regions, 'foundation.deleteRegion', request({ acknowledgedRegionDelete: false })),
			),
		).toContain('acknowledgedRegionDelete');
	});
});

describe('region folders', () => {
	it('reads a folder off column names', () => {
		const command = build(
			folders,
			'foundation.createRegionFolder',
			request({ name: 'Districts', description: 'Operational split' }),
		);

		expect(command.payload).toMatchObject({
			regionFolderId: ROW,
			name: 'Districts',
			description: 'Operational split',
		});
	});

	/*
	 * Deleting a folder does not delete the regions in it; they come loose.
	 * `deleteRegionFolderCommand` records that acknowledgement rather than
	 * guarding on it, unlike the two on `regions`, so what is testable is that a
	 * withheld one is carried and an absent one is confirmed. The old route
	 * hard-coded `true` and could express neither.
	 */
	it('carries a withheld region detach, and confirms an absent one', () => {
		const withheld = build(
			folders,
			'foundation.deleteRegionFolder',
			request({ acknowledgedRegionDetach: false }),
		);
		const absent = build(folders, 'foundation.deleteRegionFolder', request({}));

		expect(withheld.payload).toMatchObject({ acknowledgedRegionDetach: false });
		expect(absent.payload).toMatchObject({ acknowledgedRegionDetach: true });
	});
});

describe('organization species', () => {
	it('selects by name rather than by a value read for its direction', () => {
		const selected = build(
			organizationSpecies,
			'foundation.selectOrganizationSpecies',
			request({ species_id: SPECIES }),
		);
		// The row a select produces may be one that already existed and was
		// unselected — `enableOrganizationSpecies` upserts on the unique pair. Which
		// way it is going is the command's to say, not `deleted_at`'s.
		const unselected = build(
			organizationSpecies,
			'foundation.unselectOrganizationSpecies',
			request({ species_id: SPECIES }),
		);

		expect(selected.payload).toMatchObject({
			organizationSpeciesId: ROW,
			speciesId: SPECIES,
		});
		expect(unselected.type).toBe('foundation.unselectOrganizationSpecies');
		expect(unselected.payload).toMatchObject({ organizationSpeciesId: ROW });
	});
});
