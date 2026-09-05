---
'@simmer-mosquito/web': minor
---

Added: split a piece in two by sketching a line across it. Open a piece for
editing, press Split, and click a line that runs in one side and out the other.
The piece becomes two, divided along the line, and Finish puts both in the list
where the one they replace was. Cancel leaves the piece as it was. A line drawn
on a line cuts it into two lines.

Added: holes survive the cut. A hole the line misses goes to the side it sits
on. A hole the line crosses stops being a hole: each half of its ring becomes
part of the edge of one piece, so the water is still out of the shape and is now
a bay in each half rather than an island in one.

Added: a split that cannot be kept says so and draws red rather than refusing the
gesture. A line that stops inside the piece, or that would leave three pieces,
has not divided it. A record that stores one shape and no multi shape has nowhere
to put the second piece, and a Notification Registration says which shapes it
stores rather than leaving the tool to do nothing.
