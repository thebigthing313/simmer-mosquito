import type { AddressRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	CheckIcon,
	Loader2Icon,
	MapPinnedIcon,
	PlusIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { and, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { useDeferredValue, useId, useRef, useState } from 'react';
import { getServerUrl } from '../auth';
import { settleWrite } from '../sync/settle-write';
import { webCollections } from '../sync/webCollections';

export interface GeoJsonPointGeometry {
	readonly type: 'Point';
	readonly coordinates: readonly [number, number];
}

export interface MapPointDrawOptions {
	readonly prompt?: string;
}

export type HabitatGeometryValue =
	| GeoJsonPointGeometry
	| {
			readonly type: 'LineString';
			readonly coordinates: readonly (readonly [number, number])[];
	  }
	| {
			readonly type: 'Polygon';
			readonly coordinates: readonly (readonly (readonly [number, number])[])[];
	  };

type HabitatGeometryMode = HabitatGeometryValue['type'];
type GeoJsonPosition = readonly [number, number];

interface AddressIdInputProps {
	readonly actorProfileId: string | null;
	readonly organizationId: string;
	readonly requestMapPoint: (options?: MapPointDrawOptions) => Promise<GeoJsonPointGeometry>;
	readonly value: string | null;
	readonly onValueChange: (value: string | null) => void;
}

interface HabitatGeometryInputProps {
	readonly requestMapPoint: (options?: MapPointDrawOptions) => Promise<GeoJsonPointGeometry>;
	readonly value: HabitatGeometryValue | null;
	readonly onValueChange: (value: HabitatGeometryValue | null) => void;
}

export function AddressIdInput({
	actorProfileId,
	organizationId,
	requestMapPoint,
	value,
	onValueChange,
}: AddressIdInputProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const deferredSearch = useDeferredValue(search);
	const [isCreating, setIsCreating] = useState(false);
	const [selectedAddress, setSelectedAddress] = useState<AddressRow | null>(null);
	const anchorRef = useRef<HTMLDivElement>(null);

	return (
		<FieldGroup className="gap-3">
			<Field className="gap-2">
				<FieldLabel>Address</FieldLabel>
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverAnchor asChild>
						<div className="relative" ref={anchorRef}>
							<SearchIcon
								className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								className="pr-10 pl-9"
								onChange={(event) => {
									setSearch(event.target.value);
									setOpen(true);
								}}
								onFocus={() => setOpen(true)}
								placeholder="Search address book"
								value={open ? search : (selectedAddress?.displayName ?? search)}
							/>
							{value === null ? null : (
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									className="absolute top-1/2 right-1.5 -translate-y-1/2"
									aria-label="Clear address"
									onClick={() => {
										setSelectedAddress(null);
										onValueChange(null);
										setSearch('');
									}}
								>
									<XIcon aria-hidden="true" />
								</Button>
							)}
						</div>
					</PopoverAnchor>
					<PopoverContent
						align="start"
						className="grid w-(--radix-popover-trigger-width) min-w-80 gap-2 p-2"
						onOpenAutoFocus={(event) => event.preventDefault()}
						onInteractOutside={(event) => {
							// The input is the popover's anchor, which lives outside the
							// portaled content — so focusing/clicking it reads as an "outside"
							// interaction and would dismiss the popover the same gesture just
							// opened (the open→close→open flicker). Keep it open for anchor
							// interactions; genuine outside clicks still close it.
							const target = event.detail.originalEvent.target as Node | null;
							if (target !== null && anchorRef.current?.contains(target)) {
								event.preventDefault();
							}
						}}
					>
						<AddressSearchResults
							organizationId={organizationId}
							search={deferredSearch}
							selectedValue={value}
							onSelect={(address) => {
								setSelectedAddress(address);
								onValueChange(address.id);
								setSearch(address.displayName);
								setOpen(false);
							}}
						/>
						<Separator />
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="justify-start"
							onClick={() => {
								setOpen(false);
								setIsCreating(true);
							}}
						>
							<PlusIcon data-icon="inline-start" aria-hidden="true" />
							Create Address
						</Button>
					</PopoverContent>
				</Popover>
				<FieldDescription>
					Optional. Link this habitat to an address book record when field crews use a named
					location.
				</FieldDescription>
			</Field>
			{isCreating ? (
				<NewAddressSubform
					actorProfileId={actorProfileId}
					initialSearch={search}
					organizationId={organizationId}
					requestMapPoint={requestMapPoint}
					onCancel={() => setIsCreating(false)}
					onCreated={(address) => {
						setSelectedAddress(address);
						onValueChange(address.id);
						setSearch(address.displayName);
						setIsCreating(false);
					}}
				/>
			) : null}
		</FieldGroup>
	);
}

export function HabitatGeometryInput({
	requestMapPoint,
	value,
	onValueChange,
}: HabitatGeometryInputProps) {
	const [drawError, setDrawError] = useState<string | null>(null);
	const [geometryMode, setGeometryMode] = useState<HabitatGeometryMode>(value?.type ?? 'Point');
	const [draftPoints, setDraftPoints] = useState<readonly GeoJsonPosition[]>(() =>
		pointsFromGeometry(value),
	);
	const [isDrawing, setIsDrawing] = useState(false);

	async function addMapPoint() {
		setDrawError(null);
		setIsDrawing(true);
		try {
			const point = await requestMapPoint({
				prompt: pointPromptForMode(geometryMode, draftPoints.length),
			});
			const nextPoints =
				geometryMode === 'Point' ? [point.coordinates] : [...draftPoints, point.coordinates];

			setDraftPoints(nextPoints);
			const nextGeometry = geometryFromPoints(geometryMode, nextPoints);
			if (nextGeometry !== null) {
				onValueChange(nextGeometry);
			}
		} catch (error) {
			setDrawError(error instanceof Error ? error.message : 'Unable to draw geometry.');
		} finally {
			setIsDrawing(false);
		}
	}

	return (
		<Field className="gap-2">
			<FieldLabel>Geometry</FieldLabel>
			<div className="grid gap-2 rounded-md border border-border/50 bg-muted/30 p-3">
				<div className="flex min-w-0 items-start gap-2">
					<MapPinnedIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
					<div className="min-w-0 flex-1">
						<p className="m-0 text-sm font-medium text-foreground">
							{value === null ? 'No geometry drawn' : geometrySummary(value)}
						</p>
						<p className="m-0 text-xs text-muted-foreground">
							Draw against the map so the saved habitat keeps the spatial context visible.
						</p>
					</div>
				</div>
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					value={geometryMode}
					onValueChange={(nextMode) => {
						if (isHabitatGeometryMode(nextMode)) {
							setGeometryMode(nextMode);
							setDraftPoints([]);
							onValueChange(null);
							setDrawError(null);
						}
					}}
				>
					<ToggleGroupItem value="Point">Point</ToggleGroupItem>
					<ToggleGroupItem value="LineString">Line</ToggleGroupItem>
					<ToggleGroupItem value="Polygon">Polygon</ToggleGroupItem>
				</ToggleGroup>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={addMapPoint}
						disabled={isDrawing}
					>
						{isDrawing ? (
							<Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden="true" />
						) : (
							<MapPinnedIcon data-icon="inline-start" aria-hidden="true" />
						)}
						{drawActionLabel(geometryMode, draftPoints.length)}
					</Button>
					{value === null ? null : (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								setDraftPoints([]);
								onValueChange(null);
							}}
						>
							<XIcon data-icon="inline-start" aria-hidden="true" />
							Clear
						</Button>
					)}
				</div>
				{geometryMode === 'Point' ? null : (
					<p className="m-0 text-xs text-muted-foreground">
						{draftPoints.length} {draftPoints.length === 1 ? 'vertex' : 'vertices'} captured.
						{minimumVertexHint(geometryMode, draftPoints.length)}
					</p>
				)}
				{drawError === null ? null : <p className="m-0 text-sm text-destructive">{drawError}</p>}
			</div>
		</Field>
	);
}

// addresses is an on-demand collection: keep its subset warm briefly after the
// popover closes so re-focusing the field doesn't re-load (and flash the loading
// state) every time. Non-suspense useLiveQuery (gated on status) renders the
// loading line inline instead of unmounting the popover content like Suspense.
const addressSearchGcTimeMs = 30_000;

function useAddressSearch(organizationId: string, search: string) {
	const normalizedSearch = search.trim();
	const pattern = `%${normalizedSearch}%`;
	return useLiveQuery(
		{
			gcTime: addressSearchGcTimeMs,
			query: (query) => {
				let addressQuery = query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.organizationId, organizationId));

				if (normalizedSearch.length > 0) {
					addressQuery = addressQuery.where(({ address }) =>
						and(
							eq(address.organizationId, organizationId),
							or(
								ilike(address.displayName, pattern),
								ilike(address.addressLine1, pattern),
								ilike(address.addressLine2, pattern),
								ilike(address.locality, pattern),
								ilike(address.region, pattern),
								ilike(address.postalCode, pattern),
							),
						),
					);
				}

				return addressQuery.orderBy(({ address }) => address.displayName, 'asc').limit(5);
			},
		},
		[organizationId, pattern],
	);
}

function AddressSearchResults({
	organizationId,
	search,
	selectedValue,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly selectedValue: string | null;
	readonly onSelect: (address: AddressRow) => void;
}) {
	const { data, isReady, isError } = useAddressSearch(organizationId, search);

	if (isError) {
		return <AddressSearchFallback label="Addresses unavailable" />;
	}
	// Only show the loading line on the first load (no data yet); once the subset
	// is warm, re-opening keeps the prior results visible while it refreshes.
	if (!isReady && (data ?? []).length === 0) {
		return <AddressSearchFallback label="Searching addresses" />;
	}

	const addresses = data ?? [];
	if (addresses.length === 0) {
		return <AddressSearchFallback label="No address matches" />;
	}

	return (
		<div className="grid gap-1">
			{addresses.map((address) => (
				<AddressSearchResult
					address={address}
					key={address.id}
					selected={address.id === selectedValue}
					onSelect={() => onSelect(address)}
				/>
			))}
		</div>
	);
}

function AddressSearchFallback({ label }: { readonly label: string }) {
	return (
		<div className="flex min-h-16 items-center justify-center gap-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
			<SearchIcon aria-hidden="true" />
			{label}
		</div>
	);
}

function AddressSearchResult({
	address,
	selected,
	onSelect,
}: {
	readonly address: AddressRow;
	readonly selected: boolean;
	readonly onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
			onClick={onSelect}
		>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium">{address.displayName}</span>
				<span className="block truncate text-xs text-muted-foreground">{addressLine(address)}</span>
			</span>
			{selected ? <CheckIcon aria-hidden="true" /> : null}
		</button>
	);
}

function NewAddressSubform({
	actorProfileId,
	initialSearch,
	organizationId,
	requestMapPoint,
	onCancel,
	onCreated,
}: {
	readonly actorProfileId: string | null;
	readonly initialSearch: string;
	readonly organizationId: string;
	readonly requestMapPoint: (options?: MapPointDrawOptions) => Promise<GeoJsonPointGeometry>;
	readonly onCancel: () => void;
	readonly onCreated: (address: AddressRow) => void;
}) {
	const [displayName, setDisplayName] = useState(initialSearch);
	const [country, setCountry] = useState('US');
	const [addressLine1, setAddressLine1] = useState(initialSearch);
	const [addressLine2, setAddressLine2] = useState('');
	const [locality, setLocality] = useState('');
	const [region, setRegion] = useState('');
	const [postalCode, setPostalCode] = useState('');
	const [geometry, setGeometry] = useState<GeoJsonPointGeometry | null>(null);
	const [geocoderResponse, setGeocoderResponse] = useState<unknown | null>(null);
	const [geocoderResults, setGeocoderResults] = useState<readonly GeocoderResult[]>([]);
	const [geocoderOpen, setGeocoderOpen] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isGeocoding, setIsGeocoding] = useState(false);
	const canCreate =
		displayName.trim().length > 0 && country.trim().length === 2 && geometry !== null;

	async function geocodeAddress() {
		setSaveError(null);
		setIsGeocoding(true);
		try {
			const url = new URL('/geocoder/search', getServerUrl());
			url.searchParams.set('q', addressQueryText({ addressLine1, locality, region, postalCode }));
			url.searchParams.set('country', country);
			url.searchParams.set('limit', '5');
			const response = await fetch(url, { credentials: 'include' });
			const body = (await response.json()) as GeocoderResponse | { readonly error: string };
			if (!response.ok || !('results' in body)) {
				throw new Error('Unable to geocode address.');
			}
			setGeocoderResults(body.results);
			setGeocoderOpen(true);
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : 'Unable to geocode address.');
		} finally {
			setIsGeocoding(false);
		}
	}

	async function drawManualPoint() {
		try {
			setGeometry(
				await requestMapPoint({
					prompt: 'Click the map to place this address.',
				}),
			);
			setGeocoderOpen(false);
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : 'Unable to draw address point.');
		}
	}

	async function createAddress() {
		if (geometry === null) {
			setSaveError('Address geometry is required.');
			return;
		}

		setIsSaving(true);
		setSaveError(null);
		try {
			const now = new Date().toISOString();
			const address: AddressRow = {
				id: crypto.randomUUID(),
				organizationId,
				lat: geometry.coordinates[1],
				lng: geometry.coordinates[0],
				geojson: geometry,
				geomType: geometry.type,
				displayName: displayName.trim(),
				country: country.trim().toUpperCase(),
				addressLine1: nullableText(addressLine1),
				addressLine2: nullableText(addressLine2),
				locality: nullableText(locality),
				region: nullableText(region),
				postalCode: nullableText(postalCode),
				geocoderResponse,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};
			const transaction = webCollections.addresses.insert(address);
			await settleWrite(transaction);
			onCreated(address);
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : 'Unable to create address.');
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="grid gap-3 rounded-md border border-border/50 bg-muted/30 p-3">
			<div className="grid gap-3 md:grid-cols-2">
				<LabeledInput label="Name" value={displayName} onValueChange={setDisplayName} />
				<LabeledInput label="Country" value={country} onValueChange={setCountry} maxLength={2} />
				<LabeledInput label="Street address" value={addressLine1} onValueChange={setAddressLine1} />
				<LabeledInput label="Unit" value={addressLine2} onValueChange={setAddressLine2} />
				<LabeledInput label="City" value={locality} onValueChange={setLocality} />
				<LabeledInput label="State" value={region} onValueChange={setRegion} />
				<LabeledInput label="Postal code" value={postalCode} onValueChange={setPostalCode} />
				<div className="grid content-end gap-1.5">
					<Button type="button" variant="outline" onClick={geocodeAddress} disabled={isGeocoding}>
						{isGeocoding ? (
							<Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden="true" />
						) : (
							<SearchIcon data-icon="inline-start" aria-hidden="true" />
						)}
						Geocode
					</Button>
				</div>
			</div>
			<p className="m-0 text-xs text-muted-foreground">
				{geometry === null ? 'No address point selected.' : geometrySummary(geometry)}
			</p>
			{saveError === null ? null : <p className="m-0 text-sm text-destructive">{saveError}</p>}
			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="button" onClick={createAddress} disabled={!canCreate || isSaving}>
					{isSaving ? (
						<Loader2Icon data-icon="inline-start" className="animate-spin" aria-hidden="true" />
					) : null}
					Create Address
				</Button>
			</div>
			<GeocoderDialog
				open={geocoderOpen}
				results={geocoderResults}
				onOpenChange={setGeocoderOpen}
				onSelect={(result) => {
					const point = pointFromGeocoderResult(result);
					if (point !== null) {
						setGeometry(point);
						setGeocoderResponse(result);
					}
					setGeocoderOpen(false);
				}}
				onUseManualCoordinates={drawManualPoint}
			/>
		</div>
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
			<label htmlFor={inputId} className="text-sm font-medium text-foreground">
				{label}
			</label>
			<Input
				id={inputId}
				maxLength={maxLength}
				value={value}
				onChange={(event) => onValueChange(event.target.value)}
			/>
		</div>
	);
}

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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Choose Geocoder Result</DialogTitle>
					<DialogDescription>
						Select the best match or place the address point manually on the map.
					</DialogDescription>
				</DialogHeader>
				<div className="grid max-h-80 gap-2 overflow-y-auto">
					{results.length === 0 ? (
						<p className="m-0 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
							No geocoder results returned.
						</p>
					) : (
						results.map((result) => (
							<button
								type="button"
								className="grid gap-1 rounded-md border border-border/50 bg-background px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
								key={geocoderResultKey(result)}
								onClick={() => onSelect(result)}
							>
								<span className="font-medium">{result.formatted_address}</span>
								<span className="text-xs text-muted-foreground">
									{geocoderResultCoordinates(result)}
								</span>
							</button>
						))
					)}
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onUseManualCoordinates}>
						<MapPinnedIcon data-icon="inline-start" aria-hidden="true" />
						Use Manual Coordinates
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

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

function pointFromGeocoderResult(result: GeocoderResult): GeoJsonPointGeometry | null {
	const lat = result.location?.lat;
	const lng = result.location?.lng;
	if (typeof lat !== 'number' || typeof lng !== 'number') {
		return null;
	}

	return { type: 'Point', coordinates: [lng, lat] };
}

function geocoderResultCoordinates(result: GeocoderResult): string {
	const point = pointFromGeocoderResult(result);
	return point === null ? 'No coordinates' : coordinatePair(point);
}

function geocoderResultKey(result: GeocoderResult): string {
	return `${result.formatted_address ?? 'address'}-${geocoderResultCoordinates(result)}`;
}

function geometrySummary(geometry: HabitatGeometryValue): string {
	if (geometry.type === 'Point') {
		return `Point at ${coordinatePair(geometry)}`;
	}
	if (geometry.type === 'LineString') {
		return `Line with ${geometry.coordinates.length} vertices`;
	}

	const ring = geometry.coordinates[0] ?? [];
	return `Polygon with ${Math.max(ring.length - 1, 0)} vertices`;
}

function coordinatePair(point: GeoJsonPointGeometry): string {
	return `${point.coordinates[1].toFixed(5)}, ${point.coordinates[0].toFixed(5)}`;
}

function isHabitatGeometryMode(value: string): value is HabitatGeometryMode {
	return value === 'Point' || value === 'LineString' || value === 'Polygon';
}

function geometryFromPoints(
	mode: HabitatGeometryMode,
	points: readonly GeoJsonPosition[],
): HabitatGeometryValue | null {
	if (mode === 'Point') {
		const point = points[0];
		return point === undefined ? null : { type: 'Point', coordinates: point };
	}
	if (mode === 'LineString') {
		return points.length < 2 ? null : { type: 'LineString', coordinates: points };
	}

	return points.length < 3
		? null
		: {
				type: 'Polygon',
				coordinates: [closeRing(points)],
			};
}

function closeRing(points: readonly GeoJsonPosition[]): readonly GeoJsonPosition[] {
	const first = points[0];
	const last = points.at(-1);
	if (first === undefined || last === undefined) {
		return points;
	}
	if (first[0] === last[0] && first[1] === last[1]) {
		return points;
	}

	return [...points, first];
}

function pointsFromGeometry(value: HabitatGeometryValue | null): readonly GeoJsonPosition[] {
	if (value === null) {
		return [];
	}
	if (value.type === 'Point') {
		return [value.coordinates];
	}
	if (value.type === 'LineString') {
		return value.coordinates;
	}

	const ring = value.coordinates[0] ?? [];
	const first = ring[0];
	const last = ring.at(-1);
	return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]
		? ring.slice(0, -1)
		: ring;
}

function pointPromptForMode(mode: HabitatGeometryMode, pointCount: number): string {
	if (mode === 'Point') {
		return 'Click the map to place the habitat point.';
	}
	if (mode === 'LineString') {
		return pointCount === 0
			? 'Click the map to place the first line vertex.'
			: 'Click the map to add another line vertex.';
	}

	return pointCount === 0
		? 'Click the map to place the first polygon vertex.'
		: 'Click the map to add another polygon vertex.';
}

function drawActionLabel(mode: HabitatGeometryMode, pointCount: number): string {
	if (mode === 'Point') {
		return pointCount === 0 ? 'Draw point' : 'Replace point';
	}

	return pointCount === 0 ? 'Start drawing' : 'Add vertex';
}

function minimumVertexHint(mode: HabitatGeometryMode, pointCount: number): string {
	if (mode === 'LineString' && pointCount < 2) {
		return ` Add ${2 - pointCount} more to save a line.`;
	}
	if (mode === 'Polygon' && pointCount < 3) {
		return ` Add ${3 - pointCount} more to save a polygon.`;
	}

	return '';
}

function addressLine(address: AddressRow): string {
	return [address.addressLine1, address.locality, address.region, address.postalCode]
		.filter((part) => part !== null && part.trim().length > 0)
		.join(', ');
}

function addressQueryText(input: {
	readonly addressLine1: string;
	readonly locality: string;
	readonly region: string;
	readonly postalCode: string;
}): string {
	return [input.addressLine1, input.locality, input.region, input.postalCode]
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join(', ');
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
