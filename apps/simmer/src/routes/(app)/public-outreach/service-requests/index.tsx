import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(app)/public-outreach/service-requests/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/public-outreach/service-requests/"!</div>
}
