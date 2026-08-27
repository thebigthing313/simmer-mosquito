import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	AlertTriangleIcon,
	CircleCheckIcon,
	InfoIcon,
	MapPinnedIcon,
	MosquitoIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import {
	formatMapCardDate,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
} from '../../components/map/map-card';
import type { MapInset } from '../../components/map/map-inset';
import type { SampleStatus } from '../../hooks/queries/sample-view';
import { useSample } from '../../hooks/queries/use-sample';
import { useSampleIdentifications } from '../../hooks/queries/use-sample-identifications';
import { adhocLabel } from '../../lib/coordinate-label';

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
 * The map focus card for a larval Sample.
 *
 * Two queries: the Sample with its Inspection and site joined, and what was found
 * in it. The lifecycle status is derived here rather than stored, the same way the
 * server derives it.
 */
export function SampleMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { sample } = useSample(id);
	const { identifications } = useSampleIdentifications(id);

	if (sample === undefined) {
		return (
			<MapCard inset={inset} onClose={onClose} title="Sample">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const status = resolveStatus({
		hasSpecies: identifications.length > 0,
		isZeroLarvae: sample.isZeroLarvae,
		unidentifiableReason: sample.unidentifiableReason,
	});
	const meta = STATUS_META[status];
	// The most recent identification dates the Sample: a technician may record
	// several species across more than one sitting, and the last one is when the
	// jar was finished with.
	const identifiedAt = identifications.reduce<string | null>(
		(latest, row) => (latest === null || row.identifiedAt > latest ? row.identifiedAt : latest),
		null,
	);

	return (
		<MapCard
			badges={
				<Badge tone={meta.tone} variant="outline">
					{meta.label}
				</Badge>
			}
			eyebrow={<MapCardEyebrow date={sample.inspectionDate ?? undefined} type="Sample" />}
			inset={inset}
			onClose={onClose}
			title={sample.name ?? `Sample ${sample.id.slice(0, 8)}`}
			viewDetailLink={(content) => (
				<Link params={{ id: sample.id }} to="/larval-surveillance/samples/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={MapPinnedIcon}>
					{sample.habitatId === null ? (
						<span className="tabular-nums">{adhocLabel(sample.latitude, sample.longitude)}</span>
					) : (
						<Link
							className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							params={{ id: sample.habitatId }}
							to="/larval-surveillance/habitats/$id"
						>
							{sample.habitatName}
						</Link>
					)}
				</MapCardDetail>
				{identifications.map((row) => (
					<MapCardDetail icon={MosquitoIcon} key={row.speciesId}>
						<span className="italic">{row.speciesName}</span> · {row.larvaeCount.toLocaleString()}
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
					geomType={sample.geometryKind ?? undefined}
					lat={sample.latitude ?? undefined}
					lng={sample.longitude ?? undefined}
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
