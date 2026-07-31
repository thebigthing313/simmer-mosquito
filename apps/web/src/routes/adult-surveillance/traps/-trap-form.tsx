import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { CollectionLureRow, CollectionMethodRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	POINT_DRAW_TYPES,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawPoint, useAddressPoint } from '../../../components/map/use-address-point';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
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
	requireLocation = true,
	header,
	submitLabel,
	onSave,
}: TrapFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);
	// The draw layer both renders the trap's point and edits it, so the map needs no
	// separate preview feature.
	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start } = draw;

	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const methodOptions = useMemo(
		() =>
			lifecycleOptions(
				collectionMethods,
				(method) => method.isActive,
				(method) => method.name,
			),
		[collectionMethods],
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

	const placeAddressPoint = useCallback((point: DrawPoint) => {
		setGeometry(point);
		setGeometryChanged(true);
	}, []);
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});

	const startDraw = useCallback(() => {
		setLocationError(null);
		start('Point');
	}, [start]);

	const clearPoint = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas controls={{ layers: false }} onMapReady={handleMapReady} />
					<DrawToolbar
						controller={draw}
						geometryType="Point"
						pointPrompt="Click the map to place the trap point."
					/>
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

								<form.AppField name="addressId">
									{(field) => (
										<AddressPicker
											label="Address (optional)"
											onSelect={(address) => {
												field.handleChange(address?.id ?? null);
												setLocationError(null);
												selectAddress(address);
											}}
											organizationId={organizationId}
											value={field.state.value}
										/>
									)}
								</form.AppField>

								<GeometryControl
									allowedTypes={POINT_DRAW_TYPES}
									controller={draw}
									geometry={geometry}
									geometryType="Point"
									label={requireLocation ? 'Point (required)' : 'Point'}
									onClear={clearPoint}
									onDraw={startDraw}
									{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
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
												options={methodOptions}
												placeholder="Select method"
											/>
										)}
									</form.AppField>
									<form.AppField name="collectionLureId">
										{(field) => (
											<field.SelectField
												label="Lure (optional)"
												options={lureOptions(collectionLures)}
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

// --- helpers ----------------------------------------------------------------

function lureOptions(lures: readonly CollectionLureRow[]) {
	return [
		{ label: 'No lure', value: noLureValue },
		...lifecycleOptions(
			lures,
			(lure) => lure.isActive,
			(lure) => lure.name,
		),
	];
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';
