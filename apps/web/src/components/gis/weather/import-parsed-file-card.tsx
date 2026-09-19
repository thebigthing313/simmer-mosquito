import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import type { FileAssessment } from './import-assessment';
import { MAX_IMPORT_ROWS, type ParseResult } from './import-parse';
import { ImportPreview } from './import-preview';

export function ParsedFileCard({
	parsed,
	assessment,
	fileName,
	canCommit,
	onCommit,
}: {
	readonly parsed: ParseResult;
	readonly assessment: FileAssessment;
	readonly fileName: string;
	readonly canCommit: boolean;
	readonly onCommit: () => void;
}) {
	if (parsed.error !== undefined) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Unable to Read {fileName}</AlertTitle>
				<AlertDescription>{parsed.error}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card variant="surface">
			<CardHeader padding="compact" className="flex flex-wrap items-center justify-between gap-2">
				<CardTitle>{fileName}</CardTitle>
				<Button disabled={!canCommit} onClick={onCommit} type="button">
					Import {assessment.attemptable.length.toLocaleString('en-US')} Rows
				</Button>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<AssessmentCounts assessment={assessment} parsed={parsed} />

				{parsed.unmappedColumns.length === 0 ? null : (
					<p className="m-0 text-muted-foreground text-sm">
						Columns not recognised and ignored: {parsed.unmappedColumns.join(', ')}.
					</p>
				)}

				<SkippedLines rejected={parsed.rejected} />

				<ImportPreview assessed={assessment.rows} />
			</CardContent>
		</Card>
	);
}

/** What the file would do, not merely that it parsed. */
function AssessmentCounts({
	assessment,
	parsed,
}: {
	readonly assessment: FileAssessment;
	readonly parsed: ParseResult;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			<Badge tone="success" variant="outline">
				{assessment.counts.insert.toLocaleString('en-US')} to add
			</Badge>
			{assessment.counts.update === 0 ? null : (
				<Badge tone="info" variant="outline">
					{assessment.counts.update.toLocaleString('en-US')} would overwrite
				</Badge>
			)}
			{assessment.counts.noChange === 0 ? null : (
				<Badge tone="neutral" variant="outline">
					{assessment.counts.noChange.toLocaleString('en-US')} already recorded
				</Badge>
			)}
			{assessment.counts.fail === 0 ? null : (
				<Badge tone="danger" variant="outline">
					{assessment.counts.fail.toLocaleString('en-US')} cannot be written
				</Badge>
			)}
			{parsed.rejected.length === 0 ? null : (
				<Badge tone="warning" variant="outline">
					{parsed.rejected.length.toLocaleString('en-US')} unreadable
				</Badge>
			)}
			{parsed.truncated ? (
				<Badge tone="warning" variant="outline">
					Only the first {MAX_IMPORT_ROWS.toLocaleString('en-US')} kept
				</Badge>
			) : null}
		</div>
	);
}

/**
 * The lines that will not be sent, named individually, up to ten.
 */
function SkippedLines({
	rejected,
}: {
	readonly rejected: readonly { readonly line: number; readonly reason: string }[];
}) {
	if (rejected.length === 0) {
		return null;
	}
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-muted/30 p-3">
			{rejected.slice(0, 10).map((entry) => (
				<p className="m-0 text-muted-foreground text-xs" key={entry.line}>
					Line {entry.line}: {entry.reason}
				</p>
			))}
			{rejected.length > 10 ? (
				<p className="m-0 text-muted-foreground text-xs">
					…and {(rejected.length - 10).toLocaleString('en-US')} more.
				</p>
			) : null}
		</div>
	);
}
