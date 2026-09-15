import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ComponentIcon,
	ContactIcon,
	DropletIcon,
	iconRegistry,
	MosquitoIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { densityLabel, hasAnyLifeStage, LifeStageStrip } from '../../components/larval-display';
import { MapCardAddress } from '../../components/linked-address';
import {
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
	MapCardLocation,
} from '../../components/map/map-card';
import type { MapInset } from '../../components/map/map-inset';
import { resolveLinkedAddress } from '../../hooks/queries/address-view';
import { useInspection } from '../../hooks/queries/use-inspection';
import { addressCardLabel } from '../../lib/address-format';
import { habitatLabel } from '../../lib/coordinate-label';
import { recordNoun } from '../../lib/record-nouns';

const StagesIcon = iconRegistry.domains.larvalSurveillance.icon;

/**
 * The map focus card for a Habitat Inspection.
 *
 * Everything about the inspection arrives in one row from `useInspection`: the
 * habitat, the type and the inspector are joined rather than looked up in
 * sequence.
 * The Address is the exception, resolved here because {@link MapCardAddress}
 * resolves it too and one hook against one collection is one subset.
 */
export function InspectionMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { inspection } = useInspection(id);

	if (inspection === undefined) {
		return (
			<MapCard inset={inset} onClose={onClose} title={recordNoun('inspection').title}>
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	// The row is mapped at the call rather than renamed at the seam: `lat` and
	// `lng` are what every other reader of this label speaks, and `useInspection`
	// answers in `latitude` and `longitude` because that is what the rest of the
	// card reads (#907).
	//
	// The Address is the card's own full postal line rather than the row's
	// `display_name`, which is the one thing this surface asks for that the
	// explorer does not.
	const label = habitatLabel(
		{
			habitatId: inspection.habitatId,
			habitatName: inspection.habitatName,
			lat: inspection.latitude,
			lng: inspection.longitude,
		},
		{
			addressName: addressCardLabel(resolveLinkedAddress(inspection.address)),
			fallback: 'Ad-hoc inspection',
		},
	);
	const typeName =
		inspection.habitatTypeId === null ? 'Unassigned type' : (inspection.typeName ?? 'Unknown type');

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={inspection.inspectionDate} recordType="inspection" />}
			inset={inset}
			onClose={onClose}
			title={
				inspection.habitatId === null ? (
					<span className="tabular-nums">{label}</span>
				) : (
					<Link
						className={recordLink({ tone: 'inherit' })}
						params={{ id: inspection.habitatId }}
						to="/larval-surveillance/habitats/$id"
					>
						{label}
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
					{inspection.inspectedByName ?? <span className="italic">Unassigned</span>}
				</MapCardDetail>
				<MapCardDetail icon={DropletIcon}>{inspection.isWet ? 'Wet' : 'Dry'}</MapCardDetail>
				{inspection.isWet ? (
					<>
						<MapCardDetail icon={MosquitoIcon}>
							{densityLabel(inspection.density)}
							{inspection.larvaeCount == null
								? ''
								: ` · ${inspection.larvaeCount.toLocaleString('en-US')} larvae`}
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
				{inspection.addressId === null ? null : (
					<MapCardAddress address={inspection.address} addressId={inspection.addressId} />
				)}
				<MapCardLocation
					geomType={inspection.geometryKind}
					lat={inspection.latitude}
					lng={inspection.longitude}
				/>
			</div>
		</MapCard>
	);
}
