/**
 * The family's one legend, at the right of the trend heading. Monthly draws
 * three swatches, the picked month's year in the period role, the year
 * before in the comparison role and the five-year average in the average
 * role; Annual draws the average's dashed line alone, since its bars are
 * named by the axis; Today draws nothing. The average's entry is left out
 * when no chart it speaks for draws one. Takes the grain, the picked
 * period's year and whether an average is drawn. `docs/web-components.md`
 * says why it is not inside each panel.
 */

import type { OverviewGrain } from '@simmer-mosquito/domain';
import { averageLabel } from './overview-data';

export function OverviewLegend({
	grain,
	year,
	average,
}: {
	readonly grain: OverviewGrain;
	readonly year: number;
	/** Whether any chart the legend speaks for draws the average. */
	readonly average: boolean;
}) {
	if (grain === 'day' || (grain === 'year' && !average)) {
		return null;
	}
	return (
		<ul className="m-0 flex list-none flex-wrap items-center gap-3 p-0">
			{grain === 'month' ? (
				<>
					<Swatch className="bg-chart-period" label={`${year}`} />
					<Swatch className="bg-chart-comparison" label={`${year - 1}`} />
					{average ? <Swatch className="bg-chart-average" label={averageLabel(year)} /> : null}
				</>
			) : (
				<li className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
					<span
						aria-hidden="true"
						className="inline-block w-4 border-chart-average border-t-2 border-dashed"
					/>
					{averageLabel(year)}
				</li>
			)}
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
