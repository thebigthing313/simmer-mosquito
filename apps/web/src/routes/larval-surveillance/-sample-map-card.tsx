import type {
	HabitatRow,
	InspectionRow,
	SampleRow,
	SampleSpeciesRow,
	SpeciesRow,
} from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	AlertTriangleIcon,
	CircleCheckIcon,
	InfoIcon,
	MapPinnedIcon,
	MosquitoIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import {
	formatMapCardDate,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
} from '../../components/map/map-card';
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
			eyebrow={<MapCardEyebrow date={inspectionDate ?? undefined} type="Sample" />}
			onClose={onClose}
			title={title}
			viewDetailLink={(content) => (
				<Link params={{ id: sample.id }} to="/larval-surveillance/samples/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={MapPinnedIcon}>
					{inspection?.habitatId == null ? (
						<span className="italic">Ad-hoc inspection</span>
					) : (
						<Link
							className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							params={{ id: inspection.habitatId }}
							to="/larval-surveillance/habitats/$id"
						>
							{habitatName ?? `Habitat ${inspection.habitatId.slice(0, 8)}`}
						</Link>
					)}
				</MapCardDetail>
				{speciesRows.map((row) => (
					<MapCardDetail icon={MosquitoIcon} key={row.speciesId}>
						<span className="italic">{nameById.get(row.speciesId) ?? 'Unknown species'}</span> ·{' '}
						{row.larvaeCount.toLocaleString()}
					</MapCardDetail>
				))}
				{sample.hasNonMosquito ? (
					<MapCardDetail icon={InfoIcon}>Non-mosquito present</MapCardDetail>
				) : null}
				{identifiedAt === null ? null : (
					<MapCardDetail icon={CircleCheckIcon}>
						Identified {formatMapCardDate(identifiedAt)}
					</MapCardDetail>
				)}
				<MapCardLocation
					geomType={inspection?.geomType}
					lat={inspection?.lat}
					lng={inspection?.lng}
				/>
				{sample.unidentifiableReason === null ? null : (
					<MapCardDetail icon={AlertTriangleIcon}>{sample.unidentifiableReason}</MapCardDetail>
				)}
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
