/**
 * The family's one legend, on Monthly alone: a two-swatch row at the right
 * of the trend heading, the picked month's year in the period role and the
 * year before in the comparison role. Not inside each panel, because twelve
 * panels would say it twelve times; Today and Annual plot one series and
 * carry none. The swatches read the two chart roles as `var()`, the way the
 * marks do.
 */

export function OverviewLegend({ year }: { readonly year: number }) {
	return (
		<ul className="m-0 flex list-none items-center gap-3 p-0">
			<Swatch color="var(--chart-period)" label={`${year}`} />
			<Swatch color="var(--chart-comparison)" label={`${year - 1}`} />
		</ul>
	);
}

function Swatch({ color, label }: { readonly color: string; readonly label: string }) {
	return (
		<li className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
			<span
				aria-hidden="true"
				className="inline-block size-2.5 rounded-[2px]"
				style={{ backgroundColor: color }}
			/>
			{label}
		</li>
	);
}
