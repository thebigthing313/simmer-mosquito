import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { useDashboard } from '../../hooks/dashboard/use-dashboard';
import { recordNoun } from '../../lib/record-nouns';
import { ageInDays, ageLabel } from './dashboard-data';

const FlagIcon = iconRegistry.actions.warning.icon;
type ServerRead = ReturnType<typeof useDashboard>;

/**
 * One row, the whole row a link in the warning tone while the count is above
 * zero. At zero the same row draws in the neutral tone with no link.
 */
export function UntreatedBanner({
	server,
	today,
}: {
	readonly server: ServerRead;
	readonly today: string;
}) {
	const untreated = server.data?.untreatedHabitats;
	if (server.isError) {
		return (
			<NeutralBanner>
				{`Untreated ${recordNoun('habitat').many} are unavailable right now.`}
			</NeutralBanner>
		);
	}
	// Nothing until the server answers.
	if (untreated === undefined) {
		return null;
	}
	if (untreated.count === 0) {
		return <NeutralBanner>{`No untreated ${recordNoun('habitat').many}`}</NeutralBanner>;
	}
	const oldest =
		untreated.oldest === null ? '' : `; oldest ${ageLabel(ageInDays(untreated.oldest, today))}`;
	return (
		<Link
			className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-foreground hover:bg-warning-bg/70"
			search={{ untreated: true }}
			to="/larval-surveillance/habitats"
		>
			<FlagIcon aria-hidden="true" className="size-5 shrink-0 text-warning" />
			<span className="min-w-0 flex-1">
				<span className="font-medium text-sm">
					{`${untreated.count} untreated ${recordNoun('habitat').many}`}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					{`heavy in the last 7 days with no control action since${oldest}`}
				</span>
			</span>
			<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
		</Link>
	);
}

function NeutralBanner({ children }: { readonly children: string }) {
	return (
		<div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/40 px-4 py-3">
			<FlagIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
			<span className="font-medium text-muted-foreground text-sm">{children}</span>
		</div>
	);
}

// --- last 7 days -------------------------------------------------------------
