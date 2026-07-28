import { boundsFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { AddressRow, CollectionLureRow, CollectionMethodRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	ArrowLeftIcon,
	CheckIcon,
	Loader2Icon,
	MapPinnedIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import { AddressPicker } from '../-adult-pickers';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noLureValue = 'none';

export interface TrapFormValues {
	/**
	 * Optional address the trap is at — reference data only. The trap's own point
	 * (its geometry) is the authoritative location and can be refined off the
	 * address (to a backyard, treeline, etc.).
	 */
	readonly addressId: string | null;
	/** A collection method id, or '' when unset (placeholder shown). */
	readonly collectionMethodId: string;
	/** `noLureValue` or a collection lure id. */
	readonly collectionLureId: string;
	readonly trapName: string;
	readonly trapCode: string;
	readonly description: string;
	readonly isActive: boolean;
}

export interface TrapFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/adult-surveillance/traps' | '/adult-surveillance/traps/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface TrapFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly collectionMethods: readonly CollectionMethodRow[];
	readonly collectionLures: readonly CollectionLureRow[];
	readonly defaultValues: TrapFormValues;
	/** The trap's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/** Geometry to frame the map on immediately (edit pre-fill). */
	readonly initialPreviewGeometry?: GeoJsonGeometry | null;
	/**
	 * Whether a point must be set to submit. Create requires one; edit leaves it
	 * optional so a trap keeps its existing point unless the user refines it.
	 */
	readonly requireLocation?: boolean;
	readonly header: TrapFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: TrapFormValues;
		/** The trap's point. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user placed, moved, or cleared the point this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultTrapFormValues(): TrapFormValues {
	return {
		addressId: null,
		collectionMethodId: '',
		collectionLureId: noLureValue,
		trapName: '',
		trapCode: '',
		description: '',
		isActive: true,
	};
}

export function TrapFormPage({
	organizationId,
	canSubmit,
	collectionMethods,
	collectionLures,
	defaultValues,
	initialGeometry = null,
	initialPreviewGeometry = null,
	requireLocation = true,
	header,
	submitLabel,
	onSave,
}: TrapFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [previewGeometry, setPreviewGeometry] = useState<GeoJsonGeometry | null>(
		initialPreviewGeometry,
	);
	const [addressCoord, setAddressCoord] = useState<{
		readonly lat: number;
		readonly lng: number;
	} | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const draw = useMapDraw({ map, isLoaded: map !== null, value: null, onChange: () => undefined });
	const { requestPoint } = draw;

	useFitToGeometry(map, previewGeometry);

	const activeMethods = useMemo(
		() => collectionMethods.filter((method) => method.isActive),
		[collectionMethods],
	);
	const activeLures = useMemo(
		() => collectionLures.filter((lure) => lure.isActive),
		[collectionLures],
	);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			if (value.collectionMethodId === '') {
				setSaveError('Select the collection method for this trap.');
				return;
			}
			if (requireLocation && geometry === null) {
				setLocationError('Place the trap point on the map.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save trap.');
			}
		},
	});

	// Selecting an address never overwrites a point the user already placed — the
	// address is reference only. It just frames the map and, when no point exists
	// yet, seeds one at the address so the required geometry starts somewhere sane.
	const handleAddressSelected = useCallback(
		(address: AddressRow | null) => {
			setLocationError(null);
			if (address === null || typeof address.lat !== 'number' || typeof address.lng !== 'number') {
				setAddressCoord(null);
				return;
			}
			const coord = { lat: address.lat, lng: address.lng };
			setAddressCoord(coord);
			if (geometry === null) {
				setGeometry({ type: 'Point', coordinates: [coord.lng, coord.lat] });
				setGeometryChanged(true);
				setPreviewGeometry({ type: 'Point', coordinates: [coord.lng, coord.lat] });
			}
		},
		[geometry],
	);

	const requestTrapPoint = useCallback(async () => {
		setLocationError(null);
		try {
			const point = await requestPoint('Click the map to place the trap point.');
			setGeometry(point);
			setGeometryChanged(true);
			setPreviewGeometry(point as unknown as GeoJsonGeometry);
		} catch {
			// Draw cancelled (Esc / mode switch); keep the prior point.
		}
	}, [requestPoint]);

	const moveToAddress = useCallback(() => {
		if (addressCoord === null) {
			return;
		}
		const point: DrawGeometry = {
			type: 'Point',
			coordinates: [addressCoord.lng, addressCoord.lat],
		};
		setGeometry(point);
		setGeometryChanged(true);
		setPreviewGeometry(point as unknown as GeoJsonGeometry);
	}, [addressCoord]);

	const clearPoint = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
		setPreviewGeometry(null);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={previewGeometry as unknown as GeoJSON.GeoJSON | null}
						onMapReady={handleMapReady}
					/>
					{draw.isRequestingPoint ? (
						<MapPrompt>
							<MapPinnedIcon aria-hidden="true" className="size-4 text-primary" />
							Click the map to place the trap point. Press Esc to cancel.
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
					<form.AppForm>
						<form
							className="grid gap-6"
							onSubmit={(event) => {
								event.preventDefault();
								void form.handleSubmit();
							}}
						>
							<form.FormErrorAlert title="Unable to Save Trap" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to Save Trap</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<section
								aria-labelledby="trap-location-label"
								className={cn(
									'grid gap-4 rounded-md border bg-muted/30 p-4',
									locationError === null ? 'border-border/50' : 'border-destructive/60',
								)}
							>
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="trap-location-label"
									>
										Location
									</span>
									<span className="text-muted-foreground text-xs">
										The point is the trap’s exact location. An address is optional reference —
										refine the point off it to the precise spot.
									</span>
								</div>

								<div className="grid gap-1.5">
									<span className="font-medium text-foreground text-sm">Address (optional)</span>
									<form.AppField name="addressId">
										{(field) => (
											<AddressPicker
												onSelect={(address) => {
													field.handleChange(address?.id ?? null);
													handleAddressSelected(address);
												}}
												organizationId={organizationId}
												value={field.state.value}
											/>
										)}
									</form.AppField>
								</div>

								<PointControl
									canMoveToAddress={addressCoord !== null}
									geometry={geometry}
									isDrawing={draw.isRequestingPoint}
									onClear={clearPoint}
									onMoveToAddress={moveToAddress}
									onRequestPoint={requestTrapPoint}
								/>

								{locationError === null ? null : (
									<p className="m-0 text-destructive text-sm">{locationError}</p>
								)}
							</section>

							<FormSection title="Configuration">
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="collectionMethodId">
										{(field) => (
											<field.SelectField
												label="Collection method"
												options={activeMethods.map((method) => ({
													label: method.name,
													value: method.id,
												}))}
												placeholder="Select method"
											/>
										)}
									</form.AppField>
									<form.AppField name="collectionLureId">
										{(field) => (
											<field.SelectField
												label="Lure (optional)"
												options={lureOptions(activeLures)}
												placeholder="No lure"
											/>
										)}
									</form.AppField>
								</div>
							</FormSection>

							<FormSection title="Identity">
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="trapName">
										{(field) => (
											<field.TextField
												label="Trap name (optional)"
												placeholder="e.g. North Basin CDC"
											/>
										)}
									</form.AppField>
									<form.AppField name="trapCode">
										{(field) => (
											<field.TextField label="Trap code (optional)" placeholder="e.g. NB-01" />
										)}
									</form.AppField>
								</div>
								<form.AppField name="description">
									{(field) => (
										<field.TextareaField
											description="Access notes, mounting details, or anything crews should know."
											label="Description (optional)"
											placeholder="Add a description for this trap…"
											rows={3}
										/>
									)}
								</form.AppField>
								<form.AppField name="isActive">
									{(field) => (
										<field.SwitchField
											description="Inactive traps stay on record but drop out of active surveillance."
											label="Active"
										/>
									)}
								</form.AppField>
							</FormSection>

							<div className="border-border/50 border-t pt-5">
								<form.FormActions>
									<form.ResetButton />
									<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
								</form.FormActions>
							</div>
						</form>
					</form.AppForm>
				</div>
			</div>
		</MapSplitPage>
	);
}

// --- location controls ------------------------------------------------------

export function PointControl({
	geometry,
	isDrawing,
	canMoveToAddress,
	onRequestPoint,
	onMoveToAddress,
	onClear,
}: {
	readonly geometry: DrawGeometry | null;
	readonly isDrawing: boolean;
	readonly canMoveToAddress: boolean;
	readonly onRequestPoint: () => void;
	readonly onMoveToAddress: () => void;
	readonly onClear: () => void;
}) {
	return (
		<div className="grid gap-2 rounded-md border border-border/40 bg-background/70 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					<MapPinnedIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
					<div className="grid min-w-0 gap-0.5">
						<span className="font-medium text-foreground text-sm">Point (required)</span>
						<p className="m-0 min-w-0 text-muted-foreground text-xs">
							{geometry === null ? 'No point placed yet.' : pointSummary(geometry)}
						</p>
					</div>
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
					disabled={isDrawing}
					onClick={onRequestPoint}
					size="sm"
					type="button"
					variant={geometry === null ? 'default' : 'outline'}
				>
					{isDrawing ? (
						<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
					) : (
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
					)}
					{geometry === null ? 'Drop point' : 'Refine point'}
				</Button>
				{canMoveToAddress ? (
					<Button onClick={onMoveToAddress} size="sm" type="button" variant="ghost">
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
						Move to Address
					</Button>
				) : null}
				{geometry === null ? null : (
					<Button onClick={onClear} size="sm" type="button" variant="ghost">
						<XIcon aria-hidden="true" data-icon="inline-start" />
						Clear
					</Button>
				)}
			</div>
		</div>
	);
}

// --- reusable form controls -------------------------------------------------

function FormSection({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
			{children}
		</section>
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

function lureOptions(lures: readonly CollectionLureRow[]) {
	return [
		{ label: 'No lure', value: noLureValue },
		...lures.map((lure) => ({ label: lure.name, value: lure.id })),
	];
}

function pointSummary(geometry: DrawGeometry): string {
	if (geometry.type !== 'Point') {
		return 'Point placed';
	}
	const coordinates = geometry.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length < 2) {
		return 'Point placed';
	}
	return `Point · ${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

function useFitToGeometry(map: MapboxMap | null, geometry: GeoJsonGeometry | null): void {
	const lastFitRef = useRef<string | null>(null);
	useEffect(() => {
		if (map === null || geometry === null) {
			return;
		}
		const signature = JSON.stringify(geometry);
		if (lastFitRef.current === signature) {
			return;
		}
		lastFitRef.current = signature;

		const bounds = boundsFromGeoJson(geometry);
		if (bounds === null) {
			return;
		}
		const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
		if (hasArea) {
			map.fitBounds(
				[
					[bounds.west, bounds.south],
					[bounds.east, bounds.north],
				],
				{ padding: 80, maxZoom: 17, duration: 600 },
			);
		} else {
			map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
		}
	}, [map, geometry]);
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';
