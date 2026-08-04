import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../adult-surveillance/index.js';
import {
	isBindableKey,
	mergeOrganizationSettingsChange,
	normalizeBindableKey,
	resolveEffectiveSpeciesKeyBindings,
	resolveOrganizationSettings,
	speciesKeyBindingLookup,
	updateSpeciesKeyBindingsCommand,
} from '../organization-settings/index.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const aegypti = '33333333-3333-4333-8333-333333333333';
const pipiens = '44444444-4444-4444-8444-444444444444';

describe('bindable keys', () => {
	it('accepts letters and digits in either case', () => {
		expect(isBindableKey('a')).toBe(true);
		expect(isBindableKey('Z')).toBe(true);
		expect(isBindableKey('7')).toBe(true);
		expect(normalizeBindableKey('Q')).toBe('q');
	});

	it('rejects the keys the entry modal reserves and anything multi-character', () => {
		for (const key of ['Escape', 'Enter', 'Backspace', 'Tab', 'ArrowUp']) {
			expect(isBindableKey(key)).toBe(false);
			expect(normalizeBindableKey(key)).toBeNull();
		}
		expect(isBindableKey(' ')).toBe(false);
		expect(isBindableKey('-')).toBe(false);
		expect(normalizeBindableKey(7)).toBeNull();
	});
});

describe('species key bindings command', () => {
	it('normalizes key case and orders letters before digits', () => {
		const command = updateSpeciesKeyBindingsCommand({
			organizationId,
			actorProfileId,
			speciesKeyBindings: {
				bindings: [
					{ key: '1', speciesId: pipiens },
					{ key: 'A', speciesId: aegypti },
				],
			},
		});

		expect(command.payload.speciesKeyBindings.bindings).toEqual([
			{ key: 'a', speciesId: aegypti },
			{ key: '1', speciesId: pipiens },
		]);
	});

	it('rejects an unbindable key', () => {
		expect(() =>
			updateSpeciesKeyBindingsCommand({
				organizationId,
				actorProfileId,
				speciesKeyBindings: { bindings: [{ key: 'Enter', speciesId: aegypti }] },
			}),
		).toThrow(DomainValidationError);
	});

	it('rejects one key claimed by two species, and one species claiming two keys', () => {
		expect(() =>
			updateSpeciesKeyBindingsCommand({
				organizationId,
				actorProfileId,
				speciesKeyBindings: {
					bindings: [
						{ key: 'a', speciesId: aegypti },
						{ key: 'a', speciesId: pipiens },
					],
				},
			}),
		).toThrow(DomainValidationError);

		expect(() =>
			updateSpeciesKeyBindingsCommand({
				organizationId,
				actorProfileId,
				speciesKeyBindings: {
					bindings: [
						{ key: 'a', speciesId: aegypti },
						{ key: 'b', speciesId: aegypti },
					],
				},
			}),
		).toThrow(DomainValidationError);
	});
});

describe('species key bindings resolution', () => {
	it('defaults to no bindings when the setting is absent', () => {
		const resolved = resolveOrganizationSettings({ timezone: 'America/New_York' });

		expect(resolved.settings.speciesKeyBindings).toEqual({ bindings: [] });
		expect(resolved.issues).toHaveLength(0);
	});

	it('drops unusable bindings without throwing so entry is never blocked', () => {
		const resolved = resolveOrganizationSettings({
			speciesKeyBindings: {
				bindings: [
					{ key: 'a', speciesId: aegypti },
					{ key: 'Escape', speciesId: pipiens },
					{ key: 'b', speciesId: '   ' },
					{ key: 'a', speciesId: pipiens },
					'not an object',
				],
			},
		});

		expect(resolved.settings.speciesKeyBindings.bindings).toEqual([
			{ key: 'a', speciesId: aegypti },
		]);
		expect(resolved.issues.length).toBe(4);
	});

	it('falls back to defaults when the stored value is the wrong shape', () => {
		const resolved = resolveOrganizationSettings({ speciesKeyBindings: 'nonsense' });

		expect(resolved.settings.speciesKeyBindings).toEqual({ bindings: [] });
		expect(resolved.issues).toHaveLength(1);
	});

	it('merges a binding change and preserves unknown root keys', () => {
		const merged = mergeOrganizationSettingsChange(
			{ timezone: 'America/New_York', unknownRoot: 'keep' },
			{
				kind: 'speciesKeyBindings',
				speciesKeyBindings: { bindings: [{ key: 'a', speciesId: aegypti }] },
			},
		);

		expect(merged.speciesKeyBindings).toEqual({ bindings: [{ key: 'a', speciesId: aegypti }] });
		expect(merged.unknownRoot).toBe('keep');
	});

	it('builds a key lookup for the entry modal', () => {
		const lookup = speciesKeyBindingLookup({
			bindings: [
				{ key: 'a', speciesId: aegypti },
				{ key: 'p', speciesId: pipiens },
			],
		});

		expect(lookup.get('a')).toBe(aegypti);
		expect(lookup.get('p')).toBe(pipiens);
		expect(lookup.get('z')).toBeUndefined();
	});
});

describe('effective bindings', () => {
	const organization = { bindings: [{ key: 'a', speciesId: aegypti }] };

	it('uses the agency set when there is no personal set', () => {
		expect(resolveEffectiveSpeciesKeyBindings({ organization })).toEqual(organization);
		expect(resolveEffectiveSpeciesKeyBindings({ organization, user: null })).toEqual(organization);
	});

	it('lets a personal set win once one exists, ignoring an empty one', () => {
		const user = { bindings: [{ key: 'p', speciesId: pipiens }] };

		expect(resolveEffectiveSpeciesKeyBindings({ organization, user })).toEqual(user);
		expect(resolveEffectiveSpeciesKeyBindings({ organization, user: { bindings: [] } })).toEqual(
			organization,
		);
	});
});
