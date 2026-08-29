import { mapInteraction } from '@simmer-mosquito/design-tokens';
import { createWeatherStationCommand } from '@simmer-mosquito/domain';
import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import {
	LocationSection as LocationBand,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useState } from 'react';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	POINT_DRAW_TYPES,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	FORM_VALIDATION_GEOMETRY,
} from '../../../forms/domain-validation';
import type { WeatherStationFields } from '../../../hooks/mutations/use-weather-station-mutations';

/**
 * Domain issue path → the form field holding it. Geometry is placed on the map,
 * so its issues land on the form alert rather than a field.
 */
const STATION_FIELD_PATHS: Readonly<Record<string, string>> = {
	stationName: 'name',
	stationCode: 'code',
	metadata: 'metadata',
};

export interface WeatherStationFormValues {
	readonly name: string;
	readonly code: string;
	readonly metadata: MetadataValue;
}

export interface WeatherStationFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/gis/weather' | '/gis/weather/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface WeatherStationFormPageProps {
	readonly mode: 'create' | 'edit';
	readonly canSubmit: boolean;
	readonly defaultValues: WeatherStationFormValues;
	/** The station's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	readonly header: WeatherStationFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: WeatherStationFormValues;
		readonly geometry: DrawGeometry | null;
		/** True when the user placed or moved the point this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

/**
 * The form's values, as the write seam takes them.
 *
 * The code is empty-to-null rather than empty-to-empty. It is unique per agency
 * where it is non-null, so a second station saved with a blank code box would
 * collide with the first if the empty string were stored.
 */
export function weatherStationFieldsFrom(values: WeatherStationFormValues): WeatherStationFields {
	const code = values.code.trim();
	return {
		name: values.name.trim(),
		code: code.length === 0 ? null : code,
		metadata: values.metadata ?? null,
	};
}

export function defaultWeatherStationFormValues(): WeatherStationFormValues {
	return { name: '', code: '', metadata: null };
}

/**
 * Adding or editing a weather station.
 *
 * Point-only, by the domain's rule: a station is a thermometer on a post, not an
 * area. It also does not reference an Address, looking one up is a fine way to
 * find the spot on the map, but the station stores the coordinates it was given
 * rather than borrowing an address's.
 */
export function WeatherStationFormPage({
	mode,
	canSubmit,
	defaultValues,
	initialGeometry = null,
	header,
	submitLabel,
	onSave,
}: WeatherStationFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [geometryError, setGeometryError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setGeometryError(null);
		}
	}, []);

	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start } = draw;

	useFitToGeometry(map, geometry, draw.isDrawing);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidator(
				({ value }: { readonly value: WeatherStationFormValues }) =>
					createWeatherStationCommand({
						...FORM_VALIDATION_CONTEXT,
						weatherStationId: FORM_VALIDATION_CONTEXT.organizationId,
						stationName: value.name,
						stationCode: value.code,
						metadata: value.metadata,
						// The stand-in, not the real `null`. The builder requires a point and
						// fails on a null one with "geometry must be a GeoJSON geometry
						// object", which pre-empts the whole validator, so a form submitted
						// with no name *and* no point complains only about the point, and the
						// form's own guard below never runs to say where to fix it. The
						// absence of a point is this form's to report, against the map.
						geometry: geometry ?? FORM_VALIDATION_GEOMETRY,
					}),
				STATION_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			if (geometry === null) {
				setGeometryError('Place the station on the map before saving.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save weather station.');
			}
		},
	});

	const startDraw = useCallback(() => {
		setGeometryError(null);
		start('Point');
	}, [start]);

	const clearGeometry = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
					</>
				}
				gap="tight"
				header={header}
				aside={
					<>
						<MapCanvas controls={{ layers: false }} onMapReady={handleMapReady} />
						<DrawToolbar controller={draw} geometryType="Point" />
						<MapLegend mode={mode} />
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Weather Station" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Weather Station</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<div className="grid gap-5 sm:grid-cols-2">
					<form.AppField
						name="name"
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? 'Name is required.' : undefined,
						}}
					>
						{(field) => <field.TextField label="Name" required placeholder="e.g. North gauge" />}
					</form.AppField>
					<form.AppField name="code">
						{(field) => (
							<field.TextField
								description="Optional short code, unique across the agency's stations."
								label="Code"
								placeholder="e.g. NG-1"
							/>
						)}
					</form.AppField>
				</div>

				<LocationSection
					controller={draw}
					error={geometryError}
					geometry={geometry}
					onClear={clearGeometry}
					onDraw={startDraw}
				/>

				<form.AppField name="metadata">
					{(field) => (
						<field.MetadataField
							description="Optional structured notes, like the gauge model or who maintains it."
							label="Metadata"
							mode={{ kind: 'manual' }}
						/>
					)}
				</form.AppField>
			</RecordFormPage>
		</form.AppForm>
	);
}

/**
 * Where the station stands.
 *
 * Point-only, by the domain's rule, and stated on the map rather than typed:
 * a station is a thermometer on a post, and the coordinates it stores are the
 * ones somebody placed.
 */
function LocationSection({
	geometry,
	controller,
	error,
	onDraw,
	onClear,
}: {
	readonly geometry: DrawGeometry | null;
	readonly controller: ReturnType<typeof useMapDraw>;
	readonly error: string | null;
	readonly onDraw: () => void;
	readonly onClear: () => void;
}) {
	return (
		<LocationBand
			description="Place the station where it stands."
			error={error}
			gap="tight"
			title="Station location"
		>
			<GeometryControl
				allowedTypes={POINT_DRAW_TYPES}
				controller={controller}
				geometry={geometry}
				geometryType="Point"
				label="Location"
				onClear={onClear}
				onDraw={onDraw}
				required
			/>
		</LocationBand>
	);
}

function MapLegend({ mode }: { readonly mode: 'create' | 'edit' }) {
	return (
		<div className="pointer-events-none absolute bottom-10 left-4 z-10 flex flex-col gap-1.5 rounded-md border border-border/50 bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
			<span className="flex items-center gap-2 text-foreground">
				{/* Same constant the draw layer paints with, so they cannot drift. */}
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full"
					style={{ backgroundColor: mapInteraction.selected }}
				/>
				{mode === 'edit' ? 'This station' : 'New station'}
			</span>
		</div>
	);
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';
