/**
 * Writing the agency's own record.
 *
 * The one table on this seam whose writes do not go through `mutateCollection`,
 * because they do not go to `/commands/organizations` — there is no such
 * endpoint, and there should not be. `organizations` holds one row per agency
 * and its settings are a JSON document, so a write is not "these columns
 * changed": it is one of eight named things a Profile can do to the agency.
 * Seven are `organizationSettings.*` commands, each with its own route, its own
 * floor and its own validation; the eighth is the agency's details, which is an
 * identity write and named in `IdentityWriteSurface` instead.
 *
 * Sending the whole document instead is what this replaces, and it cost three
 * things:
 *
 * The server could not validate. `PATCH /organization/current` passed the
 * incoming document through `resolveOrganizationSettings`, which is deliberately
 * lenient — it substitutes a default and records an issue rather than refusing —
 * and then dropped the issues. A timezone the agency could not use became the
 * default silently. The per-command routes refuse it, and check the referenced
 * rows besides: that a unit code exists and is the right kind of unit, and that
 * a Species Key Binding still names a species that exists.
 *
 * A save rewrote settings nobody touched. Editing the larval density bands sent
 * the timezone, the unit defaults and the key bindings back from the editor's own
 * copy. `mergeOrganizationSettingsChange` on the server now merges one
 * sub-document, so the rest of the settings are not in the request at all.
 *
 * And the conflict check did nothing. The old handler caught the server's 409 and
 * immediately re-sent with `expectedUpdatedAt: null`, which always won. Nothing
 * here retries: a conflict is raised, and the surface shows it.
 *
 * ## What is here rather than in `rest-writes.ts`
 *
 * The mechanism is shared with the other two identity tables — the transaction
 * that moves the optimistic row, the txid wait, the no-op suppression. Read that
 * module for why a write to these tables cannot go through the collection's own
 * handlers.
 *
 * What is only true of this table is below: the conflict, which is the whole
 * point of the change, and `updatedAt`, which the settings routes return and the
 * two-write save needs.
 */

import { CommandError } from '@simmer-mosquito/sync';
import { organizations } from '../../lib/collections/organizations';
import { type RestRefusalBody, writeThroughRest } from './rest-writes';

/**
 * What both routes answer with.
 *
 * `updatedAt` is why this does not use `writeCommand` from `packages/sync`, which
 * returns the txid alone. Saving the agency details can mean two writes — the
 * details are a REST write and the timezone beside them is a command — and the
 * second has to state the `updated_at` the first produced, or it conflicts with
 * the write the same click just made.
 */
export interface OrganizationWriteResult {
	readonly txid: number;
	readonly updatedAt: string;
}

/**
 * A refused write that another write caused.
 *
 * Its own class so a surface can say something true about it. Every other refusal
 * is about what the Profile asked for; this one is about when they asked, and the
 * answer is to look at the current values and decide again.
 *
 * The trade-off in raising it at all: `updated_at` belongs to the row, not to the
 * setting, so a colleague who changed the mailing address while this sheet was
 * open is a conflict too, even though the server would have merged the two
 * sub-documents without touching each other. That is the safe direction, and
 * agency-level writes are rare enough that the false conflict is rarer than the
 * real one. Suppressing it would mean sending no `expectedUpdatedAt` at all,
 * which is where this started.
 */
export class OrganizationConflictError extends Error {
	constructor() {
		super('Somebody else changed this agency while you were editing. Reopen to see their changes.');
		this.name = 'OrganizationConflictError';
	}
}

/**
 * The two routes spell the same refusal differently: the details route answers
 * `organization_conflict` and the settings routes answer `settings_conflict`.
 */
const conflictErrors: ReadonlySet<string> = new Set(['settings_conflict', 'organization_conflict']);

/** What a refused body may carry, from either route. */
export type OrganizationRefusalBody = RestRefusalBody;

/**
 * The error a response means, or `null` when it wrote.
 *
 * Pure, and separate from the request for one reason: it is where the retry used
 * to be. The handler this replaces caught the 409 and immediately re-sent the
 * same body with `expectedUpdatedAt: null`, which the server cannot refuse — so
 * the concurrency check cost a round trip and stopped nothing, and the editor who
 * saved second silently overwrote the one who saved first. There is no second
 * attempt here; a conflict is an error the surface shows.
 *
 * A 2xx without a `txid` is a failure too. Both routes answer with one whenever
 * they wrote, so its absence means no write happened, whatever the status said.
 */
export function organizationRefusalFor(
	status: number,
	ok: boolean,
	body: OrganizationRefusalBody,
): Error | null {
	if (status === 409 && conflictErrors.has(body.error ?? '')) {
		return new OrganizationConflictError();
	}

	if (!ok || typeof body.txid !== 'number') {
		return new CommandError(body.reason ?? body.message ?? 'Unable to save changes.', status, body);
	}

	return null;
}

/**
 * Apply the change on screen, send it, and wait for it to stream back.
 *
 * `null` when nothing moved — see `writeThroughRest`, which owns that rule.
 */
export async function writeOrganization(input: {
	readonly url: string;
	readonly body: Record<string, unknown>;
	readonly apply: () => void;
}): Promise<OrganizationWriteResult | null> {
	const committed = await writeThroughRest({
		collection: organizations,
		url: input.url,
		method: 'PATCH',
		body: input.body,
		apply: input.apply,
		fallback: 'Unable to save changes.',
		refusalFor: organizationRefusalFor,
	});

	if (committed === null) {
		return null;
	}

	return {
		txid: committed.txid as number,
		updatedAt: typeof committed.updatedAt === 'string' ? committed.updatedAt : '',
	};
}
