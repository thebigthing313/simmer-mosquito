import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { type RecordType, recordNoun } from '../../lib/record-nouns';

/**
 * The strip above a record table whose read failed, drawn whether or not there
 * are rows behind it. Names the records from the register's plural, in sentence
 * case, and calls `onRetry` from Try Again.
 */
export function RecordTableUnavailable({
	recordType,
	onRetry,
}: {
	readonly recordType: RecordType;
	readonly onRetry: () => void;
}) {
	const { many } = recordNoun(recordType);
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				{`${many.charAt(0).toUpperCase()}${many.slice(1)} could not be loaded.`}
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}
