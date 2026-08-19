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
	// The answer is the flag to send, not the code that was refused: the caller's
	// next move is to retry with it set, and handing back the code would leave
	// every call site doing the lookup itself.
	it('names the flag that answers each refusal the server takes one for', () => {
		for (const [code, flag] of Object.entries(STOP_ACKNOWLEDGEABLE_REFUSALS)) {
			expect(acknowledgeableRefusalOf(refusal(code), STOP_ACKNOWLEDGEABLE_REFUSALS)).toBe(flag);
		}
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

	it('ignores failures that are not refusals at all', () => {
		const map = STOP_ACKNOWLEDGEABLE_REFUSALS;

		expect(acknowledgeableRefusalOf(new Error('Network down.'), map)).toBeNull();
		expect(acknowledgeableRefusalOf(null, map)).toBeNull();
		expect(acknowledgeableRefusalOf(new CommandError('Nope.', 500, undefined), map)).toBeNull();
	});

	// The map is what a caller passes, so a refusal it does not list is not one
	// this caller may answer — which is the point of passing it. The weather
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
