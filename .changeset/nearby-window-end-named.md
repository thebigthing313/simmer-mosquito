---
'@simmer-mosquito/web': patch
---

Changed: the Nearby Activity panel on a Service Request says when its window
ran past the days-after setting, "extended to the day it was closed" or
"extended to today", so a six-week range is not read against a setting that says 14. The
"Days after" field in My organization now says the number is a floor and that
the window runs on to the close, or to today while the request is open.
