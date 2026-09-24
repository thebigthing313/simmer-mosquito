import { createAddressCommand, isOwnedGeometry } from '@simmer-mosquito/domain';
import { FormSection, RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { SearchIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import type { DrawPoint } from '../../../hooks/map/use-address-point';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	FORM_VALIDATION_GEOMETRY,
} from '../../../lib/domain-validation';
import { errorMessageForSave } from '../../../lib/save-error';
import { LocationBand } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';
import {
	GeocoderDialog,
	type GeocoderResult,
	pointFromGeocoderResult,
	searchGeocoder,
} from '../../pickers/geocoder-dialog';

/** The one shape an address stores, which is the shape the geocoder returns. */
export type AddressPointGeometry = DrawPoint;

/**
 * Domain issue path to the form field holding it. The point is placed on the
 * map rather than typed, so its issues land on the alert, and so does
 * `geocoderResponse`, which no operator can fix on a field.
 */
const ADDRESS_FIELD_PATHS: Readonly<Record<string, string>> = {
	displayName: 'displayName',
	country: 'country',
	addressLine1: 'addressLine1',
	addressLine2: 'addressLine2',
	locality: 'locality',
	region: 'region',
	postalCode: 'postalCode',
};

export interface AddressFormValues {
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string;
	readonly addressLine2: string;
	readonly locality: string;
	readonly region: string;
	readonly postalCode: string;
}

/**
 * The form's rules, straight from the domain builder. The point is not handed
 * to it as it stands: a missing point is `requireGeometry`'s to report on the
 * location band, and passing the null would put a GeoJSON message in the alert
 * and stop every other rule from being reached.
 */
export function validateAddress(
	value: AddressFormValues,
	geometry: DrawGeometry | null,
	geocoderResponse: unknown,
) {
	return domainValidator(
		() =>
			createAddressCommand({
				...FORM_VALIDATION_CONTEXT,
				addressId: FORM_VALIDATION_CONTEXT.organizationId,
				displayName: value.displayName,
				geometry: geometry ?? FORM_VALIDATION_GEOMETRY,
				country: value.country,
				addressLine1: value.addressLine1,
				addressLine2: value.addressLine2,
				locality: value.locality,
				region: value.region,
				postalCode: value.postalCode,
				geocoderResponse,
			}),
		ADDRESS_FIELD_PATHS,
	)({ value });
}

export interface AddressFormHeader {
	readonly title: string;
	readonly description?: string | undefined;
	readonly backTo: '/gis/addresses' | '/gis/addresses/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

/**
 * What a save is handed. `values` is the form's; the other three are the
 * point's. The geocoder response is the provenance of a point the geocoder
 * placed, stored so a later reader can see which match the address came from.
 * A point placed by hand keeps the response the address already had.
 */
export interface AddressFormSave {
	readonly values: AddressFormValues;
	readonly geometry: AddressPointGeometry | null;
	/** True when the point was geocoded, drawn or cleared this session. */
	readonly geometryChanged: boolean;
	readonly geocoderResponse: unknown | null;
}

export interface AddressFormPageProps {
	readonly canSubmit: boolean;
	readonly defaultValues: AddressFormValues;
	readonly initialGeometry?: AddressPointGeometry | null;
	readonly initialGeocoderResponse?: unknown | null;
	readonly header: AddressFormHeader;
	readonly onSave: (input: AddressFormSave) => Promise<void>;
}

export function defaultAddressFormValues(): AddressFormValues {
	return {
		displayName: '',
		country: 'US',
		addressLine1: '',
		addressLine2: '',
		locality: '',
		region: '',
		postalCode: '',
	};
}

export function AddressFormPage({
	canSubmit,
	defaultValues,
	initialGeometry = null,
	initialGeocoderResponse = null,
	header,
	onSave,
}: AddressFormPageProps) {
	const location = useDrawLocation({
		geometryKind: 'address',
		initialGeometry,
		missingMessage: 'Geocode the address or place a point on the map.',
	});
	const { draw, geometry, geometryType } = location;

	const [geocoderResponse, setGeocoderResponse] = useState<unknown | null>(initialGeocoderResponse);
	const [geocoderResults, setGeocoderResults] = useState<readonly GeocoderResult[]>([]);
	const [geocoderOpen, setGeocoderOpen] = useState(false);
	const [isGeocoding, setIsGeocoding] = useState(false);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: AddressFormValues }) =>
				validateAddress(value, geometry, geocoderResponse),
		},
		onSubmit: async ({ value }) => {
			if (!location.requireGeometry() || geometry === null) {
				return;
			}
			if (!isOwnedGeometry('address', geometry)) {
				// Unreachable while the register says Point and nothing else. Thrown so a
				// widened policy says so in the alert instead of dropping the save.
				throw new Error('An address stores a single point.');
			}
			await onSave({
				values: value,
				geometry,
				geometryChanged: location.geometryChanged,
				geocoderResponse,
			});
		},
	});

	const geocodeAddress = async () => {
		const values = form.state.values;
		location.clearError();
		setIsGeocoding(true);
		try {
			setGeocoderResults(await searchGeocoder(addressQueryText(values), countryOf(values)));
			setGeocoderOpen(true);
		} catch (error) {
			location.reportError(errorMessageForSave(error, 'Unable to geocode address.'));
		}
		setIsGeocoding(false);
	};

	// Placing the point by hand is the gesture the band's own Draw button starts,
	// so the dialog's way out is that gesture rather than a second one.
	const drawPointByHand = () => {
		setGeocoderOpen(false);
		location.startDraw();
	};

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit} />
					</>
				}
				aside={
					<>
						<MapCanvas onMapReady={location.onMapReady} />
						<DrawToolbar
							controller={draw}
							geometryKind="address"
							geometryType={geometryType}
							pointPrompt="Click the map to place the address."
						/>
					</>
				}
				header={header}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Address" />

				<FormSection title="Address">
					<div className="grid gap-4 sm:grid-cols-2">
						<form.AppField name="displayName">
							{(field) => <field.TextField label="Display name" required />}
						</form.AppField>
						<form.AppField name="country">
							{(field) => <field.TextField label="Country" maxLength={2} required />}
						</form.AppField>
						<form.AppField name="addressLine1">
							{(field) => <field.TextField label="Street address" />}
						</form.AppField>
						<form.AppField name="addressLine2">
							{(field) => <field.TextField label="Unit" />}
						</form.AppField>
						<form.AppField name="locality">
							{(field) => <field.TextField label="City" />}
						</form.AppField>
						<form.AppField name="region">
							{(field) => <field.TextField label="State" />}
						</form.AppField>
						<form.AppField name="postalCode">
							{(field) => <field.TextField label="Postal code" />}
						</form.AppField>
					</div>
				</FormSection>

				<LocationBand
					description="Geocode from the fields above, or place the point by hand."
					extraActions={
						<Button
							disabled={isGeocoding}
							onClick={() => void geocodeAddress()}
							size="sm"
							type="button"
							variant="outline"
						>
							{isGeocoding ? (
								<Spinner data-icon="inline-start" />
							) : (
								<SearchIcon aria-hidden="true" data-icon="inline-start" />
							)}
							Geocode
						</Button>
					}
					geometryKind="address"
					label="Location"
					location={location}
					title="Address location"
				/>
			</RecordFormPage>

			<GeocoderDialog
				onOpenChange={setGeocoderOpen}
				onSelect={(result) => {
					const point = pointFromGeocoderResult(result);
					if (point !== null) {
						// Through the controller, so the map draws the point it holds and the
						// redraw flag is set where every other source of a geometry sets it.
						draw.commit(point);
						setGeocoderResponse(result);
					}
					setGeocoderOpen(false);
				}}
				onUseManualCoordinates={drawPointByHand}
				open={geocoderOpen}
				results={geocoderResults}
			/>
		</form.AppForm>
	);
}

// --- helpers ----------------------------------------------------------------

/** The country the lookup is scoped to. US is what an unset field means here. */
function countryOf(values: AddressFormValues): string {
	return values.country.trim() || 'US';
}

function addressQueryText(values: AddressFormValues): string {
	return [values.addressLine1, values.locality, values.region, values.postalCode]
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join(', ');
}
