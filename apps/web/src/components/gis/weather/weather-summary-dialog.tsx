import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { useSummaryForm } from '../../../hooks/gis/use-summary-form';
import type { WeatherSummaryListing } from '../../../hooks/queries/weather-summary-view';
import { METRIC_INPUTS, type MetricInputs } from './weather-summary-form';

/**
 * One dialog for both manual summary writes: `summary === null` records a new
 * bucket, otherwise it corrects one. Callers mount it only while open. The end
 * date follows the start until the user separates them, and every metric is
 * on screen at once because an empty box on an edit clears the reading.
 */
export function WeatherSummaryDialog({
	stationId,
	summary,
	onClose,
	onWriteYear,
}: {
	readonly stationId: string;
	readonly summary: WeatherSummaryListing | null;
	readonly onClose: () => void;
	/** The year the save is about to write into, so the card can move its tabs to it. Called before the write. */
	readonly onWriteYear: (year: number) => void;
}) {
	const form = useSummaryForm({ stationId, summary, onClose, onWriteYear });
	const { dates, metrics, issue, canSave, isSaving, error } = form;

	const isEdit = summary !== null;

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open
		>
			<DialogContent className="sm:max-w-[540px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit Summary' : 'Record Summary'}</DialogTitle>
					<DialogDescription>
						Weather at this station over one stretch of days. Both dates are included.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4">
					<BucketDates
						endDate={dates.endDate}
						onEndChange={dates.setEndDate}
						onStartChange={dates.setStartDate}
						startDate={dates.startDate}
						today={dates.today}
					/>

					<MetricGrid onChange={metrics.set} values={metrics.values} />

					{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
					{error !== null || issue === null ? null : (
						<p className="m-0 text-destructive text-sm">{issue}</p>
					)}
				</div>

				<DialogFooter>
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={!canSave || isSaving} onClick={form.save} type="button">
						{isEdit ? 'Save Summary' : 'Record Summary'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** The bucket's two ends. Both inclusive, and neither may run past today. */
function BucketDates({
	startDate,
	endDate,
	today,
	onStartChange,
	onEndChange,
}: {
	readonly startDate: string;
	readonly endDate: string;
	readonly today: string;
	readonly onStartChange: (next: string) => void;
	readonly onEndChange: (next: string) => void;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<div className="grid gap-1.5">
				<Label htmlFor="summary-start">Start date</Label>
				<Input
					id="summary-start"
					max={today}
					onChange={(event) => onStartChange(event.target.value)}
					type="date"
					value={startDate}
				/>
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="summary-end">End date</Label>
				<Input
					id="summary-end"
					max={today}
					min={startDate}
					onChange={(event) => onEndChange(event.target.value)}
					type="date"
					value={endDate}
				/>
			</div>
		</div>
	);
}

/** The seven reading boxes. An empty one is "no reading", not an unfilled field. */
function MetricGrid({
	values,
	onChange,
}: {
	readonly values: MetricInputs;
	readonly onChange: (key: keyof MetricInputs, value: string) => void;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{METRIC_INPUTS.map((metric) => (
				<div className="grid gap-1.5" key={metric.key}>
					<Label htmlFor={`summary-${metric.key}`}>{metric.label}</Label>
					<Input
						id={`summary-${metric.key}`}
						inputMode="decimal"
						onChange={(event) => onChange(metric.key, event.target.value)}
						placeholder={metric.placeholder}
						type="number"
						value={values[metric.key]}
					/>
				</div>
			))}
		</div>
	);
}
