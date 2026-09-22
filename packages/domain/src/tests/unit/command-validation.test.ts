import { describe, expect, it } from 'vitest';
import {
	actorDefaultProfileId,
	CLOCK_SKEW_TOLERANCE_MS,
	createIssues,
	jsonObject,
	LOCAL_DATE_FLOOR,
	normalizeOptionalTimestamp,
	normalizeStringUnion,
	nullableText,
	optionalUuid,
	requiredText,
	requiredUuid,
	throwIfIssues,
	validateIdList,
	validateLocalDate,
	validateOperatorCommandContext,
	validateOrganizationCommandContext,
} from '../../command-validation.js';
import { DomainValidationError } from '../../shared.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const operatorUserId = '33333333-3333-4333-8333-333333333333';

describe('command validation', () => {
	it('normalizes organization and operator command contexts', () => {
		const organizationIssues = createIssues();
		expect(
			validateOrganizationCommandContext(
				{ organizationId: ` ${organizationId} `, actorProfileId },
				organizationIssues,
			),
		).toEqual({ organizationId, actorProfileId });
		expect(organizationIssues).toEqual([]);

		const operatorIssues = createIssues();
		expect(validateOperatorCommandContext({ operatorUserId }, operatorIssues)).toEqual({
			operatorUserId,
		});
		expect(operatorIssues).toEqual([]);
	});

	it('collects id issues while returning stable normalized fallbacks', () => {
		const issues = createIssues();

		expect(requiredUuid('not-a-uuid', 'recordId', issues)).toBe('not-a-uuid');
		expect(requiredUuid(' ', 'missingId', issues)).toBe('');
		expect(optionalUuid(' also-not-a-uuid ', 'optionalId', issues)).toBe('also-not-a-uuid');
		expect(optionalUuid(' ', 'emptyOptionalId', issues)).toBeNull();

		expect(issues).toEqual([
			{ path: 'recordId', message: 'recordId must be a UUID.' },
			{ path: 'missingId', message: 'missingId is required.' },
			{ path: 'optionalId', message: 'optionalId must be a UUID.' },
		]);
	});

	it('normalizes common text, json, default actor, and throws collected issues', () => {
		const issues = createIssues();

		expect(nullableText('  hello  ', 'label', issues, 10)).toBe('hello');
		expect(requiredText(' ', 'name', issues, 10)).toBe('');
		expect(jsonObject({ imported: true }, 'metadata', issues)).toEqual({ imported: true });
		expect(jsonObject(['bad'], 'metadata', issues)).toBeNull();
		expect(actorDefaultProfileId(undefined, actorProfileId)).toBe(actorProfileId);

		expect(() => throwIfIssues('Command is invalid.', issues)).toThrow(DomainValidationError);
	});
});

describe('collapsed command primitives', () => {
	const firstId = '44444444-4444-4444-8444-444444444444';
	const secondId = '55555555-5555-4555-8555-555555555555';

	it('takes a non-empty list of distinct ids and reports each bad one by index', () => {
		const issues = createIssues();

		expect(validateIdList([` ${firstId} `, secondId], 'habitatIds', issues)).toEqual([
			firstId,
			secondId,
		]);
		expect(issues).toEqual([]);

		const emptyIssues = createIssues();
		expect(validateIdList([], 'habitatIds', emptyIssues)).toEqual([]);
		expect(emptyIssues).toEqual([
			{ path: 'habitatIds', message: 'habitatIds must include at least one id.' },
		]);

		const badIssues = createIssues();
		validateIdList([firstId, 'not-a-uuid', firstId], 'habitatIds', badIssues);
		expect(badIssues).toEqual([
			{ path: 'habitatIds.1', message: 'habitatIds.1 must be a UUID.' },
			{ path: 'habitatIds.2', message: 'habitatIds must not contain duplicates.' },
		]);
	});

	it('narrows a value to the allowed list and falls back to the first', () => {
		const intakeTypes = ['phone', 'email', 'walkIn'] as const;
		const issues = createIssues();

		expect(normalizeStringUnion('email', intakeTypes, 'intakeType', issues)).toBe('email');
		expect(issues).toEqual([]);

		expect(normalizeStringUnion('carrierPigeon', intakeTypes, 'intakeType', issues)).toBe('phone');
		expect(normalizeStringUnion(undefined, intakeTypes, 'intakeType', issues)).toBe('phone');
		expect(issues).toEqual([
			{ path: 'intakeType', message: 'intakeType is not supported.' },
			{ path: 'intakeType', message: 'intakeType is not supported.' },
		]);
	});

	it('absorbs clock skew on an optional timestamp, and takes a future one when asked', () => {
		const now = Date.now();
		const issues = createIssues();

		expect(normalizeOptionalTimestamp(undefined, 'closedAt', issues, false)).toBeNull();
		expect(normalizeOptionalTimestamp(null, 'closedAt', issues, false)).toBeNull();
		expect(issues).toEqual([]);

		// A device whose clock is a minute fast. Inside the tolerance, so the
		// command stands: this is the drift issue #625 was refusing.
		const slightlyFast = new Date(now + CLOCK_SKEW_TOLERANCE_MS / 2);
		expect(normalizeOptionalTimestamp(slightlyFast, 'closedAt', issues, false)).toBe(slightlyFast);
		expect(issues).toEqual([]);

		const wellAhead = new Date(now + CLOCK_SKEW_TOLERANCE_MS * 2);
		expect(normalizeOptionalTimestamp(wellAhead, 'closedAt', issues, false)).toBe(wellAhead);
		expect(issues).toEqual([{ path: 'closedAt', message: 'closedAt cannot be in the future.' }]);

		const allowedIssues = createIssues();
		expect(normalizeOptionalTimestamp(wellAhead, 'scheduledAt', allowedIssues, true)).toBe(
			wellAhead,
		);
		expect(allowedIssues).toEqual([]);
	});

	it('refuses a value that is not a valid Date', () => {
		const issues = createIssues();

		expect(normalizeOptionalTimestamp(new Date('nonsense'), 'closedAt', issues, false)).toBeNull();
		expect(
			normalizeOptionalTimestamp('2026-01-01' as unknown as Date, 'closedAt', issues, false),
		).toBeNull();
		expect(issues).toEqual([
			{ path: 'closedAt', message: 'closedAt must be a valid Date.' },
			{ path: 'closedAt', message: 'closedAt must be a valid Date.' },
		]);
	});
});

describe('validateLocalDate', () => {
	it('takes a real calendar date on or after the floor, in either direction', () => {
		const issues = createIssues();

		validateLocalDate('1900-01-01', 'date', issues);
		validateLocalDate('2024-02-29', 'date', issues);
		validateLocalDate('2099-12-31', 'date', issues);

		expect(issues).toEqual([]);
	});

	// The floor is the same one `parseOverviewPeriod` holds a period to. #1214
	// is the row it blocks: a collection dated 1826 by a mistyped year.
	it('refuses a malformed date, an impossible one and one before the floor', () => {
		const issues = createIssues();

		validateLocalDate('2026-9-1', 'date', issues);
		validateLocalDate('2023-02-29', 'date', issues);
		validateLocalDate('1826-03-16', 'date', issues);

		expect(issues).toEqual([
			{ path: 'date', message: 'date must be a YYYY-MM-DD date string.' },
			{ path: 'date', message: 'date must be a valid calendar date.' },
			{ path: 'date', message: `date cannot be before ${LOCAL_DATE_FLOOR}.` },
		]);
	});
});
