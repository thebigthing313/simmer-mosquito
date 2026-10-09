import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
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
import type React from 'react';
import { useOrganizationSettingsMutations } from '../../../hooks/mutations/use-organization-settings-mutations';
import {
	type SettingsSheetForm,
	type SettingsSheetOptions,
	useSettingsSheet,
} from '../../../hooks/my-organization/use-settings-sheet';
import { CloseIcon, EditIcon } from '../constants';

export interface SettingsSheetProps<Values, Payload> extends SettingsSheetOptions<Values, Payload> {
	readonly title: string;
	/** Left out, the sheet has no description and says so to Radix. */
	readonly description?: string | undefined;
	/** `wide` for a body that lays fields out in columns. */
	readonly width?: 'narrow' | 'wide';
	/** The sheet's fields, drawn under the error alert. */
	readonly children: (form: SettingsSheetForm<Values>) => React.ReactNode;
}

/**
 * The sheet every My Organization settings section edits in: the Edit
 * trigger, the header, the form with its error alert, and Save and Cancel.
 * The body is the caller's, drawn from the form it is handed. Save is
 * disabled while the Organization row is still loading. Who may open the
 * sheet is the caller's question, answered where the Edit control is drawn.
 */
export function SettingsSheet<Values, Payload>({
	title,
	description,
	width = 'narrow',
	children,
	...options
}: SettingsSheetProps<Values, Payload>) {
	const { form, open, changeOpen } = useSettingsSheet(options);
	const { canWrite } = useOrganizationSettingsMutations();

	return (
		<Sheet open={open} onOpenChange={changeOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent
				className={
					width === 'wide' ? 'w-[min(680px,100%)] sm:max-w-[680px]' : 'w-[min(440px,100%)]'
				}
				{...(description === undefined ? { 'aria-describedby': undefined } : {})}
			>
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					{description === undefined ? null : <SheetDescription>{description}</SheetDescription>}
				</SheetHeader>
				<form.AppForm>
					<form
						className="grid gap-3.5"
						noValidate
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid gap-2.5 px-4">
							<form.FormErrorAlert />
							{children(form)}
						</div>
						<SheetFooter>
							<form.FormActions>
								<form.SubmitButton disabled={!canWrite}>Save Changes</form.SubmitButton>
								<SheetClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</SheetClose>
							</form.FormActions>
						</SheetFooter>
					</form>
				</form.AppForm>
			</SheetContent>
		</Sheet>
	);
}
