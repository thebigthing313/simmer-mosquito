/**
 * A trend panel's zoom: the button that sits in the panel header and the
 * overlay it opens, which fills the viewport with the panel's title, the same
 * `OverviewChart` at `height="fill"`, and the legend on Monthly and Annual.
 * Takes the panel's title and the chart's own props. A bar click inside the
 * overlay closes it and hands the period to `onOpenPeriod`, so it opens the
 * same destination the panel's chart does. `docs/web-components.md` has the
 * rest.
 */

import { type OverviewGrain, overviewPeriodYear } from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import { OverviewChart, type OverviewChartSeries } from './overview-chart';
import { OverviewLegend } from './overview-legend';

const ExpandIcon = iconRegistry.actions.expand.icon;

/**
 * The shadcn dialog stretched to the viewport less a gutter, so a strip of
 * the backdrop stays to click on.
 */
const FILL_VIEWPORT =
	'top-4 right-4 bottom-4 left-4 flex w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-3 p-4 sm:top-6 sm:right-6 sm:bottom-6 sm:left-6 sm:max-w-none sm:p-6';

export function OverviewChartZoom({
	title,
	grain,
	period,
	series,
	onOpenPeriod,
}: {
	/** The panel's title, which heads the overlay and names the button. */
	readonly title: string;
	readonly grain: OverviewGrain;
	readonly period: string;
	readonly series: OverviewChartSeries;
	readonly onOpenPeriod: (period: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const openFromOverlay = (next: string) => {
		setOpen(false);
		onOpenPeriod(next);
	};
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button aria-label={`Zoom ${title}`} className="-my-1" size="icon-xs" variant="ghost">
					<ExpandIcon aria-hidden="true" />
				</Button>
			</DialogTrigger>
			<DialogContent aria-describedby={undefined} className={FILL_VIEWPORT}>
				<DialogHeader className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1 pr-8">
					<DialogTitle>{title}</DialogTitle>
					<OverviewLegend grain={grain} year={overviewPeriodYear(period)} />
				</DialogHeader>
				<div className="min-h-0 flex-1">
					<OverviewChart
						grain={grain}
						height="fill"
						onOpenPeriod={openFromOverlay}
						period={period}
						series={series}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
