export function Panel({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<article className="panel">
			<h1>{title}</h1>
			{children}
		</article>
	);
}

export function Fact({
	label,
	value,
	valueClassName,
}: {
	readonly label: string;
	readonly value: string;
	readonly valueClassName?: string;
}) {
	return (
		<div>
			<dt>{label}</dt>
			<dd className={valueClassName}>{value}</dd>
		</div>
	);
}
