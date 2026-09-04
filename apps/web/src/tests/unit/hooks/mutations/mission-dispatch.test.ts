/** @vitest-environment jsdom */

/**
 * What a mission dispatch write sends: missions, their stops, the notifications
 * they generate, and the registrations that decide who gets one.
 *
 * The command is authorized by name before any builder runs, so the name a hook
 * picks is what decides whether a save works, and nothing else in this app
 * asserts it. The lifecycle writes are where that bites hardest: four of the six
 * on a stop are a pair of columns read for which way the row moved, and a hook
 * naming the other direction still writes a row that looks right on screen.
 *
 * Four writes here post rather than dispatch. A mission create and a
 * registration create are multi-row commands, a move is a command on the mission
 * rather than on the stops it renumbers, and the notification generation is its
 * own route because it writes a set. Those are asserted on the wire. See
 * `dispatch-harness.ts` for why the two seams are different.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionPlanInput } from '../../../../hooks/mutations/use-mission-mutations';
import type { RegistrationFields } from '../../../../hooks/mutations/use-notification-registration-mutations';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const MISSION = '33333333-3333-4333-8333-333333333333';
const STOP = '44444444-4444-4444-8444-444444444444';
const SECOND_STOP = '55555555-5555-4555-8555-555555555555';
const THIRD_STOP = '66666666-6666-4666-8666-666666666666';
const REGISTRATION = '77777777-7777-4777-8777-777777777777';
const CONTACT = '88888888-8888-4888-8888-888888888888';
const OTHER_CONTACT = '99999999-9999-4999-8999-999999999999';
const ADDRESS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNIT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTIFICATION_TYPE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUBSCRIPTION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONTROL_REQUEST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_PROFILE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const {
	commandUrl,
	dispatches,
	firstAttempt,
	lastChanges,
	lastIntents,
	lastRequest,
	lastWrite,
	requests,
	resetDispatches,
	stubApi,
} = await import('./dispatch-harness');
const { mission_items } = await import('../../../../lib/collections/mission_items');
const { MISSION_DELETE_REFUSALS, REGISTRATION_SAVE_REFUSALS } = await import(
	'../../../../lib/acknowledgement-copy'
);
const { useMissionMutations } = await import('../../../../hooks/mutations/use-mission-mutations');
const { useMissionItemMutations } = await import(
	'../../../../hooks/mutations/use-mission-item-mutations'
);
const { useGenerateMissionNotifications } = await import(
	'../../../../hooks/mutations/use-mission-notification-generation'
);
const { useNotificationRegistrationMutations } = await import(
	'../../../../hooks/mutations/use-notification-registration-mutations'
);

const SHAPE = { type: 'Point', coordinates: [-121.49, 38.58] } as const;
const START = new Date('2026-08-10T15:00:00.000Z');
const END = new Date('2026-08-10T19:00:00.000Z');

beforeEach(() => {
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function missionPlan(overrides: Partial<MissionPlanInput> = {}): MissionPlanInput {
	return {
		controlType: 'application',
		missionName: 'North district fog',
		plannedMethodId: null,
		assignedToProfileId: null,
		scheduledStartAt: START,
		scheduledEndAt: END,
		rainDate: null,
		notificationTypeId: null,
		...overrides,
	};
}

describe('a mission write', () => {
	it('posts the create as one request naming the command', async () => {
		// A create carries the stops a mission is planned around, so it is a
		// transaction rather than a dispatch even while this app plans empty
		// missions. The request is the only place the command name appears.
		const { result } = renderHook(() => useMissionMutations());

		await result.current.create(MISSION, missionPlan({ plannedMethodId: 'method-1' }));

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('missions'));
		expect(lastRequest().method).toBe('POST');
		expect(lastRequest().body).toMatchObject({
			intents: ['missionDispatch.createMission'],
			id: MISSION,
			control_type: 'application',
			planned_method_id: 'method-1',
			scheduled_start_at: START.toISOString(),
		});
	});

	it('keeps the columns the server stamps out of the posted body', async () => {
		// `assigned_by_profile_id` is mirrored onto the optimistic row so the list
		// does not change under the user, and the server writes its own from the
		// session. A client value for it reads as an instruction.
		const { result } = renderHook(() => useMissionMutations());

		await result.current.create(MISSION, missionPlan({ assignedToProfileId: OTHER_PROFILE }));

		expect(Object.keys(lastRequest().body)).not.toContain('assigned_by_profile_id');
		expect(Object.keys(lastRequest().body)).not.toContain('organization_id');
		expect(Object.keys(lastRequest().body)).not.toContain('created_at');
	});

	it('names one command for a rename and moves only that column', async () => {
		const { result } = renderHook(() => useMissionMutations());

		await result.current.updateDetails(
			MISSION,
			missionPlan({ missionName: 'South district fog' }),
			missionPlan(),
		);

		expect(lastIntents()).toEqual(['missionDispatch.updateMissionDetails']);
		expect(lastChanges().mission_name).toBe('South district fog');
		expect(Object.keys(lastChanges())).not.toContain('scheduled_start_at');
	});

	it('reads a rescheduled window as one command, and the rain date with it', async () => {
		const { result } = renderHook(() => useMissionMutations());

		await result.current.updateDetails(
			MISSION,
			missionPlan({ rainDate: '2026-08-11' }),
			missionPlan(),
		);

		expect(lastIntents()).toEqual(['missionDispatch.updateMissionSchedule']);
		expect(lastChanges().rain_date).toBe('2026-08-11');
		expect(lastChanges().scheduled_start_at).toBe(START);
	});

	it('reads two Dates for the moment they name, not for being the same object', async () => {
		// A form rebuilds its Date on every keystroke, so comparing the objects
		// would make every save a reschedule and put the schedule guards in front
		// of a user who only fixed a typo.
		const { result } = renderHook(() => useMissionMutations());

		await result.current.updateDetails(
			MISSION,
			missionPlan({ scheduledStartAt: new Date(START.getTime()) }),
			missionPlan(),
		);

		expect(dispatches()).toHaveLength(0);
	});

	it('mirrors who handed the work over, and clears it when the work is taken back', async () => {
		const { result } = renderHook(() => useMissionMutations());

		await result.current.updateDetails(
			MISSION,
			missionPlan({ assignedToProfileId: OTHER_PROFILE }),
			missionPlan(),
		);
		expect(lastIntents()).toEqual(['missionDispatch.assignMission']);
		expect(lastChanges().assigned_by_profile_id).toBe(PROFILE);

		await result.current.updateDetails(
			MISSION,
			missionPlan(),
			missionPlan({ assignedToProfileId: OTHER_PROFILE }),
		);
		expect(lastChanges().assigned_to_profile_id).toBeNull();
		expect(lastChanges().assigned_by_profile_id).toBeNull();
	});

	it('names every command a save that touched everything means, in one write', async () => {
		// Five commands against one row, each with its own guards. Two writes would
		// be worse than one: TanStack DB merges updates to a key and keeps the last
		// metadata, so the first command's fields would travel under the second's
		// name.
		const { result } = renderHook(() => useMissionMutations());

		await result.current.updateDetails(
			MISSION,
			missionPlan({
				missionName: 'South district fog',
				scheduledEndAt: null,
				controlType: 'source_reduction',
				assignedToProfileId: OTHER_PROFILE,
				notificationTypeId: NOTIFICATION_TYPE,
			}),
			missionPlan(),
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'missionDispatch.updateMissionDetails',
			'missionDispatch.updateMissionSchedule',
			'missionDispatch.updateMissionPlan',
			'missionDispatch.assignMission',
			'missionDispatch.updateMissionNotificationType',
		]);
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useMissionMutations());

		await result.current.updateDetails(MISSION, missionPlan(), missionPlan());

		expect(dispatches()).toHaveLength(0);
	});

	it('names the start and stamps when it started', async () => {
		const { result } = renderHook(() => useMissionMutations());

		await result.current.start(MISSION);

		expect(lastIntents()).toEqual(['missionDispatch.startMission']);
		expect(lastChanges().started_at).toBeInstanceOf(Date);
	});

	it('lets the server date a mission finished without being started', async () => {
		// `autoStartMission` is what makes that legal. Guessing at the start here
		// would show a moment that is not the stored one until sync corrected it.
		const { result } = renderHook(() => useMissionMutations());

		await result.current.complete(MISSION);

		expect(lastIntents()).toEqual(['missionDispatch.completeMission']);
		expect(lastWrite().arguments).toEqual({ autoStartMission: true });
		expect(Object.keys(lastChanges())).not.toContain('started_at');
	});

	it('carries the cancellation as a comment id as well as a column', async () => {
		// The words go to a comment row, and the id is minted here so a retry
		// writes the same comment rather than a second one.
		const { result } = renderHook(() => useMissionMutations());

		await result.current.cancel(MISSION, 'Wind over the label limit.');

		expect(lastIntents()).toEqual(['missionDispatch.cancelMission']);
		expect(lastChanges().cancellation_reason).toBe('Wind over the label limit.');
		expect(lastChanges().cancelled_at).toBeInstanceOf(Date);
		expect((lastWrite().arguments as Record<string, unknown>).cancellationCommentId).toEqual(
			expect.any(String),
		);
	});

	it('clears the terminal columns on a reopen and leaves the start alone', async () => {
		// Reopening resumes work rather than resetting it, and nothing else on the
		// row records when the crew actually started.
		const { result } = renderHook(() => useMissionMutations());

		await result.current.reopen(MISSION, 'Half the block was missed.');

		expect(lastIntents()).toEqual(['missionDispatch.reopenMission']);
		expect(lastChanges().completed_at).toBeNull();
		expect(lastChanges().cancelled_at).toBeNull();
		expect(lastChanges().cancellation_reason).toBeNull();
		expect(Object.keys(lastChanges())).not.toContain('started_at');
		expect(lastWrite().arguments).toMatchObject({ reopenReason: 'Half the block was missed.' });
	});

	it('mission: its stops, its notifications, and the work recorded at them', async () => {
		const { result } = renderHook(() => useMissionMutations());

		await firstAttempt(MISSION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(MISSION, acknowledgements),
		);

		expect(lastIntents()).toEqual(['missionDispatch.deleteMission']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedActualActionDetach: false,
			acknowledgedMissionItemDeletion: false,
			acknowledgedNotificationDeletion: false,
		});
	});

	it('posts a move as one request on the mission, whatever it renumbers', async () => {
		// The stops are renumbered optimistically so nothing shifts twice on
		// screen, and one request per moved row would be a second description of
		// the same command.
		seedRows(mission_items, [
			{ id: STOP, position: 1 },
			{ id: SECOND_STOP, position: 2 },
			{ id: THIRD_STOP, position: 3 },
		]);
		const { result } = renderHook(() => useMissionMutations());

		await result.current.moveStops(MISSION, {
			order: [THIRD_STOP, STOP, SECOND_STOP],
			movedId: THIRD_STOP,
			placement: { kind: 'start' },
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('missions', MISSION));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body).toEqual({
			intents: ['missionDispatch.moveMissionItems'],
			mission_item_ids: [THIRD_STOP],
			placement: { kind: 'start' },
		});
	});

	it('names the anchor as a stop id, because that is what the endpoint takes', async () => {
		// `anchorId` is the reorder control's word for it and names no table. A
		// placement that kept it would resolve to nothing and reorder silently.
		seedRows(mission_items, [
			{ id: STOP, position: 1 },
			{ id: SECOND_STOP, position: 2 },
		]);
		const { result } = renderHook(() => useMissionMutations());

		await result.current.moveStops(MISSION, {
			order: [SECOND_STOP, STOP],
			movedId: STOP,
			placement: { kind: 'after', anchorId: SECOND_STOP },
		});

		expect(lastRequest().body.placement).toEqual({
			kind: 'after',
			missionItemId: SECOND_STOP,
		});
	});
});

describe('a mission stop write', () => {
	it('takes the ground off the request rather than sending a shape', async () => {
		// The server reads the geometry off the Requested Control Action inside the
		// transaction. A location source here would be this page deciding where a
		// request is.
		const { result } = renderHook(() => useMissionItemMutations());

		await result.current.addFromRequest({
			missionId: MISSION,
			request: {
				requestedControlActionId: CONTROL_REQUEST,
				lat: 38.58,
				lng: -121.49,
				geomType: 'st_point',
			},
			position: 4,
		});

		expect(lastIntents()).toEqual(['missionDispatch.addMissionItemFromRequestedControlAction']);
		expect(lastWrite().locationSource).toBeUndefined();
		const row = lastWrite().row as Record<string, unknown>;
		expect(row.requested_control_action_id).toBe(CONTROL_REQUEST);
		expect(row.mission_id).toBe(MISSION);
		expect(row.position).toBe(4);
	});

	it('carries the drawn shape for a stop that is ground somebody picked', async () => {
		const { result } = renderHook(() => useMissionItemMutations());

		await result.current.addAtGeometry({
			missionId: MISSION,
			geometry: SHAPE,
			addressId: ADDRESS,
			position: 1,
		});

		expect(lastIntents()).toEqual(['missionDispatch.addMissionItem']);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		const row = lastWrite().row as Record<string, unknown>;
		expect(row.requested_control_action_id).toBeNull();
		expect(row.address_id).toBe(ADDRESS);
		// The column's own vocabulary, not GeoJSON's, so the pin reads the way the
		// trigger will write it.
		expect(row.geom_type).toBe('st_point');
		expect(row.lat).toBe(38.58);
	});

	it('names the removal of a stop, which is not a mission delete', async () => {
		const { result } = renderHook(() => useMissionItemMutations());

		await result.current.removeStop(STOP);

		expect(lastIntents()).toEqual(['missionDispatch.removeMissionItem']);
	});

	it('clears the skip when a stop that had been passed over is worked', async () => {
		// Completing a skipped stop is a legal path. Leaving the reason on the row
		// renders it as still skipped, which is what the old endpoint recorded.
		const { result } = renderHook(() => useMissionItemMutations());

		await result.current.complete(STOP);

		expect(lastIntents()).toEqual(['missionDispatch.completeMissionItem']);
		expect(lastChanges().completed_at).toBeInstanceOf(Date);
		expect(lastChanges().skipped_at).toBeNull();
		expect(lastChanges().skip_reason).toBeNull();
		expect(lastWrite().arguments).toEqual({ autoStartMission: true });
	});

	it('names the reopen and leaves the skip columns alone', async () => {
		const { result } = renderHook(() => useMissionItemMutations());

		await result.current.reopen(STOP);

		expect(lastIntents()).toEqual(['missionDispatch.reopenMissionItem']);
		expect(lastChanges().completed_at).toBeNull();
		expect(Object.keys(lastChanges())).not.toContain('skipped_at');
	});

	it('clears the completion when a worked stop is passed over instead', async () => {
		const { result } = renderHook(() => useMissionItemMutations());

		await result.current.skip(STOP, 'Gate locked.');

		expect(lastIntents()).toEqual(['missionDispatch.skipMissionItem']);
		expect(lastChanges().skip_reason).toBe('Gate locked.');
		expect(lastChanges().completed_at).toBeNull();
		expect(lastWrite().arguments).toEqual({ autoStartMission: true });
	});

	it('names the unskip and takes the reason with it', async () => {
		const { result } = renderHook(() => useMissionItemMutations());

		await result.current.unskip(STOP);

		expect(lastIntents()).toEqual(['missionDispatch.unskipMissionItem']);
		expect(lastChanges().skipped_at).toBeNull();
		expect(lastChanges().skip_reason).toBeNull();
		expect(Object.keys(lastChanges())).not.toContain('completed_at');
	});
});

describe('generating a mission notification', () => {
	it('posts the mission to the generation route, which is not a table command', async () => {
		// `TableCommands` maps one row id to one command and answers one row. This
		// writes a set, so it has its own route and its own request.
		const { result } = renderHook(() => useGenerateMissionNotifications());

		await result.current(MISSION);

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('mission_notifications', 'generate'));
		expect(lastRequest().method).toBe('POST');
	});

	it('names the mission by its column, as everywhere else on the commands surface', async () => {
		const { result } = renderHook(() => useGenerateMissionNotifications());

		await result.current(MISSION);

		expect(lastRequest().body).toEqual({ mission_id: MISSION });
	});
});

function registrationFields(overrides: Partial<RegistrationFields> = {}): RegistrationFields {
	return {
		contactId: CONTACT,
		addressId: ADDRESS,
		buffer: { distance: 500, unitId: UNIT },
		flags: { hasBees: false, isNoSpray: true },
		...overrides,
	};
}

describe('a notification registration write', () => {
	it('posts the registration and its subscriptions as one request', async () => {
		// The link rows are created in the same Postgres transaction. One request
		// per row would leave a registration on screen with the types it was
		// registered for missing.
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.record({
			registrationId: REGISTRATION,
			contactId: CONTACT,
			location: { addressId: ADDRESS, geometry: SHAPE },
			buffer: { distance: 500, unitId: UNIT },
			flags: { hasBees: true, isNoSpray: false },
			subscriptions: [
				{ notificationRegistrationTypeId: SUBSCRIPTION, notificationTypeId: NOTIFICATION_TYPE },
			],
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('notification_registrations'));
		expect(lastRequest().method).toBe('POST');
		expect(lastRequest().body).toMatchObject({
			intents: ['publicEngagement.createNotificationRegistration'],
			id: REGISTRATION,
			buffer_distance: 500,
			buffer_unit_id: UNIT,
			has_bees: true,
			is_no_spray: false,
			subscriptions: [
				{ notificationRegistrationTypeId: SUBSCRIPTION, notificationTypeId: NOTIFICATION_TYPE },
			],
		});
	});

	it('sends the contact and the place as references, not as columns', async () => {
		// The row holds `contact_id` and `address_id`, and the command takes
		// instructions the server resolves inside the transaction. A registration
		// with no address says so rather than sending a missing one.
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.record({
			registrationId: REGISTRATION,
			contactId: CONTACT,
			location: { addressId: null, geometry: SHAPE },
			buffer: null,
			flags: { hasBees: false, isNoSpray: false },
			subscriptions: [],
		});

		expect(lastRequest().body).toMatchObject({
			contact: { kind: 'existing', contactId: CONTACT },
			location: { address: { kind: 'none' }, geometry: SHAPE },
		});
		expect(Object.keys(lastRequest().body)).not.toContain('contact_id');
		expect(Object.keys(lastRequest().body)).not.toContain('lat');
	});

	it('names only the command the edit means, and carries its instruction', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.save({
			registrationId: REGISTRATION,
			fields: registrationFields({ contactId: OTHER_CONTACT }),
			current: registrationFields(),
			geometry: null,
			acknowledgedFutureOnlyChange: true,
			acknowledgedHistoricalContactChange: true,
		});

		expect(lastIntents()).toEqual(['publicEngagement.updateNotificationRegistrationContact']);
		expect(lastWrite().arguments).toEqual({
			contact: { kind: 'existing', contactId: OTHER_CONTACT },
		});
		expect(lastChanges().contact_id).toBe(OTHER_CONTACT);
	});

	it('moves the centroid only when a shape actually arrived', async () => {
		// `geom` does not sync, so the caller passing a shape is the only signal a
		// redraw happened. Inventing a centroid for an address-only edit would
		// rewrite geometry nobody opened.
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.save({
			registrationId: REGISTRATION,
			fields: registrationFields({ addressId: null }),
			current: registrationFields(),
			geometry: null,
			acknowledgedFutureOnlyChange: true,
			acknowledgedHistoricalContactChange: true,
		});
		expect(lastIntents()).toEqual(['publicEngagement.updateNotificationRegistrationLocation']);
		expect(Object.keys(lastChanges())).not.toContain('lat');

		await result.current.save({
			registrationId: REGISTRATION,
			fields: registrationFields(),
			current: registrationFields(),
			geometry: SHAPE,
			acknowledgedFutureOnlyChange: true,
			acknowledgedHistoricalContactChange: true,
		});
		expect(lastChanges().lat).toBe(38.58);
		expect(lastChanges().geom_type).toBe('st_point');
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.save({
			registrationId: REGISTRATION,
			fields: registrationFields(),
			current: registrationFields(),
			geometry: null,
			acknowledgedFutureOnlyChange: false,
			acknowledgedHistoricalContactChange: false,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('notification registration: each flag rides the intent that takes it', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());
		const current = {
			contactId: CONTACT,
			addressId: null,
			buffer: { distance: 500, unitId: UNIT },
			flags: { hasBees: false, isNoSpray: true },
		};

		await firstAttempt(REGISTRATION_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save({
				registrationId: REGISTRATION,
				fields: {
					...current,
					contactId: OTHER_CONTACT,
					buffer: { distance: 800, unitId: UNIT },
				},
				current,
				geometry: null,
				acknowledgedFutureOnlyChange: acknowledgements.acknowledgedFutureOnlyChange === true,
				acknowledgedHistoricalContactChange:
					acknowledgements.acknowledgedHistoricalContactChange === true,
			}),
		);

		expect(lastIntents()).toEqual([
			'publicEngagement.updateNotificationRegistrationContact',
			'publicEngagement.updateNotificationRegistrationBuffer',
		]);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedFutureOnlyChange: false,
			acknowledgedHistoricalContactChange: false,
		});
	});

	it('asks nothing about the notices to come when only the contact moved', async () => {
		// A flag the named commands cannot be refused over is a question nobody
		// asked, and the server draws the same line.
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await firstAttempt(REGISTRATION_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save({
				registrationId: REGISTRATION,
				fields: registrationFields({ contactId: OTHER_CONTACT }),
				current: registrationFields(),
				geometry: null,
				acknowledgedFutureOnlyChange: acknowledgements.acknowledgedFutureOnlyChange === true,
				acknowledgedHistoricalContactChange:
					acknowledgements.acknowledgedHistoricalContactChange === true,
			}),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalContactChange: false });
	});

	it('reads the opt-out switch for its direction', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.deactivate(REGISTRATION);
		expect(lastIntents()).toEqual(['publicEngagement.deactivateNotificationRegistration']);
		expect(lastChanges().is_active).toBe(false);

		await result.current.reactivate(REGISTRATION);
		expect(lastIntents()).toEqual(['publicEngagement.reactivateNotificationRegistration']);
		expect(lastChanges().is_active).toBe(true);
	});

	it('names the delete, which is not the same as opting out', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.remove(REGISTRATION);

		expect(lastIntents()).toEqual(['publicEngagement.deleteNotificationRegistration']);
	});

	it('names the subscription and files it against the registration', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await result.current.subscribe({
			registrationId: REGISTRATION,
			notificationTypeId: NOTIFICATION_TYPE,
		});

		expect(lastIntents()).toEqual(['publicEngagement.subscribeNotificationRegistrationType']);
		const row = lastWrite().row as Record<string, unknown>;
		expect(row.notification_registration_id).toBe(REGISTRATION);
		expect(row.notification_type_id).toBe(NOTIFICATION_TYPE);
	});

	it('notification registration: unsubscribing is a future-only change too', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await firstAttempt(REGISTRATION_SAVE_REFUSALS, (acknowledgements) =>
			result.current.unsubscribe(
				SUBSCRIPTION,
				acknowledgements.acknowledgedFutureOnlyChange === true,
			),
		);

		expect(lastIntents()).toEqual(['publicEngagement.unsubscribeNotificationRegistrationType']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedFutureOnlyChange: false });
	});
});
