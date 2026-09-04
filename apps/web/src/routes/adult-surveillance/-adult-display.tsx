import {
	SPECIES_SEXES,
	SPECIES_STATUSES,
	type SpeciesSex,
	type SpeciesStatus,
} from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { todayInTimeZone } from '../../lib/local-date';
import { formatDate, formatWeekdayDate } from './-overview-data';

// --- shared labels ----------------------------------------------------------

/**
 * The calendar day a collection is anchored to, `YYYY-MM-DD`, or null when
 * genuinely pending.
 *
 * The two timing modes store it in different columns: `exact_timestamps` keeps
 * an instant in `collectedAt` (null until the trap is retrieved — a real pending
 * state), while `collection_date_duration` keeps a plain day in `collectionDate`
 * and always leaves `collectedAt` null. Reading only `collectedAt` mislabels
 * every date+duration collection as "Pending", so fall back to `collectionDate`.
 *
 * The instant becomes a day in the *agency's* zone, matching how the server
 * windows and orders these rows (`collectionEffectiveDateExpr`). Returning the
 * raw timestamp let every caller take its UTC prefix, so a trap emptied at
 * 10:30pm read as the next day on screen while the server filed it under the day
 * the crew worked — the two halves of the same record disagreeing.
 *
 * `collectedAt` is taken as a `Date` or a string because the two read paths spell
 * it differently: the query hooks in `hooks/queries` hand up the `Date` the row
 * schema parses, while the surfaces still on the old collections hand up the raw
 * timestamp string. Both name the same instant, and this is the one function that
 * has to know it.
 */
export function collectionEffectiveDate(
	collection: {
		readonly collectedAt: Date | string | null;
		readonly collectionDate: string | null;
	},
	timeZone: string,
): string | null {
	const { collectedAt, collectionDate } = collection;
	if (collectedAt === null) {
		return collectionDate === null ? null : collectionDate.slice(0, 10);
	}
	const instant = collectedAt instanceof Date ? collectedAt : new Date(collectedAt);
	if (!Number.isNaN(instant.getTime())) {
		return todayInTimeZone(timeZone, instant);
	}
	// An unparseable string still carries its leading date, so it is worth reading;
	// an invalid `Date` carries nothing, and guessing would be worse than a blank.
	return typeof collectedAt === 'string' ? collectedAt.slice(0, 10) : null;
}

/** Title for a collection: its date as `M/D/YYYY`, or `Pending collection` when unretrieved. */
export function collectionTitle(
	collection: {
		readonly collectedAt: Date | string | null;
		readonly collectionDate: string | null;
	},
	timeZone: string,
): string {
	const date = collectionEffectiveDate(collection, timeZone);
	return date === null ? 'Pending collection' : formatDate(date);
}

/**
 * A collection's date as a *row* reads it: `Wed, Aug 12, 2026`.
 *
 * Distinct from {@link collectionTitle}, which heads a page and a breadcrumb,
 * where a weekday is noise. In a list the weekday is the point — a trap's run is
 * weekly, so it says whether a gap is a missed visit or a weekend.
 */
export function collectionRowDate(
	collection: {
		readonly collectedAt: Date | string | null;
		readonly collectionDate: string | null;
	},
	timeZone: string,
): string {
	const date = collectionEffectiveDate(collection, timeZone);
	return date === null ? 'Pending collection' : formatWeekdayDate(date);
}

// Shared, read-only presentation for adult-surveillance values. Mirrors the
// vocabulary used across the traps/collections detail screens so overview,
// explorer, and detail read identically.

type Tone = 'neutral' | 'info' | 'catalog' | 'warning' | 'danger' | 'success';

// --- specimen sex -----------------------------------------------------------

/**
 * Sex is categorical, not a status, so it reads on the two non-status tones:
 * `catalog` (pink) for female and `info` (blue) for male. Females are what the
 * agency acts on — they are the biters, the ones tested for virus, the ones
 * driving thresholds — so they take the tone that stands out against a table of
 * neutral rows.
 */
const sexMeta: Record<SpeciesSex, { readonly label: string; readonly tone: Tone }> = {
	female: { label: 'Female', tone: 'catalog' },
	male: { label: 'Male', tone: 'info' },
};

export function speciesSexLabel(sex: SpeciesSex | null): string {
	return sex === null ? 'Unsexed' : sexMeta[sex].label;
}

export function SpeciesSexBadge({ sex }: { readonly sex: SpeciesSex | null }) {
	if (sex === null) {
		return null;
	}
	const { label, tone } = sexMeta[sex];
	return (
		<Badge tone={tone} variant="outline">
			{label}
		</Badge>
	);
}

// --- specimen physiological status ------------------------------------------

const statusMeta: Record<SpeciesStatus, { readonly label: string; readonly tone: Tone }> = {
	unfed: { label: 'Unfed', tone: 'neutral' },
	bloodfed: { label: 'Bloodfed', tone: 'danger' },
	gravid: { label: 'Gravid', tone: 'warning' },
	damaged: { label: 'Damaged', tone: 'neutral' },
};

export function speciesStatusLabel(status: SpeciesStatus | null): string {
	return status === null ? 'Not recorded' : statusMeta[status].label;
}

export function SpeciesStatusBadge({ status }: { readonly status: SpeciesStatus | null }) {
	if (status === null) {
		return null;
	}
	const { label, tone } = statusMeta[status];
	return (
		<Badge tone={tone} variant="outline">
			{label}
		</Badge>
	);
}

/**
 * Ordered option lists for form selects, low to high salience, which is not the
 * order the column stores.
 *
 * Female first because a male is not what a count is usually after, and
 * `damaged` last because it is the outcome rather than a physiological state.
 */
export const SPECIES_SEX_VALUES: readonly SpeciesSex[] = [...SPECIES_SEXES].reverse();
export const SPECIES_STATUS_VALUES: readonly SpeciesStatus[] = [
	...SPECIES_STATUSES.filter((status) => status !== 'damaged'),
	'damaged',
];

// --- collection result flags ------------------------------------------------

interface CollectionFlags {
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly collectedAt?: Date | string | null;
	readonly collectionTimingMode?: string;
}

/**
 * A trap that was set and has not been emptied yet.
 *
 * Only exact-timestamps collections can be in this state: one recorded as a
 * date plus a duration is by definition already in hand, and its `collectedAt`
 * is null for a different reason entirely.
 */
export function isPendingCollection(collection: {
	readonly collectedAt: Date | string | null;
	readonly collectionTimingMode: string;
}): boolean {
	return collection.collectionTimingMode === 'exact_timestamps' && collection.collectedAt === null;
}

/**
 * Bycatch, alone.
 *
 * The other three flags are the collection's status, and where a surface draws
 * that status some other way, this is what is left. A collection with bycatch in
 * it is an ordinary collection that also caught something else.
 */
export function BycatchBadge({ hasBycatch }: { readonly hasBycatch: boolean }) {
	return hasBycatch ? (
		<Badge tone={BYCATCH_FLAG.tone} variant="outline">
			{BYCATCH_FLAG.label}
		</Badge>
	) : null;
}

const BYCATCH_FLAG: { readonly label: string; readonly tone: Tone } = {
	label: 'Bycatch',
	tone: 'info',
};

/** The prominent result flags on a collection, in the order they should read. */
export function CollectionFlagBadges({
	collection,
	className,
}: {
	readonly collection: CollectionFlags;
	readonly className?: string;
}) {
	const flags = collectionFlagList(collection);
	if (flags.length === 0) {
		return null;
	}
	return (
		<div className={className}>
			{flags.map((flag) => (
				<Badge key={flag.label} tone={flag.tone} variant="outline">
					{flag.label}
				</Badge>
			))}
		</div>
	);
}

function collectionFlagList(
	collection: CollectionFlags,
): readonly { readonly label: string; readonly tone: Tone }[] {
	const flags: { readonly label: string; readonly tone: Tone }[] = [];
	// First, because it says the record is not finished: the other three describe
	// specimens, and a trap that is still out has none yet.
	if (
		isPendingCollection({
			collectedAt: collection.collectedAt ?? null,
			collectionTimingMode: collection.collectionTimingMode ?? '',
		})
	) {
		flags.push({ label: 'Trap out', tone: 'info' });
	}
	if (collection.hasProblem) {
		flags.push({ label: 'Problem reported', tone: 'danger' });
	}
	if (collection.isZeroResult) {
		flags.push({ label: 'Zero result', tone: 'neutral' });
	}
	if (collection.hasBycatch) {
		flags.push(BYCATCH_FLAG);
	}
	return flags;
}

// --- species distribution ---------------------------------------------------

export interface SpeciesDistributionEntry {
	readonly speciesId: string;
	readonly name: string;
	readonly total: number;
}

export interface SpeciesDistribution {
	readonly totals: readonly SpeciesDistributionEntry[];
	readonly grandTotal: number;
	/** Number of distinct species represented. */
	readonly speciesCount: number;
}

/**
 * Roll up `{ speciesId, count }` rows into a ranked (high → low) distribution,
 * resolving display names from the eager species catalog. Non-positive counts
 * are ignored so zero-result rows never inflate the totals.
 */
export function aggregateSpeciesDistribution(
	rows: readonly { readonly speciesId: string; readonly count: number }[],
	nameById: ReadonlyMap<string, string>,
): SpeciesDistribution {
	const byId = new Map<string, number>();
	let grandTotal = 0;
	for (const row of rows) {
		const count = row.count ?? 0;
		if (count <= 0) {
			continue;
		}
		byId.set(row.speciesId, (byId.get(row.speciesId) ?? 0) + count);
		grandTotal += count;
	}
	const totals = [...byId.entries()]
		.map(([speciesId, total]) => ({
			speciesId,
			total,
			name: nameById.get(speciesId) ?? 'Unknown species',
		}))
		.sort((first, second) => second.total - first.total);
	return { totals, grandTotal, speciesCount: totals.length };
}

/** Ranked horizontal bars for a species distribution, each bar scaled to the max. */
export function SpeciesDistributionBars({
	totals,
	grandTotal,
	className,
}: {
	readonly totals: readonly SpeciesDistributionEntry[];
	readonly grandTotal: number;
	readonly className?: string;
}) {
	const maxBar = totals[0]?.total ?? 1;
	return (
		<div className={className}>
			{totals.map((entry) => {
				const percent = grandTotal === 0 ? 0 : (entry.total / grandTotal) * 100;
				return (
					<div className="grid gap-1" key={entry.speciesId}>
						<div className="flex items-baseline justify-between gap-2 text-sm">
							<span className="truncate text-foreground italic">{entry.name}</span>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{entry.total.toLocaleString()} · {percent.toFixed(0)}%
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${Math.max((entry.total / maxBar) * 100, 2)}%` }}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
