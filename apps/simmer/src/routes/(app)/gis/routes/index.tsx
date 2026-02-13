import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/gis/routes/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/gis/routes/"!</div>
}
