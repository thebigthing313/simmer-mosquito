import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	CheckCircle2Icon,
	CircleIcon,
	iconRegistry,
	LocateFixedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { MapCardAddress } from '../../components/linked-address';
import {
	coordinateLabel,
	MapCard,
	MapCardDetail,
	MapCardEyebrow,
} from '../../components/map/map-card';
import type { MapInset } from '../../components/map/map-inset';
import { TagBadge } from '../../components/tag-badge';
import { trapDisplayName } from '../../hooks/queries/trap-view';
import { useRecordTags } from '../../hooks/queries/use-record-tags';
import { useTrap } from '../../hooks/queries/use-trap';

const TrapEntityIcon = iconRegistry.entities.trap.icon;

/**
 * The map focus card for a trap. One query brings the trap up with its method,
 * lure and address already joined ({@link useTrap}); the tags come alongside it,
 * keyed on the same id the card was opened with rather than on anything the trap
 * row has to return first.
 */
export function TrapMapCard({
	id,
	inset,
	onClose,
}: {
	readonly id: string;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	const { trap } = useTrap(id);
	const tags = useRecordTags(id);

	if (trap === undefined) {
		return (
			<MapCard inset={inset} onClose={onClose} title="Trap">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const lureName = trap.lureId === null ? null : (trap.lureName ?? 'Unknown lure');

	return (
		<MapCard
			badges={
				<>
					<TrapStatusBadge isActive={trap.isActive} />
					{tags.map((tag) => (
						<TagBadge key={tag.id} tag={tag} />
					))}
				</>
			}
			eyebrow={<MapCardEyebrow type="Trap" />}
			inset={inset}
			onClose={onClose}
			title={trapDisplayName(trap)}
			viewDetailLink={(content) => (
				<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1.5">
				<MapCardDetail icon={TrapEntityIcon}>
					{trap.methodName}
					{lureName === null ? '' : ` · ${lureName} lure`}
				</MapCardDetail>
				<MapCardAddress address={trap.address} addressId={trap.addressId} />
				<MapCardDetail icon={LocateFixedIcon} mono>
					{coordinateLabel({ lat: trap.latitude, lng: trap.longitude })}
				</MapCardDetail>
			</div>
		</MapCard>
	);
}

function TrapStatusBadge({ isActive }: { readonly isActive: boolean }) {
	return isActive ? (
		<Badge tone="success" variant="outline">
			<CheckCircle2Icon aria-hidden="true" />
			Active
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			<CircleIcon aria-hidden="true" />
			Inactive
		</Badge>
	);
}
