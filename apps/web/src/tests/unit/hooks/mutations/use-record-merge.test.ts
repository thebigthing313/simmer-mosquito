/**
 * Which id a merge puts where, and what it says about consent.
 *
 * Two mistakes are possible in this module and neither is visible anywhere else.
 *
 * The survivor and the retired records are ids of the same table, so sending
 * them the wrong way round type-checks, passes the manager check, and commits:
 * the record the user chose to keep is soft-deleted and a duplicate survives
 * holding its history. Nothing on the server can catch it, because from there
 * both readings are a valid merge.
 *
 * And `acknowledged()` in `apps/server/src/table-commands/shared.ts` is
 * `value !== false`, so a flag that is merely absent arrives confirmed. A
 * request that forgets to carry it has agreed on the user's behalf to something
 * with no undo.
 */

import { CommandError } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import {
	mergeRefusalReason,
	recordMergeRequest,
} from '../../../../hooks/mutations/use-record-merge';

const SURVIVOR = '11111111-1111-4111-8111-111111111111';
const RETIRED = '22222222-2222-4222-8222-222222222222';
const ALSO_RETIRED = '33333333-3333-4333-8333-333333333333';

describe('recordMergeRequest', () => {
	it('puts the survivor in the path and the retired records in the body', () => {
		const { request } = recordMergeRequest('address', {
			targetId: SURVIVOR,
			sourceIds: [RETIRED, ALSO_RETIRED],
			acknowledged: true,
		});

		expect(request.key).toBe(SURVIVOR);
		expect(request.body.sourceAddressIds).toEqual([RETIRED, ALSO_RETIRED]);
		// The survivor is never among the records being folded in. The domain
		// refuses that too, but only after the user has committed to the merge.
		expect(request.body.sourceAddressIds).not.toContain(SURVIVOR);
	});

	it('carries kept values in the same body, so they commit with the merge', () => {
		// Two writes would mean the merge could land while the values it was meant
		// to carry did not, with the record they came from already retired and no
		// way back to it.
		const { intents, request } = recordMergeRequest('contact', {
			targetId: SURVIVOR,
			sourceIds: [RETIRED],
			acknowledged: true,
			fieldUpdates: {
				intents: ['publicEngagement.updateContactCommunication'],
				values: { preferred_phone: '555-0100' },
			},
		});

		expect(request.body).toEqual({
			preferred_phone: '555-0100',
			sourceContactIds: [RETIRED],
			acknowledgedContactMerge: true,
		});
		// Updates before the merge. Either order writes the same rows, because the
		// survivor is not one of the records a merge retires.
		expect(intents).toEqual([
			'publicEngagement.updateContactCommunication',
			'publicEngagement.mergeContacts',
		]);
	});

	it('names only the merge when nothing is being kept', () => {
		// An update command with no fields is refused by the domain builder, so an
		// intent named unconditionally would 400 every merge that changed nothing.
		const { intents } = recordMergeRequest('contact', {
			targetId: SURVIVOR,
			sourceIds: [RETIRED],
			acknowledged: true,
			fieldUpdates: { intents: [], values: {} },
		});

		expect(intents).toEqual(['publicEngagement.mergeContacts']);
	});

	it('sends the acknowledgement as false rather than leaving it out', () => {
		const { request } = recordMergeRequest('address', {
			targetId: SURVIVOR,
			sourceIds: [RETIRED],
			acknowledged: false,
		});

		// Not `toBeFalsy`, and not an absence check: an absent flag is read as
		// agreement by the server, so the only safe answer is the literal false.
		expect(request.body.acknowledgedMergeConsolidatesHistory).toBe(false);
		expect('acknowledgedMergeConsolidatesHistory' in request.body).toBe(true);
	});

	it('names the habitat command, table and source key', () => {
		const result = recordMergeRequest('habitat', {
			targetId: SURVIVOR,
			sourceIds: [RETIRED],
			acknowledged: true,
		});

		expect(result.intents).toEqual(['larvalSurveillance.mergeHabitats']);
		expect(result.request.table).toBe('habitats');
		expect(result.request.body).toEqual({
			sourceHabitatIds: [RETIRED],
			acknowledgedMergeConsolidatesHistory: true,
		});
	});

	it('uses the acknowledgement flag the contact merge carries', () => {
		// `mergeContacts` predates the other two and the server still reads this
		// name. Sending the shared one would leave the real flag absent, which the
		// server reads as agreement.
		const result = recordMergeRequest('contact', {
			targetId: SURVIVOR,
			sourceIds: [RETIRED],
			acknowledged: false,
		});

		expect(result.intents).toEqual(['publicEngagement.mergeContacts']);
		expect(result.request.body).toEqual({
			sourceContactIds: [RETIRED],
			acknowledgedContactMerge: false,
		});
	});

	it('always PATCHes, because the row it answers with is the survivor', () => {
		for (const recordType of ['address', 'habitat', 'contact'] as const) {
			expect(
				recordMergeRequest(recordType, {
					targetId: SURVIVOR,
					sourceIds: [RETIRED],
					acknowledged: true,
				}).request.method,
			).toBe('PATCH');
		}
	});
});

describe('mergeRefusalReason', () => {
	it('reads the reason off a merge refusal', () => {
		const error = new CommandError('Retired.', 409, {
			error: 'merge_refused',
			reason: 'target_inactive',
		});

		expect(mergeRefusalReason(error)).toBe('target_inactive');
	});

	it('is null for a failure that is not a merge refusal', () => {
		const error = new CommandError('Nope.', 403, { error: 'forbidden', reason: 'role_too_low' });

		expect(mergeRefusalReason(error)).toBeNull();
	});

	it('is null for a reason it does not recognise, rather than passing it on', () => {
		// The dialog switches on this to decide which sentence to show, and an
		// unknown reason has no sentence. Falling through to the server's own
		// message says more than a branch that renders nothing.
		const error = new CommandError('Nope.', 409, {
			error: 'merge_refused',
			reason: 'something_new',
		});

		expect(mergeRefusalReason(error)).toBeNull();
	});

	it('is null for an ordinary error with no body at all', () => {
		expect(mergeRefusalReason(new Error('Network down.'))).toBeNull();
	});
});
