import {
	collectImportGroups,
	IMPORT_FILE_ACCEPT,
	type ImportCandidate,
	type ImportGeometryKind,
	importCandidatesFrom,
	isWgs84Geometry,
	readImportFileText,
} from '@simmer-mosquito/mapping';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { CheckIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useRef, useState } from 'react';
import {
	ImportNotes,
	type ImportNoun,
	type ImportRefusalCounts,
	importNoun,
	importNounTitle,
	importRowSummary,
} from './import-notes';
import type { DrawGeometry } from './use-map-draw';

/**
 * "Fill this geometry from a file."
 *
 * Organizations receive boundaries, routes, and trap and basin locations as
 * KML, KMZ, or GeoJSON from GIS staff and partner organizations; this reads one
 * in, lists every shape this record can store, and lets the user adopt one as
 * the drawn geometry. A feature holding several pieces is one shape and stays
 * whole; pruning a piece off it happens afterwards in the draw control, whose
 * piece list already offers Remove.
 *
 * What it offers is the record's own storable shapes, filtered to what the
 * parser can produce, so a record that takes areas and lines alike is offered
 * both and adopting one moves the form's type toggle onto it.
 *
 * Parsing is the same module the bulk region import uses
 * (`@simmer-mosquito/mapping`);
 * nothing is uploaded — the file is read in the browser.
 */

const UploadIcon = iconRegistry.actions.upload.icon;

/** Plenty for a hand-curated file, and small enough to render as a plain list. */
const MAX_CANDIDATES = 500;

/** A parsed shape plus a key of its own, since a file may repeat a name. */
interface ParsedShape extends ImportCandidate {
	readonly id: string;
}

interface ParsedFile {
	readonly fileName: string;
	readonly shapes: readonly ParsedShape[];
	readonly skipped: number;
	readonly truncated: boolean;
	readonly refusals: ImportRefusalCounts;
}

export function GeometryImportDialog({
	open,
	allowedTypes,
	onOpenChange,
	onSelect,
}: {
	readonly open: boolean;
	/** What this record stores, filtered to what the parser can produce. */
	readonly allowedTypes: readonly ImportGeometryKind[];
	readonly onOpenChange: (open: boolean) => void;
	readonly onSelect: (geometry: DrawGeometry) => void;
}) {
	const [parsed, setParsed] = useState<ParsedFile | null>(null);
	const [parseError, setParseError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const noun = importNoun(allowedTypes);
	const nounTitle = importNounTitle(noun);

	function reset() {
		setParsed(null);
		setParseError(null);
		setSelectedId(null);
	}

	async function readFile(file: File) {
		reset();
		try {
			const { groups, error } = collectImportGroups(
				await readImportFileText(file),
				file.name,
				allowedTypes,
			);
			if (error !== undefined) {
				setParseError(error);
				return;
			}
			const result = importCandidatesFrom(groups, {
				limit: MAX_CANDIDATES,
				fallbackName: nounTitle,
			});
			// A projected file would save as geometry the server rejects and the map
			// can't show, so those shapes are withheld and called out instead.
			const shapes = result.candidates
				.filter((candidate) => isWgs84Geometry(candidate.geometry))
				.map((candidate) => ({ ...candidate, id: crypto.randomUUID() }));
			setParsed({
				fileName: file.name,
				shapes,
				skipped: result.skipped,
				truncated: result.truncated,
				refusals: {
					projected: result.candidates.length - shapes.length,
					multipart: result.multipart,
					mixed: result.mixed,
				},
			});
			// A file holding exactly one usable shape needs no choosing.
			setSelectedId(shapes.length === 1 ? (shapes[0]?.id ?? null) : null);
		} catch (error) {
			setParseError(error instanceof Error ? error.message : 'That file could not be read.');
		}
	}

	function applySelection() {
		const shape = parsed?.shapes.find((candidate) => candidate.id === selectedId);
		if (shape === undefined) {
			return;
		}
		onSelect(shape.geometry);
		onOpenChange(false);
		reset();
	}

	return (
		<Dialog
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					reset();
				}
			}}
			open={open}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import a {nounTitle}</DialogTitle>
					<DialogDescription>
						Read a KML, KMZ, or GeoJSON file and use one of its shapes as this geometry. The file
						stays on this device.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-3">
					<input
						accept={IMPORT_FILE_ACCEPT}
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file !== undefined) {
								void readFile(file);
							}
							event.target.value = '';
						}}
						ref={fileInputRef}
						type="file"
					/>
					<Button onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
						<UploadIcon aria-hidden="true" data-icon="inline-start" />
						{parsed === null ? 'Choose KML, KMZ, or GeoJSON File' : 'Choose a Different File'}
					</Button>

					{parseError === null ? null : (
						<Alert variant="destructive">
							<AlertTitle>Couldn't Read That File</AlertTitle>
							<AlertDescription>{parseError}</AlertDescription>
						</Alert>
					)}

					{parsed === null ? null : (
						<ImportShapeList
							noun={noun}
							onSelect={setSelectedId}
							parsed={parsed}
							selectedId={selectedId}
						/>
					)}
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={selectedId === null} onClick={applySelection} type="button">
						Use This {nounTitle}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ImportShapeList({
	parsed,
	noun,
	selectedId,
	onSelect,
}: {
	readonly parsed: ParsedFile;
	readonly noun: ImportNoun;
	readonly selectedId: string | null;
	readonly onSelect: (id: string) => void;
}) {
	const count = parsed.shapes.length;

	if (count === 0) {
		return (
			<div className="grid gap-2">
				<p className="m-0 rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
					{parsed.fileName} holds no {noun.many}
					{parsed.skipped > 0 ? ` — ${parsed.skipped} other geometries were ignored` : ''}.
				</p>
				<ImportNotes counts={parsed.refusals} noun={noun} />
			</div>
		);
	}

	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="min-w-0 truncate text-muted-foreground text-xs">
					{parsed.fileName}
					{parsed.skipped > 0 ? ` · ${parsed.skipped} other geometries ignored` : ''}
				</span>
				<Badge tone="neutral" variant="outline">
					{count} {count === 1 ? noun.one : noun.many}
				</Badge>
			</div>
			<div className="grid max-h-72 gap-1 overflow-y-auto">
				{parsed.shapes.map((shape) => (
					<button
						className={cn(
							'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
							shape.id === selectedId ? 'border-primary/50 bg-primary/5' : 'border-border/50',
						)}
						key={shape.id}
						onClick={() => onSelect(shape.id)}
						type="button"
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">{shape.name}</span>
							<span className="block truncate text-muted-foreground text-xs">
								{importRowSummary(shape.geometry, shape.note)}
							</span>
						</span>
						{shape.id === selectedId ? <CheckIcon aria-hidden="true" /> : null}
					</button>
				))}
			</div>
			{parsed.truncated ? (
				<p className="m-0 text-muted-foreground text-xs">
					Only the first {MAX_CANDIDATES} shapes in this file are listed.
				</p>
			) : null}
			<ImportNotes counts={parsed.refusals} noun={noun} />
		</div>
	);
}
