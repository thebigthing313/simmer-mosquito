import { useState } from 'react';

/** Which habitats are ticked, with a toggle and a clear. */
export function useHabitatSelection() {
	const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

	const toggle = (habitatId: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (!next.delete(habitatId)) {
				next.add(habitatId);
			}
			return next;
		});
	};

	const clear = () => setSelected(new Set());

	return { selected, toggle, clear };
}
