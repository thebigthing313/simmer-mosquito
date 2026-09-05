/**
 * The four larval intent maps, as translations.
 *
 * `dispatch.test.ts` covers the mechanism with a fake spec — the routes, the
 * ordering, the authorization, the id. What it cannot cover is the one thing
 * each map is: a hand translation from Postgres column names to domain
 * arguments. That is where a mistake hides, because a builder reading a field
 * name nothing sends does not fail — it builds a command with the field absent,
 * and the domain either accepts a record that is missing something or refuses
 * for a reason that names the wrong cause.
 *
 * So these call the real builders with real bodies and read what came out. No
 * database is involved: a builder is a pure function, and `run` is never
 * touched.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { habitatTableCommands } from '../../../table-commands/habitats.js';
import { inspectionTableCommands } from '../../../table-commands/inspections.js';
import { sampleSpeciesTableCommands } from '../../../table-commands/sample-species.js';
import { sampleTableCommands } from '../../../table-commands/samples.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const HABITAT = '33333333-3333-4333-8333-333333333333';
const INSPECTION = '44444444-4444-4444-8444-444444444444';
const SAMPLE = '55555555-5555-4555-8555-555555555555';
const SAMPLE_SPECIES = '66666666-6666-4666-8666-666666666666';
const SPECIES = '77777777-7777-4777-8777-777777777777';
const ASSIGNMENT_ITEM = '88888888-8888-4888-8888-888888888888';
const SOURCE_HABITAT = '99999999-9999-4999-8999-999999999999';

/** The map, with no database — nothing here reaches `run`. */
const habitats = habitatTableCommands(undefined as never);
const inspections = inspectionTableCommands(undefined as never);
const samples = sampleTableCommands(undefined as never);
const sampleSpecies = sampleSpeciesTableCommands(undefined as never);

function request(
	id: string,
	payload: Record<string, unknown>,
	settings: unknown = null,
): IntentRequest<CommandTable, string> {
	return {
		payload,
		organization: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id,
	};
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

/** A wet inspection, keyed the way a collection row is keyed. */
function inspectionBody(): Record<string, unknown> {
	return {
		habitat_id: HABITAT,
		inspection_date: '2026-08-10',
		inspected_by_profile_id: ACTOR,
		is_wet: true,
		density: 'light',
		has_third_instar: true,
	};
}

describe('inspections intent map', () => {
	it('reads the result off column names', () => {
		const command = build(
			inspections,
			'larvalSurveillance.recordHabitatInspection',
			request(INSPECTION, inspectionBody()),
		);

		expect(command.type).toBe('larvalSurveillance.recordHabitatInspection');
		expect(command.payload).toMatchObject({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			inspectionId: INSPECTION,
			habitatId: HABITAT,
			inspectionDate: '2026-08-10',
			inspectedByProfileId: ACTOR,
			isWet: true,
			density: 'light',
			hasThirdInstar: true,
			hasFirstInstar: false,
		});
	});

	it('refuses the same body keyed camelCase', () => {
		// The failure this guards is silent otherwise: every field would read as
		// absent, and a wet inspection with a density band would be recorded as a dry
		// one against no habitat.
		const camelCase = {
			habitatId: HABITAT,
			inspectionDate: '2026-08-10',
			isWet: true,
			density: 'light',
		};

		expect(() =>
			build(
				inspections,
				'larvalSurveillance.recordHabitatInspection',
				request(INSPECTION, camelCase),
			),
		).toThrow(DomainValidationError);
	});

	it('takes the entry policy from the session rather than a query', () => {
		// A band and no counts: what a `hybrid` agency records and what a
		// count-and-dips agency may not. Same body, two agencies, and the only thing
		// that decided was the settings blob already on the auth context.
		expect(() =>
			build(
				inspections,
				'larvalSurveillance.recordHabitatInspection',
				request(INSPECTION, inspectionBody()),
			),
		).not.toThrow();

		expect(() =>
			build(
				inspections,
				'larvalSurveillance.recordHabitatInspection',
				request(INSPECTION, inspectionBody(), {
					larvalSurveillance: { inspectionEntryPolicy: { mode: 'count_and_dips_required' } },
				}),
			),
		).toThrow(DomainValidationError);
	});

	it('records an inspection against an assignment stop', () => {
		// A `fieldWork.*` command on a larval table: the endpoint follows the table,
		// the command follows the unit of work.
		const command = build(
			inspections,
			'fieldWork.recordHabitatInspectionForAssignmentItem',
			request(INSPECTION, { ...inspectionBody(), assignment_item_id: ASSIGNMENT_ITEM }),
		);

		expect(command.type).toBe('fieldWork.recordHabitatInspectionForAssignmentItem');
		expect(command.payload).toMatchObject({
			assignmentItemId: ASSIGNMENT_ITEM,
			inspectionId: INSPECTION,
			habitatId: HABITAT,
			isWet: true,
		});
	});

	it('changes only the location fields the body named', () => {
		const command = build(
			inspections,
			'larvalSurveillance.updateAdHocInspectionLocation',
			request(INSPECTION, { address_id: null }),
		);

		expect(command.payload).toMatchObject({ changes: { addressId: null } });
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('habitatTypeId');
	});
});

describe('samples intent map', () => {
	it('creates an unlabeled sample when that is the command, whatever the body carries', () => {
		// The old route read a `displayName` that trimmed to nothing as "unlabeled",
		// so a name of spaces silently produced a different record than the one asked
		// for. The name decides now, and the field is simply not read.
		const command = build(
			samples,
			'larvalSurveillance.addUnlabeledInspectionSample',
			request(SAMPLE, { inspection_id: INSPECTION, display_name: 'Dip 3' }),
		);

		expect(command.type).toBe('larvalSurveillance.addUnlabeledInspectionSample');
		expect(command.payload).toMatchObject({ sampleId: SAMPLE, inspectionId: INSPECTION });
		expect(command.payload).not.toHaveProperty('displayName');
	});

	it('labels a sample from its column', () => {
		const command = build(
			samples,
			'larvalSurveillance.addInspectionSample',
			request(SAMPLE, { inspection_id: INSPECTION, display_name: 'Dip 3' }),
		);

		expect(command.payload).toMatchObject({ inspectionId: INSPECTION, displayName: 'Dip 3' });
	});

	it('marks zero larvae by name, not by the column value', () => {
		// `is_zero_larvae` is a column a client can watch change; which way it moved
		// is the command's to say. A body that still holds the old value cannot
		// reverse the command it was sent with.
		const command = build(
			samples,
			'larvalSurveillance.markSampleZeroLarvae',
			request(SAMPLE, { is_zero_larvae: false }),
		);

		expect(command.type).toBe('larvalSurveillance.markSampleZeroLarvae');
	});

	it('treats an absent acknowledgement as given and an explicit false as withheld', () => {
		const assumed = build(
			samples,
			'larvalSurveillance.deleteInspectionSample',
			request(SAMPLE, {}),
		);
		const withheld = build(
			samples,
			'larvalSurveillance.deleteInspectionSample',
			request(SAMPLE, { acknowledgedAssociatedRecordsDeletion: false }),
		);

		expect(assumed.payload).toMatchObject({ acknowledgedAssociatedRecordsDeletion: true });
		expect(withheld.payload).toMatchObject({ acknowledgedAssociatedRecordsDeletion: false });
	});
});

describe('sample_species intent map', () => {
	it('reads a species count off column names', () => {
		const command = build(
			sampleSpecies,
			'larvalSurveillance.addSampleSpeciesCount',
			request(SAMPLE_SPECIES, {
				sample_id: SAMPLE,
				species_id: SPECIES,
				larvae_count: 12,
				identified_by_profile_id: ACTOR,
				identified_at: '2026-08-10',
			}),
		);

		expect(command.payload).toMatchObject({
			sampleSpeciesId: SAMPLE_SPECIES,
			sampleId: SAMPLE,
			speciesId: SPECIES,
			larvaeCount: 12,
			identifiedByProfileId: ACTOR,
			identifiedAt: '2026-08-10',
		});
	});

	it('corrects a count without restating the species', () => {
		const command = build(
			sampleSpecies,
			'larvalSurveillance.updateSampleSpeciesCount',
			request(SAMPLE_SPECIES, { larvae_count: 8 }),
		);

		expect(command.payload).toMatchObject({ changes: { larvaeCount: 8 } });
		expect((command.payload as { changes: object }).changes).not.toHaveProperty('speciesId');
	});
});

/**
 * The merge, which is the one habitat intent whose id means something other than
 * "the row being changed".
 *
 * Everywhere else on `/commands/habitats` the path id is the habitat the write
 * edits. Here it is the habitat that *survives*, and the ones being retired
 * arrive in the body. Reading it the other way round would soft-delete the
 * habitat the user had open and keep the ones they were folding away, which no
 * type and no permission check would notice.
 */
describe('habitats: merge', () => {
	it('takes the target from the path and the sources from the body', () => {
		const command = build(
			habitats,
			'larvalSurveillance.mergeHabitats',
			request(HABITAT, {
				sourceHabitatIds: [SOURCE_HABITAT],
				acknowledgedMergeConsolidatesHistory: true,
			}),
		);

		expect(command.payload).toMatchObject({
			targetHabitatId: HABITAT,
			sourceHabitatIds: [SOURCE_HABITAT],
		});
	});

	it('refuses a merge the caller withheld the acknowledgement on', () => {
		// An absent flag reads as confirmed, per `acknowledged`; `false` is how a
		// client says it has not got the confirmation yet.
		expect(() =>
			build(
				habitats,
				'larvalSurveillance.mergeHabitats',
				request(HABITAT, {
					sourceHabitatIds: [SOURCE_HABITAT],
					acknowledgedMergeConsolidatesHistory: false,
				}),
			),
		).toThrow(DomainValidationError);
	});

	it('refuses a merge with no sources', () => {
		// An empty list is a merge that would retire nothing and answer as if it
		// had worked. The domain refuses it rather than the route reading it as a
		// no-op.
		expect(() =>
			build(
				habitats,
				'larvalSurveillance.mergeHabitats',
				request(HABITAT, {
					sourceHabitatIds: [],
					acknowledgedMergeConsolidatesHistory: true,
				}),
			),
		).toThrow(DomainValidationError);
	});

	it('refuses a habitat listed as its own source', () => {
		expect(() =>
			build(
				habitats,
				'larvalSurveillance.mergeHabitats',
				request(HABITAT, {
					sourceHabitatIds: [HABITAT],
					acknowledgedMergeConsolidatesHistory: true,
				}),
			),
		).toThrow(DomainValidationError);
	});
});
