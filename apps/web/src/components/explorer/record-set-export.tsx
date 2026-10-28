/**
 * The Export control a record set's Map and Table draw: a menu offering the
 * set's matches as CSV or as an Excel workbook. Takes the request the surface
 * would page with, or null while it has none yet, and draws as an icon in the
 * map frame's panel header.
 */

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { DownloadIcon } from '@simmer-mosquito/ui-web/icons/registry';
import {
	type RecordSetExportRequest,
	useRecordSetExport,
} from '../../hooks/explorer/use-record-set-export';

export function RecordSetExport({
	compact = false,
	request,
}: {
	/** Draw the trigger as an icon, for the map frame's panel header. */
	readonly compact?: boolean;
	readonly request: RecordSetExportRequest | null;
}) {
	const { exportAs, isExporting } = useRecordSetExport(request);
	const disabled = request === null || isExporting;
	const label = isExporting ? 'Exporting' : 'Export';

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				{compact ? (
					<Button aria-label={label} size="icon-sm" title={label} variant="ghost">
						<DownloadIcon aria-hidden="true" />
					</Button>
				) : (
					<Button size="sm" variant="outline">
						<DownloadIcon aria-hidden="true" />
						{label}
					</Button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onSelect={() => exportAs('csv')}>CSV</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => exportAs('xlsx')}>Excel workbook</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
