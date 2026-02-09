import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@simmer/ui/components/input-group';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { FieldWrapper } from '../field-wrapper';
import { useFieldContext } from '../form-context';

interface PasswordFieldProps
	extends Omit<
		React.ComponentProps<typeof InputGroupInput>,
		'id' | 'name' | 'type' | 'value' | 'onChange' | 'onBlur'
	> {
	fieldProps?: Omit<ComponentProps<typeof FieldWrapper>, 'children'>;
}

export function PasswordField({ fieldProps, ...props }: PasswordFieldProps) {
	const field = useFieldContext<string | null>();
	const [showPassword, setShowPassword] = useState(false);

	return (
		<FieldWrapper {...fieldProps}>
			<InputGroup>
				<InputGroupInput
					id={field.name}
					name={field.name}
					type={showPassword ? 'text' : 'password'}
					value={field.state.value ?? ''}
					onChange={(e) => field.handleChange(e.target.value || null)}
					onBlur={field.handleBlur}
					{...props}
				/>{' '}
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						variant="ghost"
						size="icon-sm"
						onClick={() => setShowPassword((prev) => !prev)}
					>
						{showPassword ? <EyeOffIcon /> : <EyeIcon />}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</FieldWrapper>
	);
}
