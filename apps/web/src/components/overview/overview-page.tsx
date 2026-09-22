/**
 * A period-in-review page at one grain: Today, Monthly and Annual are this
 * component with `grain` set. The header carries the picker, the upward line
 * under it names the coarser periods this one sits in, the table reads the
 * period against the periods before it, and the trend section draws one
 * chart per shown row. `docs/today-spec.md` is the brief.
 *
 * The period is the URL's: `?date=`, `?month=` or `?year=`, absent for the
 * current period so a bookmark never pins itself to the day it was made. A
 * malformed or future value is rewritten to the current period, with the
 * address rewritten too, so a link never names a period it does not show; a
 * period before `earliest` is left alone and reads as zeros. The table and
 * the trend answer together, because they are one query.
 */

import {
	currentOverviewPeriod,
	OVERVIEW_PERIOD_PARAM,
	type OverviewGrain,
	type OverviewResponse,
	parseOverviewPeriod,
} from '@simmer-mosquito/domain';
import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useOverview } from '../../hooks/overview/use-overview';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../lib/local-date';
import { OverviewChart, type OverviewChartSeries } from './overview-chart';
import {
	OVERVIEW_DESCRIPTIONS,
	OVERVIEW_LABELS,
	OVERVIEW_RATIO_LABELS,
	OVERVIEW_ROUTES,
	OVERVIEW_TITLES,
	periodDestination,
	periodParamText,
	shownTypes,
	trendHeading,
} from './overview-data';
import { OverviewPicker } from './overview-picker';
import { OverviewTable, type OverviewTableState } from './overview-table';
import { UpwardLine } from './overview-upward-line';

const ChartIcon = iconRegistry.generic.chart.icon;

export function OverviewPage({ grain }: { readonly grain: OverviewGrain }) {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const current = currentOverviewPeriod(grain, today);
	const search = useSearch({ strict: false }) as Record<string, unknown>;
	const navigate = useNavigate();
	const requested = periodParamText(search[OVERVIEW_PERIOD_PARAM[grain]]);
	const parsed = parseOverviewPeriod(grain, requested, today);
	const period = parsed ?? current;

	// A malformed or future period is shown as the current one, and the address
	// says so, the Activity Monitor's rule.
	useEffect(() => {
		if (parsed === null) {
			void navigate({ to: OVERVIEW_ROUTES[grain], search: {}, replace: true });
		}
	}, [grain, navigate, parsed]);

	const pick = (next: string) => {
		void navigate({
			to: OVERVIEW_ROUTES[grain],
			search: next === current ? {} : periodDestination(grain, next).search,
			replace: true,
		});
	};
	const open = (next: string) => {
		void navigate(periodDestination(grain, next));
	};

	const read = useOverview(grain, period);
	// The server's day is the picker's upper bound and the partial test, so a
	// client whose clock disagrees draws the server's day.
	const serverCurrent =
		read.data === undefined ? current : currentOverviewPeriod(grain, read.data.today);
	const state = tableState(read);

	return (
		<div className={pageContainer({ gap: 'overview', measure: 'record', padding: 'page' })}>
			<PageHeader
				actions={
					<OverviewPicker
						current={serverCurrent}
						earliest={earliestPeriod(grain, read.data?.earliest ?? null)}
						grain={grain}
						onPick={pick}
						period={period}
					/>
				}
				description={OVERVIEW_DESCRIPTIONS[grain]}
				eyebrow="Organization"
				icon={ChartIcon}
				title={OVERVIEW_TITLES[grain]}
			/>
			<UpwardLine grain={grain} period={period} />
			<OverviewTable
				dimmed={read.isFetching && !read.isLoading}
				grain={grain}
				period={period}
				state={state}
			/>
			{state.kind === 'ready' ? (
				<TrendSection
					dimmed={read.isFetching}
					grain={grain}
					onOpenPeriod={open}
					period={period}
					response={state.response}
				/>
			) : state.kind === 'loading' ? (
				<TrendSkeleton grain={grain} period={period} />
			) : null}
		</div>
	);
}

function tableState(read: ReturnType<typeof useOverview>): OverviewTableState {
	if (read.isError) {
		return { kind: 'error' };
	}
	if (read.data === undefined) {
		return { kind: 'loading' };
	}
	if (read.data.earliest === null) {
		return { kind: 'empty' };
	}
	return { kind: 'ready', response: read.data };
}

/** The earliest record's date at the page's grain, the picker's lower bound. */
function earliestPeriod(grain: OverviewGrain, earliest: string | null): string | null {
	return earliest === null ? null : currentOverviewPeriod(grain, earliest);
}

const TREND_GRID = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';

function TrendSection({
	grain,
	period,
	response,
	dimmed,
	onOpenPeriod,
}: {
	readonly grain: OverviewGrain;
	readonly period: string;
	readonly response: OverviewResponse;
	readonly dimmed: boolean;
	readonly onOpenPeriod: (period: string) => void;
}) {
	const charts: readonly {
		readonly key: string;
		readonly title: string;
		readonly series: OverviewChartSeries;
	}[] = [
		...shownTypes(response).map((row) => ({
			key: row.type,
			title: OVERVIEW_LABELS[row.type],
			series: { kind: 'count', points: row.series } as const,
		})),
		...response.ratios.map((ratio) => ({
			key: ratio.ratio,
			title: OVERVIEW_RATIO_LABELS[ratio.ratio],
			series: { kind: 'ratio', ratio: ratio.ratio, points: ratio.series } as const,
		})),
	];
	return (
		<section className={cn('grid gap-3', dimmed && 'opacity-60 transition-opacity')}>
			<h2 className="m-0 font-semibold text-foreground text-sm">{trendHeading(grain, period)}</h2>
			<div className={TREND_GRID}>
				{charts.map((chart) => (
					<Panel
						icon={<ChartIcon aria-hidden="true" className="size-4" />}
						key={chart.key}
						title={chart.title}
					>
						<OverviewChart onOpenPeriod={onOpenPeriod} period={period} series={chart.series} />
					</Panel>
				))}
			</div>
		</section>
	);
}

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6', 'sk-7', 'sk-8'] as const;

/**
 * The trend section before the first response: the grid cannot know how
 * many rows will be shown, so it draws one skeleton panel per type and
 * settles to the shown rows on arrival.
 */
function TrendSkeleton({
	grain,
	period,
}: {
	readonly grain: OverviewGrain;
	readonly period: string;
}) {
	return (
		<section className="grid gap-3">
			<h2 className="m-0 font-semibold text-foreground text-sm">{trendHeading(grain, period)}</h2>
			<div aria-hidden="true" className={TREND_GRID}>
				{SKELETON_KEYS.map((key) => (
					<Skeleton className="h-64 w-full rounded-lg" key={key} />
				))}
			</div>
		</section>
	);
}
