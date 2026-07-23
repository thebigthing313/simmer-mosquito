import type {
	AddressRow,
	HabitatRow,
	HabitatTypeRow,
	InspectionRow,
	ProfileRow,
} from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { CalendarIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { coordinateLabel, MapCard, MapCardFact } from '../../components/map/map-card';
import { webCollections } from '../../sync/webCollections';
import { DensityBadge, hasAnyLifeStage, LifeStageStrip, WetnessBadge } from './-larval-display';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The map focus card for a larval inspection. Given the inspection id it resolves
 * the inspection off the on-demand collection, its habitat + address off the
 * on-demand collections, and its type + inspector off the eager lookups, then
 * renders the shared {@link MapCard}.
 */
export function InspectionMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const inspectionResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ inspection: webCollections.inspections })
					.where(({ inspection }) => eq(inspection.id, id))
					.findOne(),
		},
		[id],
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

	const typeId = inspection?.habitatTypeId ?? UNMATCHABLE_ID;
	const typeResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ type: webCollections.habitatTypes })
					.where(({ type }) => eq(type.id, typeId))
					.findOne(),
		},
		[typeId],
	);
	const habitatType = typeResult.data as HabitatTypeRow | undefined;

	const inspectorId = inspection?.inspectedByProfileId ?? UNMATCHABLE_ID;
	const inspectorResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ profile: webCollections.profiles })
					.where(({ profile }) => eq(profile.id, inspectorId))
					.findOne(),
		},
		[inspectorId],
	);
	const inspector = inspectorResult.data as ProfileRow | undefined;

	const addressId = inspection?.addressId ?? UNMATCHABLE_ID;
	const addressResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, addressId))
					.findOne(),
		},
		[addressId],
	);
	const address = addressResult.data as AddressRow | undefined;

	if (inspection === undefined) {
		return (
			<MapCard onClose={onClose} title="Inspection">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const habitatName = habitat?.habitatName?.trim() ?? null;
	const addressLabel = address?.displayName?.trim() ?? null;
	const siteLabel =
		habitatName ||
		addressLabel ||
		(inspection.habitatId === null
			? 'Ad-hoc inspection'
			: `Habitat ${inspection.habitatId.slice(0, 8)}`);
	const typeName =
		inspection.habitatTypeId === null ? 'Unassigned type' : (habitatType?.name ?? 'Unknown type');

	return (
		<MapCard
			badges={
				inspection.isWet ? (
					<DensityBadge density={inspection.density} />
				) : (
					<WetnessBadge isWet={false} />
				)
			}
			eyebrow={
				<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<CalendarIcon aria-hidden="true" className="size-3.5" />
					<span className="tabular-nums">{formatFullDate(inspection.inspectionDate)}</span>
				</div>
			}
			onClose={onClose}
			subtitle={typeName}
			title={
				inspection.habitatId === null ? (
					<span className="text-muted-foreground italic">Ad-hoc inspection</span>
				) : (
					<Link
						className="rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						params={{ id: inspection.habitatId }}
						to="/larval-surveillance/habitats/$id"
					>
						{siteLabel}
					</Link>
				)
			}
			viewDetailLink={(content) => (
				<Link params={{ id: inspection.id }} to="/larval-surveillance/inspections/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-3">
				{inspection.isWet && hasAnyLifeStage(inspection) ? (
					<LifeStageStrip stages={inspection} />
				) : null}
				<dl className="grid grid-cols-2 gap-2 text-xs">
					<MapCardFact label="Inspector" value={inspector?.displayName ?? 'Unassigned'} />
					<MapCardFact
						label="Water"
						value={inspection.isWet ? 'Wet' : 'Dry — no larvae possible'}
					/>
					<MapCardFact label="Dips" value={countLabel(inspection.dipCount)} />
					<MapCardFact label="Larvae counted" value={countLabel(inspection.larvaeCount)} />
					{addressLabel === null ? null : <MapCardFact label="Address" value={addressLabel} wide />}
					<MapCardFact label="Coordinates" value={coordinateLabelOf(inspection)} wide />
				</dl>
			</div>
		</MapCard>
	);
}

function countLabel(value: number | null): string {
	return value == null ? '—' : value.toLocaleString();
}

function coordinateLabelOf(inspection: InspectionRow): string {
	if (inspection.lat == null || inspection.lng == null) {
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
