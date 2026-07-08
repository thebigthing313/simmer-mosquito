import type { SpeciesSex, SpeciesStatus, TrapRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';

// --- shared labels ----------------------------------------------------------

/** A trap's human label: `Name (Code)`, whichever exists, else a short id. */
export function trapDisplayName(trap: {
	readonly id: string;
	readonly trapName: TrapRow['trapName'];
	readonly trapCode: TrapRow['trapCode'];
}): string {
	const name = trap.trapName?.trim();
	const code = trap.trapCode?.trim();
	if (name && code) {
		return `${name} (${code})`;
	}
	return name || code || `Trap ${trap.id.slice(0, 8)}`;
}

// Shared, read-only presentation for adult-surveillance values. Mirrors the
// vocabulary used across the traps/collections detail screens so overview,
// explorer, and detail read identically.

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

// --- specimen sex -----------------------------------------------------------

const sexMeta: Record<SpeciesSex, { readonly label: string; readonly tone: Tone }> = {
	female: { label: 'Female', tone: 'info' },
	male: { label: 'Male', tone: 'neutral' },
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
