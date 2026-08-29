import { createAddressCommand } from '@simmer-mosquito/domain';
import { sessionFetch } from '@simmer-mosquito/sync';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { LocationSection } from '@simmer-mosquito/ui-web/components/form';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	ArrowLeftIcon,
	Loader2Icon,
	MapPinnedIcon,
	SearchIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { GeometryControl, POINT_DRAW_TYPES } from '../../../components/map/geometry-control';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import {
	GeocoderDialog,
	type GeocoderPoint,
	type GeocoderResponse,
	type GeocoderResult,
	LabeledInput,
	pointFromGeocoderResult,
} from '../../../components/pickers/geocoder-dialog';
import { FORM_VALIDATION_CONTEXT, validateAgainstCommand } from '../../../forms/domain-validation';

/** The GIS form's public point type, and the one the geocoder helpers return. */
export type AddressPointGeometry = GeocoderPoint;

export interface AddressFormValues {
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string;
	readonly addressLine2: string;
	readonly locality: string;
	readonly region: string;
	readonly postalCode: string;
}

export interface AddressFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/gis/addresses' | '/gis/addresses/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface AddressFormPageProps {
	readonly canSubmit: boolean;
	readonly defaultValues: AddressFormValues;
	readonly initialGeometry?: AddressPointGeometry | null;
	readonly initialGeocoderResponse?: unknown | null;
	readonly header: AddressFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: AddressFormValues;
		readonly geometry: AddressPointGeometry | null;
		readonly geometryChanged: boolean;
		readonly geocoderResponse: unknown | null;
	}) => Promise<void>;
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
	submitLabel,
	onSave,
}: AddressFormPageProps) {
	const [values, setValues] = useState<AddressFormValues>(defaultValues);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<AddressPointGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [geocoderResponse, setGeocoderResponse] = useState<unknown | null>(initialGeocoderResponse);
	const [geocoderResults, setGeocoderResults] = useState<readonly GeocoderResult[]>([]);
	const [geocoderOpen, setGeocoderOpen] = useState(false);
	const [isGeocoding, setIsGeocoding] = useState(false);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const draw = useMapDraw({ map, isLoaded: map !== null, value: null, onChange: () => undefined });
	const { requestPoint } = draw;

	useCenterOnPoint(map, geometry);

	const setField = useCallback((key: keyof AddressFormValues, value: string) => {
		setValues((prev) => ({ ...prev, [key]: value }));
	}, []);

	const geocodeAddress = useCallback(async () => {
		setLocationError(null);
		setIsGeocoding(true);
		try {
			const url = new URL('/geocoder/search', getServerUrl());
			url.searchParams.set('q', addressQueryText(values));
			url.searchParams.set('country', values.country.trim() || 'US');
			url.searchParams.set('limit', '5');
			const response = await sessionFetch(url, { credentials: 'include' });
			const body = (await response.json()) as GeocoderResponse | { readonly error: string };
			if (!response.ok || !('results' in body)) {
				throw new Error('Unable to geocode address.');
			}
			setGeocoderResults(body.results);
			setGeocoderOpen(true);
		} catch (error) {
			setLocationError(error instanceof Error ? error.message : 'Unable to geocode address.');
		} finally {
			setIsGeocoding(false);
		}
	}, [values]);

	const drawManualPoint = useCallback(async () => {
		setGeocoderOpen(false);
		try {
			const point = await requestPoint('Click the map to place this address.');
			setGeometry({ type: 'Point', coordinates: point.coordinates });
			setGeometryChanged(true);
			setLocationError(null);
		} catch {
			// Draw cancelled (Esc / mode switch); keep the prior point.
		}
	}, [requestPoint]);

	const clearPoint = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	const handleSubmit = useCallback(async () => {
		setSaveError(null);
		setLocationError(null);
		if (geometry === null) {
			setLocationError('Geocode the address or place a point on the map.');
			return;
		}
		/*
		 * The rules here were hand-copied from the domain builder and had already
		 * drifted — the display-name length cap and the postal/region formats were
		 * never checked, so they came back as a generic save failure. Running the
		 * builder keeps the form and the server saying the same thing.
		 */
		const issues = validateAgainstCommand(() =>
			createAddressCommand({
				...FORM_VALIDATION_CONTEXT,
				addressId: FORM_VALIDATION_CONTEXT.organizationId,
				displayName: values.displayName,
				geometry,
				country: values.country,
				addressLine1: values.addressLine1,
				addressLine2: values.addressLine2,
				locality: values.locality,
				region: values.region,
				postalCode: values.postalCode,
			}),
		);
		if (issues !== undefined) {
			const messages = [...Object.values(issues.fields), ...issues.form];
			setSaveError(messages.join(' '));
			return;
		}
		setIsSaving(true);
		try {
			await onSave({ values, geometry, geometryChanged, geocoderResponse });
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : 'Unable to save address.');
		} finally {
			setIsSaving(false);
		}
	}, [values, geometry, geometryChanged, geocoderResponse, onSave]);

	const geoJson =
		geometry === null
			? null
			: ({
					type: 'Feature',
					properties: {},
					geometry: { type: 'Point', coordinates: geometry.coordinates },
				} as unknown as GeoJSON.Feature);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas controls={{ layers: false }} geoJson={geoJson} onMapReady={handleMapReady} />
					{draw.isRequestingPoint ? (
						<MapPrompt>
							<MapPinnedIcon aria-hidden="true" className="size-4 text-primary" />
							Click the map to place the address. Press Esc to cancel.
						</MapPrompt>
					) : null}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className={stickyHeader({ gap: 'tight', padding: 'roomy' })}>
					<Link className={backLink()} params={header.backParams ?? {}} to={header.backTo}>
						<ArrowLeftIcon aria-hidden="true" />
						{header.backLabel}
					</Link>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
							{header.title}
						</h1>
						<p className="m-0 text-muted-foreground text-sm">{header.description}</p>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<form
						className="grid gap-6"
						onSubmit={(event) => {
							event.preventDefault();
							void handleSubmit();
						}}
					>
						{saveError === null ? null : (
							<Alert variant="destructive">
								<AlertTitle>Unable to Save Address</AlertTitle>
								<AlertDescription>{saveError}</AlertDescription>
							</Alert>
						)}

						<section className="grid gap-4">
							<h2 className="m-0 font-semibold text-foreground text-sm">Address</h2>
							<div className="grid gap-4 sm:grid-cols-2">
								<LabeledInput
									label="Display name"
									required
									onValueChange={(value) => setField('displayName', value)}
									value={values.displayName}
								/>
								<LabeledInput
									label="Country"
									required
									maxLength={2}
									onValueChange={(value) => setField('country', value)}
									value={values.country}
								/>
								<LabeledInput
									label="Street address"
									onValueChange={(value) => setField('addressLine1', value)}
									value={values.addressLine1}
								/>
								<LabeledInput
									label="Unit"
									onValueChange={(value) => setField('addressLine2', value)}
									value={values.addressLine2}
								/>
								<LabeledInput
									label="City"
									onValueChange={(value) => setField('locality', value)}
									value={values.locality}
								/>
								<LabeledInput
									label="State"
									onValueChange={(value) => setField('region', value)}
									value={values.region}
								/>
								<LabeledInput
									label="Postal code"
									onValueChange={(value) => setField('postalCode', value)}
									value={values.postalCode}
								/>
							</div>
						</section>

						<LocationSection
							description="Geocode from the fields above, or place the point by hand."
							error={locationError}
							title="Address location"
						>
							<GeometryControl
								allowedTypes={POINT_DRAW_TYPES}
								controller={draw}
								extraActions={
									<Button
										disabled={isGeocoding}
										onClick={geocodeAddress}
										size="sm"
										type="button"
										variant="outline"
									>
										{isGeocoding ? (
											<Loader2Icon
												aria-hidden="true"
												className="animate-spin"
												data-icon="inline-start"
											/>
										) : (
											<SearchIcon aria-hidden="true" data-icon="inline-start" />
										)}
										Geocode
									</Button>
								}
								geometry={geometry as DrawGeometry | null}
								geometryType="Point"
								label="Location"
								onClear={clearPoint}
								onDraw={() => void drawManualPoint()}
								required
							/>
						</LocationSection>

						<div className="flex flex-wrap justify-end gap-2 border-border/50 border-t pt-5">
							<Button asChild type="button" variant="ghost">
								<Link params={header.backParams ?? {}} to={header.backTo}>
									Cancel
								</Link>
							</Button>
							<Button disabled={!canSubmit || isSaving} type="submit">
								{isSaving ? (
									<Loader2Icon
										aria-hidden="true"
										className="animate-spin"
										data-icon="inline-start"
									/>
								) : null}
								{submitLabel}
							</Button>
						</div>
					</form>
				</div>
			</div>

			<GeocoderDialog
				onOpenChange={setGeocoderOpen}
				onSelect={(result) => {
					const point = pointFromGeocoderResult(result);
					if (point !== null) {
						setGeometry(point);
						setGeometryChanged(true);
						setGeocoderResponse(result);
						setLocationError(null);
					}
					setGeocoderOpen(false);
				}}
				onUseManualCoordinates={drawManualPoint}
				open={geocoderOpen}
				results={geocoderResults}
			/>
		</MapSplitPage>
	);
}

// --- geocoder dialog --------------------------------------------------------

function MapPrompt({ children }: { readonly children: React.ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in">
			<p className="m-0 inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-foreground text-sm shadow-lg backdrop-blur-sm">
				{children}
			</p>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

function useCenterOnPoint(map: MapboxMap | null, geometry: AddressPointGeometry | null): void {
	const lastRef = useRef<string | null>(null);
	useEffect(() => {
		if (map === null || geometry === null) {
			return;
		}
		const signature = JSON.stringify(geometry.coordinates);
		if (lastRef.current === signature) {
			return;
		}
		lastRef.current = signature;
		map.easeTo({
			center: [geometry.coordinates[0], geometry.coordinates[1]],
			zoom: Math.max(map.getZoom(), 15),
			duration: 500,
		});
	}, [map, geometry]);
}

function addressQueryText(values: AddressFormValues): string {
	return [values.addressLine1, values.locality, values.region, values.postalCode]
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join(', ');
}
