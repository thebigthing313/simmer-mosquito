/**
 * Loading a spreadsheet of readings into one station.
 *
 * Three steps, and the middle one is the point: pick a file, look at what the
 * file says, then commit. The review is not decoration, an import overwrites
 * readings that already exist, and the two things a user has to agree to before
 * anything is written are how many rows would be overwritten and how many cannot
 * be written at all.
 *
 * ## The counts on screen are the client's, and the ones that matter are not
 *
 * The review names what each line would do, worked out against the readings this
 * station already holds. The server re-derives the same verdict inside the write
 * transaction, against the rows actually stored, and that is the one that writes.
 * So the review is an estimate a user acts on and the result underneath is the
 * truth. They usually agree; when they do not, someone else recorded a reading
 * while the file was open, which is what the server-side re-check exists for.
 *
 * Only rows the review did not fail are submitted. That is step 7 of the spec's
 * upload flow, "commits selected attemptable rows", and it is also what keeps one
 * repeated date in a spreadsheet from being an argument about the whole batch.
 *
 * A module beside the route rather than inside it, the way every create route
 * keeps its form in a `-*-form.tsx`, so the route is the half that computes the
 * attribution and this is the half that draws the control it gates.
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
	/** The route's `canAttributeWrite`, the prop every form page takes (#944). */
	readonly canSubmit: boolean;
}) {
	// As on the edit page: this route is the detail route's sibling, so it has to
	// name the station itself or the crumb shows the bare id.
	useBreadcrumbLabel(station.id, station.name);
	const navigate = useNavigate();
	const upload = useWeatherUpload(station.id, canSubmit);

	/*
	 * `record` is the measure the route-loading skeleton reserves, so the page
	 * arrives at the width it stood in for rather than in a 900px column of
	 * its own (#1043, #1046). The cards inside carry their own widths, so the
	 * frame is what widened. No scroller of its own: the shell's `main`
	 * scrolls the page and reserves the gutter the skeleton stands in (#1053).
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
