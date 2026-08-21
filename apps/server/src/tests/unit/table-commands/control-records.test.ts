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
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import {
	applicationBatchTableCommands,
	applicationTableCommands,
} from '../../../table-commands/applications.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { requestedControlActionTableCommands } from '../../../table-commands/requested-control-actions.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const INSECTICIDE = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';
const APPLICATION = '66666666-6666-4666-8666-666666666666';
const BATCH = '77777777-7777-4777-8777-777777777777';
const MISSION_ITEM = '88888888-8888-4888-8888-888888888888';

const GEOMETRY = { kind: 'geometry', geometry: { type: 'Point', coordinates: [-81, 28] } };
const WHEN = '2026-08-10';
const RESOLVED_AT = '2026-08-11T14:00:00.000Z';

const applications = applicationTableCommands(undefined as never);
const applicationBatches = applicationBatchTableCommands(undefined as never);
const requests = requestedControlActionTableCommands(undefined as never);

function request(payload: Record<string, unknown>): IntentRequest {
	return {
		payload,
		agency: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id: ROW,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<TCommand, unknown>,
	intent: AgencyCommandType,
	intentRequest: IntentRequest,
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
