import { Button } from '@simmer/ui/components/button';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/')({
	component: RouteComponent,
});

function RouteComponent() {
	const [counter, setCounter] = useState(0);
	return (
		<div className="flex flex-col gap-2">
			<span>Hello world!</span>
			<span>Counter: {counter}</span>
			<Button variant="default" onClick={() => setCounter(counter + 1)}>
				Increment
			</Button>
		</div>
	);
}
