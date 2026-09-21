/**
 * PROTOTYPE variant B, table then charts: one panel holds the comparison
 * table with nothing else in it, and under it a grid of small-multiple
 * panels draws one full chart per row, axes and all. The numbers are read
 * first and the trends second, and a chart has room for its axis.
 */

import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { tableFor } from './prototype-data';
import {
	CountCell,
	columnPeriod,
	Legend,
	periodLabel,
	RatioCellView,
	TableHeadCells,
	type VariantProps,
} from './prototype-page';
import { TypeChart } from './prototype-type-chart';

const TableIcon = iconRegistry.generic.chart.icon;

export function VariantPanels({ grain, period, options, openPeriod }: VariantProps) {
	const table = tableFor(period);
	const trendHeading =
		grain === 'day'
			? `${period.year} by day`
			: grain === 'month'
				? `${period.year} by month, beside ${period.year - 1}`
				: 'By year';
	return (
		<>
			<Panel
				actions={
					table.caption === null ? null : (
						<span className="text-muted-foreground text-xs">{table.caption}</span>
					)
				}
				icon={<TableIcon aria-hidden="true" className="size-4" />}
				title={periodLabel(period)}
			>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-border/60 border-b">
								<th
									className="px-4 py-2 text-left font-medium text-muted-foreground text-xs"
									scope="col"
								>
									Record type
								</th>
								<TableHeadCells headers={table.columns.map((c) => c.header)} />
							</tr>
						</thead>
						<tbody>
							{table.rows.map((row) => (
								<tr className="border-border/40 border-b" key={row.type.key}>
									<th className="px-4 py-2 text-left font-medium" scope="row">
										{row.type.label}
									</th>
									{row.cells.map((cell, i) => (
										<td className="px-3 py-2 text-right" key={table.columns[i]?.key}>
											<CountCell
												at={columnPeriod(period, i)}
												cell={cell}
												emphasis={i === 0}
												type={row.type}
											/>
										</td>
									))}
								</tr>
							))}
							{table.ratios.map((ratio, index) => (
								<tr
									className={cn(
										'border-border/40 border-b',
										index === 0 && 'border-t-2 border-t-border/80',
									)}
									key={ratio.key}
								>
									<th className="px-4 py-2 text-left font-medium" scope="row">
										{ratio.label}
									</th>
									{ratio.cells.map((cell, i) => (
										<td className="px-3 py-2 text-right" key={table.columns[i]?.key}>
											<RatioCellView cell={cell} emphasis={i === 0} ratio={ratio.key} />
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Panel>

			<section className="grid gap-3">
				<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
					<h2 className="m-0 font-semibold text-foreground text-sm">{trendHeading}</h2>
					<Legend comparison={options.comparison} period={period} />
				</div>
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{table.rows.map((row) => (
						<Panel
							icon={<TableIcon aria-hidden="true" className="size-4" />}
							key={row.type.key}
							title={row.type.label}
						>
							<div className="px-3 pt-3 pb-2">
								<TypeChart
									openPeriod={openPeriod}
									options={options}
									period={period}
									subject={{ kind: 'type', type: row.type }}
								/>
							</div>
						</Panel>
					))}
					{table.ratios.map((ratio) => (
						<Panel
							icon={<TableIcon aria-hidden="true" className="size-4" />}
							key={ratio.key}
							title={ratio.label}
						>
							<div className="px-3 pt-3 pb-2">
								<TypeChart
									openPeriod={openPeriod}
									options={options}
									period={period}
									subject={{ kind: 'ratio', ratio: ratio.key }}
								/>
							</div>
						</Panel>
					))}
				</div>
			</section>
		</>
	);
}
