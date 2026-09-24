/**
 * The pieces a sample row draws on the Samples Map's rail and in the Samples
 * Table: where the sample was taken, what was identified in it, and the colour
 * its status paints. Each takes a `SampleListRow`, one row of `/map/samples`.
 */

import { Link } from '@tanstack/react-router';
import { habitatLabel } from '../../../lib/coordinate-label';
import { formatCount } from '../../../lib/format-count';
import { SAMPLE_STATUS_COLORS } from '../../map';
import { type SampleStatus, sampleStatusLabel } from './legend';

/** One identified species within a sample, as returned by `/map/samples`. */
interface SampleSpeciesResult {
	readonly speciesId: string;
	readonly larvaeCount: number;
}

/**
 * One sample as returned by `/map/samples`: the parent inspection's
 * owned-geometry projection plus the sample's result fields, its habitat
 * label, and its identified species rolled up with counts.
 *
 * The server commits to one status by precedence (an identified result wins
 * over any closed-out reason), so the map colour and the row's status agree.
 */
export interface SampleListRow {
	readonly id: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
	readonly displayName: string | null;
	readonly inspectionId: string;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	/** The parent inspection's Address, the rung below the Habitat name. */
	readonly addressDisplayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly status: SampleStatus;
	readonly identifiedAt: string | null;
	readonly larvaeTotal: number;
	readonly results: readonly SampleSpeciesResult[];
}

/** The status colour this sample draws in, so the row matches the map. */
export function sampleSwatch(sample: SampleListRow): {
	readonly color: string;
	readonly label: string;
} {
	const color = SAMPLE_STATUS_COLORS[sample.status];
	return {
		color: color ?? 'var(--muted-foreground)',
		label: sampleStatusLabel(sample.status),
	};
}

/**
 * The Habitat the sample was taken from, linked, or where else it was taken
 * when there is none, with the non-mosquito flag after it.
 */
export function SampleContext({ sample }: { readonly sample: SampleListRow }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
			{sample.habitatId === null ? (
				<span className="truncate tabular-nums">
					{/*
					 * `habitatLabel` and not `adhocLabel`, although this arm has
					 * already established there is no habitat: the rungs below the
					 * habitat name are the address and then the coordinates, and
					 * asking the one function is what keeps this from being a
					 * private variant that omits the rung it happens not to need
					 * (#1231). The other arm draws a link, which is why the two are
					 * still branches rather than one call.
					 */}
					{habitatLabel(sample, {
						addressName: sample.addressDisplayName,
						fallback: 'One-off sample',
					})}
				</span>
			) : (
				<Link
					className="pointer-events-auto relative z-10 truncate rounded-sm hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: sample.habitatId }}
					to="/larval-surveillance/habitats/$id"
				>
					{sample.habitatName?.trim() || `Habitat ${sample.habitatId.slice(0, 8)}`}
				</Link>
			)}
			{sample.hasNonMosquito ? (
				<>
					<span aria-hidden="true">·</span>
					<span className="shrink-0">Non-mosquito</span>
				</>
			) : null}
		</span>
	);
}

/** Identified species as compact "name · count" chips, overflow collapsed to "+N". */
export function SpeciesResults({
	sample,
	nameById,
	limit,
}: {
	readonly sample: SampleListRow;
	readonly nameById: ReadonlyMap<string, string>;
	readonly limit: number;
}) {
	const shown = sample.results.slice(0, limit);
	const overflow = sample.results.length - shown.length;

	return (
		<div className="flex items-center gap-1">
			{shown.map((result) => (
				<span
					className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/25 bg-[var(--success-bg)] px-2 py-0.5 text-[var(--success)] text-xs"
					key={result.speciesId}
					title={`${nameById.get(result.speciesId) ?? 'Unknown species'}: ${result.larvaeCount.toLocaleString('en-US')} larvae`}
				>
					<span className="max-w-[8rem] truncate italic">
						{nameById.get(result.speciesId) ?? 'Unknown species'}
					</span>
					<span className="shrink-0 tabular-nums opacity-80">
						{formatCount(result.larvaeCount)}
					</span>
				</span>
			))}
			{overflow > 0 ? (
				<span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
					+{overflow}
				</span>
			) : null}
		</div>
	);
}
