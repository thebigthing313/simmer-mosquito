'use client';

export function FormActions({ children }: { readonly children: React.ReactNode }) {
	return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
