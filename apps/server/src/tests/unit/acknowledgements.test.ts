import { ACKNOWLEDGEMENTS } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import {
	ACKNOWLEDGEMENT_MECHANISMS,
	requireStateAcknowledgement,
	StateAcknowledgementRequiredError,
	UNCHECKED_ACKNOWLEDGEMENTS,
} from '../../acknowledgements.js';
import { acknowledgementRequiredBody } from '../../record-deletion.js';

/**
 * The map of what checks each acknowledgement, and its ratchet.
 *
 * The `Record<Acknowledgement, …>` type already makes a missing entry a compile
 * error. What it cannot do is hold the checked-in count of the entries nothing
 * checks, and that number is the whole mechanism: it is what makes the next
 * branch's author say out loud that a flag they added is unread.
 *
 * `pnpm check:acknowledgements` asserts the same thing from outside the type
 * system, and also the half neither the type nor this file can see: that every
 * name in the vocabulary is on a real command payload.
 */
describe('acknowledgement mechanisms', () => {
	it('answers for every acknowledgement in the vocabulary and no others', () => {
		expect(Object.keys(ACKNOWLEDGEMENT_MECHANISMS).sort()).toEqual([...ACKNOWLEDGEMENTS].sort());
	});

	it('holds the unchecked count where it is checked in', () => {
		const unchecked = Object.values(ACKNOWLEDGEMENT_MECHANISMS).filter(
			(mechanism) => mechanism.kind === 'unchecked',
		);
		expect(unchecked.length).toBe(UNCHECKED_ACKNOWLEDGEMENTS);
	});

	it('names an issue for every flag it cannot yet answer for', () => {
		for (const [flag, mechanism] of Object.entries(ACKNOWLEDGEMENT_MECHANISMS)) {
			if (mechanism.kind === 'unchecked') {
				// An `unchecked` entry with no issue behind it is a note, not a plan,
				// and the ratchet would let it sit there forever.
				expect(mechanism.issue, flag).toBeGreaterThan(0);
			}
		}
	});
});

describe('state acknowledgement refusal', () => {
	it('refuses when the state holds and the flag was withheld', () => {
		expect(() =>
			requireStateAcknowledgement({
				state: true,
				acknowledgement: 'acknowledgedClosedRequestDeletion',
				acknowledged: false,
				message: 'This request is closed.',
			}),
		).toThrow(StateAcknowledgementRequiredError);
	});

	it('carries an empty consequences list, because the condition counts no rows', () => {
		try {
			requireStateAcknowledgement({
				state: true,
				acknowledgement: 'acknowledgedPendingTrapCollection',
				acknowledged: false,
				message: 'This trap already has a pending collection.',
			});
			expect.unreachable('the refusal should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(StateAcknowledgementRequiredError);
			const refusal = error as StateAcknowledgementRequiredError;
			expect(refusal.acknowledgement).toBe('acknowledgedPendingTrapCollection');
			expect(refusal.message).toBe('This trap already has a pending collection.');
			// Nothing to count, so nothing is carried, and the body builder is what
			// turns that into the empty list the wire shape promises.
			expect(acknowledgementRequiredBody(refusal).consequences).toEqual([]);
		}
	});

	it('says nothing when the state does not hold, whatever the flag says', () => {
		expect(() =>
			requireStateAcknowledgement({
				state: false,
				acknowledgement: 'acknowledgedClosedRequestChange',
				acknowledged: false,
				message: 'This request is closed.',
			}),
		).not.toThrow();
	});

	// The trap #319 is filed about, pinned here so a future change to
	// `acknowledged()` cannot flip it silently: only an explicit `false` withholds.
	it('treats a confirmed flag as confirmed', () => {
		expect(() =>
			requireStateAcknowledgement({
				state: true,
				acknowledgement: 'acknowledgedClosedRequestChange',
				acknowledged: true,
				message: 'This request is closed.',
			}),
		).not.toThrow();
	});
});
