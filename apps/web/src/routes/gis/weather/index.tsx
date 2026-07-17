import type { WeatherSourceRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { weatherSourceTypeLabel } from './-weather-display';

export const Route = createFileRoute('/gis/weather/')({
	component: WeatherSourcesRoute,
});

const WeatherIcon = iconRegistry.domains.weather.icon;

function WeatherSourcesRoute() {
	const { rows } = useCollectionRows<WeatherSourceRow>(webCollections.weatherSources);
	const sources = useMemo(
		() => [...rows].sort((a, b) => a.sourceName.localeCompare(b.sourceName)),
		[rows],
	);

	return (
		<div className="mx-auto grid w-full max-w-[1100px] content-start gap-5 px-4 py-6 md:px-8">
			<div className="grid gap-1">
				<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">Weather</h1>
				<p className="m-0 text-muted-foreground text-sm">
					Weather sources feeding the agency's surveillance and control records.
				</p>
			</div>

			{sources.length === 0 ? (
				<Empty className="min-h-[220px] border border-border/40 bg-muted/30">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<WeatherIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No weather sources</EmptyTitle>
						<EmptyDescription>
							Weather sources appear here once they're connected for your agency.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="overflow-hidden rounded-md border border-border/40">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead>Name</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Code</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sources.map((source) => (
								<TableRow key={source.id}>
									<TableCell>
										<Link
											className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											params={{ id: source.id }}
											to="/gis/weather/$id"
										>
											{source.sourceName}
										</Link>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{weatherSourceTypeLabel(source.sourceType)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{source.sourceCode ?? '—'}
									</TableCell>
									<TableCell>
										<StatusBadge isActive={source.isActive} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

function StatusBadge({ isActive }: { readonly isActive: boolean }) {
	return isActive ? (
		<Badge tone="success" variant="outline">
			Active
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			Inactive
		</Badge>
	);
}
