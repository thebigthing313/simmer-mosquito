/**
 * The contact input block, shared by the contact page and the service request
 * form's inline "new contact" path.
 *
 * `prefix` is what the two callers differ by: the contact page owns the fields at
 * the root of its form, the service request form nests them under `newContact`.
 * Everything else — which fields exist, how they are grouped, what the
 * placeholders say — stays one definition, so a caller keying a contact in during
 * intake is offered the same record as one filling in the directory.
 */
export function ContactFieldsBlock({
	form,
	prefix = '',
	headingLevel = 'h2',
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	/** Field-name prefix, e.g. `newContact.`. Empty when the fields sit at the root. */
	readonly prefix?: string;
	/** The block's groups sit directly under the page title, or nested a level in. */
	readonly headingLevel?: 'h2' | 'h3';
}) {
	return (
		<>
			<ContactFieldGroup
				level={headingLevel}
				description="A contact needs at least one identifier — a name, company, phone, or email."
				title="Identity"
			>
				<form.AppField name={`${prefix}contactName`}>
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => <field.TextField label="Name" placeholder="e.g. Jordan Rivera" />}
				</form.AppField>
				<div className="grid gap-5 sm:grid-cols-2">
					<form.AppField name={`${prefix}company`}>
						{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
						{(field: any) => <field.TextField label="Company" placeholder="e.g. Riverside HOA" />}
					</form.AppField>
					<form.AppField name={`${prefix}department`}>
						{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
						{(field: any) => <field.TextField label="Department" placeholder="e.g. Facilities" />}
					</form.AppField>
				</div>
				<form.AppField name={`${prefix}title`}>
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => <field.TextField label="Title" placeholder="e.g. Property Manager" />}
				</form.AppField>
			</ContactFieldGroup>

			<ContactFieldGroup level={headingLevel} title="Communication">
				<div className="grid gap-5 sm:grid-cols-2">
					<form.AppField name={`${prefix}preferredPhone`}>
						{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
						{(field: any) => (
							<field.TextField label="Preferred phone" placeholder="(555) 123-4567" />
						)}
					</form.AppField>
					<form.AppField name={`${prefix}alternatePhone`}>
						{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
						{(field: any) => (
							<field.TextField label="Alternate phone" placeholder="(555) 987-6543" />
						)}
					</form.AppField>
				</div>
				<form.AppField name={`${prefix}email`}>
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => <field.TextField label="Email" placeholder="name@example.com" />}
				</form.AppField>
			</ContactFieldGroup>

			<ContactFieldGroup
				level={headingLevel}
				description="How this contact prefers to be reached for notifications and follow-up."
				title="Notification Preferences"
			>
				<form.AppField name={`${prefix}wantsEmail`}>
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<field.SwitchField description="Requires an email address." label="Wants email" />
					)}
				</form.AppField>
				<form.AppField name={`${prefix}wantsSms`}>
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<field.SwitchField description="Requires a preferred phone number." label="Wants SMS" />
					)}
				</form.AppField>
				<form.AppField name={`${prefix}wantsPhone`}>
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<field.SwitchField
							description="Requires a preferred phone number."
							label="Wants phone calls"
						/>
					)}
				</form.AppField>
			</ContactFieldGroup>
		</>
	);
}

function ContactFieldGroup({
	level,
	title,
	description,
	children,
}: {
	readonly level: 'h2' | 'h3';
	readonly title: string;
	readonly description?: string;
	readonly children: React.ReactNode;
}) {
	const Heading = level;

	return (
		<section className="grid gap-4">
			<div className="grid gap-0.5">
				<Heading className="m-0 font-semibold text-foreground text-sm">{title}</Heading>
				{description === undefined ? null : (
					<p className="m-0 text-muted-foreground text-xs">{description}</p>
				)}
			</div>
			{children}
		</section>
	);
}
