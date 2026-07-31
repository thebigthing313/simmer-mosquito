import type {
	AddressRow,
	HabitatRow,
	HabitatTypeRow,
	InspectionRow,
	ProfileRow,
} from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ComponentIcon,
	ContactIcon,
	DropletIcon,
	iconRegistry,
	MapPinnedIcon,
	MosquitoIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { densityLabel, hasAnyLifeStage, LifeStageStrip } from '../../components/larval-display';
import {
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
} from '../../components/map/map-card';
import { addressCardLabel } from '../../lib/address-format';
import { webCollections } from '../../sync/webCollections';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const StagesIcon = iconRegistry.domains.larvalSurveillance.icon;

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
	const addressLabel = addressCardLabel(address);
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
			eyebrow={<MapCardEyebrow date={inspection.inspectionDate} type="Inspection" />}
			onClose={onClose}
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
			<div className="grid gap-1.5">
				<MapCardDetail icon={ComponentIcon}>{typeName}</MapCardDetail>
				<MapCardDetail icon={ContactIcon}>
					{inspector?.displayName ?? <span className="italic">Unassigned</span>}
				</MapCardDetail>
				<MapCardDetail icon={DropletIcon}>{inspection.isWet ? 'Wet' : 'Dry'}</MapCardDetail>
				{inspection.isWet ? (
					<>
						<MapCardDetail icon={MosquitoIcon}>
							{densityLabel(inspection.density)}
							{inspection.larvaeCount == null
								? ''
								: ` · ${inspection.larvaeCount.toLocaleString()} larvae`}
						</MapCardDetail>
						<MapCardDetail icon={StagesIcon}>
							{hasAnyLifeStage(inspection) ? (
								<LifeStageStrip size="sm" stages={inspection} />
							) : (
								<span className="italic">No stages recorded</span>
							)}
						</MapCardDetail>
					</>
				) : null}
				{addressLabel === null ? null : (
					<MapCardDetail icon={MapPinnedIcon}>{addressLabel}</MapCardDetail>
				)}
				<MapCardLocation geomType={inspection.geomType} lat={inspection.lat} lng={inspection.lng} />
			</div>
		</MapCard>
	);
}
