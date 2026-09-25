import { describe, expect, it } from 'vitest';
import { formatPhoneNumber } from '../../../lib/phone-number';

describe('formatPhoneNumber', () => {
	it.each([
		['5551234567', '(555) 123-4567'],
		['555-123-4567', '(555) 123-4567'],
		['555.123.4567', '(555) 123-4567'],
		['(555)123-4567', '(555) 123-4567'],
		['  555 123 4567 ', '(555) 123-4567'],
		['+1 555-123-4567', '(555) 123-4567'],
		['1 (555) 123-4567', '(555) 123-4567'],
		['15551234567', '(555) 123-4567'],
		['5550100', '555-0100'],
	])('writes %j as %j', (written, shown) => {
		expect(formatPhoneNumber(written)).toBe(shown);
	});

	it.each([
		['555-123-4567 x12', '(555) 123-4567 ext. 12'],
		['555-123-4567 ext 12', '(555) 123-4567 ext. 12'],
		['555-123-4567 Ext. 12', '(555) 123-4567 ext. 12'],
		['5551234567extension12', '(555) 123-4567 ext. 12'],
		['555-123-4567 #12', '(555) 123-4567 ext. 12'],
	])('keeps the extension on %j', (written, shown) => {
		expect(formatPhoneNumber(written)).toBe(shown);
	});

	it.each([
		['+44 20 7946 0958'],
		['25551234567'],
		['555-1234-56'],
		['call the office'],
		['555-CALL-NOW'],
		[''],
	])('leaves %j as written', (written) => {
		expect(formatPhoneNumber(written)).toBe(written);
	});

	it('trims a value it cannot read', () => {
		expect(formatPhoneNumber('  ask for Dana  ')).toBe('ask for Dana');
	});

	it('passes null through', () => {
		expect(formatPhoneNumber(null)).toBeNull();
	});
});
