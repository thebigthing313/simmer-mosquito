import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';

const ChartIcon = iconRegistry.generic.chart.icon;

export const Route = createFileRoute('/larval-surveillance/inspections/stats')({
	component: InspectionStatsRoute,
});

function InspectionStatsRoute() {
	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<header className="grid gap-1.5">
				<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Inspection Statistics
				</h1>
				<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
					Inspection effort and breeding-positive trends over time.
				</p>
			</header>

			<Empty className="min-h-[320px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ChartIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Statistics Coming Soon</EmptyTitle>
					<EmptyDescription>
						Wet-versus-dry rates, breeding density trends, and per-inspector effort will live here.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
