import { describe, expect, it } from 'vitest';
import {
	addUtcDays,
	distanceToMeters,
	serviceRequestContextBounds,
} from '../../organization-settings/index.js';

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
});

describe('serviceRequestContextBounds', () => {
	it('resolves radius meters and an inclusive date window around the request date', () => {
		const bounds = serviceRequestContextBounds('2026-07-23', {
			radius: { amount: 0.25, unitCode: 'mile' },
			timeWindow: { daysBefore: 14, daysAfter: 14 },
		});
		expect(bounds.radiusMeters).toBeCloseTo(402.336, 3);
		expect(bounds.dateFrom).toBe('2026-07-09');
		expect(bounds.dateTo).toBe('2026-08-06');
	});

	it('collapses to the request date when the window is zero on both sides', () => {
		const bounds = serviceRequestContextBounds('2026-07-23', {
			radius: { amount: 100, unitCode: 'meter' },
			timeWindow: { daysBefore: 0, daysAfter: 0 },
		});
		expect(bounds.radiusMeters).toBe(100);
		expect(bounds.dateFrom).toBe('2026-07-23');
		expect(bounds.dateTo).toBe('2026-07-23');
	});
});
