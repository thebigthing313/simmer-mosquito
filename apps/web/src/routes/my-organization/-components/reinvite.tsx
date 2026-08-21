import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { useMembershipMutations } from '../../../hooks/mutations/use-membership-mutations';
import type { PersonListing } from '../../../hooks/queries/use-people-directory';
import { AddIcon } from './constants';
import { formatRole, SaveErrorNote, saveFailureMessage } from './helpers';
import type { SimmerRole } from './types';

/**
 * Sending somebody's invitation again.
 *
 * An action on a row that is already invited, not a second trip through the
 * invite dialog. A second `identity.invite` for the same address is a retry the
 * server swallows, and there is no key that could tell a retry from a deliberate
 * redo — so the redo is its own command, reached from the row it is about.
 *
 * Only shown on a Membership still at `invited`. An active member has no link to
 * replace, and an ended one is a fresh invitation.
 *
 * No role check: this renders inside the edit sheet, which the People page draws
 * only for somebody past the people floor. A second check here would be the same
 * question asked twice and answerable two ways.
 */
export function ReinviteControl({ person }: { readonly person: PersonListing }) {
	if (person.membershipId == null || person.membershipStatus !== 'invited') {
		return null;
	}

	return (
		<ReinviteAction
			email={person.email}
			membershipId={person.membershipId}
			name={person.displayName}
			role={person.role ?? 'viewer'}
		/>
	);
}

/**
 * The dialog is the confirmation, and there is no step after it.
 *
 * It names all three things that change: who the mail goes to, the role the new
 * invitation grants, and that the link they are holding stops working. Anything
 * less and the destructive half — killing a link somebody may be about to use —
 * is the half nobody read.
 */
function ReinviteAction({
	email,
	membershipId,
	name,
	role,
}: {
	readonly email: string | null;
	readonly membershipId: string;
	readonly name: string;
	readonly role: SimmerRole;
}) {
	const { reinvite } = useMembershipMutations();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);

	async function confirm() {
		setConfirmOpen(false);
		setIsSending(true);
		setFailure(null);
		try {
			await reinvite(membershipId, role);
			toast.success(`New invitation sent to ${email ?? name}.`);
		} catch (sendError) {
			const message = saveFailureMessage(sendError, 'The new invitation was not sent.');
			setFailure(message);
			toast.error(message);
		} finally {
			setIsSending(false);
		}
	}

	return (
		<div className="grid gap-1.5 border-border/50 border-t px-4 pt-3">
			<span className="text-muted-foreground text-xs">
				{name} has not accepted their invitation yet.
			</span>
			<div>
				<Button
					disabled={isSending}
					onClick={() => setConfirmOpen(true)}
					size="xs"
					type="button"
					variant="outline"
				>
					<AddIcon aria-hidden="true" />
					Send New Invitation
				</Button>
			</div>
			<SaveErrorNote message={failure} />
			<AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
				<AlertDialogContent>
					<AlertDialogTitle>Send {name} a new invitation?</AlertDialogTitle>
					<AlertDialogHeader>
						<AlertDialogDescription>
							A new link goes to {email ?? 'their address'} and grants {formatRole(role)}. The link
							they have now stops working.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirm}>Send New Invitation</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
