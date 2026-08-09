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
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { switchOrganization } from '../api';
import { appAuthController } from '../app-auth';

// --- being inside an agency ---------------------------------------------------
//
// ADR 0011: an operator does not write an agency's records from outside it. They
// hold a membership in that agency and act through the ordinary agency routes,
// which means holding an ordinary agency session — and a session belongs to one
// organization at a time.
//
// So a page that writes agency records asks first: is this session in *this*
// agency? If it is not, there is nothing useful to render, because every write
// on the page would land in whichever agency the session is actually in. The
// gate is the page.

const EnterIcon = iconRegistry.entities.organization.icon;

/** Whether this operator session is currently inside the given agency. */
function useInsideAgency(organizationId: string): boolean {
	const snapshot = useSyncExternalStore(
		appAuthController.subscribe,
		() => appAuthController.snapshot,
		() => appAuthController.snapshot,
	);

	return snapshot?.authenticated === true
		? snapshot.localIdentity.organizationId === organizationId
		: false;
}

/**
 * Render `children` only when this session is inside the agency; otherwise offer
 * the way in.
 *
 * The refusal case is worth reading rather than hiding. An operator who is not a
 * member of the agency cannot be let in from here — WorkOS declines the switch,
 * and the fix is a membership, which is a deliberate act somebody has to
 * perform. Reporting that plainly is more useful than a disabled button.
 */
export function AgencySessionGate({
	organizationId,
	workosOrganizationId,
	agencyName,
	children,
}: {
	readonly organizationId: string;
	readonly workosOrganizationId: string | null;
	readonly agencyName: string | undefined;
	readonly children: ReactNode;
}) {
	const inside = useInsideAgency(organizationId);

	return inside ? (
		<>{children}</>
	) : (
		<AgencyEntry name={agencyName ?? 'this agency'} workosOrganizationId={workosOrganizationId} />
	);
}

function AgencyEntry({
	name,
	workosOrganizationId,
}: {
	readonly name: string;
	readonly workosOrganizationId: string | null;
}) {
	const enter = useEnterAgency(workosOrganizationId, name);
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
						: `Records are written as a member of the agency that owns them, so this page needs your session to be inside ${name}. You need an admin membership there.`}
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

/** Re-seal the session against the agency, then forget everything read as who we were. */
function useEnterAgency(
	workosOrganizationId: string | null,
	name: string,
): {
	readonly pending: boolean;
	readonly run: () => Promise<void>;
} {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);

	async function run() {
		if (workosOrganizationId === null) {
			return;
		}

		setPending(true);
		try {
			const outcome = await switchOrganization({ organizationId: workosOrganizationId });
			if (outcome.status !== 'switched') {
				// A refusal is not a malfunction, and the two want different words. The
				// refusal has a fix — somebody grants the membership — and saying so is
				// the point of the gate; the reason WorkOS returns for it is a code
				// like `invalid_grant`, which is not that.
				toast.error(
					outcome.status === 'refused'
						? `You need an admin membership in ${name} before you can enter it.`
						: outcome.reason,
				);
				return;
			}

			await appAuthController.refresh();
			// Everything already fetched was fetched as somebody else, in another
			// agency. None of it describes where this session now is.
			await queryClient.invalidateQueries();
		} finally {
			setPending(false);
		}
	}

	return { pending, run };
}
