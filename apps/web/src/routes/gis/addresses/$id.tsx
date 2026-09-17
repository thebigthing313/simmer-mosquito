import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { AddressSurveillanceCard } from '../../../components/address-surveillance';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	createItems,
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { useAddressMutations } from '../../../hooks/mutations/use-address-mutations';
import { type AddressRecord, useAddressRecord } from '../../../hooks/queries/use-address-record';
import { formatAddressLines } from '../../../lib/address-format';
import { type AddressGeometry, useAddressGeometry } from './-address-data';

export const Route = createFileRoute('/gis/addresses/$id')({
	component: RouteComponent,
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;

const layout: RecordDetailLayout = {
	mainGap: 'tight',
	skeleton: { main: [['h-[360px]', 'h-64'], 'h-40'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// addresses is on-demand; status-gated useLiveQuery (not the suspense variant)
	// to avoid the post-unmount hang on on-demand collections.
	const result = useAddressRecord(id);

	return (
		<RecordDetailPage
			layout={layout}
			recordType="address"
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
		<DetailPageShell
			facts={<AddressDetailsCard address={address} />}
			header={{
				actions: createItems('addressId', address.id, [
					'/larval-surveillance/habitats/create',
					'/adult-surveillance/traps/create',
					'/public-engagement/service-requests/create',
				]),
				edit: { minimum: 'manager', params: { id: address.id }, to: '/gis/addresses/$id/edit' },
				icon: AddressIcon,
				recordType: 'address',
				/* Postal lines, as an envelope carries them: the header has the width,
				   and a comma-run makes the reader find where the street ends before
				   they can copy it. */
				remove: {
					name: address.displayName,
					onDelete: () => mutations.remove(address.id),
					recordId: address.id,
					returnTo: '/gis/addresses',
				},
				subtitle:
					addressLines.length === 0 ? (
						<p className="m-0">No street address</p>
					) : (
						addressLines.map((line) => (
							<p className="m-0" key={line}>
								{line}
							</p>
						))
					),
				tags: { recordId: address.id },
				title: address.displayName,
			}}
			layout={layout}
			lead={
				<AddressLocationCard
					geometry={geometryQuery.data ?? null}
					isLoading={geometryQuery.isLoading}
				/>
			}
		>
			<RecordRegionsBand recordId={address.id} recordType="addresses" />
			<AddressSurveillanceCard addressId={address.id} />
		</DetailPageShell>
	);
}

function AddressLocationCard({
	geometry,
	isLoading,
}: {
	/** The whole query value: four reads at the call site put that route over the
	 * complexity gate, and each of them was the same `?? null`. */
	readonly geometry: AddressGeometry | null;
	readonly isLoading: boolean;
}) {
	const { geojson = null, lat = null, lng = null, unsupportedShape = null } = geometry ?? {};
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
			unsupportedShape={unsupportedShape}
		/>
	);
}

function AddressDetailsCard({ address }: { readonly address: AddressRecord }) {
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
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
