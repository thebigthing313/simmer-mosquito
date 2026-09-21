/**
 * PROTOTYPE. One chart for one row of the table, at whichever grain the page
 * is on: the year's days as an area on Today, twelve months beside last year
 * on Monthly, the years on Annual. A bar opens its own period at the page's grain.
 */

import { type ChartOptions, DaysArea, MonthsBars, YearsBars } from './prototype-charts';
import {
	formatRatioTick,
	type Period,
	type RatioKey,
	ratioSeries,
	type TypeSpec,
	typeSeries,
} from './prototype-data';
import { seriesLabels } from './prototype-page';

export type RowSubject =
	| { readonly kind: 'type'; readonly type: TypeSpec }
	| { readonly kind: 'ratio'; readonly ratio: RatioKey };

export function rowKey(subject: RowSubject): string {
	return subject.kind === 'type' ? subject.type.key : subject.ratio;
}

export function TypeChart({
	subject,
	period,
	options,
	openPeriod,
}: {
	readonly subject: RowSubject;
	readonly period: Period;
	readonly options: ChartOptions;
	readonly openPeriod: (period: Period) => void;
}) {
	const series =
		subject.kind === 'type' ? typeSeries(subject.type, period) : ratioSeries(subject.ratio, period);
	const format =
		subject.kind === 'ratio' ? (v: number) => formatRatioTick(subject.ratio, v) : undefined;
	const chartOptions: ChartOptions = { ...options, format };
	const labels = seriesLabels(period);

	if (period.grain === 'day') {
		return (
			<DaysArea
				label={labels.period}
				onPointClick={(point) => {
					const [year, month, day] = point.date.split('-').map(Number);
					if (year && month && day) openPeriod({ grain: 'day', year, month, day });
				}}
				options={chartOptions}
				points={series.days}
			/>
		);
	}
	if (period.grain === 'month') {
		return (
			<MonthsBars
				comparisonLabel={labels.comparison}
				onBarClick={(point) => {
					if (point.reached) {
						openPeriod({ grain: 'month', year: period.year, month: point.month, day: 1 });
					}
				}}
				options={chartOptions}
				periodLabel={labels.period}
				points={series.months}
			/>
		);
	}
	return (
		<YearsBars
			label={labels.period}
			onBarClick={(point) => openPeriod({ grain: 'year', year: point.year, month: 1, day: 1 })}
			options={chartOptions}
			points={series.years}
		/>
	);
}
