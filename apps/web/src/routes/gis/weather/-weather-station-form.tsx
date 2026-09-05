import { mapInteraction } from '@simmer-mosquito/design-tokens';
import { createWeatherStationCommand, getOwnedGeometryPolicy } from '@simmer-mosquito/domain';
import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import {
	LocationSection as LocationBand,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { useState } from 'react';
import { MapCanvas } from '../../../components/map';
import { DrawToolbar, GeometryControl } from '../../../components/map/geometry-control';
import { useDrawLocation } from '../../../components/map/use-draw-location';
import type {
	DrawGeometry,
	DrawGeometryFor,
	DrawGeometryType,
	MapDrawController,
} from '../../../components/map/use-map-draw';
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

/** What a weather station stores, read off the register rather than named here. */
const STATION_LOCATION_SHAPES = getOwnedGeometryPolicy('weatherStation').allowedTypes;

/**
 * Whether a placed shape is one a weather station stores.
 *
 * The draw control takes the same `weatherStation` policy and offers nothing
 * else, so this narrows what the routes hold to what the write seam takes rather
 * than gating a second time. Both halves read the register, for the same reason
 * the Region predicate does: the routes used to ask `type === 'Point'`, which is
 * a copy of the matrix that goes stale the day the policy widens, and on Regions
 * that copy refused a boundary the user could see on the map. `Point` written
 * into the assertion was the last of that copy left.
 */
export function isStationLocation(
	geometry: DrawGeometry,
): geometry is DrawGeometryFor<'weatherStation'> {
	return STATION_LOCATION_SHAPES.includes(geometry.type);
}

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
 * The code is empty-to-null rather than empty-to-empty. It is unique per
 * organization where it is non-null, so a second station saved with a blank
 * code box would collide with the first if the empty string were stored.
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
	const [saveError, setSaveError] = useState<string | null>(null);
	const location = useDrawLocation({
		geometryKind: 'weatherStation',
		initialGeometry,
		missingMessage: 'Place the station on the map before saving.',
	});
	const { draw, geometry, geometryType } = location;

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
			if (!location.requireGeometry() || geometry === null) {
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged: location.geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save weather station.');
			}
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
					</>
				}
				header={header}
				aside={
					<>
						<MapCanvas onMapReady={location.onMapReady} />
						<DrawToolbar
							geometryKind="weatherStation"
							controller={draw}
							geometryType={geometryType}
						/>
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
								description="Optional short code, unique across your stations."
								label="Code"
								placeholder="e.g. NG-1"
							/>
						)}
					</form.AppField>
				</div>

				<LocationSection
					controller={draw}
					error={location.locationError}
					geometry={geometry}
					geometryType={geometryType}
					onClear={location.clear}
					onDraw={location.startDraw}
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
	geometryType,
	controller,
	error,
	onDraw,
	onClear,
}: {
	readonly geometry: DrawGeometry | null;
	readonly geometryType: DrawGeometryType;
	readonly controller: MapDrawController;
	readonly error: string | null;
	readonly onDraw: () => void;
	readonly onClear: () => void;
}) {
	return (
		<LocationBand
			description="Place the station where it stands."
			error={error}
			title="Station location"
		>
			<GeometryControl
				controller={controller}
				geometry={geometry}
				geometryType={geometryType}
				geometryKind="weatherStation"
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
