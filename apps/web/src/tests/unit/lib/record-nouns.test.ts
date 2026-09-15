import { describe, expect, it } from 'vitest';
import { recordCount, recordNoun } from '../../../lib/record-nouns';

/**
 * A count that names a record type, which is where the register's reach ended.
 *
 * `check:record-nouns` refuses a copy of a register form, and the three strings
 * #940 came for said a word the register does not carry: two toasts on the
 * chemical create route and the mix preview above the form counted
 * `applications` where the register says `chemical applications`. No widening
 * of that scan reaches a word the register has not got, so the fix is the call
 * site passing a record type.
 */
describe('recordCount', () => {
	it('counts one record in the singular', () => {
		expect(recordCount('application', 1)).toBe('1 chemical application');
	});

	it('counts several in the plural', () => {
		expect(recordCount('application', 2)).toBe('2 chemical applications');
	});

	// Zero is a plural. What to draw for an empty set is the surface's question,
	// and `countLabel` is the surface that answers it with `None`.
	it('counts none in the plural', () => {
		expect(recordCount('application', 0)).toBe('0 chemical applications');
	});

	it('separates thousands', () => {
		expect(recordCount('habitat', 14245)).toBe('14,245 habitats');
	});

	// The word in the count is the register's, not the call site's. This is the
	// assertion that fails if a spelling is ever written back into a toast.
	it('reads the same spelling the headings read', () => {
		expect(recordCount('requestedControlAction', 3)).toBe(
			`3 ${recordNoun('requestedControlAction').many}`,
		);
	});
});
