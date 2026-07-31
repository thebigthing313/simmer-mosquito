'use client';

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@simmer-mosquito/ui-web/components/ui/input-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import { useFieldContext } from '../form-contexts';
import { FormFieldFrame } from './field-frame';
import type { BaseFieldProps } from './text-field';

const PasteIcon = iconRegistry.actions.paste.icon;

export interface UrlFieldProps
	extends BaseFieldProps,
		Omit<
			React.ComponentProps<typeof InputGroupInput>,
			| 'defaultValue'
			| 'disabled'
			| 'id'
			| 'onBlur'
			| 'onChange'
			| 'placeholder'
			| 'required'
			| 'type'
			| 'value'
		> {}

export function UrlField({
	label,
	required,
	description,
	disabled,
	placeholder = 'https://...',
	...props
}: UrlFieldProps) {
	const field = useFieldContext<string>();
	const [pasteFailed, setPasteFailed] = useState(false);

	async function pasteFromClipboard() {
		setPasteFailed(false);
		try {
			const text = await navigator.clipboard.readText();
			field.handleChange(text.trim());
			field.handleBlur();
		} catch {
			setPasteFailed(true);
		}
	}

	return (
		<FormFieldFrame
			description={pasteFailed ? 'Clipboard access was not available.' : description}
			disabled={disabled}
			label={label}
			required={required}
			renderControl={(controlProps) => (
				<InputGroup data-disabled={disabled ? true : undefined}>
					<InputGroupInput
						{...props}
						{...controlProps}
						{...(disabled === undefined ? {} : { disabled })}
						onBlur={field.handleBlur}
						onChange={(event) => field.handleChange(event.target.value)}
						placeholder={placeholder}
						type="url"
						value={field.state.value ?? ''}
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupButton
							aria-label={`Paste ${label ?? 'URL'}`}
							disabled={disabled}
							onClick={pasteFromClipboard}
							size="xs"
							type="button"
						>
							<PasteIcon aria-hidden="true" />
							Paste
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			)}
		/>
	);
}
