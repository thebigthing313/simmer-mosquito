import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { WeatherSummaryListing } from '../../../hooks/queries/weather-summary-view';
import { WriteOnly } from '../../write-only';
import { summaryPeriodLabel } from './weather-display';

const AddIcon = iconRegistry.actions.add.icon;
const ImportIcon = iconRegistry.actions.upload.icon;

/**
 * The question a hard delete has to ask. A summary has no `deleted_at` and
 * nothing restores it.
 */
export function ConfirmSummaryDelete({
	summary,
	onCancel,
	onConfirm,
}: {
	readonly summary: WeatherSummaryListing | null;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
}) {
	return (
		<AlertDialog onOpenChange={(open) => (open ? undefined : onCancel())} open={summary !== null}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Delete the reading for {summary === null ? '' : summaryPeriodLabel(summary)}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This removes the reading permanently. It cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>Delete Reading</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** Import a file, or record one reading by hand. */
export function SummaryActions({
	stationId,
	isStationActive,
	onRecord,
}: {
	readonly stationId: string;
	readonly isStationActive: boolean;
	readonly onRecord: () => void;
}) {
	return (
		<WriteOnly minimum="manager">
			<div className="flex items-center gap-2">
				<Button asChild size="sm" variant="outline">
					<Link params={{ id: stationId }} to="/gis/weather/$id/import">
						<ImportIcon aria-hidden="true" />
						Import
					</Link>
				</Button>
				{/* Recording a reading needs an active station; the server refuses it on
				    an inactive one, so the button says so rather than the save. */}
				<Button
					disabled={!isStationActive}
					onClick={onRecord}
					size="sm"
					title={isStationActive ? undefined : 'Reactivate this station to record new readings.'}
					type="button"
				>
					<AddIcon aria-hidden="true" />
					Record
				</Button>
			</div>
		</WriteOnly>
	);
}
