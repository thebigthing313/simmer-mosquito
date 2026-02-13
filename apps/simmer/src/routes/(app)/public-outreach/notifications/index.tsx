import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/public-outreach/notifications/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/public-outreach/notifications/"!</div>
}
