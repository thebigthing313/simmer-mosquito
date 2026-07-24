import type { LarvalDensity } from '@simmer-mosquito/sync';
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
import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { webCollections } from '../sync/webCollections';

const InspectionIcon = iconRegistry.entities.inspection.icon;

// Same on-demand collection + gcTime contract as the history card; the subset is
// shared, so this second live query reuses the warm habitat slice.
const statsGcTimeMs = 30_000;

// Minimal projection: just the fields that decide dry / wet-negative / wet-positive.
interface InspectionStatsRow {
	readonly id: string;
	readonly isWet: boolean;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
}

type SegmentKey = 'dry' | 'wetNegative' | 'wetPositive';

interface Segment {
	readonly key: SegmentKey;
	readonly label: string;
	readonly color: string;
	readonly count: number;
	readonly percent: number;
}

// Dry = not holding water. Wet inspections split on breeding evidence: any
// recorded life stage, a positive larvae count, or a non-"none" density means
// immatures were present (wet-positive); otherwise the wet habitat read clean.
function isBreeding(row: InspectionStatsRow): boolean {
	if (
		row.hasEggs ||
		row.hasFirstInstar ||
		row.hasSecondInstar ||
		row.hasThirdInstar ||
		row.hasFourthInstar ||
		row.hasPupae
	) {
		return true;
	}
	if (row.larvaeCount !== null && row.larvaeCount > 0) {
		return true;
	}
	return row.density !== null && row.density !== 'none';
}

const chartConfig = {
	count: { label: 'Inspections' },
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
		if (!row.isWet) {
			dry += 1;
		} else if (isBreeding(row)) {
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
	const result = useLiveQuery(
		{
			gcTime: statsGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: webCollections.inspections })
					.where(({ inspection }) => eq(inspection.habitatId, habitatId))
					.select(({ inspection }) => ({
						id: inspection.id,
						isWet: inspection.isWet,
						density: inspection.density,
						larvaeCount: inspection.larvaeCount,
						hasEggs: inspection.hasEggs,
						hasFirstInstar: inspection.hasFirstInstar,
						hasSecondInstar: inspection.hasSecondInstar,
						hasThirdInstar: inspection.hasThirdInstar,
						hasFourthInstar: inspection.hasFourthInstar,
						hasPupae: inspection.hasPupae,
					})),
		},
		[habitatId],
	);

	const rows = (result.data ?? []) as unknown as readonly InspectionStatsRow[];
	const { total, segments } = useMemo(() => computeSegments(rows), [rows]);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
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
									{total}
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
										<span className="font-medium text-foreground">{segment.count}</span> ·{' '}
										{segment.percent}%
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
