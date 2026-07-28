// Presentational pieces every control-action form shares. Each form owns its own
// fields and `useAppForm` instance; only the chrome around them lives here.
//
// Geometry capture is NOT here: control actions own Point/LineString/Polygon
// geometry (see `OWNED_GEOMETRY_POLICIES` in `packages/domain/src/shared.ts`),
// and the shared `GeometryControl` in `components/map/geometry-control` serves
// every record with that policy — control actions and ad-hoc inspections alike.

export function FormSection({
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

/** Trim a form text value down to the nullable column it maps to. */
export function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
