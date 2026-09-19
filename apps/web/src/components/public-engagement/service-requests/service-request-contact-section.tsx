import { FormSection } from '@simmer-mosquito/ui-web/components/form';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { ContactPicker } from '../../pickers/contact-picker';
import { ContactFieldsBlock } from '../contact-fields-block';
import type { ContactMode, ServiceRequestFormValues } from './service-request-form-values';

export function ContactSection({
	form,
	disableNewContact,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly disableNewContact: boolean;
}) {
	return (
		<FormSection title="Contact">
			{disableNewContact ? null : (
				<form.AppField name="contactMode">
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<ToggleGroup
							aria-label="Contact source"
							className="w-full"
							onValueChange={(next: string) => {
								if (next === 'existing' || next === 'new') {
									field.handleChange(next);
								}
							}}
							size="sm"
							type="single"
							value={field.state.value}
							variant="outline"
						>
							<ToggleGroupItem className="flex-1 text-xs" value="existing">
								Existing contact
							</ToggleGroupItem>
							<ToggleGroupItem className="flex-1 text-xs" value="new">
								New contact
							</ToggleGroupItem>
						</ToggleGroup>
					)}
				</form.AppField>
			)}

			<form.Subscribe
				selector={(state: { values: ServiceRequestFormValues }) => state.values.contactMode}
			>
				{(contactMode: ContactMode) =>
					contactMode === 'existing' || disableNewContact ? (
						<form.AppField name="contactId">
							{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
							{(field: any) => (
								<ContactPicker
									onSelect={(contact) => field.handleChange(contact?.id ?? null)}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					) : (
						<div className="grid gap-6 rounded-md border border-border/50 bg-muted/30 p-4">
							<ContactFieldsBlock form={form} headingLevel="h3" prefix="newContact." />
						</div>
					)
				}
			</form.Subscribe>
		</FormSection>
	);
}
