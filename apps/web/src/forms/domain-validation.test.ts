import { createHabitatCommand, DomainValidationError } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { domainValidator, validateAgainstCommand } from './domain-validation';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const HABITAT = '33333333-3333-4333-8333-333333333333';
const POINT = { type: 'Point', coordinates: [-118.24, 34.05] } as const;

describe('validateAgainstCommand', () => {
	it('passes when the command builds', () => {
		const result = validateAgainstCommand(() =>
			createHabitatCommand({
				organizationId: ORG,
				actorProfileId: ACTOR,
				habitatId: HABITAT,
				locationSource: { kind: 'geometry', geometry: POINT },
				description: 'North basin catchment',
			}),
		);

		expect(result).toBeUndefined();
	});

	it('routes a domain issue onto the field that holds it', () => {
		const result = validateAgainstCommand(
			() =>
				createHabitatCommand({
					organizationId: ORG,
					actorProfileId: ACTOR,
					habitatId: HABITAT,
					locationSource: { kind: 'geometry', geometry: POINT },
					description: '   ',
				}),
			{ description: 'description' },
		);

		expect(result?.fields.description).toBeDefined();
		expect(result?.form).toEqual([]);
	});

	it('keeps unmapped issues on the form rather than dropping them', () => {
		const result = validateAgainstCommand(
			() =>
				createHabitatCommand({
					organizationId: ORG,
					actorProfileId: ACTOR,
					habitatId: HABITAT,
					// No geometry: the issue has no field in the form's tree.
					locationSource: { kind: 'geometry', geometry: null as never },
					description: 'North basin catchment',
				}),
			{ description: 'description' },
		);

		expect(result?.form.length).toBeGreaterThan(0);
	});

	it('rethrows anything that is not a domain validation error', () => {
		expect(() =>
			validateAgainstCommand(() => {
				throw new TypeError('boom');
			}),
		).toThrow(TypeError);
	});
});

describe('domainValidator', () => {
	it('produces the shape TanStack Form expects, or undefined when valid', () => {
		const validate = domainValidator(
			({ value }: { readonly value: { readonly description: string } }) =>
				createHabitatCommand({
					organizationId: ORG,
					actorProfileId: ACTOR,
					habitatId: HABITAT,
					locationSource: { kind: 'geometry', geometry: POINT },
					description: value.description,
				}),
			{ description: 'description' },
		);

		expect(validate({ value: { description: 'North basin' } })).toBeUndefined();
		expect(validate({ value: { description: '' } })).toMatchObject({
			fields: { description: expect.any(String) },
		});
	});
});

describe('DomainValidationError', () => {
	it('is the error the builders throw, so instanceof holds across the boundary', () => {
		let caught: unknown;
		try {
			createHabitatCommand({
				organizationId: ORG,
				actorProfileId: ACTOR,
				habitatId: HABITAT,
				locationSource: { kind: 'geometry', geometry: POINT },
				description: '',
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(DomainValidationError);
	});
});
