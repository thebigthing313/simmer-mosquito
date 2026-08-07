import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { AddressRow } from '@simmer-mosquito/sync';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { webCollections } from '../../../sync/webCollections';
import { useAddressGeometry } from './-address-data';

export const Route = createFileRoute('/gis/addresses/$id')({
	component: RouteComponent,
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const addressGcTimeMs = 30_000;

function RouteComponent() {
	const { id } = Route.useParams();
	return <AddressDetail addressId={id} />;
}

function AddressDetail({ addressId }: { readonly addressId: string }) {
	// addresses is on-demand; status-gated useLiveQuery (not the suspense variant)
	// to avoid the post-unmount hang on on-demand collections.
	const result = useLiveQuery(
		{
			gcTime: addressGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, addressId))
					.findOne(),
		},
		[addressId],
	);
	const address = result.data as AddressRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link className={backLink()} to="/gis/addresses">
					<ArrowLeftIcon aria-hidden="true" />
					Back to Address Book
				</Link>
				{!result.isReady ? (
					<AddressDetailSkeleton />
				) : address === undefined ? (
					<RecordUnavailable noun="address" reason="not-found" />
				) : (
					<AddressDetailContent address={address} />
				)}
			</div>
		</div>
	);
}

function AddressDetailContent({ address }: { readonly address: AddressRow }) {
	useBreadcrumbLabel(address.id, address.displayName);
	const geometryQuery = useAddressGeometry(address.id);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<AddressIcon aria-hidden="true" className="size-3.5" />
						Address
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{address.displayName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{addressLine(address) || 'No street address'}
					</p>
				</div>
				<WriteOnly minimum="manager">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: address.id }} to="/gis/addresses/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</WriteOnly>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<AddressLocationCard
					geojson={geometryQuery.data?.geojson ?? null}
					isLoading={geometryQuery.isLoading}
					lat={geometryQuery.data?.lat ?? null}
					lng={geometryQuery.data?.lng ?? null}
				/>
				<div className="grid content-start gap-5">
					<AddressDetailsCard address={address} />
					<DangerZoneCard
						name={address.displayName}
						noun="address"
						onDelete={() => webCollections.addresses.delete(address.id)}
						recordId={address.id}
						recordType="address"
						returnTo="/gis/addresses"
					/>
				</div>
			</div>
		</>
	);
}

function AddressLocationCard({
	geojson,
	lat,
	lng,
	isLoading,
}: {
	readonly geojson: GeoJsonGeometry | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly isLoading: boolean;
}) {
	return (
		<RecordLocationCard
			description={
				lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Address point'
			}
			emptyDescription="This address has no location to display."
			emptyTitle="No Location Recorded"
			geojson={geojson}
			geomType={geojson?.type ?? null}
			height="h-[300px]"
			isPending={isLoading}
		/>
	);
}

function AddressDetailsCard({ address }: { readonly address: AddressRow }) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Street">{orDash(address.addressLine1)}</DetailRow>
					<DetailRow label="Unit">{orDash(address.addressLine2)}</DetailRow>
					<DetailRow label="City">{orDash(address.locality)}</DetailRow>
					<DetailRow label="State">{orDash(address.region)}</DetailRow>
					<DetailRow label="Postal">{orDash(address.postalCode)}</DetailRow>
					<DetailRow label="Country">{address.country}</DetailRow>
				</dl>
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[90px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function orDash(value: string | null): ReactNode {
	return value !== null && value.trim().length > 0 ? (
		value
	) : (
		<span className="text-muted-foreground">—</span>
	);
}

function addressLine(address: AddressRow): string {
	return [address.addressLine1, address.locality, address.region, address.postalCode]
		.filter((part): part is string => part !== null && part.trim().length > 0)
		.join(', ');
}

function AddressDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<Skeleton className="h-[360px]" />
				<Skeleton className="h-64" />
			</div>
		</>
	);
}
