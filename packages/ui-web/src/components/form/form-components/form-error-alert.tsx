'use client';

import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { useFormContext } from '../form-contexts';
import { errorMessagesFrom } from '../form-errors';

export function FormErrorAlert({ title = 'Unable to save changes' }: { readonly title?: string }) {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => state.errors}>
			{(errors) => {
				const messages = errorMessagesFrom(errors);

				if (messages.length === 0) {
					return null;
				}

				return (
					<Alert variant="destructive">
						<AlertTitle>{title}</AlertTitle>
						<AlertDescription>
							{messages.length === 1 ? (
								<p>{messages[0]?.message}</p>
							) : (
								<ul className="ml-4 flex list-disc flex-col gap-1">
									{messages.map((error) => (
										<li key={error.message}>{error.message}</li>
									))}
								</ul>
							)}
						</AlertDescription>
					</Alert>
				);
			}}
		</form.Subscribe>
	);
}
