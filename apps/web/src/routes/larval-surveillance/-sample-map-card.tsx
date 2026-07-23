import type {
	HabitatRow,
	InspectionRow,
	SampleRow,
	SampleSpeciesRow,
	SpeciesRow,
} from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { CalendarIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { coordinateLabel, MapCard, MapCardFact } from '../../components/map/map-card';
import { webCollections } from '../../sync/webCollections';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

type SampleStatus = 'identified' | 'awaiting' | 'zero_larvae' | 'unidentifiable';

const STATUS_META: Record<
	SampleStatus,
	{ readonly label: string; readonly tone: 'success' | 'info' | 'neutral' | 'warning' }
> = {
	identified: { label: 'Identified', tone: 'success' },
	awaiting: { label: 'Awaiting ID', tone: 'info' },
	zero_larvae: { label: 'No larvae', tone: 'neutral' },
	unidentifiable: { label: 'Unidentifiable', tone: 'warning' },
};

/**
 * The map focus card for a larval sample. A sample inherits its geometry + habitat
 * from its parent inspection, so this resolves the sample, its inspection, and its
 * habitat off the on-demand collections, rolls up the identified species from
 * `sample_species` (names off the eager taxonomy), derives the lifecycle status the
 * same way the server does, then renders the shared {@link MapCard}.
 */
export function SampleMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const sampleResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ sample: webCollections.samples })
					.where(({ sample }) => eq(sample.id, id))
					.findOne(),
		},
		[id],
	);
	const sample = sampleResult.data as SampleRow | undefined;

	const inspectionId = sample?.inspectionId ?? UNMATCHABLE_ID;
	const inspectionResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ inspection: webCollections.inspections })
					.where(({ inspection }) => eq(inspection.id, inspectionId))
					.findOne(),
		},
		[inspectionId],
	);
	const inspection = inspectionResult.data as InspectionRow | undefined;

	const habitatId = inspection?.habitatId ?? UNMATCHABLE_ID;
	const habitatResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ habitat: webCollections.habitats })
					.where(({ habitat }) => eq(habitat.id, habitatId))
					.findOne(),
		},
		[habitatId],
	);
	const habitat = habitatResult.data as HabitatRow | undefined;

	const speciesRowsResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ result: webCollections.sampleSpecies })
					.where(({ result }) => eq(result.sampleId, id))
					.orderBy(({ result }) => result.larvaeCount, 'desc'),
		},
		[id],
	);
	const speciesRows = (speciesRowsResult.data ?? []) as readonly SampleSpeciesRow[];

	const catalogResult = useLiveQuery(
		(query) => query.from({ species: webCollections.species }),
		[],
	);
	const nameById = useMemo(
		() =>
			new Map((catalogResult.data ?? []).map((row) => [row.id, (row as SpeciesRow).displayName])),
		[catalogResult.data],
	);

	if (sample === undefined) {
		return (
			<MapCard onClose={onClose} title="Sample">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const status = resolveStatus({
		hasSpecies: speciesRows.length > 0,
		isZeroLarvae: sample.isZeroLarvae,
		unidentifiableReason: sample.unidentifiableReason,
	});
	const meta = STATUS_META[status];
	const larvaeTotal = speciesRows.reduce((sum, row) => sum + row.larvaeCount, 0);
	const identifiedAt = speciesRows.reduce<string | null>(
		(latest, row) => (latest === null || row.identifiedAt > latest ? row.identifiedAt : latest),
		null,
	);
	const inspectionDate = inspection?.inspectionDate ?? null;
	const habitatName = habitat?.habitatName?.trim() ?? null;
	const title = sample.displayName?.trim() || `Sample ${sample.id.slice(0, 8)}`;

	return (
		<MapCard
			badges={
				<Badge tone={meta.tone} variant="outline">
					{meta.label}
				</Badge>
			}
			eyebrow={
				inspectionDate === null ? undefined : (
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<CalendarIcon aria-hidden="true" className="size-3.5" />
						<span className="tabular-nums">{formatFullDate(inspectionDate)}</span>
					</div>
				)
			}
			onClose={onClose}
			subtitle={
				inspection?.habitatId == null ? (
					<span className="italic">Ad-hoc inspection</span>
				) : (
					<Link
						className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						params={{ id: inspection.habitatId }}
						to="/larval-surveillance/habitats/$id"
					>
						{habitatName ?? `Habitat ${inspection.habitatId.slice(0, 8)}`}
					</Link>
				)
			}
			title={title}
			viewDetailLink={(content) => (
				<Link params={{ id: sample.id }} to="/larval-surveillance/samples/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-3">
				{speciesRows.length > 0 ? (
					<div className="flex flex-wrap gap-1.5">
						{speciesRows.map((row) => (
							<span
								className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/25 bg-[var(--success-bg)] px-2 py-0.5 text-[var(--success)] text-xs"
								key={row.speciesId}
							>
								<span className="italic">{nameById.get(row.speciesId) ?? 'Unknown species'}</span>
								<span className="tabular-nums opacity-80">{row.larvaeCount.toLocaleString()}</span>
							</span>
						))}
					</div>
				) : null}
				<dl className="grid grid-cols-2 gap-2 text-xs">
					<MapCardFact label="Larvae counted" value={countLabel(larvaeTotal)} />
					<MapCardFact
						label="Identified"
						value={identifiedAt === null ? 'Not yet' : formatFullDate(identifiedAt)}
					/>
					<MapCardFact
						label="Non-mosquito"
						value={sample.hasNonMosquito ? 'Present' : 'None noted'}
					/>
					<MapCardFact label="Coordinates" value={coordinateLabelOf(inspection)} />
					{sample.unidentifiableReason === null ? null : (
						<MapCardFact label="Unidentifiable" value={sample.unidentifiableReason} wide />
					)}
				</dl>
			</div>
		</MapCard>
	);
}

function resolveStatus(input: {
	readonly hasSpecies: boolean;
	readonly isZeroLarvae: boolean;
	readonly unidentifiableReason: string | null;
}): SampleStatus {
	if (input.hasSpecies) {
		return 'identified';
	}
	if (input.isZeroLarvae) {
		return 'zero_larvae';
	}
	if (input.unidentifiableReason !== null && input.unidentifiableReason.trim().length > 0) {
		return 'unidentifiable';
	}
	return 'awaiting';
}

function countLabel(value: number): string {
	return value <= 0 ? '—' : value.toLocaleString();
}

function coordinateLabelOf(inspection: InspectionRow | undefined): string {
	if (inspection?.lat == null || inspection.lng == null) {
		return 'Unknown';
	}
	return coordinateLabel({ lat: inspection.lat, lng: inspection.lng });
}

function formatFullDate(date: string): string {
	const parts = date.slice(0, 10).split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))) {
		return date;
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month - 1, day)));
}
