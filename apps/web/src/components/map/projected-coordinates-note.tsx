/**
 * The line both import surfaces use to say what they withheld.
 *
 * Agency exports are often in a projected CRS (State Plane feet, UTM metres).
 * Those coordinates parse as valid GeoJSON but land nowhere on earth, so both
 * the geometry import dialog and the bulk region import drop them before the
 * user can pick one. One component keeps the two surfaces saying the same
 * thing, which is what #444 builds on.
 */
export function ProjectedCoordinatesNote({ count }: { readonly count: number }) {
	if (count === 0) {
		return null;
	}
	return (
		<p className="m-0 text-muted-foreground text-xs">
			{count} {count === 1 ? 'shape uses' : 'shapes use'} coordinates outside the longitude/latitude
			range. Re-export the file as WGS84 (EPSG:4326) to use {count === 1 ? 'it' : 'them'}.
		</p>
	);
}
