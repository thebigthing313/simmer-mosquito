/** @vitest-environment jsdom */

/**
 * The opt-in itself, and what a question says when nobody wrote it a sentence.
 *
 * `acknowledged()` on the server reads an absent flag as confirmed, so a guard
 * fires only for a client that sends `false` on purpose. That reading is staying
 * (#319): flipping it would refuse writes from mobile and from every script that
 * works today. The cost is that a form which forgets to send its flags passes
 * every guard and nobody finds out, because the write succeeds.
 *
 * That is what each surface owes a test for, and those tests now live beside the
 * hooks they cover, in `tests/unit/hooks/mutations/`, one file per write
 * surface. They assert the intents and the columns of the same write, so keeping
 * the flags apart from the rest of the payload would have meant rendering every
 * hook twice. What stays here is the part with no mutation hook behind it: the
 * default, the copy, and the weather import, which answers its refusals over a
 * REST endpoint and is asserted at the callback.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import {
	acknowledgementCopyFor,
	IMPORT_REFUSALS,
	STATION_REFUSALS,
} from '../../../lib/acknowledgement-copy';

describe('opting in', () => {
	// The surfaces that have not been converted keep the behaviour that shipped:
	// no flags, every guard confirmed. Losing this would turn on forty-five
	// questions at once across pages with no wording for any of them.
	it('sends nothing at all without ask', async () => {
		const write = vi.fn(async () => undefined);
		const { result } = renderHook(() => useAcknowledgedWrite({ askable: STATION_REFUSALS }));

		await result.current.run(write);

		expect(write).toHaveBeenCalledWith({});
	});
});

describe('a refusal with no copy', () => {
	/**
	 * The counts are the server's and they are true whether or not anybody wrote a
	 * sentence around them, so the question states them and the save goes through
	 * on confirm. Dead-ending the user over a missing string in this repo would be
	 * the worse failure.
	 */
	it('builds a sentence from the consequences and logs the flag', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const copy = acknowledgementCopyFor('acknowledgedNothingWrittenYet', [
			{ key: 'inspections', count: 4, singular: 'inspection', plural: 'inspections' },
			{ key: 'samples', count: 1, singular: 'sample', plural: 'samples' },
		]);

		expect(copy.body).toBe('This affects 4 inspections and 1 sample.');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('acknowledgedNothingWrittenYet'));
		warn.mockRestore();
	});

	it('still says something when the refusal counts nothing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(acknowledgementCopyFor('acknowledgedNothingWrittenYet', []).body).toBe(
			'This changes records beyond the one on screen.',
		);
		warn.mockRestore();
	});

	it('prefers the written question when there is one', () => {
		expect(acknowledgementCopyFor('acknowledgedSummaryDeletion', []).confirm).toBe('Delete them');
	});
});

describe('the weather import', () => {
	// The one surface that answers its refusals over a REST endpoint rather than
	// through a collection, so what it sends is asserted at the callback.
	it('hands the commit both import flags withheld', async () => {
		const seen: Array<Readonly<Record<string, boolean>>> = [];
		const { result } = renderHook(() =>
			useAcknowledgedWrite({ askable: IMPORT_REFUSALS, ask: true }),
		);

		await result.current.run(async (acknowledgements) => {
			seen.push(acknowledgements);
		});

		expect(seen).toEqual([{ acknowledgedUpdates: false, acknowledgedPartialImport: false }]);
	});
});
