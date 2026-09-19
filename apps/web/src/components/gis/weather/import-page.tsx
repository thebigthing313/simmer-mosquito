/**
 * Loading a spreadsheet of readings into one station: pick a file, review what
 * the file would do, then commit. The review's counts are the client's
 * estimate against the synced summaries; the server re-derives the verdict
 * inside the write transaction, and that is the one that writes. Only rows the
 * review did not fail are submitted.
 */
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link, useNavigate } from '@tanstack/react-router';
import { useWeatherUpload } from '../../../hooks/gis/use-weather-upload';
import type { WeatherStation } from '../../../hooks/queries/use-weather-station';
import { useBreadcrumbLabel } from '../../app-shell';
import { FilePickerCard } from './import-file-picker-card';
import { ParsedFileCard } from './import-parsed-file-card';
import { ImportResultCard } from './import-result-card';

export function ImportWeatherPage({
	station,
	canSubmit,
}: {
	readonly station: WeatherStation;
	/** The route's `canAttributeWrite`, the prop every form page takes. */
	readonly canSubmit: boolean;
}) {
	// As on the edit page: this route is the detail route's sibling, so it has to
	// name the station itself or the crumb shows the bare id.
	useBreadcrumbLabel(station.id, station.name);
	const navigate = useNavigate();
	const upload = useWeatherUpload(station.id, canSubmit);

	/*
	 * `record` is the measure the route-loading skeleton reserves, so the page
	 * arrives at the width it stood in for. No scroller of its own: the shell's
	 * `main` scrolls the page.
	 */
	return (
		<div className={pageContainer({ gap: 'detail', measure: 'record', padding: 'detail' })}>
			<Link className={backLink()} params={{ id: station.id }} to="/gis/weather/$id">
				<ArrowLeftIcon aria-hidden="true" />
				Back to {station.name}
			</Link>

			<PageHeader
				description={`Load a CSV or Excel file of readings for ${station.name}.`}
				title="Import Readings"
			/>

			<FilePickerCard isBusy={upload.isBusy} onFile={upload.chooseFile} />

			{upload.error === null ? null : (
				<Alert variant="destructive">
					<AlertTitle>Unable to Import</AlertTitle>
					<AlertDescription>{upload.error}</AlertDescription>
				</Alert>
			)}

			{upload.parsed === null || upload.assessment === null ? null : (
				<ParsedFileCard
					assessment={upload.assessment}
					canCommit={upload.canCommit}
					fileName={upload.fileName ?? 'the file'}
					onCommit={upload.commit}
					parsed={upload.parsed}
				/>
			)}

			{upload.result === null ? null : (
				<ImportResultCard
					onDone={() => void navigate({ to: '/gis/weather/$id', params: { id: station.id } })}
					result={upload.result}
					stationName={station.name}
				/>
			)}
			{upload.dialog}
		</div>
	);
}
