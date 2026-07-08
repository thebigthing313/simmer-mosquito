import { boundsFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { AddressRow, CollectionLureRow, CollectionMethodRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
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

export type TrapLocationMode = 'address' | 'point';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noLureValue = 'none';

export interface TrapFormValues {
	readonly locationMode: TrapLocationMode;
	/** The target address when `locationMode === 'address'`. */
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
	/** Ad-hoc point to pre-fill on edit; create starts with none. */
	readonly initialAdhocGeometry?: DrawGeometry | null;
	/** Geometry to frame the map on immediately (edit pre-fill). */
	readonly initialPreviewGeometry?: GeoJsonGeometry | null;
	/** Edit locks the address/point choice — the two are distinct command paths. */
	readonly lockLocationMode?: boolean;
	/**
	 * Whether a location must be set to submit. Create requires one; edit leaves it
	 * optional so a trap keeps its existing location unless the user changes it.
	 */
	readonly requireLocation?: boolean;
	readonly header: TrapFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: TrapFormValues;
		readonly adhocGeometry: DrawGeometry | null;
		/** Centroid of the selected address (address mode), for the optimistic row. */
		readonly addressCoord: { readonly lat: number; readonly lng: number } | null;
	}) => Promise<void>;
}

export function defaultTrapFormValues(): TrapFormValues {
	return {
		locationMode: 'address',
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
	initialAdhocGeometry = null,
	initialPreviewGeometry = null,
	lockLocationMode = false,
	requireLocation = true,
	header,
	submitLabel,
	onSave,
}: TrapFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [adhocGeometry, setAdhocGeometry] = useState<DrawGeometry | null>(initialAdhocGeometry);
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
			if (requireLocation && value.locationMode === 'address' && value.addressId === null) {
				setLocationError('Select the address this trap is placed at.');
				return;
			}
			if (requireLocation && value.locationMode === 'point' && adhocGeometry === null) {
				setLocationError('Drop a point on the map for this trap.');
				return;
			}
			try {
				await onSave({
					values: value,
					adhocGeometry: value.locationMode === 'point' ? adhocGeometry : null,
					addressCoord: value.locationMode === 'address' ? addressCoord : null,
				});
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save trap.');
			}
		},
	});

	const handleAddressSelected = useCallback((address: AddressRow | null) => {
		setLocationError(null);
		if (address === null || typeof address.lat !== 'number' || typeof address.lng !== 'number') {
			setPreviewGeometry(null);
			setAddressCoord(null);
			return;
		}
		setAddressCoord({ lat: address.lat, lng: address.lng });
		setPreviewGeometry({ type: 'Point', coordinates: [address.lng, address.lat] });
	}, []);

	const requestAdhocPoint = useCallback(async () => {
		setLocationError(null);
		try {
			const point = await requestPoint('Click the map to place the trap point.');
			setAdhocGeometry(point);
			setPreviewGeometry(point as unknown as GeoJsonGeometry);
		} catch {
			// Draw cancelled (Esc / mode switch); keep the prior point.
		}
	}, [requestPoint]);

	const clearAdhoc = useCallback(() => {
		setAdhocGeometry(null);
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
				<header className="sticky top-0 z-10 grid gap-2 border-border/50 border-b bg-background/95 px-5 py-4 backdrop-blur-sm">
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
							<form.FormErrorAlert title="Unable to save trap" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to save trap</AlertTitle>
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
										Anchor the trap to an existing address, or drop an ad-hoc point.
									</span>
								</div>

								<form.AppField name="locationMode">
									{(field) => (
										<ToggleGroup
											aria-label="Location mode"
											className="w-full"
											disabled={lockLocationMode}
											onValueChange={(next) => {
												if (next === 'address' || next === 'point') {
													field.handleChange(next);
												}
											}}
											size="sm"
											type="single"
											value={field.state.value}
											variant="outline"
										>
											<ToggleGroupItem className="flex-1 text-xs" value="address">
												Address
											</ToggleGroupItem>
											<ToggleGroupItem className="flex-1 text-xs" value="point">
												Ad-hoc point
											</ToggleGroupItem>
										</ToggleGroup>
									)}
								</form.AppField>

								<form.Subscribe selector={(state) => state.values.locationMode}>
									{(locationMode) =>
										locationMode === 'address' ? (
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
										) : (
											<AdhocPointControl
												geometry={adhocGeometry}
												isDrawing={draw.isRequestingPoint}
												onClear={clearAdhoc}
												onRequestPoint={requestAdhocPoint}
											/>
										)
									}
								</form.Subscribe>

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

function AdhocPointControl({
	geometry,
	isDrawing,
	onRequestPoint,
	onClear,
}: {
	readonly geometry: DrawGeometry | null;
	readonly isDrawing: boolean;
	readonly onRequestPoint: () => void;
	readonly onClear: () => void;
}) {
	return (
		<div className="grid gap-2 rounded-md border border-border/40 bg-background/70 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					<MapPinnedIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
					<p className="m-0 min-w-0 text-foreground text-sm">
						{geometry === null ? 'No point placed yet.' : adhocPointSummary(geometry)}
					</p>
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
					{geometry === null ? 'Drop point' : 'Replace point'}
				</Button>
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

function adhocPointSummary(geometry: DrawGeometry): string {
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
