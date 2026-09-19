import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { useState } from 'react';
import type { AuthMe } from '../../auth';
import { useMembershipMutations } from '../../hooks/mutations/use-membership-mutations';
import { profileSavePlan, useProfileMutations } from '../../hooks/mutations/use-profile-mutations';
import type { PersonListing } from '../../hooks/queries/use-people-directory';
import { CloseIcon, EditIcon, SaveIcon } from './constants';
import { requiredTextValue, SaveErrorNote, saveFailureMessage, watchWrite } from './helpers';
import { ReinviteControl } from './reinvite';
import { RemoveMemberControl } from './remove-member';
import { RoleField } from './role-field';
import type { SimmerRole } from './types';

export function EditProfileSheet({
	auth,
	canEditRole,
	person,
}: {
	readonly auth: AuthMe | null;
	readonly canEditRole: boolean;
	readonly person: PersonListing;
}) {
	const { save } = useProfileMutations();
	const { changeRole } = useMembershipMutations();
	const [open, setOpen] = useState(false);
	const [displayName, setDisplayName] = useState(person.displayName);
	const [isActive, setIsActive] = useState(person.isActive);
	const [role, setRole] = useState<SimmerRole>(person.role ?? 'viewer');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setDisplayName(person.displayName);
			setIsActive(person.isActive);
			setRole(person.role ?? 'viewer');
			setError(null);
			setIsSaving(false);
		}
		setOpen(nextOpen);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSaving(true);
		const membershipId = person.membershipId ?? null;
		try {
			const nextDisplayName = requiredTextValue(displayName, 'Display name');
			const plan = profileSavePlan({ displayName: nextDisplayName, isActive, role }, person);
			// The role first, and only if it moved: it is a different command with a
			// different floor (owner, not admin), and a refusal there must not leave the
			// profile half saved and the sheet closed.
			if (plan.roleChange !== null) {
				if (membershipId !== null) {
					await changeRole(membershipId, plan.roleChange);
				}
			}
			updateOpen(false);
			watchWrite(save(person.profileId, plan.changes), 'Unable to save profile.');
		} catch (saveError) {
			setError(saveFailureMessage(saveError, 'The changes were not saved.'));
		}
		setIsSaving(false);
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(420px,100%)]">
				<SheetHeader>
					<SheetTitle>Edit {person.displayName}</SheetTitle>
					<SheetDescription>
						Update the profile label, assignment state, and access role.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-3 px-4">
						<Field className="gap-1">
							<FieldLabel>Display name</FieldLabel>
							<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
						</Field>
						<div className="grid gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">Link state</span>
							<Badge tone={person.userId === null ? 'neutral' : 'info'} variant="outline">
								{person.userId === null ? 'Historical profile' : 'Linked profile'}
							</Badge>
						</div>
						<RoleField
							editable={person.membershipId != null && canEditRole}
							onChange={setRole}
							value={role}
						/>
						<div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-3 py-2 font-medium text-sm">
							<span>Active</span>
							<Switch checked={isActive} onCheckedChange={setIsActive} />
						</div>
						<SaveErrorNote message={error} />
					</div>
					<SheetFooter>
						<Button type="submit" disabled={isSaving}>
							<SaveIcon aria-hidden="true" />
							Save Changes
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
				<ReinviteControl person={person} />
				<RemoveMemberControl auth={auth} person={person} onRemoved={() => setOpen(false)} />
			</SheetContent>
		</Sheet>
	);
}
