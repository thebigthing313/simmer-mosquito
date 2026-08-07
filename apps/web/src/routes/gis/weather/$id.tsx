import type { WeatherSourceRow, WeatherSummaryRow } from '@simmer-mosquito/sync';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import { webCollections } from '../../../sync/webCollections';
import {
	formatMeasure,
	formatRange,
	summaryPeriodLabel,
	weatherSourceTypeLabel,
} from './-weather-display';

export const Route = createFileRoute('/gis/weather/$id')({
	component: RouteComponent,
});

const WeatherIcon = iconRegistry.domains.weather.icon;
const summariesGcTimeMs = 30_000;

function RouteComponent() {
	const { id } = Route.useParams();
	return <WeatherSourceDetail sourceId={id} />;
}

function WeatherSourceDetail({ sourceId }: { readonly sourceId: string }) {
	// weatherSources is an eager collection, so this resolves without a fetch.
	const result = useLiveQuery(
		(query) =>
			query
				.from({ source: webCollections.weatherSources })
				.where(({ source }) => eq(source.id, sourceId))
				.findOne(),
		[sourceId],
	);
	const source = result.data as WeatherSourceRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1000px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link className={backLink()} to="/gis/weather">
					<ArrowLeftIcon aria-hidden="true" />
					Back to Weather
				</Link>
				{!result.isReady ? (
					<DetailSkeleton />
				) : source === undefined ? (
					<RecordUnavailable noun="weather source" reason="not-found" />
				) : (
					<WeatherSourceContent source={source} />
				)}
			</div>
		</div>
	);
}

function WeatherSourceContent({ source }: { readonly source: WeatherSourceRow }) {
	useBreadcrumbLabel(source.id, source.sourceName);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<WeatherIcon aria-hidden="true" className="size-3.5" />
						Weather source
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{source.sourceName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{weatherSourceTypeLabel(source.sourceType)}
					</p>
				</div>
				<Badge tone={source.isActive ? 'success' : 'neutral'} variant="outline">
					{source.isActive ? 'Active' : 'Inactive'}
				</Badge>
			</div>

			<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<WeatherSummariesCard sourceId={source.id} />
				<Card variant="surface">
					<CardHeader className="px-4 py-4">
						<CardTitle>Details</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2.5" padding="compact">
						<DetailRow label="Type">{weatherSourceTypeLabel(source.sourceType)}</DetailRow>
						<DetailRow label="Code">
							{source.sourceCode ?? <span className="text-muted-foreground">Not set</span>}
						</DetailRow>
						<DetailRow label="Provider">
							{source.providerSourceId ?? <span className="text-muted-foreground">Not set</span>}
						</DetailRow>
						<DetailRow label="Status">{source.isActive ? 'Active' : 'Inactive'}</DetailRow>
					</CardContent>
				</Card>
			</div>
		</>
	);
}

function WeatherSummariesCard({ sourceId }: { readonly sourceId: string }) {
	// weatherSummaries is on-demand; status-gated useLiveQuery (not the suspense
	// variant) to avoid the post-unmount hang on on-demand collections.
	const result = useLiveQuery(
		{
			gcTime: summariesGcTimeMs,
			query: (query) =>
				query
					.from({ summary: webCollections.weatherSummaries })
					.where(({ summary }) => eq(summary.weatherSourceId, sourceId))
					.orderBy(({ summary }) => summary.endDate, 'desc'),
		},
		[sourceId],
	);
	const summaries = useMemo(
		() => (result.data ?? []) as readonly WeatherSummaryRow[],
		[result.data],
	);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Recent Summaries</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				{result.isError ? (
					<SummariesEmpty
						description="Weather summaries could not be loaded. Try again shortly."
						title="Summaries Unavailable"
					/>
				) : !result.isReady ? (
					<div className="grid gap-2">
						{[0, 1, 2].map((index) => (
							<Skeleton className="h-10 w-full" key={index} />
						))}
					</div>
				) : summaries.length === 0 ? (
					<SummariesEmpty
						description="No weather summaries have been recorded for this source yet."
						title="No Summaries"
					/>
				) : (
					<div className="overflow-x-auto rounded-md border border-border/40">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead>Period</TableHead>
									<TableHead className="text-right">Temp (°F)</TableHead>
									<TableHead className="text-right">Precip (in)</TableHead>
									<TableHead className="text-right">Humidity (%)</TableHead>
									<TableHead className="text-right">Wind (mph)</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{summaries.map((summary) => (
									<TableRow key={summary.id}>
										<TableCell className="font-medium text-foreground">
											{summaryPeriodLabel(summary)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatRange(summary.temperatureMinF, summary.temperatureMaxF, '')}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatMeasure(summary.precipitationInches, '')}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatRange(summary.relativeHumidityMin, summary.relativeHumidityMax, '')}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatRange(summary.windSpeedMinMph, summary.windSpeedMaxMph, '')}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[90px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function SummariesEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[120px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function DetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-56" />
			</div>
			<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<Skeleton className="h-64" />
				<Skeleton className="h-48" />
			</div>
		</>
	);
}
