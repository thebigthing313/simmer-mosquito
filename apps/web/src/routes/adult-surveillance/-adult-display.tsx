import type { SpeciesSex, SpeciesStatus, TrapRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { formatDate } from './-overview-data';

// --- shared labels ----------------------------------------------------------

/**
 * The one trap label used everywhere in the app: `Code - Name`, dropping the dash
 * when only one of the two is set (and falling back to a short id when neither
 * is). Selects, lists, detail headers, map cards and route stops all read the
 * same way, so a trap is recognisable by its code wherever it appears.
 */
export function trapDisplayName(trap: {
	readonly id: string;
	readonly trapName: TrapRow['trapName'];
	readonly trapCode: TrapRow['trapCode'];
}): string {
	const name = trap.trapName?.trim();
	const code = trap.trapCode?.trim();
	if (name && code) {
		return `${code} - ${name}`;
	}
	return code || name || `Trap ${trap.id.slice(0, 8)}`;
}

/**
 * The date a collection is anchored to, or null when genuinely pending.
 *
 * The two timing modes store the date in different columns: `exact_timestamps`
 * keeps it in `collectedAt` (null until the trap is retrieved — a real pending
 * state), while `collection_date_duration` keeps it in `collectionDate` and
 * always leaves `collectedAt` null. Reading only `collectedAt` mislabels every
 * date+duration collection as "Pending", so fall back to `collectionDate`.
 */
export function collectionEffectiveDate(collection: {
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
}): string | null {
	return collection.collectedAt ?? collection.collectionDate;
}

/** Title for a collection: its date as `M/D/YYYY`, or `Pending collection` when unretrieved. */
export function collectionTitle(collection: {
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
}): string {
	const date = collectionEffectiveDate(collection);
	return date === null ? 'Pending collection' : formatDate(date);
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

/** Ordered option lists, low → high salience, for form selects. */
export const SPECIES_SEX_VALUES: readonly SpeciesSex[] = ['female', 'male'];
export const SPECIES_STATUS_VALUES: readonly SpeciesStatus[] = [
	'unfed',
	'bloodfed',
	'gravid',
	'damaged',
];

// --- collection result flags ------------------------------------------------

interface CollectionFlags {
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
}

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

export function collectionFlagList(
	collection: CollectionFlags,
): readonly { readonly label: string; readonly tone: Tone }[] {
	const flags: { readonly label: string; readonly tone: Tone }[] = [];
	if (collection.hasProblem) {
		flags.push({ label: 'Problem reported', tone: 'danger' });
	}
	if (collection.isZeroResult) {
		flags.push({ label: 'Zero result', tone: 'neutral' });
	}
	if (collection.hasBycatch) {
		flags.push({ label: 'Bycatch', tone: 'info' });
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
