/**
 * The `missions` and `mission_items` maps.
 *
 * More inference came out of this domain than any other, so what is pinned here
 * is the readings the old routes could not make rather than the column names:
 * a stop drawn off a request *with* ground of its own, a Complete on a stop
 * somebody had skipped, and an acknowledgement a client is allowed to withhold.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { CommandTable } from '../../../command-payload.js';
import type { OrganizationCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { missionItemTableCommands } from '../../../table-commands/mission-items.js';
import { missionTableCommands } from '../../../table-commands/missions.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const MISSION = '44444444-4444-4444-8444-444444444444';
const REQUESTED_ACTION = '55555555-5555-4555-8555-555555555555';
const ADDRESS = '66666666-6666-4666-8666-666666666666';
const STOP = '77777777-7777-4777-8777-777777777777';
const COMMENT = '88888888-8888-4888-8888-888888888888';
const METHOD = '99999999-9999-4999-8999-999999999999';

const GEOMETRY = { kind: 'geometry', geometry: { type: 'Point', coordinates: [-81, 28] } };
const START = '2026-08-10T13:00:00.000Z';

const missions = missionTableCommands(undefined as never);
const missionItems = missionItemTableCommands(undefined as never);

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

describe('missions intent map', () => {
	it('reads the plan and the window off column names', () => {
		const command = build(
			missions,
			'missionDispatch.createMission',
			request({
				control_type: 'application',
				scheduled_start_at: START,
				mission_name: 'Tuesday adulticide',
				planned_method_id: METHOD,
				rain_date: '2026-08-12',
			}),
		);

		expect(command.payload).toMatchObject({
			missionId: ROW,
			controlType: 'application',
			scheduledStartAt: new Date(START),
			missionName: 'Tuesday adulticide',
			plannedMethodId: METHOD,
			rainDate: '2026-08-12',
		});
	});

	it('takes its stops as rows of the table they become, each stating its kind', () => {
		const command = build(
			missions,
			'missionDispatch.createMission',
			request({
				control_type: 'application',
				scheduled_start_at: START,
				mission_items: [
					{ id: STOP, kind: 'explicit', locationSource: GEOMETRY, address_id: ADDRESS },
					{
						id: MISSION,
						kind: 'fromRequestedControlAction',
						requested_control_action_id: REQUESTED_ACTION,
					},
				],
			}),
		);

		expect(command.payload).toMatchObject({
			items: [
				{ kind: 'explicit', missionItemId: STOP, addressId: ADDRESS },
				{
					kind: 'fromRequestedControlAction',
					missionItemId: MISSION,
					requestedControlActionId: REQUESTED_ACTION,
				},
			],
		});
	});

	it('lets a client withhold an acknowledgement the old routes hard-coded to true', () => {
		const withheld = build(
			missions,
			'missionDispatch.updateMissionSchedule',
			request({
				scheduled_start_at: START,
				acknowledgedNotificationTimingChange: false,
			}),
		);

		expect(withheld.payload).toMatchObject({
			acknowledgedNotificationTimingChange: false,
			// Absent means confirmed, which is what an online client sends.
			acknowledgedWorkedMissionScheduleChange: true,
		});
	});

	it('carries a client-generated id for the comment a cancellation writes', () => {
		const command = build(
			missions,
			'missionDispatch.cancelMission',
			request({
				cancellationCommentId: COMMENT,
				cancellation_reason: 'Wind out of range',
			}),
		);

		expect(command.payload).toMatchObject({
			cancellationCommentId: COMMENT,
			cancellationReason: 'Wind out of range',
		});
	});

	it('reopens without reading which closed state it is coming back from', () => {
		const command = build(
			missions,
			'missionDispatch.reopenMission',
			request({ reopenCommentId: COMMENT, reopenReason: 'Cancelled in error' }),
		);

		expect(command.type).toBe('missionDispatch.reopenMission');
		expect(command.payload).toMatchObject({ missionId: ROW, reopenCommentId: COMMENT });
	});

	it('restacks the stops from the mission, not from any stop', () => {
		const command = build(
			missions,
			'missionDispatch.moveMissionItems',
			request({
				mission_item_ids: [STOP, MISSION],
				placement: { kind: 'start' },
			}),
		);

		expect(command.payload).toMatchObject({
			missionId: ROW,
			missionItemIds: [STOP, MISSION],
			placement: { kind: 'start' },
		});
	});
});

describe('mission_items intent map', () => {
	it('keeps a request link and a location of its own on the same stop', () => {
		const command = build(
			missionItems,
			'missionDispatch.addMissionItem',
			request({
				mission_id: MISSION,
				locationSource: GEOMETRY,
				requested_control_action_id: REQUESTED_ACTION,
			}),
		);

		// The old POST read this pair as "drawn off the request" and dropped the
		// ground the caller drew.
		expect(command.type).toBe('missionDispatch.addMissionItem');
		expect(command.payload).toMatchObject({
			missionItemId: ROW,
			missionId: MISSION,
			requestedControlActionId: REQUESTED_ACTION,
		});
	});

	it('is a different command when the stop is the request', () => {
		const command = build(
			missionItems,
			'missionDispatch.addMissionItemFromRequestedControlAction',
			request({ mission_id: MISSION, requested_control_action_id: REQUESTED_ACTION }),
		);

		expect(command.type).toBe('missionDispatch.addMissionItemFromRequestedControlAction');
		expect(command.payload).toMatchObject({ requestedControlActionId: REQUESTED_ACTION });
	});

	it('appends when no placement is stated, and leaves the default to the domain', () => {
		const command = build(
			missionItems,
			'missionDispatch.addMissionItem',
			request({ mission_id: MISSION, locationSource: GEOMETRY }),
		);

		expect(command.payload).toMatchObject({ placement: { kind: 'end' } });
	});

	it('completes a stop that was skipped', () => {
		const command = build(
			missionItems,
			'missionDispatch.completeMissionItem',
			request({ skipped_at: START, completed_at: START }),
		);

		// The old PATCH checked `skipped_at` first and recorded this as a skip — the
		// work was done and the record said it was passed over.
		expect(command.type).toBe('missionDispatch.completeMissionItem');
		expect(command.payload).toMatchObject({ missionItemId: ROW, completedAt: new Date(START) });
	});

	it('reads a skip reason off its column', () => {
		const command = build(
			missionItems,
			'missionDispatch.skipMissionItem',
			request({ skip_reason: 'Locked gate', skipped_at: START }),
		);

		expect(command.payload).toMatchObject({
			skipReason: 'Locked gate',
			skippedAt: new Date(START),
		});
	});

	it('takes nothing but the row to undo either close', () => {
		expect(
			build(missionItems, 'missionDispatch.reopenMissionItem', request({})).payload,
		).toMatchObject({ missionItemId: ROW });
		expect(
			build(missionItems, 'missionDispatch.unskipMissionItem', request({})).payload,
		).toMatchObject({ missionItemId: ROW });
	});
});
