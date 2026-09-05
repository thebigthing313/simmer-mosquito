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
import { adhocLabel } from '../../lib/coordinate-label';

const StagesIcon = iconRegistry.domains.larvalSurveillance.icon;

/**
 * The map focus card for a Habitat Inspection.
 *
 * Everything about the inspection arrives in one row from `useInspection` — the
 * site, the type and the inspector are joined rather than looked up in sequence.
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
			<MapCard inset={inset} onClose={onClose} title="Inspection">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	// `habitatName` is null only for an Ad Hoc Inspection — a Habitat with no name
	// of its own already reads out its coordinates. So the fallbacks below are what
	// titles an inspection that happened at no Habitat: the Address it was linked
	// to, or failing that its own centroid.
	const siteLabel =
		inspection.habitatName ??
		addressCardLabel(resolveLinkedAddress(inspection.address)) ??
		adhocLabel(inspection.latitude, inspection.longitude);
	const typeName =
		inspection.habitatTypeId === null ? 'Unassigned type' : (inspection.typeName ?? 'Unknown type');

	return (
		<MapCard
			eyebrow={<MapCardEyebrow date={inspection.inspectionDate} type="Inspection" />}
			inset={inset}
			onClose={onClose}
			title={
				inspection.habitatId === null ? (
					<span className="tabular-nums">{siteLabel}</span>
				) : (
					<Link
						className={recordLink({ tone: 'inherit' })}
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
					{inspection.inspectedByName ?? <span className="italic">Unassigned</span>}
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
