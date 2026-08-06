'use client';

import { FieldGroup } from '@simmer-mosquito/ui-web/components/ui/field';

export function AppFieldGroup({ children }: { readonly children: React.ReactNode }) {
	return <FieldGroup>{children}</FieldGroup>;
}
