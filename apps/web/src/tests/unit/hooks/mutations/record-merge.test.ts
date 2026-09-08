/** @vitest-environment jsdom */

/**
 * What a merge puts on the wire.
 *
 * `recordMergeRequest` is asserted as a value and the hook is asserted against a
 * stubbed `writeCommand`, so both stop one step short of the request. The two
 * mistakes this module can make survive that step. The survivor and the retired
 * records are ids of the same table, so sending them the wrong way round is a
 * valid merge in the other direction: the record the user chose to keep is
 * retired and a duplicate inherits its history, and no type, floor or server
 * check sees anything wrong. And `acknowledged()` in
 * `apps/server/src/table-commands/shared.ts` is `value !== false`, so a flag
 * that does not reach the body arrives confirmed, which agrees on the user's
 * behalf to something with no undo.
 *
 * Neither is visible anywhere but the url and the body that went out, so this
 * reads them off a stubbed `fetch` rather than off a handoff.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { commandUrl, lastRequest, requests, resetDispatches, stubApi, stubApiRefusal } =
	await import('./dispatch-harness');
const { CommandError } = await import('@simmer-mosquito/sync');
const { mergeRefusalReason, useRecordMerge } = await import(
	'../../../../hooks/mutations/use-record-merge'
);

const SURVIVOR = '11111111-1111-4111-8111-111111111111';
const RETIRED = '22222222-2222-4222-8222-222222222222';
const ALSO_RETIRED = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('an address merge', () => {
	it('addresses the survivor and names the retired records in the body', async () => {
		const { result } = renderHook(() => useRecordMerge('address'));

		await result.current({
			targetId: SURVIVOR,
			sourceIds: [RETIRED, ALSO_RETIRED],
			acknowledged: true,
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('addresses', SURVIVOR));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body).toEqual({
			intents: ['foundation.mergeAddresses'],
			sourceAddressIds: [RETIRED, ALSO_RETIRED],
			acknowledgedMergeConsolidatesHistory: true,
		});
	});

	it('never puts a retired id in the path', async () => {
		// The read that is wrong in the other direction. Both ids are addresses, so
		// the server commits either one and the cleanup page reports a success.
		const { result } = renderHook(() => useRecordMerge('address'));

		await result.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: true });

		expect(lastRequest().url).not.toContain(RETIRED);
		expect(lastRequest().body.sourceAddressIds).not.toContain(SURVIVOR);
	});

	it('sends the consent as false rather than leaving it out', async () => {
		const { result } = renderHook(() => useRecordMerge('address'));

		await result.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: false });

		// The literal, and the key's presence. An absent flag is the server's
		// spelling of agreement, so a body that omits it is the guard not firing.
		expect(lastRequest().body.acknowledgedMergeConsolidatesHistory).toBe(false);
		expect('acknowledgedMergeConsolidatesHistory' in lastRequest().body).toBe(true);
	});

	it('carries the kept values in the same request as the merge', async () => {
		// A second request could land after the merge had already retired the record
		// the values came from, leaving nothing to read them back off.
		const { result } = renderHook(() => useRecordMerge('address'));

		await result.current({
			targetId: SURVIVOR,
			sourceIds: [RETIRED],
			acknowledged: true,
			fieldUpdates: {
				intents: ['foundation.updateAddressDetails'],
				values: { address_line_2: 'Unit 4' },
			},
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().body.address_line_2).toBe('Unit 4');
		expect(lastRequest().body.intents).toEqual([
			'foundation.updateAddressDetails',
			'foundation.mergeAddresses',
		]);
	});
});

describe('a habitat merge', () => {
	it('posts to the habitats endpoint under its own command name', async () => {
		const { result } = renderHook(() => useRecordMerge('habitat'));

		await result.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: true });

		expect(lastRequest().url).toBe(commandUrl('habitats', SURVIVOR));
		expect(lastRequest().body).toEqual({
			intents: ['larvalSurveillance.mergeHabitats'],
			sourceHabitatIds: [RETIRED],
			acknowledgedMergeConsolidatesHistory: true,
		});
	});
});

describe('a contact merge', () => {
	it('spells the consent the way the contact command reads it', async () => {
		// `mergeContacts` predates the other two and the server still looks for this
		// name. Sending the shared spelling leaves the real flag absent, which is
		// read as agreement, and the guard the dialog put in front of the user is
		// gone with nothing to show for it.
		const { result } = renderHook(() => useRecordMerge('contact'));

		await result.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: false });

		expect(lastRequest().url).toBe(commandUrl('contacts', SURVIVOR));
		expect(lastRequest().body.acknowledgedContactMerge).toBe(false);
		expect('acknowledgedMergeConsolidatesHistory' in lastRequest().body).toBe(false);
	});
});

describe('a refused merge', () => {
	it('hands the reason back as the dialog reads it', async () => {
		// The seam between the request and `mergeRefusalReason`: the refusal has to
		// arrive as a `CommandError` carrying the server's body, or the dialog falls
		// through to a message about nothing it can act on.
		stubApiRefusal(409, { error: 'merge_refused', reason: 'target_inactive' });
		const { result } = renderHook(() => useRecordMerge('habitat'));

		const refusal = await result
			.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: true })
			.catch((error: unknown) => error);

		expect(refusal).toBeInstanceOf(CommandError);
		expect(mergeRefusalReason(refusal)).toBe('target_inactive');
	});
});
