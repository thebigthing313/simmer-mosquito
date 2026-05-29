import type { HabitatDisplayRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	CircleIcon,
	InfoIcon,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { Suspense, type ReactNode } from 'react';
import { webCollections } from '../sync/webCollections';
import type { VisibleHabitat } from './habitats';

interface HabitatCardProps {
	readonly habitat: VisibleHabitat;
	readonly mode: 'compact' | 'normal';
	readonly className?: string;
}

export function HabitatCard({ habitat, mode, className }: HabitatCardProps) {
	const layoutClassName =
		mode === 'compact'
			? 'grid gap-3 rounded-md border border-border/40 bg-muted/30 px-4 py-4'
			: 'grid gap-4 rounded-md border border-border/60 bg-card px-4 py-4 shadow-sm';

	return (
		<article className={cn(layoutClassName, className)}>
			<div className="flex items-start justify-between gap-3">
				<div className="grid gap-1">
					<Link
						className={cn(
							'leading-none font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
							mode === 'compact' ? 'text-[0.98rem]' : 'text-[1.02rem]',
						)}
						params={{ id: habitat.row.id }}
						to="/habitats/$id"
					>
						{habitatName(habitat.row)}
					</Link>
					<span
						className={cn(
							'text-muted-foreground',
							mode === 'compact' ? 'text-sm' : 'text-[0.92rem]',
						)}
					>
						{habitat.typeName}
					</span>
				</div>
				<HabitatStateBadge habitat={habitat.row} />
			</div>
			<div className="grid gap-3">
				<p className={cn('m-0 text-muted-foreground', mode === 'compact' ? 'line-clamp-2 text-[0.88rem]' : 'text-sm')}>
					{habitatDescription(habitat.row)}
				</p>
				<HabitatFacts habitat={habitat.row} mode={mode} />
			</div>
		</article>
	);
}

function HabitatFacts({
	habitat,
	mode,
}: {
	readonly habitat: HabitatDisplayRow;
	readonly mode: 'compact' | 'normal';
}) {
	if (mode === 'compact') {
		return <HabitatMetaChips habitat={habitat} mode={mode} />;
	}

	return (
		<div className="grid gap-2 text-[0.8rem]">
			<HabitatMetaChips habitat={habitat} mode={mode} />
			<Suspense fallback={<Fact label="Address" value="Loading address" />}>
				<HabitatAddressFact addressId={habitat.addressId} />
			</Suspense>
		</div>
	);
}

function HabitatMetaChips({
	habitat,
	mode,
}: {
	readonly habitat: HabitatDisplayRow;
	readonly mode: 'compact' | 'normal';
}) {
	return (
		<div
			className={cn(
				'flex flex-wrap items-center gap-2',
				mode === 'compact' ? 'text-[0.76rem]' : 'text-[0.8rem]',
			)}
		>
			<MetaChip
				icon={<CircleIcon aria-hidden="true" />}
				label={`Geometry: ${formatGeometryTypeLabel(habitat.geomType ?? '')}`}
				value={formatGeometryTypeLabel(habitat.geomType ?? '')}
			/>
			<MetaChip
				icon={<MapPinnedIcon aria-hidden="true" />}
				label={`Coordinates: ${coordinateLabel(habitat)}`}
				value={coordinateLabel(habitat)}
			/>
			<MetaChip
				icon={<InfoIcon aria-hidden="true" />}
				label={`Updated: ${formatShortDate(habitat.updatedAt)}`}
				value={formatShortDate(habitat.updatedAt)}
			/>
		</div>
	);
}

function MetaChip({
	icon,
	label,
	value,
}: {
	readonly icon: ReactNode;
	readonly label: string;
	readonly value: string;
}) {
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/85 px-2.5 py-1 text-muted-foreground"
			title={label}
		>
			<span className="sr-only">{label}</span>
			{icon}
			<span className="font-medium text-foreground">{value}</span>
		</span>
	);
}

function HabitatAddressFact({ addressId }: { readonly addressId: string | null }) {
	if (addressId === null) {
		return <Fact label="Address" value="No linked address" />;
	}

	return <ResolvedHabitatAddressFact addressId={addressId} />;
}

function ResolvedHabitatAddressFact({ addressId }: { readonly addressId: string }) {

	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ address: webCollections.addresses })
				.where(({ address }) => eq(address.id, addressId))
				.orderBy(({ address }) => address.id, 'asc')
				.limit(1),
		[addressId],
	);

	const address = result.data[0];
	if (address === undefined) {
		return <Fact label="Address" value="Linked address unavailable" />;
	}

	return (
		<Fact
			label="Address"
			value={address.displayName}
			detail={formatAddressLine(address)}
			icon={<MapPinnedIcon aria-hidden="true" />}
		/>
	);
}

function HabitatStateBadge({ habitat }: { readonly habitat: HabitatDisplayRow }) {
	if (habitat.isInaccessible) {
		return (
			<Badge variant="outline" tone="danger">
				<AlertTriangleIcon aria-hidden="true" />
				Inaccessible
			</Badge>
		);
	}

	if (habitat.isActive) {
		return (
			<Badge variant="outline" tone="success">
				<CheckCircle2Icon aria-hidden="true" />
				Active
			</Badge>
		);
	}

	return (
		<Badge variant="outline" tone="neutral">
			Inactive
		</Badge>
	);
}

function Fact({
	label,
	value,
	detail,
	icon,
}: {
	readonly label: string;
	readonly value: string;
	readonly detail?: string;
	readonly icon?: ReactNode;
}) {
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-background px-2.5 py-2">
			<span className="font-bold text-muted-foreground">{label}</span>
			<div className="flex min-w-0 items-center gap-1.5">
				<strong className="truncate font-semibold text-foreground">{value}</strong>
				{icon === undefined ? null : <span className="text-muted-foreground">{icon}</span>}
			</div>
			{detail === undefined ? null : <span className="truncate text-muted-foreground">{detail}</span>}
		</div>
	);
}

function habitatName(habitat: HabitatDisplayRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}

function habitatDescription(habitat: HabitatDisplayRow): string {
	return habitat.description.trim() || 'No description recorded.';
}

function coordinateLabel(habitat: HabitatDisplayRow): string {
	if (habitat.lat === undefined || habitat.lng === undefined) {
		return 'Unknown';
	}

	return `${habitat.lat.toFixed(4)}, ${habitat.lng.toFixed(4)}`;
}

function formatGeometryTypeLabel(value: string): string {
	const normalized = value.trim().toLowerCase().replace(/^st_?/, '').replace(/[_\s]+/g, '');

	switch (normalized) {
		case 'point':
			return 'Point';
		case 'multipoint':
			return 'Multi-point';
		case 'linestring':
			return 'Line';
		case 'multilinestring':
			return 'Multi-line';
		case 'polygon':
			return 'Polygon';
		case 'multipolygon':
			return 'Multi-polygon';
		case 'geometrycollection':
			return 'Geometry collection';
		default:
			return value
				.trim()
				.replace(/^st_?/i, '')
				.replace(/[_\s]+/g, ' ')
				.replace(/\b\w/g, (character) => character.toUpperCase());
	}
}

function formatAddressLine(address: {
	readonly addressLine1: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}): string {
	const parts = [address.addressLine1, address.locality, address.region, address.postalCode]
		.filter((value) => value !== null)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	return parts.length === 0 ? 'Address details unavailable' : parts.join(', ');
}

function formatShortDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(date);
}