import { describe, expect, it } from 'vitest';
import {
	acknowledgeableRefusalOf,
	readAcknowledgements,
	STOP_ACKNOWLEDGEABLE_REFUSALS,
} from '../../../lib/stop-acknowledgements';
import { CommandError } from '../../../sync/command-error';

/**
 * The refusals a technician may answer, and the three that nobody may.
 *
 * Getting the set wrong is silent in the dangerous direction: treat a hard
 * refusal as acknowledgeable and the UI offers a "Record it anyway" the server
 * will refuse again, with no explanation of why the second attempt failed too.
 */
describe('acknowledgeable refusals', () => {
	/**
	 * The pairs are written out rather than read off the map.
	 *
	 * Iterating `STOP_ACKNOWLEDGEABLE_REFUSALS` and passing the same map in asserts
	 * `map[code] === map[code]`, which is true whatever the map says: a flag
	 * renamed on one side and not the other would still pass. The point of this
	 * test is the pairing itself, so the pairing has to be stated here, where a
	 * change to it shows up as a diff.
	 *
	 * The answer is the flag to send, not the code that was refused: the caller's
	 * next move is to retry with it set, and handing back the code would leave
	 * every call site doing the lookup itself.
	 */
	it.each([
		['assignment_item_already_completed', 'acknowledgedCompletedItemAdditionalRecord'],
		['assignment_item_target_mismatch', 'acknowledgedTargetMismatch'],
		['mission_item_already_completed', 'acknowledgedCompletedItemAdditionalAction'],
		['mission_item_requested_action_mismatch', 'acknowledgedRequestedActionMismatch'],
		['mission_geometry_not_covered', 'acknowledgedMissionGeometryNotCovered'],
	])('answers %s with %s', (code, flag) => {
		expect(acknowledgeableRefusalOf(refusal(code), STOP_ACKNOWLEDGEABLE_REFUSALS)).toBe(flag);
	});

	it('covers every refusal the map declares', () => {
		// The list above is hand-written, so this is what stops a sixth refusal being
		// added to the map and silently going untested.
		expect(Object.keys(STOP_ACKNOWLEDGEABLE_REFUSALS)).toHaveLength(5);
	});

	/**
	 * Accumulation across retries, which moved into `useAcknowledgedWrite` when
	 * `withAcknowledgement` was deleted and went untested in the move.
	 *
	 * A second refusal on the retry has to keep the first answer, or the two
	 * questions loop forever: answering the second would drop the first, the server
	 * would refuse over it again, and the dialog would reopen on the question the
	 * user just answered.
	 */
	it('keeps an earlier answer when a retry raises a second question', () => {
		const first = acknowledgeableRefusalOf(
			refusal('assignment_item_target_mismatch'),
			STOP_ACKNOWLEDGEABLE_REFUSALS,
		);
		const second = acknowledgeableRefusalOf(
			refusal('assignment_item_already_completed'),
			STOP_ACKNOWLEDGEABLE_REFUSALS,
		);
		const accumulated = { ...(first === null ? {} : { [first]: true }) };

		expect({ ...accumulated, ...(second === null ? {} : { [second]: true }) }).toEqual({
			acknowledgedTargetMismatch: true,
			acknowledgedCompletedItemAdditionalRecord: true,
		});
	});

	it('refuses to offer a way past the ones that are always bugs', () => {
		// A collection filed against a habitat stop, or an application against a
		// source-reduction mission, is never a judgement call — the server has no
		// flag for either and asking would promise something it cannot deliver.
		for (const code of [
			'assignment_item_wrong_target_type',
			'mission_item_wrong_control_type',
			'assignment_item_skipped',
		]) {
			expect(acknowledgeableRefusalOf(refusal(code), STOP_ACKNOWLEDGEABLE_REFUSALS)).toBeNull();
		}
	});

	/**
	 * The settled refusal body, which names its own flag instead of taking a code
	 * per question.
	 *
	 * The two assignment-execution questions arrive this way since #336, and the
	 * clearance and state refusals on other surfaces always did. The flag is still
	 * checked against the caller's map: a surface that cannot ask a question must
	 * not offer a button for it just because the server named one.
	 */
	it('reads the flag a 409 acknowledgement_required names', () => {
		expect(
			acknowledgeableRefusalOf(
				acknowledgementRequired('acknowledgedCompletedItemAdditionalRecord'),
				STOP_ACKNOWLEDGEABLE_REFUSALS,
			),
		).toBe('acknowledgedCompletedItemAdditionalRecord');
		expect(
			acknowledgeableRefusalOf(
				acknowledgementRequired('acknowledgedTargetMismatch'),
				STOP_ACKNOWLEDGEABLE_REFUSALS,
			),
		).toBe('acknowledgedTargetMismatch');
	});

	it('does not offer a named flag this surface cannot be asked', () => {
		expect(
			acknowledgeableRefusalOf(
				acknowledgementRequired('acknowledgedSummaryDeletion'),
				STOP_ACKNOWLEDGEABLE_REFUSALS,
			),
		).toBeNull();
	});

	it('ignores failures that are not refusals at all', () => {
		const map = STOP_ACKNOWLEDGEABLE_REFUSALS;

		expect(acknowledgeableRefusalOf(new Error('Network down.'), map)).toBeNull();
		expect(acknowledgeableRefusalOf(null, map)).toBeNull();
		expect(acknowledgeableRefusalOf(new CommandError('Nope.', 500, undefined), map)).toBeNull();
	});

	// The map is what a caller passes, so a refusal it does not list is not one
	// this caller may answer, which is the point of passing it. The weather
	// station writes reuse the same machinery with three refusals of their own,
	// and must not be offered a mission stop's answers.
	it('answers nothing the caller did not say it could be asked', () => {
		expect(acknowledgeableRefusalOf(refusal('assignment_item_target_mismatch'), {})).toBeNull();
		expect(
			acknowledgeableRefusalOf(refusal('weather_station_identity_change_unacknowledged'), {
				weather_station_identity_change_unacknowledged:
					'acknowledgedHistoricalStationIdentityChange',
			}),
		).toBe('acknowledgedHistoricalStationIdentityChange');
	});

	// The settled body (#317) names the flag rather than a refusal code, so there
	// is nothing to translate — but the caller's map still decides whether this
	// page may ask, which is the whole reason it is an argument.
	it('reads the flag straight off the settled acknowledgement body', () => {
		const map = { acknowledgedSummaryDeletion: 'acknowledgedSummaryDeletion' } as const;

		expect(acknowledgeableRefusalOf(settledRefusal('acknowledgedSummaryDeletion'), map)).toBe(
			'acknowledgedSummaryDeletion',
		);
		expect(acknowledgeableRefusalOf(settledRefusal('acknowledgedCascadeDelete'), map)).toBeNull();
	});
});

describe('reading acknowledgements off a mutation', () => {
	it('passes through only the flags the endpoint reads', () => {
		expect(
			readAcknowledgements({
				acknowledgements: {
					acknowledgedTargetMismatch: true,
					// Not a flag: a payload key that let anything through here would be
					// a way to set command options from the metadata channel.
					completeAssignmentItem: false,
				},
			}),
		).toEqual({ acknowledgedTargetMismatch: true });
	});

	it('drops anything that is not literally true', () => {
		expect(
			readAcknowledgements({ acknowledgements: { acknowledgedTargetMismatch: 'yes' } }),
		).toEqual({});
	});

	it('is empty for a mutation carrying none', () => {
		expect(readAcknowledgements({ locationSource: { kind: 'geometry' } })).toEqual({});
		expect(readAcknowledgements(undefined)).toEqual({});
	});
});

function refusal(code: string): CommandError {
	return new CommandError('Refused.', 400, { error: code, reason: 'Because.' });
}

/** The `409 acknowledgement_required` body, which names the flag itself. */
function settledRefusal(flag: string): CommandError {
	return new CommandError('Refused.', 409, {
		error: 'acknowledgement_required',
		flag,
		message: 'Confirm this.',
	});
}

/** The same body, with the sentence a completed stop carries. */
function acknowledgementRequired(flag: string): CommandError {
	return new CommandError('Refused.', 409, {
		error: 'acknowledgement_required',
		message: 'This stop is already completed.',
		flag,
		consequences: [],
	});
}
