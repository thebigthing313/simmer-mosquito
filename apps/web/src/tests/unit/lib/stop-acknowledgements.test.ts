import { describe, expect, it } from 'vitest';
import {
	acknowledgeableRefusalOf,
	readAcknowledgements,
	withAcknowledgement,
} from '../../../lib/stop-acknowledgements';
import { CommandError } from '../../../sync/command-error';

/**
 * The four refusals a technician may answer, and the three that nobody may.
 *
 * Getting the set wrong is silent in the dangerous direction: treat a hard
 * refusal as acknowledgeable and the UI offers a "Record it anyway" the server
 * will refuse again, with no explanation of why the second attempt failed too.
 */
describe('acknowledgeable refusals', () => {
	it('recognises the four the server takes a flag for', () => {
		for (const code of [
			'assignment_item_already_completed',
			'assignment_item_target_mismatch',
			'mission_item_requested_action_mismatch',
			'mission_geometry_not_covered',
		]) {
			expect(acknowledgeableRefusalOf(refusal(code))).toBe(code);
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
			expect(acknowledgeableRefusalOf(refusal(code))).toBeNull();
		}
	});

	it('ignores failures that are not refusals at all', () => {
		expect(acknowledgeableRefusalOf(new Error('Network down.'))).toBeNull();
		expect(acknowledgeableRefusalOf(null)).toBeNull();
		expect(acknowledgeableRefusalOf(new CommandError('Nope.', 500, undefined))).toBeNull();
	});

	it('answers the question the refusal asked, and only that one', () => {
		expect(withAcknowledgement({}, 'assignment_item_target_mismatch')).toEqual({
			acknowledgedTargetMismatch: true,
		});
		// A second refusal on the retry keeps the first answer.
		expect(
			withAcknowledgement(
				{ acknowledgedTargetMismatch: true },
				'assignment_item_already_completed',
			),
		).toEqual({
			acknowledgedCompletedItemAdditionalRecord: true,
			acknowledgedTargetMismatch: true,
		});
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
