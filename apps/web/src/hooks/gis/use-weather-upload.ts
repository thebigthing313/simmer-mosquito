import { useState } from 'react';
import { IMPORT_REFUSALS } from '../../lib/acknowledgement-copy';
import { todayInTimeZone } from '../../lib/local-date';
import { errorMessageForSave } from '../../lib/save-error';
import { assessParsedRows, type FileAssessment } from '../../routes/gis/weather/-import-assessment';
import {
	commitWeatherImport,
	type WeatherImportResult,
} from '../../routes/gis/weather/-import-commit';
import { type ParseResult, parseWeatherFile } from '../../routes/gis/weather/-import-parse';
import { newRecordId } from '../mutations/shared';
import { useAllWeatherSummaries } from '../queries/use-weather-summaries';
import { useAcknowledgedWrite } from '../use-acknowledged-write';
import { useOrganizationTimeZone } from '../use-organization-time-zone';

/**
 * The weather import page's state machine: choosing a file, assessing what it
 * would do against the station's stored readings, and committing the rows the
 * review did not fail through an acknowledged write.
 */
export function useWeatherUpload(stationId: string, canSubmit: boolean) {
	// The organization's calendar day, so the review and the server agree about
	// which rows are dated in the future.
	const today = todayInTimeZone(useOrganizationTimeZone());
	// Every reading the station holds, not the year the detail page was showing.
	// The assessment answers insert, update, no change or fail per row against
	// what is already stored, so a narrower window would report a row overwriting
	// a 2019 reading as an insert.
	const { summaries, isReady } = useAllWeatherSummaries(stationId);
	const { run, dialog } = useAcknowledgedWrite({ askable: IMPORT_REFUSALS, ask: true });

	const [fileName, setFileName] = useState<string | null>(null);
	const [parsed, setParsed] = useState<ParseResult | null>(null);
	const [assessment, setAssessment] = useState<FileAssessment | null>(null);
	const [result, setResult] = useState<WeatherImportResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);

	const chooseFile = (file: File | undefined) => {
		if (file === undefined) {
			return;
		}
		setError(null);
		setResult(null);
		setFileName(file.name);
		setIsBusy(true);
		void parseWeatherFile(file)
			.then((read) => {
				setParsed(read);
				// Assessed once, here, rather than on every render: the ids it mints
				// are the ones the commit sends, and re-minting them would make a
				// retry insert under different ids.
				setAssessment(assessParsedRows(read.rows, summaries, newRecordId, today));
			})
			.finally(() => setIsBusy(false));
	};

	const commit = () => {
		if (!canSubmit || assessment === null || assessment.attemptable.length === 0) {
			return;
		}
		setError(null);
		setIsBusy(true);
		// Only the rows the review did not fail. The server assesses again and can
		// still refuse one, but it is not asked to write a line the user has already
		// been shown as unwritable.
		//
		// Both acknowledgements go out withheld, which `ask: true` sends as `false`
		// so the guards run at all. What the file would overwrite is the server's to
		// answer against stored rows, and it answers by refusing once and naming what
		// it found, which is a better question than one asked from the client's own
		// estimate.
		void run(async (acknowledgements) => {
			setResult(
				await commitWeatherImport({
					weatherStationId: stationId,
					rows: assessment.attemptable,
					acknowledgedUpdates: acknowledgements.acknowledgedUpdates === true,
					acknowledgedPartialImport: acknowledgements.acknowledgedPartialImport === true,
				}),
			);
		})
			.catch((cause: unknown) =>
				setError(errorMessageForSave(cause, 'Unable to import these readings.')),
			)
			.finally(() => setIsBusy(false));
	};

	return {
		fileName,
		parsed,
		assessment,
		result,
		error,
		isBusy,
		dialog,
		chooseFile,
		commit,
		// The file's own three conditions, and the route's: a batch is one command
		// per row, and every row is attributed to the actor Profile (#944).
		canCommit: canSubmit && (assessment?.attemptable.length ?? 0) > 0 && !isBusy && isReady,
	};
}
