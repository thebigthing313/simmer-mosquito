import type { LarvalDensity } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';

// Shared, read-only presentation for larval inspection values. Mirrors the
// density/life-stage vocabulary used on the habitat detail history so the
// overview reads identically to the record it links into.

export interface LifeStageFlags {
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
}

type LifeStageKey = keyof LifeStageFlags;

// Ordered egg -> instars -> pupae, rendered as a single "E1234P" strip.
const lifeStageSegments: readonly {
	readonly key: LifeStageKey;
	readonly symbol: string;
	readonly label: string;
}[] = [
	{ key: 'hasEggs', symbol: 'E', label: 'Eggs' },
	{ key: 'hasFirstInstar', symbol: '1', label: '1st instar' },
	{ key: 'hasSecondInstar', symbol: '2', label: '2nd instar' },
	{ key: 'hasThirdInstar', symbol: '3', label: '3rd instar' },
	{ key: 'hasFourthInstar', symbol: '4', label: '4th instar' },
	{ key: 'hasPupae', symbol: 'P', label: 'Pupae' },
];

export function hasAnyLifeStage(stages: LifeStageFlags): boolean {
	return lifeStageSegments.some((segment) => stages[segment.key]);
}

/**
 * Larvae per dip — the measure an agency's density bands are ranges of.
 *
 * The bands under Organization → Larval Surveillance are literally "more than
 * *n* and up to *m* larvae per dip", so this is the number a density badge was
 * derived from rather than a statistic invented for display.
 *
 * `null` unless both numbers are present and at least one dip was taken. A count
 * with no effort behind it is not a rate, and zero dips would print `Infinity`
 * into a surveillance record.
 */
export function larvaePerDip(larvaeCount: number | null, dipCount: number | null): number | null {
	if (larvaeCount === null || dipCount === null || dipCount <= 0) {
		return null;
	}
	return larvaeCount / dipCount;
}

/**
 * A fixed six-cell "E1234P" strip: each life stage is a stable cell, filled when
 * present and dimmed when absent, so rows line up regardless of what was recorded.
 */
export function LifeStageStrip({
	stages,
	size = 'default',
}: {
	readonly stages: LifeStageFlags;
	readonly size?: 'default' | 'sm';
}) {
	const present = lifeStageSegments.filter((segment) => stages[segment.key]);
	const ariaLabel =
		present.length === 0
			? 'No life stages recorded'
			: `Life stages present: ${present.map((segment) => segment.label).join(', ')}`;

	return (
		<div
			aria-label={ariaLabel}
			// `w-fit`, not `inline-flex` alone: the segments are fixed-size, and a
			// grid or flex parent stretches an item to its track by default — which
			// left a run of empty box trailing the P.
			className="flex w-fit overflow-hidden rounded-md border border-border"
			role="img"
		>
			{lifeStageSegments.map((segment, index) => {
				const isPresent = stages[segment.key];
				return (
					<span
						aria-hidden="true"
						className={cn(
							'flex items-center justify-center font-semibold tabular-nums',
							size === 'sm' ? 'size-5 text-[0.65rem]' : 'size-6 text-xs',
							index > 0 && 'border-l border-border',
							isPresent
								? 'bg-primary text-primary-foreground'
								: 'bg-muted/40 text-muted-foreground/40',
						)}
						key={segment.key}
						title={segment.label}
					>
						{segment.symbol}
					</span>
				);
			})}
		</div>
	);
}

const densityBadges: Record<
	LarvalDensity,
	{ readonly label: string; readonly tone: 'neutral' | 'info' | 'warning' | 'danger' }
> = {
	none: { label: 'None', tone: 'neutral' },
	light: { label: 'Light', tone: 'info' },
	medium: { label: 'Medium', tone: 'warning' },
	heavy: { label: 'Heavy', tone: 'danger' },
	very_heavy: { label: 'Very heavy', tone: 'danger' },
};

export function densityLabel(density: LarvalDensity | null): string {
	return density === null ? 'Not recorded' : densityBadges[density].label;
}

export function DensityBadge({ density }: { readonly density: LarvalDensity | null }) {
	if (density === null) {
		return <span className="text-muted-foreground text-sm">—</span>;
	}

	// very_heavy escalates to the solid destructive variant so it reads as more
	// severe than heavy, which shares the same danger tone.
	if (density === 'very_heavy') {
		return <Badge variant="destructive">{densityBadges[density].label}</Badge>;
	}

	const { label, tone } = densityBadges[density];
	return (
		<Badge tone={tone} variant="outline">
			{label}
		</Badge>
	);
}

/** Compact wet / dry pill used where a full density badge would be too heavy. */
export function WetnessBadge({ isWet }: { readonly isWet: boolean }) {
	return isWet ? (
		<Badge tone="info" variant="outline">
			Wet
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			Dry
		</Badge>
	);
}
