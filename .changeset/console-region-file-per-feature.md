---
'@simmer-mosquito/admin': minor
---

Changed: the agency setup page reads a region boundary file one record per
feature. A boundary drawn on several separated lots comes across whole, instead
of silently becoming its first lot. When the file holds nothing the page can
use, the message counts every feature it skipped rather than only those of
another geometry kind.
