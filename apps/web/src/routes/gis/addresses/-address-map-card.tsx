import type { AddressRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import { MapCard } from '../../../components/map/map-card';
import { webCollections } from '../../../sync/webCollections';
import { useAddressGeometry } from './-address-data';

const gcTimeMs = 30_000;

/**
 * The map focus card for an address. Self-fetches the address off the on-demand
 * collection and its point geometry (kept out of the sync shape) over HTTP to fly
 * the map to it, then renders the shared {@link MapCard}.
 */
export function AddressMapCard({
	id,
	map,
	onClose,
}: {
	readonly id: string;
	readonly map: MapboxMap | null;
	readonly onClose: () => void;
}) {
	const addressResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, id))
					.findOne(),
		},
		[id],
	);
	const address = addressResult.data as AddressRow | undefined;

	const geometryQuery = useAddressGeometry(id);
	const lat = geometryQuery.data?.lat ?? null;
	const lng = geometryQuery.data?.lng ?? null;

	useEffect(() => {
		if (map === null || lat === null || lng === null) {
			return;
		}
		map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
	}, [map, lat, lng]);

	if (address === undefined) {
		return (
			<MapCard className="max-w-[420px]" onClose={onClose} title="Address">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const line = fullAddress(address);

	return (
		<MapCard
			className="max-w-[420px]"
			onClose={onClose}
			subtitle={line.length === 0 ? undefined : line}
			title={address.displayName}
			viewDetailLink={(content) => (
				<Link params={{ id: address.id }} to="/gis/addresses/$id">
					{content}
				</Link>
			)}
		/>
	);
}

/** The complete postal address as a readable line: street, unit · city, state postal · country. */
function fullAddress(address: AddressRow): string {
	const street = joinParts([address.addressLine1, address.addressLine2], ', ');
	const cityStateZip = joinParts(
		[joinParts([address.locality, address.region], ', '), address.postalCode],
		' ',
	);
	const country = address.country.trim() === 'US' ? null : address.country;
	return joinParts([street, cityStateZip, country], ' · ');
}

function joinParts(parts: readonly (string | null | undefined)[], separator: string): string {
	return parts
		.map((part) => part?.trim() ?? '')
		.filter((part) => part.length > 0)
		.join(separator);
}
