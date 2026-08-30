import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import {
	type AddressRecordLink,
	useAddressSurveillance,
} from '../hooks/queries/use-address-surveillance';

/**
 * What is sited at an Address, read from the Address.
 *
 * Search finds an Address by its street and a Habitat by its own name, and never
 * one by the other (#285). These two readouts are the join the reader used to
 * make by hand: the address result and the address page both name the Habitats
 * and Traps at it and link straight to them.
 */

const HabitatIcon = iconRegistry.entities.habitat.icon;
const TrapIcon = iconRegistry.entities.trap.icon;

/**
 * The chips themselves, wrapped. Renders nothing when the address holds neither,
 * so a search row only grows when there is somewhere to go.
 */
export function AddressSurveillanceLinks({
	className,
	habitats,
	traps,
}: {
	readonly className?: string;
	readonly habitats: readonly AddressRecordLink[];
	readonly traps: readonly AddressRecordLink[];
}) {
	if (habitats.length === 0 && traps.length === 0) {
		return null;
	}

	return (
		<div className={cn('flex flex-wrap items-center gap-1.5', className)}>
			{habitats.map((habitat) => (
				<Badge asChild key={habitat.id} variant="outline">
					<Link params={{ id: habitat.id }} to="/larval-surveillance/habitats/$id">
						<ChipBody icon={HabitatIcon} record={habitat} />
					</Link>
				</Badge>
			))}
			{traps.map((trap) => (
				<Badge asChild key={trap.id} variant="outline">
					<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id">
						<ChipBody icon={TrapIcon} record={trap} />
					</Link>
				</Badge>
			))}
		</div>
	);
}

function ChipBody({
	icon: Icon,
	record,
}: {
	readonly icon: RegistryIcon;
	readonly record: AddressRecordLink;
}) {
	return (
		<>
			<Icon aria-hidden="true" />
			<span className="max-w-[14rem] truncate">{record.name}</span>
			{record.isActive ? null : <span className="text-muted-foreground">Inactive</span>}
		</>
	);
}

/** The same links on the Address's own page, as a card of its own. */
export function AddressSurveillanceCard({ addressId }: { readonly addressId: string }) {
	const surveillance = useAddressSurveillance([addressId]);
	const habitats = surveillance.habitatsByAddress.get(addressId) ?? [];
	const traps = surveillance.trapsByAddress.get(addressId) ?? [];

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Habitats and Traps</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				{surveillance.isError ? (
					<CardMessage>Habitats and traps could not be loaded.</CardMessage>
				) : !surveillance.isReady ? (
					<div className="flex gap-1.5">
						<Skeleton className="h-6 w-32 rounded-full" />
						<Skeleton className="h-6 w-24 rounded-full" />
					</div>
				) : habitats.length === 0 && traps.length === 0 ? (
					<CardMessage>Nothing is sited here yet.</CardMessage>
				) : (
					<AddressSurveillanceLinks habitats={habitats} traps={traps} />
				)}
			</CardContent>
		</Card>
	);
}

function CardMessage({ children }: { readonly children: string }) {
	return <p className="m-0 px-1 py-2 text-muted-foreground text-sm">{children}</p>;
}
