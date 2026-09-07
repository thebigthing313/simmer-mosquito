/**
 * The Habitat detail page's date column.
 *
 * It was one of two formatters answering `Unknown` for input it could not read,
 * which named the reader's problem rather than the record's, and it read the
 * date with a hand-rolled parse (#609). Both are gone; what it renders for a
 * real date is unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../../../routes/-habitat-detail';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('formatDate', () => {
	// The label is the reader's locale, so the day is what is asserted rather
	// than the wording. Reading the string as an instant is what would move it.
	it('renders the day that was recorded, whatever zone the reader is in', () => {
		const label = formatDate('2026-08-04');
		expect(label).toContain('4');
		expect(label).toContain('2026');
		expect(label).not.toContain('3');
	});

	it('writes an unreadable date back rather than answering Unknown', () => {
		expect(formatDate('4 August')).toBe('4 August');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatDate');
	});
});
