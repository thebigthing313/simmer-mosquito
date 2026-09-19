import { mapInteraction } from '@simmer-mosquito/design-tokens';
import { createWeatherStationCommand } from '@simmer-mosquito/domain';
import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { WeatherStationFields } from '../../../hooks/mutations/use-weather-station-mutations';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	FORM_VALIDATION_GEOMETRY,
} from '../../../lib/domain-validation';
import { CustomFieldsSection } from '../../forms/custom-fields-section';
import { LocationBand } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';

/**
 * Domain issue path to the form field holding it. Geometry is placed on the
 * map, so its issues land on the form alert.
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
	readonly onSave: (input: {
		readonly values: WeatherStationFormValues;
		readonly geometry: DrawGeometry | null;
		/** True when the user placed or moved the point this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

/**
 * The form's values, as the write seam takes them. The code is empty-to-null:
 * it is unique per organization where non-null, so two blank codes would
 * collide as empty strings.
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
 * Adding or editing a weather station. Point-only, by the domain's rule, and
 * with no Address reference: the station stores the coordinates it was given.
 */
export function WeatherStationFormPage({
	mode,
	canSubmit,
	defaultValues,
	initialGeometry = null,
	header,
	onSave,
}: WeatherStationFormPageProps) {
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
						// The stand-in, not the real `null`: the builder fails a null point with a
						// GeoJSON message that pre-empts the whole validator. The absence of a point
						// is this form's to report, against the map.
						geometry: geometry ?? FORM_VALIDATION_GEOMETRY,
					}),
				STATION_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			if (!location.requireGeometry() || geometry === null) {
				return;
			}
			await onSave({ values: value, geometry, geometryChanged: location.geometryChanged });
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit} />
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

				{/*
				 * Point-only, by the domain's rule, and stated on the map rather than
				 * typed: a station is a thermometer on a post, and the coordinates it
				 * stores are the ones somebody placed.
				 */}
				<LocationBand
					description="Place the station where it stands."
					geometryKind="weatherStation"
					label="Location"
					location={location}
					title="Station location"
				/>

				<CustomFieldsSection
					description="Optional structured notes, like the gauge model or who maintains it."
					form={form}
					framed={false}
				/>
			</RecordFormPage>
		</form.AppForm>
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

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';
