import {
	boundsFromGeoJson,
	collectImportGroups,
	countGeoJsonVertices,
	formatBoundingBox,
	type GeoJsonGeometry,
	type GeoJsonPoint,
	type ImportGeometryKind,
	importCandidatesFrom,
	isWgs84Geometry,
	readImportFileText,
} from '@simmer-mosquito/mapping';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useId, useRef, useState } from 'react';

const UploadIcon = iconRegistry.actions.upload.icon;
const CheckIcon = iconRegistry.actions.check.icon;

/**
 * Geometry, without a map.
 *
 * The agency workspace draws boundaries on a Mapbox canvas. The console
 * deliberately has none: `components/map` and `use-map-draw` are inseparable
 * from `mapbox-gl`, which is 1.7 MB and would land in the boot payload of a
 * console whose every other page is a table. It is also the wrong tool here — an
 * operator standing an agency up is loading the boundary file the customer sent,
 * not tracing a district freehand.
 *
 * Shapes therefore come from a KML, KMZ, or GeoJSON file, parsed with the shared
 * `@simmer-mosquito/mapping` importer (the same parser the web app's bulk region
 * import uses), and single points come from typed coordinates. Both read back
 * what was understood before anything is saved: with no map to check against,
 * the type, vertex count, and bounds are the only way to catch a file that
 * parsed cleanly but is not the district anyone meant.
 */

/** Shape entry — polygons and lines, from a KML/KMZ/GeoJSON file or pasted GeoJSON. */
export function GeometryFileInput({
	label,
	description,
	kinds,
	value,
	onChange,
}: {
	readonly label: string;
	readonly description: string;
	/** Which geometries this record accepts. Everything else in the file is skipped. */
	readonly kinds: readonly ImportGeometryKind[];
	readonly value: GeoJsonGeometry | null;
	readonly onChange: (geometry: GeoJsonGeometry | null) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [paste, setPaste] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [source, setSource] = useState<string | null>(null);
	const pasteId = useId();

	function parse(text: string, fileName: string) {
		const groups = collectImportGroups(text, fileName, kinds);
		if (groups.error !== undefined) {
			setError(groups.error);
			return;
		}

		const result = importCandidatesFrom(groups.groups, { limit: 1, fallbackName: fileName });
		const [first] = result.candidates;
		if (first === undefined) {
			const wanted = kinds.join(' or ').toLowerCase();
			setError(
				result.skipped > 0
					? `No ${wanted} in ${fileName}. ${result.skipped} ${result.skipped === 1 ? 'geometry of another kind was' : 'geometries of other kinds were'} skipped.`
					: `No ${wanted} found in ${fileName}.`,
			);
			return;
		}

		if (!isWgs84Geometry(first.geometry)) {
			setError(
				'Those coordinates fall outside the WGS84 range, so the file is probably in a projected coordinate system. Reproject it to EPSG:4326 and try again.',
			);
			return;
		}

		if (result.truncated) {
			setError(null);
		}

		setSource(
			result.candidates.length < result.skipped + 1 || result.truncated
				? `${fileName} (first shape of several)`
				: fileName,
		);
		onChange(first.geometry as GeoJsonGeometry);
	}

	async function handleFile(file: File) {
		try {
			parse(await readImportFileText(file), file.name);
		} catch (cause) {
			// An unreadable archive says why (wrong format, encrypted, no KML inside);
			// anything else has nothing worth relaying.
			setError(cause instanceof Error ? cause.message : 'That file could not be read.');
		}
	}

	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<FieldDescription>{description}</FieldDescription>

			<div className="grid gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<Button onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
						<UploadIcon aria-hidden="true" data-icon="inline-start" />
						Choose KML, KMZ, or GeoJSON file
					</Button>
					{value === null ? null : (
						<Button
							onClick={() => {
								onChange(null);
								setSource(null);
								setError(null);
							}}
							type="button"
							variant="ghost"
						>
							Clear
						</Button>
					)}
				</div>
				<input
					accept=".kml,.kmz,.json,.geojson,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
					className="sr-only"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file !== undefined) {
							void handleFile(file);
						}
						// Reset so re-picking the same file fires change again.
						event.target.value = '';
					}}
					ref={fileInputRef}
					type="file"
				/>

				<div className="grid gap-2">
					<label className="text-muted-foreground text-xs" htmlFor={pasteId}>
						…or paste GeoJSON
					</label>
					<Textarea
						className="font-mono text-xs"
						id={pasteId}
						onChange={(event) => setPaste(event.target.value)}
						placeholder='{"type":"Polygon","coordinates":[[[-122.4,37.8],…]]}'
						rows={3}
						value={paste}
					/>
					<div className="flex justify-end">
						<Button
							disabled={paste.trim() === ''}
							onClick={() => parse(paste, 'pasted.geojson')}
							size="sm"
							type="button"
							variant="outline"
						>
							Use pasted geometry
						</Button>
					</div>
				</div>

				{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
				{value === null ? null : <GeometrySummary from={source} geometry={value} />}
			</div>
		</Field>
	);
}

/**
 * Point entry — two coordinate fields.
 *
 * A trap or an address is one location. Asking for a file to carry a single
 * point would be ceremony; a latitude and a longitude are what the operator has
 * in front of them, usually copied from the customer's own records.
 */
export function PointInput({
	label,
	description,
	value,
	onChange,
}: {
	readonly label: string;
	readonly description: string;
	readonly value: GeoJsonPoint | null;
	readonly onChange: (point: GeoJsonPoint | null) => void;
}) {
	const [latitude, setLatitude] = useState(value === null ? '' : String(value.coordinates[1]));
	const [longitude, setLongitude] = useState(value === null ? '' : String(value.coordinates[0]));
	const latId = useId();
	const lngId = useId();

	function commit(nextLat: string, nextLng: string) {
		setLatitude(nextLat);
		setLongitude(nextLng);

		const lat = Number.parseFloat(nextLat);
		const lng = Number.parseFloat(nextLng);
		const valid =
			Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

		onChange(valid ? { type: 'Point', coordinates: [lng, lat] } : null);
	}

	const touched = latitude !== '' || longitude !== '';
	const invalid = touched && value === null;

	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<FieldDescription>{description}</FieldDescription>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="grid gap-1.5">
					<label className="text-muted-foreground text-xs" htmlFor={latId}>
						Latitude
					</label>
					<Input
						id={latId}
						inputMode="decimal"
						onChange={(event) => commit(event.target.value, longitude)}
						placeholder="37.7749"
						value={latitude}
					/>
				</div>
				<div className="grid gap-1.5">
					<label className="text-muted-foreground text-xs" htmlFor={lngId}>
						Longitude
					</label>
					<Input
						id={lngId}
						inputMode="decimal"
						onChange={(event) => commit(latitude, event.target.value)}
						placeholder="-122.4194"
						value={longitude}
					/>
				</div>
			</div>
			{invalid ? (
				<p className="m-0 text-destructive text-sm">
					Enter a latitude between -90 and 90 and a longitude between -180 and 180.
				</p>
			) : null}
		</Field>
	);
}

/**
 * What was parsed, in the terms that would reveal a wrong file: the geometry
 * type, how many vertices it carries, and where on earth it sits.
 */
function GeometrySummary({
	geometry,
	from,
}: {
	readonly geometry: GeoJsonGeometry;
	readonly from: string | null;
}) {
	const bounds = boundsFromGeoJson(geometry);

	return (
		<div className="grid gap-1 rounded-md border border-success/30 bg-success/5 p-3">
			<p className="m-0 flex items-center gap-1.5 font-medium text-foreground text-sm">
				<CheckIcon aria-hidden="true" className="size-4 text-success" />
				{geometry.type} ready{from === null ? '' : ` from ${from}`}
			</p>
			<p className="m-0 text-muted-foreground text-xs tabular-nums">
				{countGeoJsonVertices(geometry)} vertices
				{bounds === null ? '' : ` · ${formatBoundingBox(bounds, 4)}`}
			</p>
		</div>
	);
}
