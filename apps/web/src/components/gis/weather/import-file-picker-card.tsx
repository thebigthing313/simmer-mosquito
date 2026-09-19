import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	IMPORT_COLUMNS,
	IMPORT_FILE_ACCEPT,
	type ImportColumn,
	MAX_IMPORT_ROWS,
} from './import-parse';

/** Choosing the file, and what the parser expects of it. */
export function FilePickerCard({
	isBusy,
	onFile,
}: {
	readonly isBusy: boolean;
	readonly onFile: (file: File | undefined) => void;
}) {
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Choose a File</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<Input
					accept={IMPORT_FILE_ACCEPT}
					aria-label="Spreadsheet of readings"
					disabled={isBusy}
					onChange={(event) => onFile(event.target.files?.[0])}
					type="file"
				/>
				<p className="m-0 text-muted-foreground text-xs">
					Readings are read in °F, inches, percent and mph. Up to{' '}
					{MAX_IMPORT_ROWS.toLocaleString('en-US')} rows.
				</p>
				<ColumnGuide />
			</CardContent>
		</Card>
	);
}

/**
 * The headings a file may name its columns with, before one is chosen.
 *
 * Every spelling comes off the parser's own map, so this cannot drift from what
 * a file is actually matched against. Without it a user learned the headings by
 * uploading a file and reading back the list of columns that went unmapped.
 */
function ColumnGuide() {
	return (
		<div className="grid gap-2">
			<p className="m-0 text-muted-foreground text-xs">
				The first row names the columns. Case, spaces, punctuation and a bracketed unit are ignored,
				so "Start Date" and "start_date" are the same heading.
			</p>
			<div className="overflow-x-auto rounded-md border border-border/40">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-[13rem]">Column</TableHead>
							<TableHead>Headings</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{IMPORT_COLUMNS.required.map((column) => (
							<ColumnGuideRow column={column} isRequired key={column.label} />
						))}
						{IMPORT_COLUMNS.recommended.map((column) => (
							<ColumnGuideRow column={column} isRequired={false} key={column.label} />
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

function ColumnGuideRow({
	column,
	isRequired,
}: {
	readonly column: ImportColumn;
	readonly isRequired: boolean;
}) {
	return (
		<TableRow>
			<TableCell className="font-medium text-foreground">
				<span className="flex flex-wrap items-center gap-1.5">
					{column.label}
					{isRequired ? (
						<Badge tone="info" variant="outline">
							Required
						</Badge>
					) : null}
				</span>
			</TableCell>
			<TableCell className="text-muted-foreground">{column.headings.join(', ')}</TableCell>
		</TableRow>
	);
}
