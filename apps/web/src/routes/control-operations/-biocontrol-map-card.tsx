import type { BiocontrolActionRow, ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../components/map/map-card';
import { webCollections } from '../../sync/webCollections';
import { ContextBadge, formatAmount } from './-control-display';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const UnitIcon = iconRegistry.entities.unit.icon;

/**
 * The map focus card for a biocontrol release. Resolves the action off the
 * on-demand collection and its method + unit off the eager lookups, then renders
 * the shared {@link MapCard}.
 */
export function BiocontrolMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const actionResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ action: webCollections.biocontrolActions })
					.where(({ action }) => eq(action.id, id))
					.findOne(),
		},
		[id],
	);
	const action = actionResult.data as BiocontrolActionRow | undefined;

	const methodId = action?.biocontrolMethodId ?? UNMATCHABLE_ID;
	const methodResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ method: webCollections.biocontrolMethods })
					.where(({ method }) => eq(method.id, methodId))
					.findOne(),
		},
		[methodId],
	);
	const method = methodResult.data as ControlMethodRow | undefined;

	const unitId = action?.releaseUnitId ?? UNMATCHABLE_ID;
	const unitResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ unit: webCollections.units })
					.where(({ unit }) => eq(unit.id, unitId))
					.findOne(),
		},
		[unitId],
	);
	const unit = unitResult.data as UnitRow | undefined;

	if (action === undefined) {
		return (
			<MapCard onClose={onClose} title="Biocontrol">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const methodName = method?.name ?? 'Unknown method';
	const amount = formatAmount(action.amountReleased, unit);

	return (
		<MapCard
			badges={<ContextBadge habitatId={action.habitatId} inspectionId={action.inspectionId} />}
			eyebrow={<MapCardEyebrow date={action.biocontrolDate} type="Biocontrol" />}
			onClose={onClose}
			title={methodName}
			viewDetailLink={(content) => (
				<Link params={{ id: action.id }} to="/control-operations/biocontrol/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={UnitIcon}>{amount}</MapCardDetail>
				<MapCardDetail icon={LocateFixedIcon} mono>
					{coordinateLabel(action)}
				</MapCardDetail>
			</div>
		</MapCard>
	);
}
