import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/gis/regions/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/gis/regions/"!</div>
}
