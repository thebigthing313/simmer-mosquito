import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../../adult-surveillance/index.js';
import {
	DEFAULT_SERVICE_REQUEST_OVERDUE_DAYS,
	isServiceRequestOverdue,
	MAX_SERVICE_REQUEST_OVERDUE_DAYS,
	mergeOrganizationSettingsChange,
	resolveOrganizationSettings,
	serviceRequestOverdueCutoff,
	updateServiceRequestOverdueDaysCommand,
} from '../../organization-settings/index.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';

function overdueDaysCommand(serviceRequestOverdueDays: unknown) {
	return updateServiceRequestOverdueDaysCommand({
		organizationId,
		actorProfileId,
		serviceRequestOverdueDays: serviceRequestOverdueDays as never,
	});
}

describe('the overdue threshold setting', () => {
	it('resolves to 14 days for an Organization that never set it', () => {
		expect(DEFAULT_SERVICE_REQUEST_OVERDUE_DAYS).toBe(14);
		expect(
			resolveOrganizationSettings(null).settings.publicEngagement.serviceRequestOverdueDays,
		).toBe(14);
		expect(
			resolveOrganizationSettings({ publicEngagement: {} }).settings.publicEngagement
				.serviceRequestOverdueDays,
		).toBe(14);
	});

	it('resolves a stored off as off, not as the default', () => {
		expect(
			resolveOrganizationSettings({ publicEngagement: { serviceRequestOverdueDays: 'off' } })
				.settings.publicEngagement.serviceRequestOverdueDays,
		).toBe('off');
	});

	it('resolves a stored number of days as that number', () => {
		expect(
			resolveOrganizationSettings({ publicEngagement: { serviceRequestOverdueDays: 30 } }).settings
				.publicEngagement.serviceRequestOverdueDays,
		).toBe(30);
	});

	it('falls back to 14 with an issue when the stored value is unreadable', () => {
		const resolved = resolveOrganizationSettings({
			publicEngagement: { serviceRequestOverdueDays: 0 },
		});
		expect(resolved.settings.publicEngagement.serviceRequestOverdueDays).toBe(14);
		expect(resolved.issues.map((issue) => issue.path)).toContain(
			'publicEngagement.serviceRequestOverdueDays',
		);
	});

	it('stores off explicitly, beside the service request context', () => {
		const merged = mergeOrganizationSettingsChange(
			{ publicEngagement: { other: true } },
			{ kind: 'serviceRequestOverdueDays', serviceRequestOverdueDays: 'off' },
		);
		expect(merged.publicEngagement).toMatchObject({
			other: true,
			serviceRequestOverdueDays: 'off',
			serviceRequestContext: { timeWindow: { daysBefore: 14, daysAfter: 14 } },
		});
		expect(
			resolveOrganizationSettings(merged).settings.publicEngagement.serviceRequestOverdueDays,
		).toBe('off');
	});

	it('keeps a stored threshold when another setting is written', () => {
		const merged = mergeOrganizationSettingsChange(
			{ publicEngagement: { serviceRequestOverdueDays: 'off' } },
			{ kind: 'timezone', timezone: 'America/Chicago' },
		);
		expect(
			resolveOrganizationSettings(merged).settings.publicEngagement.serviceRequestOverdueDays,
		).toBe('off');
	});
});

describe('updateServiceRequestOverdueDaysCommand', () => {
	it('carries a whole number of days', () => {
		expect(overdueDaysCommand(21)).toEqual({
			type: 'organizationSettings.updateServiceRequestOverdueDays',
			payload: {
				organizationId,
				actorProfileId,
				expectedUpdatedAt: null,
				serviceRequestOverdueDays: 21,
			},
		});
	});

	it('carries off', () => {
		expect(overdueDaysCommand('off').payload.serviceRequestOverdueDays).toBe('off');
	});

	it('takes both ends of the range', () => {
		expect(overdueDaysCommand(1).payload.serviceRequestOverdueDays).toBe(1);
		expect(overdueDaysCommand(MAX_SERVICE_REQUEST_OVERDUE_DAYS).payload).toMatchObject({
			serviceRequestOverdueDays: 365,
		});
	});

	it.each([
		['zero', 0],
		['a negative number', -3],
		['a fraction', 14.5],
		['a value above the upper bound', 366],
		['text other than off', '14'],
		['nothing', undefined],
	])('refuses %s with a validation issue', (_label, value) => {
		let caught: unknown;
		try {
			overdueDaysCommand(value);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(DomainValidationError);
		expect((caught as DomainValidationError).issues).toEqual([
			expect.objectContaining({ path: 'serviceRequestOverdueDays' }),
		]);
	});
});

describe('isServiceRequestOverdue', () => {
	const today = '2026-10-20';
	const cutoff = serviceRequestOverdueCutoff(14, today);

	it('is overdue at 15 days and not at 14', () => {
		expect(isServiceRequestOverdue({ requestDate: '2026-10-05', closedAt: null }, cutoff)).toBe(
			true,
		);
		expect(isServiceRequestOverdue({ requestDate: '2026-10-06', closedAt: null }, cutoff)).toBe(
			false,
		);
	});

	it('is never overdue once closed', () => {
		expect(
			isServiceRequestOverdue(
				{ requestDate: '2026-01-01', closedAt: '2026-10-01T12:00:00.000Z' },
				cutoff,
			),
		).toBe(false);
	});

	it('is never overdue with the threshold off', () => {
		expect(serviceRequestOverdueCutoff('off', today)).toBeNull();
		expect(isServiceRequestOverdue({ requestDate: '2020-01-01', closedAt: null }, null)).toBe(
			false,
		);
	});

	it('cuts off at the first day that is not overdue', () => {
		// A request is overdue when its date is before the cut-off.
		expect(cutoff).toBe('2026-10-06');
		expect(serviceRequestOverdueCutoff(1, '2026-03-01')).toBe('2026-02-28');
	});
});
