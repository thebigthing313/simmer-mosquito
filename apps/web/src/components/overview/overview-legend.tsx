/**
 * The family's one legend: a two-swatch row at the right of Monthly's trend
 * heading, the picked month's year in the period role and the year before in
 * the comparison role. Takes the picked month's year. `docs/web-components.md`
 * says why it is not inside each panel.
 */

export function OverviewLegend({ year }: { readonly year: number }) {
	return (
		<ul className="m-0 flex list-none items-center gap-3 p-0">
			<Swatch className="bg-chart-period" label={`${year}`} />
			<Swatch className="bg-chart-comparison" label={`${year - 1}`} />
		</ul>
	);
}

function Swatch({ className, label }: { readonly className: string; readonly label: string }) {
	return (
		<li className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
			<span aria-hidden="true" className={`inline-block size-2.5 rounded-sm ${className}`} />
			{label}
		</li>
	);
}
