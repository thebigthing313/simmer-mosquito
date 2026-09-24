import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useHabitatHistory } from '../../../hooks/queries/use-habitat-history';
import { formatCount } from '../../../lib/format-count';
import { HISTORY_UNAVAILABLE } from './habitat-history-tab';
import {
	ApplicationHistory,
	InspectionHistory,
	RequestHistory,
	SampleHistory,
	SourceReductionHistory,
} from './habitat-history-tabs';

const InspectionIcon = iconRegistry.entities.inspection.icon;

/**
 * The card's own read has no rows: each tab counts its own. So the `PanelRows`
 * around the tabs is the failure and the placeholder, and everything past those
 * is `children`.
 */
const NO_CARD_ROWS: readonly never[] = [];

/**
 * What has happened at this habitat, a tab per kind of record. Exported for
 * `tests/unit/link-destinations.test.tsx`, which reads the five destinations
 * the rows carry.
 */
export function HabitatHistoryCard({ habitatId }: { readonly habitatId: string }) {
	const {
		inspections,
		samples,
		applications,
		sourceReductions,
		requests,
		isReady,
		isError,
		isApplicationsError,
		isSourceReductionsError,
		isRequestsError,
	} = useHabitatHistory(habitatId);

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>History</CardTitle>
				<CardDescription>
					Recent larval inspections, samples, applications, source reductions, and requests for
					control at this habitat.
				</CardDescription>
			</CardHeader>
			<CardContent padding="compact">
				<PanelRows
					icon={<InspectionIcon aria-hidden="true" />}
					reading={{ isError, isReady, rows: NO_CARD_ROWS }}
					unavailable={HISTORY_UNAVAILABLE}
					wrap="none"
				>
					{() => (
						<Tabs defaultValue="inspections">
							{/* Five tabs no longer fit a narrow main column, and the strip's
						    default is to overflow the card rather than shrink. */}
							<TabStrip>
								<TabStripTab value="inspections">
									Inspections ({formatCount(inspections.length)})
								</TabStripTab>
								<TabStripTab value="samples">Samples ({formatCount(samples.length)})</TabStripTab>
								<TabStripTab value="applications">
									Applications ({formatCount(applications.length)})
								</TabStripTab>
								<TabStripTab value="source-reductions">
									Source Reductions ({formatCount(sourceReductions.length)})
								</TabStripTab>
								<TabStripTab value="requests">
									Requests ({formatCount(requests.length)})
								</TabStripTab>
							</TabStrip>
							<TabsContent value="inspections" className="pt-4">
								<InspectionHistory habitatId={habitatId} inspections={inspections} />
							</TabsContent>
							<TabsContent value="samples" className="pt-4">
								<SampleHistory habitatId={habitatId} samples={samples} />
							</TabsContent>
							<TabsContent value="applications" className="pt-4">
								<ApplicationHistory
									applications={applications}
									habitatId={habitatId}
									isError={isApplicationsError}
								/>
							</TabsContent>
							<TabsContent value="source-reductions" className="pt-4">
								<SourceReductionHistory
									habitatId={habitatId}
									isError={isSourceReductionsError}
									sourceReductions={sourceReductions}
								/>
							</TabsContent>
							<TabsContent value="requests" className="pt-4">
								<RequestHistory
									habitatId={habitatId}
									isError={isRequestsError}
									requests={requests}
								/>
							</TabsContent>
						</Tabs>
					)}
				</PanelRows>
			</CardContent>
		</Card>
	);
}

export function HistorySkeleton() {
	return (
		<Card variant="surface">
			<CardContent padding="default" className="grid gap-3">
				<Skeleton className="h-5 w-32" />
				<TableSkeleton rows={5} />
			</CardContent>
		</Card>
	);
}

function TableSkeleton({ rows }: { readonly rows: number }) {
	return (
		<div className="grid gap-2">
			{Array.from({ length: rows }, (_value, index) => index).map((index) => (
				<Skeleton className="h-9 w-full" key={index} />
			))}
		</div>
	);
}
