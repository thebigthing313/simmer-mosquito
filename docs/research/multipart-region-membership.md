# Region membership under multipart geometry

Research for issue #419, under the map in #415. Nothing here was executed against
a database. It is the PostGIS and OGC documentation read against the code that is
checked in.

## The short answer

`st_relate(region, record, 'T********')` already does the right thing for
multipart geometry. The interior of a MultiPolygon is the union of its parts'
interiors, so a record with one part interior-inside a region matches, and a
record whose every part only abuts the boundary does not. The bug is not the
predicate, it is the `case` that decides which records reach it: it tests
`geom_type = 'st_polygon'`, and `st_multipolygon` falls through to plain
`st_intersects`.

MultiLineString and MultiPoint stay on plain intersection. That is not inherited,
it is the same argument ADR 0015 made for LineString and Point, and the multipart
forms do not change any term of it.

## 1. What `ST_Relate(a, b, 'T********')` means for multipart arguments

### The pattern

PostGIS defines the pattern characters as: `F` no intersection, `0` point
intersection, `1` line intersection, `2` area intersection, `T` non-empty
intersection, `*` any value.
([ST_Relate](https://postgis.net/docs/ST_Relate.html))

The OGC specification gives the matrix itself. Cell one, row major, is
`dim(I(a) ∩ I(b))`, the dimension of the intersection of the two interiors, and
`p = T => dim(x) ∈ {0, 1, 2}, i.e. x ≠ ∅`. It also pins the value range for the
areal case:

> in the Area-Area case the only possible values for the Interior-Interior cell
> are drawn from {-1, 2}

So for area against area, `T` in cell one means the interiors share actual area,
never a point or a line.
([OGC Simple Features Specification for SQL, revision 1.1, section 2.1.13.2](https://docs.ogc.org/is/99-049/99-049.pdf))

### Interior of a MultiPolygon

The OGC specification defines boundary first, then interior as what is left:

> The boundary of a MultiPolygon consists of the set of Rings of its Polygons.

> The interior of a geometry consists of those points that are left when the
> boundary points are removed.

And it says outright that this interior comes in one piece per part:

> The interior of a MultiPolygon with more than 1 Polygon is not connected, the
> number of connected components of the interior of a MultiPolygon is equal to
> the number of Polygons in the MultiPolygon.

([OGC 99-049, sections 2.1.12 and 2.1.13.1](https://docs.ogc.org/is/99-049/99-049.pdf))

The assertions on MultiPolygon close the gap. Element interiors may not
intersect, and element boundaries may touch at only a finite number of points, so
removing the rings from the collection leaves exactly the union of the open part
interiors and nothing else. There is no seam where a shared edge would have
contributed interior.

The same document also treats the multipart forms as the same dimensional class
as their single-part forms when it defines the named predicates:

> P is used to refer to 0 dimensional geometries (Points and MultiPoints), L is
> used to refer to one-dimensional geometries (LineStrings and MultiLineStrings)
> and A is used to refer to two-dimensional geometries (Polygons and
> MultiPolygons).

That is the citation for "the A/A rule is the A/A rule, whether or not either
side is multipart".

### What that means for our rule

Write `I(R)` for the region interior and `I(M) = I(p₁) ∪ … ∪ I(pₙ)` for a
MultiPolygon record. Cell one is non-empty exactly when some part's interior
meets the region interior:

`I(R) ∩ I(M) ≠ ∅  ⟺  ∃ i . I(R) ∩ I(pᵢ) ≠ ∅`

Two consequences, stated the way the ticket asks:

- **A record with one part interior-inside a region is a member.** Set union is
  existential. An Application whose treated area is two lobes, one inside the
  district and one across the road outside it, matches the district. That is the
  answer the domain wants: the crew worked in the district.
- **A record whose every part merely touches the region boundary is correctly
  excluded.** Each part contributes an empty interior-interior intersection, and
  a union of empty sets is empty. Three lots all sitting flush against the south
  edge of a district are work next to the district, exactly as ADR 0015 already
  says for a single Polygon.

A useful corollary for reviewers: no part is privileged and no part count is read.
The predicate never asks how many pieces a geometry has, which is why widening the
branch is the whole fix and the SQL inside the branch does not change.

## 2. A MultiPolygon on the `a` side

Cell one is `dim(I(a) ∩ I(b))`. Set intersection is commutative, so cell one is
symmetric in its arguments even though the full matrix is not: cells two and four
swap, and so do three and seven. Our pattern reads only cell one, so
`st_relate(region, record, 'T********')` and
`st_relate(record, region, 'T********')` answer identically, and a MultiPolygon
region behaves the same way as a MultiPolygon record.

That matters because #415 widens `regions.geom` from `geometry(Polygon, 4326)`
(`packages/db/migrations/202605270001_owned_geometry_columns.sql:58`). Once a
region is three disjoint park lots, a record matches the region when it meets any
lot's interior, and a record that only abuts all three is out. No code change on
the region side. The existing argument order stays as it is.

One thing does not survive symmetry: the `&&` in `regionMembershipClause`. It is
a bounding-box test on the whole geometry, so a MultiPolygon region whose parts
are far apart has a bounding box much larger than its area and the index prefilter
gets looser. That costs candidates, never correctness. ADR 0015 already names
`ST_Subdivide` on a materialized region-parts table as the escape hatch if the
cost ever matters, and this is the case that would make it matter first.

## 3. MultiLineString and MultiPoint

`ST_Intersects` "Returns `true` if two geometries intersect. Geometries intersect
if they have any point in common", and matches `T********`, `*T*******`,
`***T*****`, `****T****`, that is, any of the four interior and boundary cells
being non-empty. ([ST_Intersects](https://postgis.net/docs/ST_Intersects.html))

ADR 0015's reason for keeping point and line on plain intersection is that
boundary contact is the only contact those shapes can offer against a region, so
excluding it would put a trap standing on a district line in no district. The
multipart forms do not change any term of that:

- **MultiPoint.** "The boundary of a Point or a MultiPoint is the empty set"
  (OGC 99-049, 2.1.13.1), so a MultiPoint's interior is all of its points. An
  interior rule would still exclude a point sitting on the region boundary, which
  is the outcome ADR 0015 rejected. Plain intersection, unchanged. Note the
  existential shape is the same as the polygon case: a MultiPoint matches when any
  of its points meets the region, which is what a multi-point record means.
- **MultiLineString.** "The boundary of a MultiCurve consists of those Points
  that are in the boundaries of an odd number of its element Curves"
  (OGC 99-049, 2.1.13.1). The mod-2 rule means a MultiLineString's boundary is
  not the plain union of its parts' endpoints: two segments meeting end to end
  contribute no boundary node there. That is a real trap, and plain intersection
  sidesteps it entirely, because it reads no boundary cell in isolation. It is
  also the reason not to get clever later: an interior-only rule for lines would
  behave differently for one LineString than for the MultiLineString built from
  its halves, which is the kind of split answer this rule exists to prevent.

So the extension is not inherited. Point and line stay on `ST_Intersects` for the
same stated reason, and MultiLineString gains a second reason to stay there.

## 4. PostGIS gotchas around `ST_Relate` and multipolygon validity

**Parts touching at a point are valid, and are fine.** PostGIS states the rule as
"A MultiPolygon is a collection of non-overlapping, non-adjacent Polygons.
Polygons in the collection may touch only at a finite number of points", and its
validity rules for MultiPolygon are that each element is valid, "Elements do not
overlap (i.e. their interiors must not intersect)" and "Elements touch only at
points (i.e. not along a line)".
([Chapter 4, Data Management](https://postgis.net/docs/using_postgis_dbmanagement.html))
The bowtie-at-a-vertex shapefile artefact is therefore a legal MultiPolygon, GEOS
relates it correctly, and the shared vertex is boundary for both parts, so it
contributes nothing to cell one. Nothing to guard.

**Parts sharing an edge, or overlapping, are invalid, and that is the risk.**
PostGIS is explicit that this is not a safe input: "Most PostGIS functions rely on
the assumption that geometry arguments are valid... Assuming valid geometric
inputs allows functions to operate more efficiently." Invalid input may error or
return a wrong answer. `ST_Relate` is a GEOS call with no repair step, so a single
invalid row can either abort a tile read for the whole viewport or answer wrongly
for that record. Two practical notes:

- The import path is where these arrive. County parcel and parks files routinely
  carry edge-adjacent parts. `ST_MakeValid` is the documented repair, and its own
  docs note that "Single polygons may become multi-geometries in case of
  self-intersections" ([ST_MakeValid](https://postgis.net/docs/ST_MakeValid.html)),
  which is a second, quieter route by which a MultiPolygon appears on a row that
  nobody drew as one.
- The CHECK-swap migration in #415 is the cheapest place to close this. It is
  already rewriting the geometry constraint on nine tables, and adding
  `check (st_isvalid(geom))` there costs one more predicate on the same scan.
  That is a call for the migration ticket, not this one, but it belongs in the
  spec: the interior rule is only as trustworthy as the validity of what it reads.

**Keep invalid geometry out of the corpus.** GEOS behaviour on invalid input is
undefined by the documentation, so an invalid case would pin mobile's hand-rolled
predicate to whatever GEOS happens to do this release. The corpus file already
makes this argument about geometry the schema forbids; it is the same argument.

## 5. The corrected predicate

The site is `regionMembershipMatch` in
`packages/db/src/domains/map-region-filter.ts`. Today:

```ts
return sql<boolean>`case
	when ${input.geomType} = 'st_polygon'
		then st_relate(${input.regionGeom}, ${input.geom}, 'T********')
	else st_intersects(${input.regionGeom}, ${input.geom})
end`;
```

### Form (a), widen the raw comparison

```ts
return sql<boolean>`case
	when ${input.geomType} in ('st_polygon', 'st_multipolygon')
		then st_relate(${input.regionGeom}, ${input.geom}, 'T********')
	else st_intersects(${input.regionGeom}, ${input.geom})
end`;
```

### Form (b), key on a normalized base type

`normalizeGeomType` lives in `packages/mapping/src/geometry.ts:307` and maps both
`st_polygon` and `Polygon` to `polygon`. It has no SQL twin, so form (b) has to
normalize in the emitted SQL:

```ts
return sql<boolean>`case
	when replace(${input.geomType}, 'st_multi', 'st_') = 'st_polygon'
		then st_relate(${input.regionGeom}, ${input.geom}, 'T********')
	else st_intersects(${input.regionGeom}, ${input.geom})
end`;
```

### Recommendation: form (a), with the list named once in TypeScript

Take (a). Three reasons, in order of weight.

1. **`packages/db` cannot import `packages/mapping`.** Mapping is a
   *devDependency* of db (`packages/db/package.json`), pulled in for the corpus
   integration test only. Shipping form (b) as a call to `normalizeGeomType` would
   promote it to a runtime dependency of the query builder, and the version above
   does not even do that: it hand-rolls a string trick that only looks like
   normalization. The value of "route through `normalizeGeomType`" is one
   normalizer, and (b) does not deliver it here.
2. **The `case` is embedded in every tileset.** Twenty-nine occurrences of
   `st_polygon` sit in
   `packages/db/src/tests/unit/domains/__snapshots__/map-surface-sql.snap.sql`.
   A reviewer reading that diff can check `in ('st_polygon', 'st_multipolygon')`
   by eye. `replace(geom_type, 'st_multi', 'st_') = 'st_polygon'` has to be
   evaluated in the reader's head twenty-nine times, and it is also a text
   function the planner cannot reason about on a stored generated column.
3. **The set is closed and short.** Two areal types exist. GeometryCollection is
   out of scope in #415, and #415 point 4 keeps the Point typmods, so nothing else
   can arrive. An enumeration of a closed two-element set is not the drift risk
   that #415 point 7 is aimed at; that point is about the many TypeScript
   consumers asking "areal or point", and it is satisfied there.

Where #415 point 7 does apply is the TypeScript half. Declare the areal set once,
in `packages/mapping`, next to `normalizeGeomType`:

```ts
/** True when a stored `geom_type` names an areal shape, single or multipart. */
export function isArealGeomType(value: string): boolean {
	const base = normalizeGeomType(value);
	return base === 'polygon' || base === 'multipolygon';
}
```

`membershipBranchFor` then reads it, and mobile's predicate reads the same
function rather than re-deriving the branch. The SQL keeps its own two literals,
and the corpus is what holds the two statements of the rule together, which is
exactly the job ADR 0015 gave it.

Also worth a sentence in the helper's doc comment, which currently says "A
polygon is inside only when the two *interiors* meet". Widen the wording to
"An area, one piece or several, is inside only when the two interiors meet", and
add the union fact, because the next reader's question will be "which part
counts".

## 6. Corpus additions

`packages/mapping/src/test-corpus.ts`. The type work first, then the cases.

### Type and helper changes

- `CorpusGeomType` (`:72`) gains the three multipart names:
  `'st_point' | 'st_multipoint' | 'st_linestring' | 'st_multilinestring' | 'st_polygon' | 'st_multipolygon'`.
- `CorpusCase.record` gains `GeoJsonMultiPoint | GeoJsonMultiLineString | GeoJsonMultiPolygon`,
  all three already exported from `packages/mapping/src/geometry.ts`.
- `membershipBranchFor` (`:363-365`) becomes
  `isArealGeomType(geomType) ? 'interior-intersection' : 'plain-intersection'`.
- `REGION_MEMBERSHIP_CORPUS_SIZE` (`:361`) moves from 22 to 32 for the ten cases
  below, or to 30 if the two region-side cases are deferred with the `regions`
  column widening.
- `test-corpus.test.ts` has two assertions that hard-code the three dimensions:
  `covers all three record dimensions` and the `expected` map in
  `labels every case with the dimension of the geometry it carries`. Both need the
  six names. The doc block's "What is deliberately absent" section loses its
  multipart paragraph and should say instead that multipart is present and empty
  geometry is still absent.

### The cases

Eight against the shared region (outer square lng -90.00 to -89.90, lat 30.00 to
30.10, hole lng -89.97 to -89.94, lat 30.03 to 30.06), plus two more in the next
section that bring their own. Every coordinate below is a region ring literal or lies on
an axis-aligned edge whose fixed ordinate is one, which is the corpus's existing
rule for keeping boundary cases exact.

The first two are the pair the ticket asks for and are the whole point of the set.

| id | geomType | shape | relationship to the region | branch | inside |
| --- | --- | --- | --- | --- | --- |
| `multipolygon-all-parts-sharing-an-edge` | `st_multipolygon` | two boxes: `(-90.00, 29.98, -89.96, 30.00)` and `(-89.94, 29.98, -89.90, 30.00)` | both parts sit south of the region, each sharing a stretch of the southern edge, overlapping it nowhere | `interior-intersection` | `false` |
| `multipolygon-one-part-inside` | `st_multipolygon` | two boxes: `(-89.93, 30.01, -89.91, 30.02)` and `(-89.80, 30.02, -89.78, 30.04)` | one part drawn wholly inside the region, one part east of it and disjoint | `interior-intersection` | `true` |
| `multipolygon-one-part-touching-one-disjoint` | `st_multipolygon` | two boxes: `(-90.00, 29.98, -89.90, 30.00)` and `(-89.80, 30.02, -89.78, 30.04)` | one part shares the southern edge, the other is nowhere near | `interior-intersection` | `false` |
| `multipolygon-parts-touching-at-a-vertex` | `st_multipolygon` | boxes `(-90.02, 29.98, -90.00, 30.00)` and `(-90.00, 30.00, -89.98, 30.02)`, meeting only at `(-90.00, 30.00)` | a legal MultiPolygon whose parts touch at one point, which is also the region's south-west vertex; the second part's interior is inside the region | `interior-intersection` | `true` |
| `multipolygon-all-parts-in-the-hole` | `st_multipolygon` | boxes `(-89.96, 30.04, -89.955, 30.05)` and `(-89.95, 30.04, -89.945, 30.05)` | both parts sit inside the hole, which is not part of the region | `interior-intersection` | `false` |
| `multipoint-one-point-inside` | `st_multipoint` | points `(-89.92, 30.02)` and `(-89.80, 30.02)` | one point inside the outer ring, one east of it | `plain-intersection` | `true` |
| `multipoint-all-points-outside` | `st_multipoint` | points `(-89.80, 30.02)` and `(-89.955, 30.045)` | one east of the region, one in the hole | `plain-intersection` | `false` |
| `multilinestring-touching-only-at-a-node` | `st_multilinestring` | lines `[(-90.02, 29.98), (-90.00, 30.00)]` and `[(-89.80, 30.02), (-89.79, 30.02)]` | one part ends on the region's south-west vertex, the other is disjoint | `plain-intersection` | `true` |

Why this set and not a larger one, case by case:

- **`multipolygon-all-parts-sharing-an-edge`** is the case that fails today. Under
  the shipped `case` it routes to `st_intersects` and answers `true`. It is the
  multipart twin of `polygon-sharing-one-edge`, which the file already calls "the
  single case that separates the two branches". The gap between the two parts is
  deliberate: parts that met along `lng -89.95` would be an invalid MultiPolygon
  by the rule in section 4, and the corpus must not carry one.
- **`multipolygon-one-part-inside`** proves the union is existential rather than
  universal. A rule that required every part to meet the interior would answer
  `false` here, and nothing else in the corpus would catch that.
- **`multipolygon-one-part-touching-one-disjoint`** separates "no part matched"
  from "the matching part was outside the bounding box". It also exercises the
  `&&` prefilter against a multipart bounding box that is much larger than the
  geometry.
- **`multipolygon-parts-touching-at-a-vertex`** is the shapefile artefact from
  section 4, and it is deliberately a `true` case, so the corpus records that a
  legal point-touching MultiPolygon is ordinary input and not something to reject.
- **`multipolygon-all-parts-in-the-hole`** keeps the hole first-class for the
  multipart arm. `polygon-in-hole` already covers the single case, and without the
  multipart twin an implementation that unioned parts before testing the hole
  would pass.
- **The two MultiPoint cases** pin the existential reading on the plain arm, where
  it is not obvious: someone reading only the polygon cases could conclude the
  union rule is a property of the interior pattern rather than of geometry.
  `multipoint-all-points-outside` is the one that fails a naive
  "test the first part" implementation.
- **`multilinestring-touching-only-at-a-node`** is the mod-2 boundary case from
  section 3 in its cheapest form. It answers `true` and would keep answering
  `true` if someone moved lines onto the interior pattern only if they got the
  boundary rule right, so it is the tripwire on that change.

Cases deliberately left out: a MultiLineString crossing the region (adds nothing
`line-crossing-boundary` does not already say), a three-part MultiPolygon (part
count is not a variable the predicate reads), and any invalid MultiPolygon, for
the reason in section 4.

### Two cases the shared region cannot express

`CorpusCase.region` exists for exactly this and is unused today. A MultiPolygon
region needs it:

| id | geomType | region | record | branch | inside |
| --- | --- | --- | --- | --- | --- |
| `polygon-in-one-part-of-a-multipolygon-region` | `st_polygon` | two disjoint boxes, `(-90.00, 30.00, -89.95, 30.05)` and `(-89.90, 30.00, -89.85, 30.05)` | box `(-89.99, 30.01, -89.98, 30.02)` | `interior-intersection` | `true` |
| `polygon-between-the-parts-of-a-multipolygon-region` | `st_polygon` | the same two boxes | box `(-89.95, 30.00, -89.90, 30.05)`, filling the gap and sharing an edge with each part | `interior-intersection` | `false` |

These two are the section 2 claim made checkable. They cost more than the others,
because the corpus type currently declares `region?: GeoJsonPolygon` and would
have to widen to `GeoJsonPolygon | GeoJsonMultiPolygon`, and the
`runs every case against the shared region` assertion in `test-corpus.test.ts`
would have to become "a case brings its own region only when it names one".

**Sequencing.** The jsts oracle and the pure unit test can take all ten cases the
day they are written. The SQL half cannot. It seeds every case into `habitats`,
whose constraint is
`check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'))`
(`packages/db/migrations/202605270001_owned_geometry_columns.sql:149`), and it
seeds `CORPUS_REGION` into `regions.geom`, which is `geometry(Polygon, 4326)`.
So the eight record-side cases land with or after the CHECK swap, and the two
region-side cases land with or after the `regions` column widening. If the corpus
lands first, `region-membership.integration.test.ts` fails on the insert, not on
the predicate. Either file the corpus change inside the migration slice, or land
it with the multipart cases held behind the same migration.

Worth keeping while you are in the file: the `touches_cross_check` in the SQL test
(`st_intersects and not st_touches`) stays algebraically equal to the interior
pattern for the multipart arm, because `ST_Touches` is defined as interiors not
intersecting while the geometries do intersect, and neither half of that reads a
part count. It keeps working as the cross-check without change.

## 7. ADR 0015 amendment

ADR 0015 is `docs/adr/0015-region-membership-is-computed-interior-intersection.md`.
Its Decision section says areas need interiors to meet, and then says multipart
cannot occur, with the sentence "If a table ever relaxes that check, this rule
needs revisiting before that migration lands". That is the sentence #415 cashes
in. The amendment widens the same rule and rewrites that paragraph. It does not
touch the Decision's first half, the corpus paragraph, or the multiselect
paragraph.

Suggested wording, as an `## Amendment` section appended after `## Consequences`,
with the Status line updated to point at it.

> ## Amendment, [date]: multipart geometry
>
> Amended by ADR 0018, which lets a record hold MultiPoint, MultiLineString or
> MultiPolygon geometry on the same row and id as its single-part form.
>
> The rule does not change. It widens, because the interior rule was already
> written in the one vocabulary that covers both shapes. The OGC model defines the
> interior of a MultiPolygon as its point set with the rings of its element
> Polygons removed, which is the union of its parts' interiors, one connected
> component per part. `'T********'` reads the interior-interior cell, so the
> question the predicate asks a multipart record is "does any part's interior meet
> the region's interior".
>
> That gives the answers the domain wants without a new rule. A treated area split
> into two lobes by a road, one lobe inside a district, is in that district. A
> parcel set whose every lot abuts a district edge and overlaps it nowhere is next
> to the district, not in it, exactly as a single Polygon in the same position
> already was.
>
> Three things follow.
>
> **The branch reads areal rather than polygon.** The record takes the interior
> arm when its `geom_type` is `st_polygon` or `st_multipolygon`, and plain
> intersection otherwise. The stored `geom_type` column is still what decides,
> so it still cannot drift from the geometry it describes.
>
> **A MultiPolygon region behaves the same way.** The interior-interior cell is
> symmetric, so once `regions.geom` accepts a MultiPolygon, a record is in a
> multipart region when it meets any part's interior. No predicate change. The
> `&&` prefilter gets looser, because a multipart bounding box covers the gaps
> between the parts, and that costs candidates rather than correctness.
>
> **MultiPoint and MultiLineString stay on plain intersection**, for the reason
> the single-part forms do: boundary contact is the only contact those shapes can
> offer a region, and excluding it would put a trap standing on a district line in
> no district. A MultiLineString has a second reason. Its boundary is the mod-2
> union of its parts' endpoints, not the plain union, so an interior-only rule
> would answer differently for one LineString than for the MultiLineString built
> from its halves. Plain intersection reads no boundary cell in isolation and
> sidesteps that.
>
> The paragraph above that said multipart and collection geometry cannot occur is
> superseded. Two of its three claims still hold and are worth keeping: the
> `geom_type` column is generated, and GeometryCollection remains out of scope, so
> the areal set stays closed at two names.
>
> One thing this amendment assumes and does not provide: that stored MultiPolygons
> are valid. PostGIS allows parts that touch at a finite number of points and
> forbids parts that share an edge or overlap, and it warns that its functions
> assume valid input. `ST_Relate` has no repair step, so an invalid row can abort a
> tile read or answer wrongly. Validity is the migration's job, not the
> predicate's, and ADR 0018 owns it.
>
> ### Consequences of the amendment
>
> - Saved district filters can change answer again, this time only for rows that
>   are multipart, of which there are none on the day it lands. #415 point 2 says
>   there is no backfill, so the change is forward-looking by construction.
> - The corpus grows to cover the multipart arms before mobile implements them.
>   The gate rises ahead of the implementation, which is deliberate.

Two edits outside that block:

- The Status line becomes "Accepted. Amends the plain-intersection rule the Region
  multiselect shipped under, documented in
  `packages/db/src/domains/map-region-filter.ts`. Amended for multipart geometry
  by ADR 0018, see the amendment below."
- In the Decision, the sentence "Multipart and collection geometry cannot occur,
  on two independent gates" and the sentence after it are the ones the amendment
  supersedes. Leave them in place and let the amendment carry the correction,
  rather than editing the accepted text, which is the convention the rest of
  `docs/adr/` follows.

## Sources

- [ST_Relate, PostGIS reference](https://postgis.net/docs/ST_Relate.html)
- [ST_Intersects, PostGIS reference](https://postgis.net/docs/ST_Intersects.html)
- [ST_MakeValid, PostGIS reference](https://postgis.net/docs/ST_MakeValid.html)
- [Chapter 4, Data Management, PostGIS manual, geometry types and Geometry Validation](https://postgis.net/docs/using_postgis_dbmanagement.html)
- [Chapter 5, Spatial Queries, PostGIS manual, Dimensionally Extended 9-Intersection Model](https://postgis.net/docs/using_postgis_query.html)
- [OpenGIS Simple Features Specification for SQL, revision 1.1, OGC 99-049, sections 2.1.11 to 2.1.13](https://docs.ogc.org/is/99-049/99-049.pdf)
- [Introduction to PostGIS workshop, DE-9IM](https://postgis.net/workshops/postgis-intro/de9im.html)
