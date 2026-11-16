/**
 * The Treatment and request maps.
 *
 * The readings worth pinning here are the ones that were compound conditions:
 * an action's create was chosen by whether `missionItemId` was present, and a
 * request was resolved or reopened by `isResolved !== false && resolvedAt !==
 * null`, two keys, one of them optional, folded into one direction. A
 * Treatment adds a third: its lines arrive as rows nested in the body, and the
 * Formulation set changes whole or not at all.
 *
 * What the writer does with the lines (the diff, the recipe check, the
 * refusals) needs Postgres, and is in
 * `tests/integration/treatments.integration.test.ts`.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import {
	biocontrolActionTableCommands,
	outreachActionTableCommands,
	sourceReductionTableCommands,
} from '../../../table-commands/performed-actions.js';
import { requestedControlActionTableCommands } from '../../../table-commands/requested-control-actions.js';
import { treatmentTableCommands } from '../../../table-commands/treatments.js';
import { organizationHarness, ROW } from './command-harness.js';

const { request, build } = organizationHarness({ role: 'manager' });

const INSECTICIDE = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';
const APPLICATION = '66666666-6666-4666-8666-666666666666';
const BATCH = '77777777-7777-4777-8777-777777777777';
const MISSION_ITEM = '88888888-8888-4888-8888-888888888888';
const HABITAT = '99999999-9999-4999-8999-999999999999';
const INSPECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const METHOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FORMULATION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const GEOMETRY = { kind: 'geometry', geometry: { type: 'Point', coordinates: [-81, 28] } };
const WHEN = '2026-08-10';
const RESOLVED_AT = '2026-08-11T14:00:00.000Z';

const treatments = treatmentTableCommands(undefined as never);
const requests = requestedControlActionTableCommands(undefined as never);
const sourceReductions = sourceReductionTableCommands(undefined as never);
const outreachActions = outreachActionTableCommands(undefined as never);
const biocontrolActions = biocontrolActionTableCommands(undefined as never);

function line(): Record<string, unknown> {
	return {
		id: APPLICATION,
		insecticide_id: INSECTICIDE,
		amount_applied: 2.5,
		application_unit_id: UNIT,
		application_batches: [{ id: LINK, insecticide_batch_id: BATCH }],
	};
}

function treatmentBody(): Record<string, unknown> {
	return {
		locationSource: GEOMETRY,
		application_date: WHEN,
		application_method_id: METHOD,
		applications: [line()],
	};
}

describe('treatments intent map', () => {
	it('reads the visit off column names and the lines as nested rows', () => {
		const command = build(
			treatments,
			'controlOperations.recordTreatment',
			request(treatmentBody()),
		);

		expect(command.payload).toMatchObject({
			treatmentId: ROW,
			applicationDate: WHEN,
			applicationMethodId: METHOD,
			formulationId: null,
			mixAmount: null,
			mixUnitId: null,
			applications: [line()],
		});
	});

	it('reads the Formulation set off its three columns', () => {
		const command = build(
			treatments,
			'controlOperations.recordTreatment',
			request({
				...treatmentBody(),
				formulation_id: FORMULATION,
				mix_amount: 78,
				mix_unit_id: UNIT,
			}),
		);

		expect(command.payload).toMatchObject({
			formulationId: FORMULATION,
			mixAmount: 78,
			mixUnitId: UNIT,
		});
	});

	it('keeps a malformed line in place so the domain names its index', () => {
		// Dropping it would save a Treatment holding fewer products than the crew
		// recorded, behind a 201.
		expect(() =>
			build(
				treatments,
				'controlOperations.recordTreatment',
				request({ ...treatmentBody(), applications: [line(), 'not a row'] }),
			),
		).toThrow(
			expect.objectContaining({
				issues: expect.arrayContaining([expect.objectContaining({ path: 'applications.1.id' })]),
			}),
		);
	});

	it('records off a stop only when that is the command', () => {
		const plain = build(
			treatments,
			'controlOperations.recordTreatment',
			request({ ...treatmentBody(), mission_item_id: MISSION_ITEM }),
		);
		const stop = build(
			treatments,
			'missionDispatch.recordTreatmentForMissionItem',
			request({
				...treatmentBody(),
				locationSource: undefined,
				geometry: GEOMETRY.geometry,
				mission_item_id: MISSION_ITEM,
			}),
		);

		expect(plain.payload).not.toHaveProperty('missionItemId');
		expect(stop.payload).toMatchObject({ missionItemId: MISSION_ITEM, treatmentId: ROW });
	});

	it('leaves the stored Formulation alone on an edit that names none of it', () => {
		const command = build(
			treatments,
			'controlOperations.updateTreatmentFieldDetails',
			request({ application_date: WHEN }),
		);

		expect(command.payload).toMatchObject({ changes: { applicationDate: WHEN } });
		expect(command.payload).not.toHaveProperty('changes.formulationId');
	});

	it('clears the Formulation set when all three arrive null', () => {
		// Switching to product by product clears the reference, the mix amount and
		// the mix unit together.
		const command = build(
			treatments,
			'controlOperations.updateTreatmentFieldDetails',
			request({ formulation_id: null, mix_amount: null, mix_unit_id: null }),
		);

		expect(command.payload).toMatchObject({
			changes: { formulationId: null, mixAmount: null, mixUnitId: null },
		});
	});

	it('refuses half a Formulation set', () => {
		expect(() =>
			build(
				treatments,
				'controlOperations.updateTreatmentFieldDetails',
				request({ formulation_id: FORMULATION }),
			),
		).toThrow(DomainValidationError);
	});

	it('revises from the full line set and nothing else', () => {
		const command = build(
			treatments,
			'controlOperations.reviseTreatmentLines',
			request({ application_date: WHEN, applications: [line()] }),
		);

		expect(command.payload).toEqual(
			expect.objectContaining({ treatmentId: ROW, applications: [line()] }),
		);
		expect(command.payload).not.toHaveProperty('applicationDate');
	});

	it.each([
		'controlOperations.updateTreatmentFieldDetails',
		'controlOperations.updateTreatmentLocationAndContext',
		'controlOperations.reviseTreatmentLines',
	] as const)('refuses a mission stop named on %s', (intent) => {
		// The stop link is fixed at create; a PATCH naming it is refused rather
		// than saved without it.
		expect(() =>
			build(
				treatments,
				intent,
				request({ application_date: WHEN, applications: [line()], mission_item_id: MISSION_ITEM }),
			),
		).toThrow(
			expect.objectContaining({
				issues: [expect.objectContaining({ path: 'mission_item_id' })],
			}),
		);
	});

	it('deletes with no flag for the lines, and asks about batch links and support records', () => {
		const command = build(
			treatments,
			'controlOperations.deleteTreatment',
			request({ acknowledgedBatchDeletion: false }),
		);

		expect(command.payload).toMatchObject({
			treatmentId: ROW,
			acknowledgedBatchDeletion: false,
			acknowledgedSupportRecordDeletion: true,
		});
	});

	it('accepts nothing for the retired batch commands', () => {
		expect(Object.keys(treatments.intents).sort()).toEqual([
			'controlOperations.deleteTreatment',
			'controlOperations.recordTreatment',
			'controlOperations.reviseTreatmentLines',
			'controlOperations.updateTreatmentFieldDetails',
			'controlOperations.updateTreatmentLocationAndContext',
			'missionDispatch.recordTreatmentForMissionItem',
		]);
	});
});

describe('requested_control_actions intent map', () => {
	it('resolves and reopens by name, not by a compound of two keys', () => {
		// `isResolved !== false && resolvedAt !== null` decided this before, so
		// clearing the date reopened the request as a side effect.
		const resolved = build(
			requests,
			'controlOperations.resolveRequestedControlAction',
			request({ resolved_at: RESOLVED_AT }),
		);
		const reopened = build(
			requests,
			'controlOperations.reopenRequestedControlAction',
			request({ resolved_at: RESOLVED_AT }),
		);

		expect(resolved.payload).toMatchObject({ resolvedAt: new Date(RESOLVED_AT) });
		expect(reopened.type).toBe('controlOperations.reopenRequestedControlAction');
	});

	it('resolves without a date, which means now', () => {
		const command = build(requests, 'controlOperations.resolveRequestedControlAction', request({}));

		expect(command.type).toBe('controlOperations.resolveRequestedControlAction');
	});

	it('reads a new request off column names', () => {
		const command = build(requests, 'controlOperations.requestControlAction', {
			...request({
				locationSource: GEOMETRY,
				control_type: 'source_reduction',
				summary: 'Standing water behind the school',
			}),
		});

		expect(command.payload).toMatchObject({
			requestedControlActionId: ROW,
			controlType: 'source_reduction',
			summary: 'Standing water behind the school',
		});
	});
});

/**
 * ADR 0012: an action recorded off a mission stop stores what the same action
 * recorded outside one stores.
 *
 * The mission branch is a second construction of the same command, and it once
 * silently dropped `context` on all four types. The form sends the same keys
 * either way and the writers read `payload.context ?? { kind: 'none' }`, so the
 * action landed with null links and nothing threw. A client-side wire check
 * cannot see it, because the keys are on the request body in both cases, so the
 * assertion has to be on the command the intent map builds.
 *
 * This replaces `mission-execution-context.test.ts`, which asserted the same
 * thing over the payload inference the per-domain routes did (#634).
 */
describe('a mission stop keeps the action\u2019s own context', () => {
	const LARVAL = { kind: 'larval', habitatId: HABITAT, inspectionId: INSPECTION };
	// Outreach reaches people, not habitats: its larval context is the inspection
	// alone, and a habitat on it is refused by the domain.
	const OUTREACH_LARVAL = { kind: 'larval', inspectionId: INSPECTION };

	it.each([
		[
			'treatment',
			treatments,
			'missionDispatch.recordTreatmentForMissionItem',
			treatmentBody(),
			LARVAL,
		],
		[
			'source reduction',
			sourceReductions,
			'missionDispatch.recordSourceReductionForMissionItem',
			{
				source_reduction_method_id: METHOD,
				source_reduction_date: WHEN,
				sources_eliminated_amount: 4,
				sources_eliminated_unit_id: UNIT,
			},
			LARVAL,
		],
		[
			'outreach action',
			outreachActions,
			'missionDispatch.recordOutreachActionForMissionItem',
			{ outreach_method_id: METHOD, outreach_date: WHEN, reach: 12 },
			OUTREACH_LARVAL,
		],
		[
			'biocontrol action',
			biocontrolActions,
			'missionDispatch.recordBiocontrolActionForMissionItem',
			{
				biocontrol_method_id: METHOD,
				biocontrol_date: WHEN,
				amount_released: 3,
				release_unit_id: UNIT,
			},
			LARVAL,
		],
	] as const)('carries it through the %s stop command', (_name, spec, intent, body, context) => {
		const command = build(
			spec as never,
			intent,
			request({
				...body,
				geometry: GEOMETRY.geometry,
				mission_item_id: MISSION_ITEM,
				context,
			}),
		);

		expect(command.payload).toMatchObject({ missionItemId: MISSION_ITEM, context });
	});

	it('reads a stop with no context as an ordinary action', () => {
		// `{ kind: 'none' }` rather than a missing key: the writers read
		// `payload.context ?? { kind: 'none' }`, and an action with no larval or
		// adult context is an ordinary action, not an invalid one.
		const command = build(
			treatments,
			'missionDispatch.recordTreatmentForMissionItem',
			request({
				...treatmentBody(),
				geometry: GEOMETRY.geometry,
				mission_item_id: MISSION_ITEM,
			}),
		);

		expect(command.payload).toMatchObject({
			missionItemId: MISSION_ITEM,
			context: { kind: 'none' },
		});
	});
});
