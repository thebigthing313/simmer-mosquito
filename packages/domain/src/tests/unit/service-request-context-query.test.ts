import { describe, expect, it } from 'vitest';
import {
	addUtcDays,
	distanceToMeters,
	serviceRequestContextBounds,
} from '../../organization-settings/index.js';
import { DomainValidationError } from '../../shared.js';

describe('distanceToMeters', () => {
	it('converts the seeded mile unit to meters', () => {
		expect(distanceToMeters(0.25, 'mile')).toBeCloseTo(402.336, 3);
		expect(distanceToMeters(1, 'mile')).toBeCloseTo(1609.344, 3);
	});

	it('supports common distance units and abbreviations, case-insensitively', () => {
		expect(distanceToMeters(2, 'kilometer')).toBe(2000);
		expect(distanceToMeters(100, 'meter')).toBe(100);
		expect(distanceToMeters(3, 'FT')).toBeCloseTo(0.9144, 4);
		expect(distanceToMeters(1, ' mi ')).toBeCloseTo(1609.344, 3);
	});

	it('falls back to a 1:1 meter factor for an unrecognized unit', () => {
		expect(distanceToMeters(50, 'furlong')).toBe(50);
	});
});

describe('addUtcDays', () => {
	it('adds and subtracts days without timezone drift', () => {
		expect(addUtcDays('2026-07-23', 14)).toBe('2026-08-06');
		expect(addUtcDays('2026-07-23', -14)).toBe('2026-07-09');
	});

	it('crosses month and year boundaries', () => {
		expect(addUtcDays('2026-01-01', -1)).toBe('2025-12-31');
		expect(addUtcDays('2024-02-28', 1)).toBe('2024-02-29');
	});

	it('reads the date out of a timestamp', () => {
		expect(addUtcDays('2026-07-23T18:04:00.000Z', 1)).toBe('2026-07-24');
	});

	it('refuses a date it cannot read rather than answering from 1970', () => {
		for (const unreadable of ['', 'yesterday', '23/07/2026', '2026-7-3']) {
			expect(() => addUtcDays(unreadable, 14)).toThrow(DomainValidationError);
		}
	});

	it('refuses a date that is not on the calendar', () => {
		expect(() => addUtcDays('2026-02-30', 0)).toThrow(DomainValidationError);
		expect(() => addUtcDays('2026-13-01', 0)).toThrow(DomainValidationError);
	});

	it('separates a date that never arrived from one it could not read', () => {
		expect(() => addUtcDays(null as unknown as string, 1)).toThrow(
			expect.objectContaining({ issues: [{ path: 'date', message: 'date is missing.' }] }),
		);
		expect(() => addUtcDays(undefined as unknown as string, 1)).toThrow(DomainValidationError);
	});

	it('names the argument it refused', () => {
		expect(() => addUtcDays('yesterday', 1)).toThrow(
			expect.objectContaining({
				issues: [{ path: 'date', message: 'date must be a YYYY-MM-DD date string.' }],
			}),
		);
	});
});

describe('serviceRequestContextBounds', () => {
	const context = {
		radius: { amount: 0.25, unitCode: 'mile' },
		timeWindow: { daysBefore: 14, daysAfter: 14 },
	};

	it('resolves radius meters and an inclusive date window around the request date', () => {
		const bounds = serviceRequestContextBounds('2026-07-23', context, '2026-07-30');
		expect(bounds.radiusMeters).toBeCloseTo(402.336, 3);
		expect(bounds.dateFrom).toBe('2026-07-09');
		expect(bounds.dateTo).toBe('2026-08-06');
	});

	it('collapses to the request date when the window is zero on both sides', () => {
		const bounds = serviceRequestContextBounds(
			'2026-07-23',
			{ radius: { amount: 100, unitCode: 'meter' }, timeWindow: { daysBefore: 0, daysAfter: 0 } },
			'2026-07-23',
		);
		expect(bounds.radiusMeters).toBe(100);
		expect(bounds.dateFrom).toBe('2026-07-23');
		expect(bounds.dateTo).toBe('2026-07-23');
	});

	// The end of the window is the later of the setting's end and the anchor,
	// which is the day the request closed, or today while it is open. A request
	// open for six weeks used to show two weeks after its date and nothing of
	// the work that closed it (#1084).
	it('ends on the setting when the anchor is earlier', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-07-30').dateTo).toBe(
			'2026-08-06',
		);
	});

	it('ends on the anchor when it is later than the setting', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-09-04').dateTo).toBe(
			'2026-09-04',
		);
	});

	it('ends on the setting when the request closed on its own date', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-07-23').dateTo).toBe(
			'2026-08-06',
		);
	});

	it('ends on the shared day when the anchor sits exactly on the setting', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-08-06').dateTo).toBe(
			'2026-08-06',
		);
	});

	// The page says which end won, so a person reading a six-week range is
	// not sent to the settings for a number that says 14 (#1085).
	it('says the setting set the end when the anchor is earlier', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-07-30').dateToFrom).toBe(
			'setting',
		);
	});

	it('says the anchor set the end when it is later', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-09-04').dateToFrom).toBe(
			'anchor',
		);
	});

	it('credits the setting when the anchor sits exactly on it', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-08-06').dateToFrom).toBe(
			'setting',
		);
	});

	it('never moves the start, whichever end wins', () => {
		expect(serviceRequestContextBounds('2026-07-23', context, '2026-09-04').dateFrom).toBe(
			'2026-07-09',
		);
	});

	it('refuses a request date it cannot read, naming the request date', () => {
		expect(() => serviceRequestContextBounds('not a date', context, '2026-07-30')).toThrow(
			expect.objectContaining({
				issues: [{ path: 'requestDate', message: 'requestDate must be a YYYY-MM-DD date string.' }],
			}),
		);
	});

	it('refuses an anchor it cannot read, naming the anchor', () => {
		expect(() => serviceRequestContextBounds('2026-07-23', context, 'today')).toThrow(
			expect.objectContaining({
				issues: [{ path: 'endAnchor', message: 'endAnchor must be a YYYY-MM-DD date string.' }],
			}),
		);
		expect(() =>
			serviceRequestContextBounds('2026-07-23', context, null as unknown as string),
		).toThrow(DomainValidationError);
	});
});
