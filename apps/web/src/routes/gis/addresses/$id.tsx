import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AddressSurveillanceCard } from '../../../components/address-surveillance';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	RecordDetailColumns,
	RecordDetailHeader,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useAddressMutations } from '../../../hooks/mutations/use-address-mutations';
import { type AddressRecord, useAddressRecord } from '../../../hooks/queries/use-address-record';
import { formatAddressLines } from '../../../lib/address-format';
import { useAddressGeometry } from './-address-data';

export const Route = createFileRoute('/gis/addresses/$id')({
	component: RouteComponent,
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const _addressGcTimeMs = 30_000;

const layout: RecordDetailLayout = {
	aside: 'wide',
	mainGap: 'tight',
	skeleton: { eyebrow: 'w-20', main: ['h-[360px]'], aside: ['h-64'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// addresses is on-demand; status-gated useLiveQuery (not the suspense variant)
	// to avoid the post-unmount hang on on-demand collections.
	const result = useAddressRecord(id);

	return (
		<RecordDetailPage
			back={{ label: 'Back to Address Book', to: '/gis/addresses' }}
			layout={layout}
			noun="address"
			reading={{ isError: result.isError, isReady: result.isReady, record: result.address }}
		>
			{(record) => <AddressDetailContent address={record} />}
		</RecordDetailPage>
	);
}

function AddressDetailContent({ address }: { readonly address: AddressRecord }) {
	const mutations = useAddressMutations();
	useBreadcrumbLabel(address.id, address.displayName);
	const geometryQuery = useAddressGeometry(address.id);
	const addressLines = formatAddressLines(address);

	return (
		<RecordDetailColumns
			aside={
				<>
					<AddressDetailsCard address={address} />
					<DangerZoneCard
						name={address.displayName}
						noun="address"
						onDelete={() => mutations.remove(address.id)}
						recordId={address.id}
						recordType="address"
						returnTo="/gis/addresses"
					/>
				</>
			}
			header={
				<RecordDetailHeader
					actions={
						<WriteOnly minimum="manager">
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: address.id }} to="/gis/addresses/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
					}
					eyebrow="Address"
					icon={AddressIcon}
					subtitle={
						/* Postal lines, as an envelope carries them — the header has the
						   width, and a comma-run makes the reader find where the street
						   ends before they can copy it. */
						addressLines.length === 0 ? (
							<p className="m-0 text-[0.95rem] text-muted-foreground">No street address</p>
						) : (
							addressLines.map((line) => (
								<p className="m-0 text-[0.95rem] text-muted-foreground" key={line}>
									{line}
								</p>
							))
						)
					}
					title={address.displayName}
				/>
			}
			layout={layout}
		>
			<AddressLocationCard
				geojson={geometryQuery.data?.geojson ?? null}
				isLoading={geometryQuery.isLoading}
				lat={geometryQuery.data?.lat ?? null}
				lng={geometryQuery.data?.lng ?? null}
			/>
			<RecordRegionsBand noun="address" recordId={address.id} recordType="addresses" />
			<AddressSurveillanceCard addressId={address.id} />
		</RecordDetailColumns>
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

function AddressDetailsCard({ address }: { readonly address: AddressRecord }) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<DetailList>
					<DetailRow label="Street">{address.addressLine1}</DetailRow>
					<DetailRow label="Unit">{address.addressLine2}</DetailRow>
					<DetailRow label="City">{address.locality}</DetailRow>
					<DetailRow label="State">{address.region}</DetailRow>
					<DetailRow label="Postal">{address.postalCode}</DetailRow>
					<DetailRow label="Country">{address.country}</DetailRow>
				</DetailList>
			</CardContent>
		</Card>
	);
}
