/**
 * Reading a refusal that a confirmation can answer.
 *
 * The words are next door in `acknowledgement-copy.ts`; this is what recognises
 * a refusal, pulls the counts off it, and carries a stop's answers as mutation
 * metadata. Split because the copy is edited by whoever writes a surface and
 * this is not.
 */

import type { DeleteImpactEntry } from '../hooks/use-delete-impact';
import { STOP_ACKNOWLEDGEABLE_REFUSALS } from './acknowledgement-copy';

/**
 * The flags a stop-execution write carries, read off its metadata.
 *
 * They travel as mutation metadata rather than as row columns because they are
 * not properties of the record — nothing about an inspection says whether its
 * stop was already closed. The same channel `locationSource` uses.
 */
export type StopAcknowledgements = Partial<
	Record<
		(typeof STOP_ACKNOWLEDGEABLE_REFUSALS)[keyof typeof STOP_ACKNOWLEDGEABLE_REFUSALS],
		boolean
	>
>;

/**
 * The acknowledgement flag that answers a failed write, if the refusal is one a
 * flag can answer.
 *
 * `askable` is the map to judge against, because each surface can be refused
 * over different things, see `useAcknowledgedWrite`.
 *
 * Two body shapes reach here. The older refusals name themselves in `error` and
 * the map turns that name into a flag. The settled shape (#317) puts
 * `acknowledgement_required` in `error` and the flag itself in `flag`, so there
 * is nothing to translate — but it is still checked against the caller's map,
 * because a page that can only answer three questions must not offer a dialog
 * for a fourth.
 */
export function acknowledgeableRefusalOf<TAskable extends Readonly<Record<string, string>>>(
	error: unknown,
	askable: TAskable,
): TAskable[keyof TAskable] | null {
	const body = (error as { readonly body?: unknown } | null)?.body;
	if (typeof body !== 'object' || body === null) {
		return null;
	}
	const code = (body as { readonly error?: unknown }).error;
	if (typeof code !== 'string') {
		return null;
	}
	// The settled refusal names its own flag, so there is no per-code entry to
	// look up. It is still checked against this caller's map, because the map is
	// what says which questions this surface can ask.
	if (code === 'acknowledgement_required') {
		const flag = (body as { readonly flag?: unknown }).flag;
		const asked: readonly string[] = Object.values(askable);
		return typeof flag === 'string' && asked.includes(flag)
			? (flag as TAskable[keyof TAskable])
			: null;
	}
	// Generic over the map so a caller keeps the literal union of its own flags
	// rather than a bare `string`. A misspelled flag then fails to compile where it
	// is declared, instead of becoming a question the user answers and the server
	// never hears.
	return Object.hasOwn(askable, code) ? askable[code as keyof TAskable] : null;
}

/**
 * The counts a refusal turned on, or an empty list.
 *
 * A `stateGuard` refusal carries `consequences: []` rather than omitting the
 * field, so a caller never branches on whether it is there. An older refusal
 * that predates the settled body has nothing to read and lands here as empty
 * too.
 */
export function consequencesOf(error: unknown): readonly DeleteImpactEntry[] {
	const body = (error as { readonly body?: unknown } | null)?.body;
	if (typeof body !== 'object' || body === null) {
		return [];
	}
	const consequences = (body as { readonly consequences?: unknown }).consequences;
	return Array.isArray(consequences) ? (consequences as readonly DeleteImpactEntry[]) : [];
}

/** The flags a mutation carried, read off its metadata. */
export function readAcknowledgements(metadata: unknown): StopAcknowledgements {
	if (typeof metadata !== 'object' || metadata === null) {
		return {};
	}
	const value = (metadata as { readonly acknowledgements?: unknown }).acknowledgements;
	if (typeof value !== 'object' || value === null) {
		return {};
	}
	const flags: Record<string, true> = {};
	for (const flag of Object.values(STOP_ACKNOWLEDGEABLE_REFUSALS)) {
		if ((value as Record<string, unknown>)[flag] === true) {
			flags[flag] = true;
		}
	}
	return flags;
}
