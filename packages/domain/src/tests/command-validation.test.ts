import { describe, expect, it } from 'vitest';
import {
	actorDefaultProfileId,
	createIssues,
	jsonObject,
	nullableText,
	optionalUuid,
	requiredText,
	requiredUuid,
	throwIfIssues,
	validateAgencyCommandContext,
	validateOperatorCommandContext,
} from '../command-validation.js';
import { DomainValidationError } from '../shared.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const operatorUserId = '33333333-3333-4333-8333-333333333333';

describe('command validation', () => {
	it('normalizes agency and operator command contexts', () => {
		const agencyIssues = createIssues();
		expect(
			validateAgencyCommandContext(
				{ organizationId: ` ${organizationId} `, actorProfileId },
				agencyIssues,
			),
		).toEqual({ organizationId, actorProfileId });
		expect(agencyIssues).toEqual([]);

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
