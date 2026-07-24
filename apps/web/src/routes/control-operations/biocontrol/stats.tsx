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

export const Route = createFileRoute('/control-operations/biocontrol/stats')({
	component: BiocontrolStatsRoute,
});

function BiocontrolStatsRoute() {
	return (
		<div className="mx-auto grid w-full max-w-[1200px] content-start gap-6 px-4 py-6 md:px-8 md:py-8">
			<header className="grid gap-1.5">
				<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Biocontrol Statistics
				</h1>
				<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
					Release volumes and coverage summaries across your biocontrol work.
				</p>
			</header>

			<Empty className="min-h-[320px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ChartIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>Statistics Coming Soon</EmptyTitle>
					<EmptyDescription>
						Weekly, monthly, and annual release charts for biocontrol will live here.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
