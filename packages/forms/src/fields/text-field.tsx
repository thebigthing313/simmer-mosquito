import { InputGroup, InputGroupInput } from '@simmer/ui/components/input-group';
import { FieldWrapper } from '../field-wrapper';
import { useFieldContext } from '../form-context';

interface TextFieldProps
	extends Omit<
		React.ComponentProps<typeof InputGroupInput>,
		'id' | 'name' | 'type' | 'value' | 'onChange' | 'onBlur'
	> {
	fieldProps?: Omit<React.ComponentProps<typeof FieldWrapper>, 'children'>;
}

export function TextField({ fieldProps, ...props }: TextFieldProps) {
	const field = useFieldContext<string | null>();

	return (
		<FieldWrapper {...fieldProps}>
			<InputGroup>
				<InputGroupInput
					id={field.name}
					name={field.name}
					type="text"
					value={field.state.value ?? ''}
					onChange={(e) => field.handleChange(e.target.value || null)}
					onBlur={field.handleBlur}
					{...props}
				/>
			</InputGroup>
		</FieldWrapper>
	);
}
