import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { AddressRow } from '@simmer-mosquito/sync';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapCanvas } from '../../../components/map';
import { webCollections } from '../../../sync/webCollections';
import { useAddressGeometry } from './-address-data';

export const Route = createFileRoute('/gis/addresses/$id')({
	component: RouteComponent,
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

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
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/gis/addresses"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to address book
				</Link>
				{!result.isReady ? (
					<AddressDetailSkeleton />
				) : address === undefined ? (
					<AddressUnavailable />
				) : (
					<AddressDetailContent address={address} />
				)}
			</div>
		</div>
	);
}

function AddressDetailContent({ address }: { readonly address: AddressRow }) {
	useBreadcrumbLabel(address.id, address.displayName);
	const navigate = useNavigate();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const geometryQuery = useAddressGeometry(address.id);

	const confirmDelete = useCallback(async () => {
		setDeleteOpen(false);
		setDeleteError(null);
		try {
			await webCollections.addresses.delete(address.id).isPersisted.promise;
			await navigate({ to: '/gis/addresses' });
		} catch (cause) {
			setDeleteError(cause instanceof Error ? cause.message : 'Unable to delete the address.');
		}
	}, [address.id, navigate]);

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
				<div className="flex items-center gap-2">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: address.id }} to="/gis/addresses/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
					<Button
						className="text-destructive hover:bg-destructive/10 hover:text-destructive"
						onClick={() => setDeleteOpen(true)}
						size="sm"
						variant="ghost"
					>
						<DeleteIcon aria-hidden="true" />
						Delete
					</Button>
				</div>
			</div>

			{deleteError === null ? null : <p className="m-0 text-destructive text-sm">{deleteError}</p>}

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<AddressLocationCard
					geojson={geometryQuery.data?.geojson ?? null}
					isLoading={geometryQuery.isLoading}
					lat={geometryQuery.data?.lat ?? null}
					lng={geometryQuery.data?.lng ?? null}
				/>
				<AddressDetailsCard address={address} />
			</div>

			<AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this address?</AlertDialogTitle>
						<AlertDialogDescription>
							{address.displayName} will be removed from the address book. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDelete}>Delete address</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
	const handleMapReady = useCallback(
		(map: MapboxMap) => {
			if (lat === null || lng === null) {
				return;
			}
			map.setCenter([lng, lat]);
			map.setZoom(15);
		},
		[lat, lng],
	);

	const feature =
		geojson === null
			? null
			: ({ type: 'Feature', properties: {}, geometry: geojson } as unknown as GeoJSON.Feature);

	return (
		<Card className="overflow-hidden" variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Location</CardTitle>
				<CardDescription>
					{lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Address point'}
				</CardDescription>
			</CardHeader>
			<CardContent padding="compact">
				<div className="h-[300px] overflow-hidden rounded-md border border-border/40">
					{isLoading ? (
						<Skeleton className="h-full w-full rounded-none" />
					) : feature === null ? (
						<div className="flex h-full items-center justify-center bg-muted/30 text-muted-foreground text-sm">
							No location recorded.
						</div>
					) : (
						<MapCanvas
							controls={{ search: false, layers: false, geolocate: false }}
							geoJson={feature}
							onMapReady={handleMapReady}
						/>
					)}
				</div>
			</CardContent>
		</Card>
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

function AddressUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Address unavailable</EmptyTitle>
				<EmptyDescription>
					This address could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
