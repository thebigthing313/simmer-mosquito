import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';
import { useEnterOrganization } from '../hooks/use-enter-organization';
import { useInsideOrganization } from '../hooks/use-inside-organization';

// --- being inside an organization
// ---------------------------------------------------
//
// ADR 0011: an operator does not write an organization's records from outside
// it. They hold a membership in that organization and act through the ordinary
// organization routes, which means holding an ordinary organization session —
// and a session belongs to one organization at a time.
//
// So a page that writes organization records asks first: is this session in
// *this* organization? If it is not, there is nothing useful to render, because
// every write on the page would land in whichever organization the session is
// actually in. The gate is the page.

const EnterIcon = iconRegistry.entities.organization.icon;

/**
 * Render `children` only when this session is inside the organization;
 * otherwise offer the way in.
 *
 * The refusal case is worth reading rather than hiding. An operator who is not
 * a member of the organization cannot be let in from here — WorkOS declines the
 * switch, and the fix is a membership, which is a deliberate act somebody has
 * to perform. Reporting that plainly is more useful than a disabled button.
 */
export function OrganizationSessionGate({
	organizationId,
	workosOrganizationId,
	organizationName,
	children,
}: {
	readonly organizationId: string;
	readonly workosOrganizationId: string | null;
	readonly organizationName: string | undefined;
	readonly children: ReactNode;
}) {
	const inside = useInsideOrganization(organizationId);

	return inside ? (
		children
	) : (
		<OrganizationEntry
			name={organizationName ?? 'this organization'}
			workosOrganizationId={workosOrganizationId}
		/>
	);
}

function OrganizationEntry({
	name,
	workosOrganizationId,
}: {
	readonly name: string;
	readonly workosOrganizationId: string | null;
}) {
	const enter = useEnterOrganization(workosOrganizationId, name);
	const unlinked = workosOrganizationId === null;

	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<EnterIcon />
				</EmptyMedia>
				<EmptyTitle>Enter {name} to make changes</EmptyTitle>
				<EmptyDescription>
					{unlinked
						? `${name} has no WorkOS organization yet, so there is nothing to enter. Link it first.`
						: `Records are written as a member of the organization that owns them, so this page needs your session to be inside ${name}. You need an admin membership there.`}
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button disabled={enter.pending || unlinked} onClick={enter.run}>
					{enter.pending ? 'Entering…' : `Enter ${name}`}
				</Button>
			</EmptyContent>
		</Empty>
	);
}
