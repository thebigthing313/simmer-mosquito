/**
 * The chemical application, batch link, and request maps.
 *
 * The two readings worth pinning here are the ones that were compound
 * conditions: an application's create was chosen by whether `missionItemId` was
 * present, and a request was resolved or reopened by
 * `isResolved !== false && resolvedAt !== null` — two keys, one of them
 * optional, folded into one direction.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import {
	applicationBatchTableCommands,
	applicationTableCommands,
} from '../../../table-commands/applications.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import {
	biocontrolActionTableCommands,
	outreachActionTableCommands,
	sourceReductionTableCommands,
} from '../../../table-commands/performed-actions.js';
import { requestedControlActionTableCommands } from '../../../table-commands/requested-control-actions.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const INSECTICIDE = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';
const APPLICATION = '66666666-6666-4666-8666-666666666666';
const BATCH = '77777777-7777-4777-8777-777777777777';
const MISSION_ITEM = '88888888-8888-4888-8888-888888888888';
const HABITAT = '99999999-9999-4999-8999-999999999999';
const INSPECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const METHOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const GEOMETRY = { kind: 'geometry', geometry: { type: 'Point', coordinates: [-81, 28] } };
const WHEN = '2026-08-10';
const RESOLVED_AT = '2026-08-11T14:00:00.000Z';

const applications = applicationTableCommands(undefined as never);
const applicationBatches = applicationBatchTableCommands(undefined as never);
const requests = requestedControlActionTableCommands(undefined as never);
const sourceReductions = sourceReductionTableCommands(undefined as never);
const outreachActions = outreachActionTableCommands(undefined as never);
const biocontrolActions = biocontrolActionTableCommands(undefined as never);

function request(payload: Record<string, unknown>): IntentRequest<CommandTable, string> {
	return {
		payload,
		organization: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id: ROW,
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

function applicationBody(): Record<string, unknown> {
	return {
		locationSource: GEOMETRY,
		insecticide_id: INSECTICIDE,
		amount_applied: 2.5,
		application_unit_id: UNIT,
		application_date: WHEN,
	};
}

describe('applications intent map', () => {
	it('reads the product and dose off column names', () => {
		const command = build(
			applications,
			'controlOperations.recordChemicalApplication',
			request(applicationBody()),
		);

		expect(command.payload).toMatchObject({
			applicationId: ROW,
			insecticideId: INSECTICIDE,
			amountApplied: 2.5,
			applicationUnitId: UNIT,
			applicationDate: WHEN,
		});
	});

	it('records off a stop only when that is the command', () => {
		const plain = build(
			applications,
			'controlOperations.recordChemicalApplication',
			request({ ...applicationBody(), mission_item_id: MISSION_ITEM }),
		);
		const stop = build(
			applications,
			'missionDispatch.recordChemicalApplicationForMissionItem',
			request({
				...applicationBody(),
				locationSource: undefined,
				geometry: GEOMETRY.geometry,
				mission_item_id: MISSION_ITEM,
			}),
		);

		expect(plain.payload).not.toHaveProperty('missionItemId');
		expect(stop.payload).toMatchObject({ missionItemId: MISSION_ITEM, applicationId: ROW });
	});

	it('lets a caller withhold the batch-clearance acknowledgement', () => {
		// Changing the product clears the batch links, since batches of the old
		// insecticide cannot describe the new one. The old PATCH hard-coded this, so
		// nobody could be asked.
		const withheld = build(
			applications,
			'controlOperations.updateChemicalApplicationFieldDetails',
			request({ insecticide_id: INSECTICIDE, acknowledgedBatchClearance: false }),
		);

		expect(withheld.payload).toMatchObject({ acknowledgedBatchClearance: false });
	});
});

describe('application_batches intent map', () => {
	it('links a batch through its own two columns', () => {
		const command = build(
			applicationBatches,
			'controlOperations.addChemicalApplicationBatch',
			request({ application_id: APPLICATION, insecticide_batch_id: BATCH }),
		);

		expect(command.payload).toMatchObject({
			applicationBatchId: ROW,
			applicationId: APPLICATION,
			insecticideBatchId: BATCH,
		});
	});

	it('removes a link by the link row alone', () => {
		// Which application it belonged to is what the server looks up — and is also
		// how the permission check reaches that application's performer.
		const command = build(
			applicationBatches,
			'controlOperations.removeChemicalApplicationBatch',
			request({ application_id: APPLICATION }),
		);

		expect(command.payload).toMatchObject({ applicationBatchId: ROW });
		expect(command.payload).not.toHaveProperty('applicationId');
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
			'chemical application',
			applications,
			'missionDispatch.recordChemicalApplicationForMissionItem',
			applicationBody(),
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
			applications,
			'missionDispatch.recordChemicalApplicationForMissionItem',
			request({
				...applicationBody(),
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
