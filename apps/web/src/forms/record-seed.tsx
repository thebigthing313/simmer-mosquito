/**
 * The record a create form is opened on, read before the form takes it.
 *
 * A create form is seeded by an id in the URL. An assignment stop's "Record
 * Inspection" names the habitat the crew was sent to, a trap's "Record
 * Collection" names the trap, and the palette will hand out the same links.
 *
 * Search returns a retired record on purpose: somebody looking one up wants to
 * open its page and read its history. A create form is the other case. A
 * retired site is not the subject of new work, and the pickers already say so —
 * the trap picker offers active traps only — so a seeded retired id arrived at
 * a form holding a value its own picker would not offer back. The id is
 * dropped here instead, and the form opens blank.
 *
 * This is one seam rather than a check per route so the next way in inherits
 * it. Reading `retired` off the search result would have covered the palette
 * and nothing else: the stop pages and the trap page carry an id and no
 * lifecycle at all, and the record is already synced by the time the form
 * mounts.
 */

import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { unmatchableId } from '../hooks/queries/shared';
import { habitats } from '../lib/collections/habitats';
import { traps } from '../lib/collections/traps';

/** The records a create form can be opened on today. */
export type RecordSeedKind = 'habitat' | 'trap';

/**
 * Three states, not two.
 *
 * `pending` is the read the answer depends on, and the caller has to wait it
 * out: form defaults are taken once at mount, so a seed that resolves after
 * that is a seed the form never sees.
 */
export type RecordSeed =
	| { readonly status: 'pending' }
	| { readonly status: 'ready'; readonly id: string | null };

const PENDING: RecordSeed = { status: 'pending' };
const BLANK: RecordSeed = { status: 'ready', id: null };

/**
 * The rule, apart from the two collections it reads.
 *
 * An error resolves to a blank form rather than to the seed. A read that failed
 * cannot say the record is active, and the picker beside the field is failing
 * on the same collection, so keeping the id would fill in a field nothing can
 * confirm or change.
 */
export function resolveRecordSeed(input: {
	readonly id: string | null;
	readonly isReady: boolean;
	readonly isError: boolean;
	readonly isActive: boolean | undefined;
}): RecordSeed {
	if (input.id === null) {
		return BLANK;
	}
	if (input.isError) {
		return BLANK;
	}
	if (!input.isReady) {
		return PENDING;
	}
	// `undefined` is a row this agency cannot see, which is no more seedable than
	// a retired one.
	return input.isActive === true ? { status: 'ready', id: input.id } : BLANK;
}

/**
 * Both collections are queried on every call, because a hook cannot be
 * conditional. The kind that was not asked for runs against
 * {@link unmatchableId} and returns nothing, the same trick the record hooks
 * use for an id a form does not have yet.
 */
export function useRecordSeed(kind: RecordSeedKind, id: string | null): RecordSeed {
	const habitatId = kind === 'habitat' && id !== null ? id : unmatchableId;
	const trapId = kind === 'trap' && id !== null ? id : unmatchableId;

	const habitat = useLiveQuery(
		(query) =>
			query
				.from({ habitat: habitats })
				.where(({ habitat }) => eq(habitat.id, habitatId))
				.select(({ habitat }) => ({ isActive: habitat.is_active })),
		[habitatId],
	);
	const trap = useLiveQuery(
		(query) =>
			query
				.from({ trap: traps })
				.where(({ trap }) => eq(trap.id, trapId))
				.select(({ trap }) => ({ isActive: trap.is_active })),
		[trapId],
	);

	const answer = kind === 'habitat' ? habitat : trap;
	return resolveRecordSeed({
		id,
		isReady: answer.isReady,
		isError: answer.isError,
		isActive: answer.data[0]?.isActive,
	});
}

/**
 * What a create route draws while its seed resolves.
 *
 * The same two-pane shape the edit routes show while their record loads, so a
 * form opened from a stop reads as loading rather than as empty. A route with
 * no seed never renders this: {@link resolveRecordSeed} answers a null id
 * without a read.
 */
export function SeededFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-24 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}
