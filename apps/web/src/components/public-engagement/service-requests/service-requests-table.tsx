import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { Address } from '../../../hooks/queries/address-view';
import type { ContactSummary } from '../../../hooks/queries/contact-view';
import { addressCardLabel } from '../../../lib/address-format';
import { ClampedTextCell, LinkedTableRow } from '../../record/linked-table-row';
import {
	contactDisplayName,
	formatRequestAge,
	formatRequestDate,
	intakeTypeLabel,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../public-engagement-display';
import { RequestStatusBadge } from '../public-engagement-ui';
import type { ServiceRequestListing } from './service-request-listing';

/**
 * A page of Service Requests as a table, one row per request, each opening its detail page. Takes
 * the rows the route read, the contacts, addresses and profile names resolved for them, and today's
 * date for the age column.
 */
export function ServiceRequestsTable({
	addressById,
	contactById,
	profileNames,
	rows,
	today,
}: {
	readonly addressById: ReadonlyMap<string, Address>;
	readonly contactById: ReadonlyMap<string, ContactSummary>;
	readonly profileNames: ReadonlyMap<string, string>;
	readonly rows: readonly ServiceRequestListing[];
	readonly today: string;
}) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Number</TableHead>
						<TableHead>Received</TableHead>
						<TableHead>Age</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Contact</TableHead>
						<TableHead>Address</TableHead>
						<TableHead>Intake</TableHead>
						<TableHead>Received by</TableHead>
						<TableHead>Details</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<RequestRow
							address={addressById.get(row.addressId)}
							contact={contactById.get(row.contactId)}
							key={row.id}
							receivedByName={
								row.receivedByProfileId === null
									? null
									: (profileNames.get(row.receivedByProfileId) ?? null)
							}
							row={row}
							today={today}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function RequestRow({
	address,
	contact,
	receivedByName,
	row,
	today,
}: {
	readonly address: Address | undefined;
	readonly contact: ContactSummary | undefined;
	readonly receivedByName: string | null;
	readonly row: ServiceRequestListing;
	readonly today: string;
}) {
	const title = serviceRequestTitle(row);
	const addressLabel = addressCardLabel(address);
	const details = row.details.trim();
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${title}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/public-engagement/service-requests/table' }}
						to="/public-engagement/service-requests/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="font-medium tabular-nums">{title}</TableCell>
			<TableCell className="tabular-nums">{formatRequestDate(row.requestDate)}</TableCell>
			{/* A closed request has stopped ageing, and Received already dates it. */}
			<TableCell className="tabular-nums">
				{isServiceRequestOpen(row) ? formatRequestAge(row.requestDate, today) : <AbsentValue />}
			</TableCell>
			<TableCell>
				<RequestStatusBadge open={row.closedAt === null} />
			</TableCell>
			<TableCell className="max-w-[14rem] truncate">
				{contact === undefined ? <AbsentValue /> : contactDisplayName(contact)}
			</TableCell>
			<TableCell
				className="max-w-[18rem] truncate text-muted-foreground"
				title={addressLabel ?? undefined}
			>
				{addressLabel ?? <AbsentValue />}
			</TableCell>
			<TableCell className="text-muted-foreground">{intakeTypeLabel(row.intakeType)}</TableCell>
			<TableCell className="text-muted-foreground">{receivedByName ?? <AbsentValue />}</TableCell>
			<ClampedTextCell empty={<AbsentValue />} text={details} />
		</LinkedTableRow>
	);
}
