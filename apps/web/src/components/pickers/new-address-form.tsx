import { createAddressCommand } from '@simmer-mosquito/domain';
import type { AddressRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { RequiredMark } from '@simmer-mosquito/ui-web/components/form';
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
import { Loader2Icon, MapPinnedIcon, SearchIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useId, useState } from 'react';
import { getServerUrl } from '../../auth';
import { FORM_VALIDATION_CONTEXT, validateAgainstCommand } from '../../forms/domain-validation';
import { webCollections } from '../../sync/webCollections';

/**
 * Create an address without leaving the form that needs it.
 *
 * Crews record work at places the address book has never seen, and making them
 * abandon a half-filled inspection to go add one loses the rest of the form. The
 * fields mirror the standalone address form, and both routes to a point are here:
 * geocode what was typed, or place it by hand when the caller has a map to draw
 * against.
 */

export interface GeoJsonPointGeometry {
	readonly type: 'Point';
	readonly coordinates: readonly [number, number];
}

export interface MapPointDrawOptions {
	readonly prompt?: string;
}

/** Places a point by map click. Omitted where the caller has no map (a dialog). */
export type RequestMapPoint = (options?: MapPointDrawOptions) => Promise<GeoJsonPointGeometry>;

export interface NewAddressFormProps {
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	/** Seeds the name and street line from whatever was typed into the picker. */
	readonly initialSearch: string;
	readonly requestMapPoint?: RequestMapPoint | undefined;
	readonly onCancel: () => void;
	readonly onCreated: (address: AddressRow) => void;
}

export function NewAddressForm({
	organizationId,
	actorProfileId,
	initialSearch,
	requestMapPoint,
	onCancel,
	onCreated,
}: NewAddressFormProps) {
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

	async function geocodeAddress() {
		setSaveError(null);
		setIsGeocoding(true);
		try {
			const url = new URL('/geocoder/search', getServerUrl());
			url.searchParams.set('q', addressQueryText({ addressLine1, locality, region, postalCode }));
			url.searchParams.set('country', country);
			url.searchParams.set('limit', '5');
			const response = await fetch(url, { credentials: 'include' });
			const body = (await response.json().catch(() => null)) as
				| GeocoderResponse
				| { readonly error?: string }
				| null;
			if (!response.ok || body === null || !('results' in body)) {
				throw new Error(geocoderErrorMessage(response.status, readErrorCode(body)));
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
		if (requestMapPoint === undefined) {
			return;
		}
		try {
			setGeometry(await requestMapPoint({ prompt: 'Click the map to place this address.' }));
			// The point is what the outstanding complaint was about, so retire it.
			setSaveError(null);
			setGeocoderOpen(false);
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : 'Unable to draw address point.');
		}
	}

	async function createAddress() {
		if (geometry === null) {
			setSaveError('Geocode the address or place its point on the map.');
			return;
		}
		// Same builder the server runs, so the subform rejects what the server would.
		const issues = validateAgainstCommand(() =>
			createAddressCommand({
				...FORM_VALIDATION_CONTEXT,
				addressId: FORM_VALIDATION_CONTEXT.organizationId,
				displayName,
				geometry,
				country,
				addressLine1,
				addressLine2,
				locality,
				region,
				postalCode,
			}),
		);
		if (issues !== undefined) {
			setSaveError([...Object.values(issues.fields), ...issues.form].join(' '));
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
			await settleWrite(webCollections.addresses.insert(address));
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
				<LabeledInput label="Name" onValueChange={setDisplayName} required value={displayName} />
				<LabeledInput
					label="Country"
					maxLength={2}
					onValueChange={setCountry}
					required
					value={country}
				/>
				<LabeledInput label="Street address" onValueChange={setAddressLine1} value={addressLine1} />
				<LabeledInput label="Unit" onValueChange={setAddressLine2} value={addressLine2} />
				<LabeledInput label="City" onValueChange={setLocality} value={locality} />
				<LabeledInput label="State" onValueChange={setRegion} value={region} />
				<LabeledInput label="Postal code" onValueChange={setPostalCode} value={postalCode} />
				<div className="grid content-end gap-1.5">
					<Button disabled={isGeocoding} onClick={geocodeAddress} type="button" variant="outline">
						{isGeocoding ? (
							<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
						) : (
							<SearchIcon aria-hidden="true" data-icon="inline-start" />
						)}
						Geocode
					</Button>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<p className="m-0 min-w-0 flex-1 text-muted-foreground text-xs">
					{geometry === null
						? 'No address point selected.'
						: `Point at ${coordinatePair(geometry)}`}
				</p>
				{requestMapPoint === undefined ? null : (
					<Button onClick={drawManualPoint} size="sm" type="button" variant="ghost">
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
						{geometry === null ? 'Place on Map' : 'Move Point'}
					</Button>
				)}
			</div>
			{saveError === null ? null : <p className="m-0 text-destructive text-sm">{saveError}</p>}
			<div className="flex flex-wrap justify-end gap-2">
				<Button onClick={onCancel} type="button" variant="ghost">
					Cancel
				</Button>
				<Button disabled={isSaving} onClick={createAddress} type="button">
					{isSaving ? (
						<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
					) : null}
					Create Address
				</Button>
			</div>
			<GeocoderDialog
				onOpenChange={setGeocoderOpen}
				onSelect={(result) => {
					const point = pointFromGeocoderResult(result);
					if (point !== null) {
						setGeometry(point);
						setGeocoderResponse(result);
						setSaveError(null);
					}
					setGeocoderOpen(false);
				}}
				{...(requestMapPoint === undefined ? {} : { onUseManualCoordinates: drawManualPoint })}
				open={geocoderOpen}
				results={geocoderResults}
			/>
		</div>
	);
}

function LabeledInput({
	label,
	value,
	onValueChange,
	maxLength,
	required = false,
}: {
	readonly label: string;
	readonly value: string;
	readonly onValueChange: (value: string) => void;
	readonly maxLength?: number;
	readonly required?: boolean;
}) {
	const inputId = useId();
	return (
		<div className="grid gap-1.5">
			<label className="font-medium text-foreground text-sm" htmlFor={inputId}>
				{label}
				{required ? <RequiredMark /> : null}
			</label>
			<Input
				aria-required={required ? true : undefined}
				id={inputId}
				maxLength={maxLength}
				onChange={(event) => onValueChange(event.target.value)}
				value={value}
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
	readonly onUseManualCoordinates?: () => void;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Choose Geocoder Result</DialogTitle>
					<DialogDescription>
						{onUseManualCoordinates === undefined
							? 'Select the best match for this address.'
							: 'Select the best match or place the address point manually on the map.'}
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
				{onUseManualCoordinates === undefined ? null : (
					<DialogFooter>
						<Button onClick={onUseManualCoordinates} type="button" variant="outline">
							<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
							Use Manual Coordinates
						</Button>
					</DialogFooter>
				)}
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

function coordinatePair(point: GeoJsonPointGeometry): string {
	return `${point.coordinates[1].toFixed(5)}, ${point.coordinates[0].toFixed(5)}`;
}

function readErrorCode(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) {
		return undefined;
	}
	const error = (body as { readonly error?: unknown }).error;
	return typeof error === 'string' ? error : undefined;
}

/**
 * Every geocoder failure used to read "Unable to geocode address." — equally
 * true of an unset API key, a rate limit, an expired session, and an upstream
 * outage, and equally useless for deciding whether to retry, place the point by
 * hand, or tell someone the deployment is misconfigured. `/geocoder/search`
 * already distinguishes them; this says which, and names the way out.
 *
 * Placing the point on the map is always available in this form, so it is the
 * fallback every message points at.
 */
function geocoderErrorMessage(status: number, error: string | undefined): string {
	if (status === 401) {
		return 'Your session has expired. Sign in again to look up addresses.';
	}
	if (error === 'geocoder_not_configured') {
		return 'Address lookup is not configured on this deployment. Place the point on the map instead.';
	}
	if (status === 429) {
		return 'Address lookup is rate limited right now. Try again shortly, or place the point on the map.';
	}
	if (error === 'invalid_query') {
		return 'Enter more of the address before looking it up.';
	}
	if (status >= 500) {
		return 'The address lookup service is unavailable. Place the point on the map instead.';
	}
	return 'Unable to geocode address. Place the point on the map instead.';
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
