import type { DomainValidationIssue } from '../shared.js';
import type { SpeciesKeyBinding, SpeciesKeyBindings } from './types-and-defaults.js';
import { DEFAULT_SPECIES_KEY_BINDINGS } from './types-and-defaults.js';

/**
 * Characters an organization may bind to a species. Letters and digits only:
 * they are layout-stable across keyboards, legible on a printed bench sheet,
 * and leave the editing keys free. Bindings are stored and compared lowercase,
 * so a binding fires whether or not caps lock is on.
 */
export const BINDABLE_KEY_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Keys the entry modal owns and therefore never offers as bindings: Escape closes,
 * Enter commits, Backspace undoes the last press, and Tab/arrows keep focus moving
 * for keyboard and screen-reader users.
 */
export const RESERVED_ENTRY_KEYS: readonly string[] = [
	'Escape',
	'Enter',
	'Backspace',
	'Tab',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
];

const BINDABLE_KEY_SET = new Set(BINDABLE_KEY_CHARACTERS.split(''));

/** True when a raw `KeyboardEvent.key` is a character an organization may bind. */
export function isBindableKey(key: string): boolean {
	return key.length === 1 && BINDABLE_KEY_SET.has(key.toLowerCase());
}

/** Lowercase a single bindable character, or return null when it cannot be bound. */
export function normalizeBindableKey(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	return normalized.length === 1 && BINDABLE_KEY_SET.has(normalized) ? normalized : null;
}

/**
 * Strict normalization for the settings command builder. Rejects unbindable keys,
 * blank species, and any key or species claimed twice — one key means one species and
 * one species means one key, so both the modal lookup and the printed sheet stay
 * unambiguous.
 */
export function normalizeSpeciesKeyBindings(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): SpeciesKeyBindings {
	if (!isPlainObject(value)) {
		issues.push({ path, message: `${path} must be an object.` });
		return DEFAULT_SPECIES_KEY_BINDINGS;
	}
	if (!Array.isArray(value.bindings)) {
		issues.push({ path: `${path}.bindings`, message: `${path}.bindings must be an array.` });
		return DEFAULT_SPECIES_KEY_BINDINGS;
	}

	const bindings: SpeciesKeyBinding[] = [];
	const seenKeys = new Set<string>();
	const seenSpecies = new Set<string>();

	value.bindings.forEach((entry, index) => {
		const entryPath = `${path}.bindings[${index}]`;
		if (!isPlainObject(entry)) {
			issues.push({ path: entryPath, message: `${entryPath} must be an object.` });
			return;
		}

		const key = normalizeBindableKey(entry.key);
		if (key === null) {
			issues.push({
				path: `${entryPath}.key`,
				message: 'Key must be a single letter or digit.',
			});
			return;
		}

		const speciesId = typeof entry.speciesId === 'string' ? entry.speciesId.trim() : '';
		if (speciesId.length === 0) {
			issues.push({ path: `${entryPath}.speciesId`, message: 'speciesId is required.' });
			return;
		}

		if (seenKeys.has(key)) {
			issues.push({
				path: `${entryPath}.key`,
				message: `Key "${key}" is already bound to another species.`,
			});
			return;
		}
		if (seenSpecies.has(speciesId)) {
			issues.push({
				path: `${entryPath}.speciesId`,
				message: 'This species already has a key.',
			});
			return;
		}

		seenKeys.add(key);
		seenSpecies.add(speciesId);
		bindings.push({ key, speciesId });
	});

	return { bindings: sortBindings(bindings) };
}

/**
 * Tolerant read-time resolution. Unusable entries are dropped with a non-fatal issue
 * rather than throwing — a bad binding written by an import or a hand edit must never
 * block identification entry.
 */
export function resolveSpeciesKeyBindings(
	value: unknown,
	issues: DomainValidationIssue[],
	path = 'speciesKeyBindings',
): SpeciesKeyBindings {
	if (value === undefined || value === null) {
		return DEFAULT_SPECIES_KEY_BINDINGS;
	}
	if (!isPlainObject(value)) {
		issues.push({ path, message: 'Species key bindings must be an object; defaults were used.' });
		return DEFAULT_SPECIES_KEY_BINDINGS;
	}
	if (value.bindings === undefined || value.bindings === null) {
		return DEFAULT_SPECIES_KEY_BINDINGS;
	}
	if (!Array.isArray(value.bindings)) {
		issues.push({
			path: `${path}.bindings`,
			message: 'Species key bindings must be a list; defaults were used.',
		});
		return DEFAULT_SPECIES_KEY_BINDINGS;
	}

	const bindings: SpeciesKeyBinding[] = [];
	const seenKeys = new Set<string>();
	const seenSpecies = new Set<string>();

	for (const [index, entry] of value.bindings.entries()) {
		if (!isPlainObject(entry)) {
			issues.push({
				path: `${path}.bindings[${index}]`,
				message: 'Binding must be an object; it was dropped.',
			});
			continue;
		}
		const key = normalizeBindableKey(entry.key);
		const speciesId = typeof entry.speciesId === 'string' ? entry.speciesId.trim() : '';
		if (key === null || speciesId.length === 0) {
			issues.push({
				path: `${path}.bindings[${index}]`,
				message: 'Binding needs a single letter or digit and a species; it was dropped.',
			});
			continue;
		}
		if (seenKeys.has(key) || seenSpecies.has(speciesId)) {
			issues.push({
				path: `${path}.bindings[${index}]`,
				message: 'Duplicate key or species; the later binding was dropped.',
			});
			continue;
		}
		seenKeys.add(key);
		seenSpecies.add(speciesId);
		bindings.push({ key, speciesId });
	}

	return { bindings: sortBindings(bindings) };
}

/**
 * The scope seam. v1 stores one binding set per organization; a personal set can be
 * layered in later by passing it here, and every caller — modal, settings page, cheat
 * sheet — keeps reading through this one function.
 */
export function resolveEffectiveSpeciesKeyBindings(input: {
	readonly organization: SpeciesKeyBindings;
	readonly user?: SpeciesKeyBindings | null;
}): SpeciesKeyBindings {
	const personal = input.user;
	if (personal !== undefined && personal !== null && personal.bindings.length > 0) {
		return personal;
	}
	return input.organization;
}

/** Key → species id, for resolving a key press during entry. */
export function speciesKeyBindingLookup(bindings: SpeciesKeyBindings): ReadonlyMap<string, string> {
	return new Map(bindings.bindings.map((binding) => [binding.key, binding.speciesId] as const));
}

/** Species id → key, for annotating species lists with the key that records them. */
export function speciesKeyBySpeciesId(bindings: SpeciesKeyBindings): ReadonlyMap<string, string> {
	return new Map(bindings.bindings.map((binding) => [binding.speciesId, binding.key] as const));
}

export function cloneSpeciesKeyBindings(bindings: SpeciesKeyBindings): SpeciesKeyBindings {
	return { bindings: bindings.bindings.map((binding) => ({ ...binding })) };
}

/** Digits after letters, each ascending — the order a bench sheet reads in. */
function sortBindings(bindings: readonly SpeciesKeyBinding[]): readonly SpeciesKeyBinding[] {
	return [...bindings].sort((first, second) => {
		const firstIsDigit = first.key >= '0' && first.key <= '9';
		const secondIsDigit = second.key >= '0' && second.key <= '9';
		if (firstIsDigit !== secondIsDigit) {
			return firstIsDigit ? 1 : -1;
		}
		return first.key.localeCompare(second.key);
	});
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
