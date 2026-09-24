import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { useId, useState } from 'react';
import { useProfileMutations } from '../../hooks/mutations/use-profile-mutations';
import { errorMessageForSave } from '../../lib/save-error';
import { CloseIcon, SaveIcon } from './constants';
import { requiredTextValue, SaveErrorNote, watchWrite } from './helpers';

export function HistoricalProfileSheet({
	onOpenChange,
	open,
}: {
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
}) {
	const { createHistorical } = useProfileMutations();
	const id = useId();
	const [displayName, setDisplayName] = useState('');
	const [isActive, setIsActive] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setDisplayName('');
			setIsActive(false);
			setError(null);
		}
		onOpenChange(nextOpen);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			// Validated before the sheet closes: a save that never left should not
			// look like one that did.
			const fields = { displayName: requiredTextValue(displayName, 'Display name'), isActive };
			updateOpen(false);
			watchWrite(createHistorical(fields), 'Unable to add historical profile.');
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		}
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetContent className="w-[min(420px,100%)]">
				<SheetHeader>
					<SheetTitle>Add Historical Profile</SheetTitle>
					<SheetDescription>
						Create a person record for field history without inviting them to SIMMER.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-3 px-4">
						<Field className="gap-1">
							<FieldLabel htmlFor={`${id}-display-name`}>Display name</FieldLabel>
							<Input
								id={`${id}-display-name`}
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="Name used on historical records"
							/>
						</Field>
						<div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/35 px-3 py-2 font-medium text-sm">
							<Label htmlFor={`${id}-active`}>Active for assignment</Label>
							<Switch id={`${id}-active`} checked={isActive} onCheckedChange={setIsActive} />
						</div>
						<SaveErrorNote message={error} />
					</div>
					<SheetFooter>
						<Button type="submit">
							<SaveIcon aria-hidden="true" />
							Save Profile
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
