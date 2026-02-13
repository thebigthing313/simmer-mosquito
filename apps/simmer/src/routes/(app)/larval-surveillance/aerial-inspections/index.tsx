import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(app)/larval-surveillance/aerial-inspections/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/larval-surveillance/aerial-inspections/"!</div>
}
