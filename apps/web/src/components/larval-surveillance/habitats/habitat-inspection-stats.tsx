import { isPositiveInspection } from '@simmer-mosquito/domain';
import type { Inspection } from '@simmer-mosquito/sync';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@simmer-mosquito/ui-web/components/ui/chart';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Cell, Pie, PieChart } from 'recharts';
import { liveQueryGcTimeMs } from '../../../hooks/queries/shared';
import { inspections } from '../../../lib/collections/inspections';
import { formatCount } from '../../../lib/format-count';
import { recordNoun } from '../../../lib/record-nouns';

const InspectionIcon = iconRegistry.entities.inspection.icon;

// Minimal projection: the fields a Positive Inspection is decided on.
interface InspectionStatsRow {
	readonly id: string;
	readonly isWet: boolean;
	/** Taken from the row schema rather than a hand-written union. */
	readonly density: Inspection['density'];
	readonly larvaeCount: number | null;
}

type SegmentKey = 'dry' | 'wetNegative' | 'wetPositive';

interface Segment {
	readonly key: SegmentKey;
	readonly label: string;
	readonly color: string;
	readonly count: number;
	readonly percent: number;
}

const chartConfig = {
	count: { label: recordNoun('inspection').titleMany },
	dry: { label: 'Dry', color: 'var(--muted-foreground)' },
	wetNegative: { label: 'Wet, no breeding', color: 'var(--chart-2)' },
	wetPositive: { label: 'Wet, breeding', color: 'var(--chart-5)' },
} satisfies ChartConfig;

function computeSegments(rows: readonly InspectionStatsRow[]): {
	readonly total: number;
	readonly segments: readonly Segment[];
} {
	let dry = 0;
	let wetNegative = 0;
	let wetPositive = 0;
	for (const row of rows) {
		// Dry = not holding water. Wet inspections split on the Positive
		// Inspection rule, which reads abundance and not life stages.
		if (!row.isWet) {
			dry += 1;
		} else if (isPositiveInspection(row)) {
			wetPositive += 1;
		} else {
			wetNegative += 1;
		}
	}

	const total = rows.length;
	const toPercent = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 100));
	const segments: readonly Segment[] = [
		{
			key: 'dry',
			label: chartConfig.dry.label,
			color: chartConfig.dry.color,
			count: dry,
			percent: toPercent(dry),
		},
		{
			key: 'wetNegative',
			label: chartConfig.wetNegative.label,
			color: chartConfig.wetNegative.color,
			count: wetNegative,
			percent: toPercent(wetNegative),
		},
		{
			key: 'wetPositive',
			label: chartConfig.wetPositive.label,
			color: chartConfig.wetPositive.color,
			count: wetPositive,
			percent: toPercent(wetPositive),
		},
	];
	return { total, segments };
}

export function HabitatInspectionStats({ habitatId }: { readonly habitatId: string }) {
	// inspections is an on-demand collection: use the status-gated useLiveQuery
	// pattern (not useLiveSuspenseQuery) to avoid the post-unmount suspense hang.
	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ inspection: inspections() })
				.where(({ inspection }) => eq(inspection.habitat_id, habitatId))
				.select(({ inspection }) => ({
					id: inspection.id,
					isWet: inspection.is_wet,
					density: inspection.density,
					larvaeCount: inspection.larvae_count,
				})),
	});

	const rows: readonly InspectionStatsRow[] = result.data;
	const { total, segments } = computeSegments(rows);

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle className="flex items-center gap-2">
					<InspectionIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					Inspection Summary
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				{result.isError ? (
					<p className="m-0 text-sm text-muted-foreground">Inspection summary is unavailable.</p>
				) : !result.isReady ? (
					<StatsSkeleton />
				) : total === 0 ? (
					<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
						No inspections recorded for this habitat yet.
					</p>
				) : (
					<div className="grid gap-3">
						<div className="relative mx-auto w-full max-w-[200px]">
							<ChartContainer className="aspect-square w-full" config={chartConfig}>
								<PieChart>
									<ChartTooltip
										content={<ChartTooltipContent hideLabel nameKey="key" />}
										cursor={false}
									/>
									<Pie
										data={segments as Segment[]}
										dataKey="count"
										innerRadius={58}
										isAnimationActive={false}
										nameKey="key"
										paddingAngle={2}
										stroke="var(--card)"
										strokeWidth={2}
									>
										{segments.map((segment) => (
											<Cell key={segment.key} fill={segment.color} />
										))}
									</Pie>
								</PieChart>
							</ChartContainer>
							{/* Total lives in the donut hole as an HTML overlay; pointer-events-none
							    keeps the slice tooltip reachable underneath. */}
							<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
								<span className="text-2xl leading-none font-semibold text-foreground tabular-nums">
									{formatCount(total)}
								</span>
								<span className="text-xs text-muted-foreground">
									{total === 1 ? 'inspection' : 'inspections'}
								</span>
							</div>
						</div>

						<dl className="grid gap-2">
							{segments.map((segment) => (
								<div className="flex items-center gap-2 text-sm" key={segment.key}>
									<span
										aria-hidden="true"
										className="size-2.5 shrink-0 rounded-[3px]"
										style={{ backgroundColor: segment.color }}
									/>
									<dt className="text-foreground">{segment.label}</dt>
									<dd className="m-0 ml-auto text-muted-foreground tabular-nums">
										<span className="font-medium text-foreground">
											{formatCount(segment.count)}
										</span>{' '}
										· {segment.percent}%
									</dd>
								</div>
							))}
						</dl>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function StatsSkeleton() {
	return (
		<div className="grid gap-4" aria-hidden="true">
			<Skeleton className="mx-auto aspect-square w-full max-w-[200px] rounded-full" />
			<div className="grid gap-2">
				{[0, 1, 2].map((index) => (
					<Skeleton className="h-4 w-full" key={index} />
				))}
			</div>
		</div>
	);
}
