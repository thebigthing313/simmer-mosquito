/** @vitest-environment jsdom */

/**
 * What a public engagement write dispatches: requests, outreach and contacts.
 *
 * Three surfaces that each split one form across two commands, and the split is
 * the part nothing else asserts. A service request's contact is a reference the
 * command resolves rather than a column the client sets, an outreach edit is
 * either field details or location and context, and a contact edit is either
 * who they are or how the organization may reach them. Name the wrong half and
 * the server answers 200 having dropped the work.
 *
 * The close is the other reason this file exists. It writes two clocks:
 * `closed_at` is the browser's and goes on the wire, `updated_at` is the
 * browser's too but is stripped and rewritten by Postgres. The backdating that
 * keeps a fast clock from having the close refused only exists on the first.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutreachAction } from '../../../../hooks/queries/outreach-view';
import { installMemoryCollections } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const CONTACT = '44444444-4444-4444-8444-444444444444';
const OTHER_CONTACT = '55555555-5555-4555-8555-555555555555';
const ADDRESS = '66666666-6666-4666-8666-666666666666';
const METHOD = '77777777-7777-4777-8777-777777777777';
const STOP = '88888888-8888-4888-8888-888888888888';

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

const { dispatches, firstAttempt, lastChanges, lastIntents, lastWrite, resetDispatches, stubApi } =
	await import('./dispatch-harness');
const {
	CONTROL_ACTION_DELETE_REFUSALS,
	SERVICE_REQUEST_DELETE_REFUSALS,
	SERVICE_REQUEST_SAVE_REFUSALS,
} = await import('../../../../lib/acknowledgement-copy');
const { useServiceRequestMutations } = await import(
	'../../../../hooks/mutations/use-service-request-mutations'
);
const { useOutreachActionMutations } = await import(
	'../../../../hooks/mutations/use-outreach-action-mutations'
);
const { useContactMutations } = await import('../../../../hooks/mutations/use-contact-mutations');

const SHAPE = { type: 'Point', coordinates: [-121.49, 38.58] } as const;
const LOCATION_SOURCE = { kind: 'geometry', geometry: SHAPE } as const;

beforeEach(() => {
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function requestFields(overrides: Record<string, unknown> = {}) {
	return {
		intakeType: 'phone' as const,
		requestDate: '2026-08-03',
		details: 'Mosquitoes out back',
		receivedByProfileId: null,
		...overrides,
	};
}

describe('a service request write', () => {
	it('names the create and states both parties as references', async () => {
		// `contact_id` and `address_id` are where a resolved reference lands. The
		// command reads the reference, so a row column on its own resolves nothing.
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.record({
			requestId: RECORD,
			fields: requestFields(),
			contactId: CONTACT,
			addressId: ADDRESS,
			geometry: SHAPE,
		});

		expect(lastIntents()).toEqual(['publicEngagement.createServiceRequest']);
		expect(lastWrite().arguments).toEqual({
			contact: { kind: 'existing', contactId: CONTACT },
			location: { address: { kind: 'existing', addressId: ADDRESS }, geometry: SHAPE },
		});
	});

	it('writes the optimistic point in the column vocabulary, not GeoJSON', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.record({
			requestId: RECORD,
			fields: requestFields(),
			contactId: CONTACT,
			addressId: ADDRESS,
			geometry: SHAPE,
		});

		expect(lastWrite().row).toMatchObject({ lat: 38.58, lng: -121.49, geom_type: 'st_point' });
	});

	it('names both commands when the details and the caller both moved', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.save({
			requestId: RECORD,
			fields: requestFields({ details: 'Worse at dusk' }),
			current: requestFields(),
			contactId: OTHER_CONTACT,
			currentContactId: CONTACT,
			acknowledgedHistoricalContactChange: true,
		});

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'publicEngagement.updateServiceRequestDetails',
			'publicEngagement.updateServiceRequestContact',
		]);
		expect(lastWrite().arguments).toEqual({
			contact: { kind: 'existing', contactId: OTHER_CONTACT },
		});
	});

	it('sends no contact reference when the edit left the caller alone', async () => {
		// A reference the named commands have no reader for is a key the server
		// ignores, and it makes the body claim an edit it is not making.
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.save({
			requestId: RECORD,
			fields: requestFields({ details: 'Worse at dusk' }),
			current: requestFields(),
			contactId: CONTACT,
			currentContactId: CONTACT,
			acknowledgedHistoricalContactChange: false,
		});

		expect(lastIntents()).toEqual(['publicEngagement.updateServiceRequestDetails']);
		expect(lastWrite().arguments).toBeUndefined();
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.save({
			requestId: RECORD,
			fields: requestFields(),
			current: requestFields(),
			contactId: CONTACT,
			currentContactId: CONTACT,
			acknowledgedHistoricalContactChange: false,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('service request: only when the request moves to another contact', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());
		const fields = requestFields();

		await firstAttempt(SERVICE_REQUEST_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save({
				requestId: RECORD,
				fields,
				current: fields,
				contactId: OTHER_CONTACT,
				currentContactId: CONTACT,
				acknowledgedHistoricalContactChange:
					acknowledgements.acknowledgedHistoricalContactChange === true,
			}),
		);

		expect(lastIntents()).toEqual(['publicEngagement.updateServiceRequestContact']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalContactChange: false });
	});

	it('backdates the closing stamp it sends, and not the one Postgres rewrites', async () => {
		// #37. `closed_at` goes on the wire and the server refuses a moment ahead of
		// its own clock with no tolerance, so a browser running fast would have
		// every close refused. `updated_at` is stripped and needs no margin.
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.close(RECORD, 'Treated the basin');

		expect(lastIntents()).toEqual(['publicEngagement.closeServiceRequest']);
		const closedAt = lastChanges().closed_at as Date;
		const updatedAt = lastChanges().updated_at as Date;
		expect(closedAt.getTime()).toBeLessThan(updatedAt.getTime());
		expect(lastChanges().closed_by_profile_id).toBe(PROFILE);
	});

	it('mints the resolution comment here, so a retry does not write a second one', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.close(RECORD, 'Treated the basin');
		const first = lastWrite().arguments as Record<string, unknown>;

		expect(first.resolutionSummary).toBe('Treated the basin');
		expect(first.resolutionCommentId).toEqual(expect.any(String));

		await result.current.close(RECORD, 'Treated the basin');
		const second = lastWrite().arguments as Record<string, unknown>;

		// Two closes are two comments. One retry of the same close is not, and that
		// is the caller's id to hold, not this hook's.
		expect(second.resolutionCommentId).not.toBe(first.resolutionCommentId);
	});

	it('clears both closing columns on a reopen and dates the reopen itself', async () => {
		// There is no `reopened_at` column, so the moment travels as an argument and
		// the comment it writes is the only record the reopen happened.
		const { result } = renderHook(() => useServiceRequestMutations());

		await result.current.reopen(RECORD, 'Caller says it is back');

		expect(lastIntents()).toEqual(['publicEngagement.reopenServiceRequest']);
		expect(lastChanges().closed_at).toBeNull();
		expect(lastChanges().closed_by_profile_id).toBeNull();
		const args = lastWrite().arguments as Record<string, unknown>;
		expect(args.reopenReason).toBe('Caller says it is back');
		expect(args.reopenCommentId).toEqual(expect.any(String));
		expect(args.reopenedAt).toBeInstanceOf(Date);
	});

	it('service request: the assignment stops cut from it', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());

		await firstAttempt(SERVICE_REQUEST_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['publicEngagement.deleteServiceRequest']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedAssignmentItemDeletion: false });
	});
});

function outreachValues(overrides: Record<string, unknown> = {}) {
	return {
		methodId: METHOD,
		technicianProfileId: PROFILE,
		actionDate: '2026-08-03',
		addressId: ADDRESS,
		reach: 40,
		reachDescription: 'Third grade assembly',
		metadata: null,
		...overrides,
	};
}

/** The record as its detail page holds one, which is what an edit compares against. */
function outreachRecord(overrides: Partial<OutreachAction> = {}): OutreachAction {
	return {
		id: RECORD,
		outreachDate: '2026-08-03',
		methodId: METHOD,
		methodName: 'School visit',
		technicianProfileId: PROFILE,
		technicianName: 'Dana Reyes',
		reach: 40,
		reachDescription: 'Third grade assembly',
		addressId: ADDRESS,
		address: {
			id: ADDRESS,
			displayName: null,
			addressLine1: null,
			addressLine2: null,
			locality: null,
			region: null,
			postalCode: null,
		},
		inspectionId: null,
		requestedControlActionId: null,
		missionItemId: null,
		latitude: 38.58,
		longitude: -121.49,
		geometryKind: 'st_point',
		metadata: null,
		createdAt: new Date('2026-08-03T00:00:00.000Z'),
		updatedAt: new Date('2026-08-03T00:00:00.000Z'),
		createdByProfileId: PROFILE,
		updatedByProfileId: PROFILE,
		...overrides,
	};
}

const DRAWN = { lat: 38.6, lng: -121.5, geomType: 'st_point', locationSource: LOCATION_SOURCE };
const UNMOVED = { lat: 38.58, lng: -121.49, geomType: 'st_point' };

describe('an outreach write', () => {
	it('names the plain recording and states that there is no larval attachment', async () => {
		// `outreach_actions` has no `habitat_id`, so `{ kind: 'none' }` is the only
		// context a create can state. An absent context is a different request.
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.record({
			outreachActionId: RECORD,
			values: outreachValues(),
			location: DRAWN,
			missionItemId: null,
		});

		expect(lastIntents()).toEqual(['controlOperations.recordOutreachAction']);
		expect(lastWrite().context).toEqual({ kind: 'none' });
		expect(lastWrite().locationSource).toEqual(LOCATION_SOURCE);
	});

	it('names the mission stop command when the outreach closed one', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.record({
			outreachActionId: RECORD,
			values: outreachValues(),
			location: DRAWN,
			missionItemId: STOP,
			acknowledgements: { acknowledgedCompletedItemAdditionalRecord: false },
		});

		expect(lastIntents()).toEqual(['missionDispatch.recordOutreachActionForMissionItem']);
		expect(lastWrite().row).toMatchObject({ mission_item_id: STOP });
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedCompletedItemAdditionalRecord: false,
		});
	});

	it('leaves the location source out of a create that drew nothing', async () => {
		// The key's absence, not its value: `locationSource: undefined` reads the
		// same to a `toBeUndefined`, and an assertion that cannot tell the two apart
		// would pass for a hook that always sent the key.
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.record({
			outreachActionId: RECORD,
			values: outreachValues(),
			location: UNMOVED,
			missionItemId: null,
		});

		expect(Object.keys(lastWrite())).not.toContain('locationSource');
	});

	it('names the field details command alone when only the measurements moved', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.update(outreachRecord(), {
			values: outreachValues({ reach: 65 }),
			location: UNMOVED,
		});

		expect(lastIntents()).toEqual(['controlOperations.updateOutreachActionFieldDetails']);
		expect(lastChanges().reach).toBe(65);
		expect(Object.keys(lastChanges())).not.toContain('address_id');
		expect(Object.keys(lastWrite())).not.toContain('locationSource');
	});

	it('names the location command alone when only the address moved', async () => {
		// The field details builder has no reader for `address_id`, so this under
		// the other name is an address change dropped behind a 200.
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.update(outreachRecord(), {
			values: outreachValues({ addressId: null }),
			location: UNMOVED,
		});

		expect(lastIntents()).toEqual(['controlOperations.updateOutreachActionLocationAndContext']);
		expect(lastChanges().address_id).toBeNull();
		expect(Object.keys(lastChanges())).not.toContain('reach');
	});

	it('names both, in that order, when the form moved on both halves', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.update(outreachRecord(), {
			values: outreachValues({ reach: 65 }),
			location: DRAWN,
		});

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'controlOperations.updateOutreachActionFieldDetails',
			'controlOperations.updateOutreachActionLocationAndContext',
		]);
	});

	it('reseeds the marker columns when the shape was redrawn', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.update(outreachRecord(), {
			values: outreachValues(),
			location: DRAWN,
		});

		expect(lastIntents()).toEqual(['controlOperations.updateOutreachActionLocationAndContext']);
		expect(lastWrite().locationSource).toEqual(LOCATION_SOURCE);
		expect(lastChanges().lat).toBe(38.6);
		expect(lastChanges().lng).toBe(-121.5);
	});

	it('never states a context on an edit, because that would clear the inspection', async () => {
		// `contextIds` maps a context onto both `habitat_id` and `inspection_id`.
		// Nothing on this form can change the Inspection, so stating one unlinks it.
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.update(outreachRecord({ inspectionId: RECORD }), {
			values: outreachValues({ reach: 65, addressId: null }),
			location: DRAWN,
		});

		expect(lastWrite().context).toBeUndefined();
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.update(outreachRecord(), {
			values: outreachValues(),
			location: UNMOVED,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('reads the custom fields structurally, so an unchanged bag is not a write', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await result.current.update(outreachRecord({ metadata: { venue: 'library' } }), {
			values: outreachValues({ metadata: { venue: 'library' } }),
			location: UNMOVED,
		});
		expect(dispatches()).toHaveLength(0);

		await result.current.update(outreachRecord({ metadata: { venue: 'library' } }), {
			values: outreachValues({ metadata: { venue: 'school' } }),
			location: UNMOVED,
		});
		expect(lastIntents()).toEqual(['controlOperations.updateOutreachActionFieldDetails']);
	});

	it('outreach action: its notes and crew', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await firstAttempt(CONTROL_ACTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['controlOperations.deleteOutreachAction']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSupportRecordDeletion: false });
	});
});

function contactFields(overrides: Record<string, unknown> = {}) {
	return {
		contactName: 'Dana Reyes',
		company: null,
		department: 'Grounds',
		title: null,
		preferredPhone: '555-0100',
		alternatePhone: null,
		email: null,
		wantsEmail: false,
		wantsSms: false,
		wantsPhone: false,
		...overrides,
	};
}

describe('a contact write', () => {
	it('names the create and takes the id it was handed', async () => {
		// The service-request form writes the contact first and names it in the
		// request that follows, so the id cannot be minted inside the write.
		const { result } = renderHook(() => useContactMutations());

		await result.current.create(CONTACT, contactFields());

		expect(lastIntents()).toEqual(['publicEngagement.createContact']);
		expect(lastWrite().row).toMatchObject({ id: CONTACT, organization_id: ORGANIZATION });
	});

	it('names the details command alone when a job title was corrected', async () => {
		const { result } = renderHook(() => useContactMutations());

		await result.current.save(CONTACT, contactFields({ title: 'Grounds lead' }), contactFields());

		expect(lastIntents()).toEqual(['publicEngagement.updateContactDetails']);
		expect(Object.keys(lastChanges())).not.toContain('wants_sms');
	});

	it('names the communication command alone when consent was withdrawn', async () => {
		// Withdrawing SMS must not travel as an edit to somebody's job title.
		const { result } = renderHook(() => useContactMutations());

		await result.current.save(
			CONTACT,
			contactFields({ wantsSms: true }),
			contactFields({ wantsSms: false }),
		);

		expect(lastIntents()).toEqual(['publicEngagement.updateContactCommunication']);
		expect(lastChanges().wants_sms).toBe(true);
		expect(Object.keys(lastChanges())).not.toContain('contact_name');
	});

	it('names both halves on one write when both moved', async () => {
		const { result } = renderHook(() => useContactMutations());

		await result.current.save(
			CONTACT,
			contactFields({ company: 'Harborview HOA', email: 'dana@example.test' }),
			contactFields(),
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'publicEngagement.updateContactDetails',
			'publicEngagement.updateContactCommunication',
		]);
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useContactMutations());

		await result.current.save(CONTACT, contactFields(), contactFields());

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useContactMutations());

		await result.current.remove(CONTACT);

		expect(lastIntents()).toEqual(['publicEngagement.deleteContact']);
	});
});
