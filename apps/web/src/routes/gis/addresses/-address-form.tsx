import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	ArrowLeftIcon,
	CheckIcon,
	Loader2Icon,
	MapPinnedIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { useMapDraw } from '../../../components/map/use-map-draw';

export type AddressPointGeometry = {
	readonly type: 'Point';
	readonly coordinates: readonly [number, number];
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
			const response = await fetch(url, { credentials: 'include' });
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
		if (values.displayName.trim().length === 0) {
			setSaveError('A display name is required.');
			return;
		}
		if (values.country.trim().length !== 2) {
			setSaveError('Country must be a two-letter code.');
			return;
		}
		if (geometry === null) {
			setLocationError('Geocode the address or place a point on the map.');
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
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						params={header.backParams ?? {}}
						to={header.backTo}
					>
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
									onValueChange={(value) => setField('displayName', value)}
									value={values.displayName}
								/>
								<LabeledInput
									label="Country"
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

						<section
							aria-labelledby="address-location-label"
							className={cn(
								'grid gap-3 rounded-md border bg-muted/30 p-4',
								locationError === null ? 'border-border/50' : 'border-destructive/60',
							)}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="address-location-label"
									>
										Location (required)
									</span>
									<span className="text-muted-foreground text-xs">
										{geometry === null ? 'No point placed yet.' : pointSummary(geometry)}
									</span>
								</div>
								{geometry === null ? (
									<Badge tone="neutral" variant="outline">
										Not set
									</Badge>
								) : (
									<Badge tone="success" variant="outline">
										<CheckIcon aria-hidden="true" />
										Placed
									</Badge>
								)}
							</div>
							<div className="flex flex-wrap gap-2">
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
								<Button
									disabled={draw.isRequestingPoint}
									onClick={drawManualPoint}
									size="sm"
									type="button"
									variant={geometry === null ? 'default' : 'ghost'}
								>
									<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
									{geometry === null ? 'Place on Map' : 'Move Point'}
								</Button>
								{geometry === null ? null : (
									<Button onClick={clearPoint} size="sm" type="button" variant="ghost">
										<XIcon aria-hidden="true" data-icon="inline-start" />
										Clear
									</Button>
								)}
							</div>
							{locationError === null ? null : (
								<p className="m-0 text-destructive text-sm">{locationError}</p>
							)}
						</section>

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

function GeocoderDialog({
	open,
	results,
	onOpenChange,
	onSelect,
	onUseManualCoordinates,
}: {
	readonly open: boolean;
	readonly results: readonly GeocoderResult[];
	readonly onOpenChange: (open: boolean) => void;
	readonly onSelect: (result: GeocoderResult) => void;
	readonly onUseManualCoordinates: () => void;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Choose Geocoder Result</DialogTitle>
					<DialogDescription>
						Select the best match or place the address point manually on the map.
					</DialogDescription>
				</DialogHeader>
				<div className="grid max-h-80 gap-2 overflow-y-auto">
					{results.length === 0 ? (
						<p className="m-0 rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
							No geocoder results returned.
						</p>
					) : (
						results.map((result) => (
							<button
								className="grid gap-1 rounded-md border border-border/50 bg-background px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
								key={geocoderResultKey(result)}
								onClick={() => onSelect(result)}
								type="button"
							>
								<span className="font-medium">{result.formatted_address}</span>
								<span className="text-muted-foreground text-xs">
									{geocoderResultCoordinates(result)}
								</span>
							</button>
						))
					)}
				</div>
				<DialogFooter>
					<Button onClick={onUseManualCoordinates} type="button" variant="outline">
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
						Use Manual Coordinates
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function LabeledInput({
	label,
	value,
	onValueChange,
	maxLength,
}: {
	readonly label: string;
	readonly value: string;
	readonly onValueChange: (value: string) => void;
	readonly maxLength?: number;
}) {
	const inputId = useId();
	return (
		<div className="grid gap-1.5">
			<label className="font-medium text-foreground text-sm" htmlFor={inputId}>
				{label}
			</label>
			<Input
				id={inputId}
				maxLength={maxLength}
				onChange={(event) => onValueChange(event.target.value)}
				value={value}
			/>
		</div>
	);
}

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

interface GeocoderResponse {
	readonly results: readonly GeocoderResult[];
}

interface GeocoderResult {
	readonly formatted_address?: string;
	readonly location?: {
		readonly lat?: number;
		readonly lng?: number;
	};
}

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

function pointFromGeocoderResult(result: GeocoderResult): AddressPointGeometry | null {
	const lat = result.location?.lat;
	const lng = result.location?.lng;
	if (typeof lat !== 'number' || typeof lng !== 'number') {
		return null;
	}
	return { type: 'Point', coordinates: [lng, lat] };
}

function geocoderResultCoordinates(result: GeocoderResult): string {
	const point = pointFromGeocoderResult(result);
	return point === null ? 'No coordinates' : pointSummary(point);
}

function geocoderResultKey(result: GeocoderResult): string {
	return `${result.formatted_address ?? 'address'}-${geocoderResultCoordinates(result)}`;
}

function pointSummary(geometry: AddressPointGeometry): string {
	return `${geometry.coordinates[1].toFixed(5)}, ${geometry.coordinates[0].toFixed(5)}`;
}

function addressQueryText(values: AddressFormValues): string {
	return [values.addressLine1, values.locality, values.region, values.postalCode]
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join(', ');
}
