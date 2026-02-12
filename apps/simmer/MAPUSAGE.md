# Map Usage Guide

This guide documents the Simmer map system, built on **Mapbox GL JS** with a **Zustand store** and a collection of React hooks. The system provides a centralized, reactive way to manage map state, markers, polygons, lines, and viewport controls across your application.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [The MapboxMap Component](#the-mapboxmap-component)
- [The Map Store](#the-map-store)
- [Hooks Reference](#hooks-reference)
  - [useMapCenter](#usemapcenter)
  - [useMapViewport](#usemapviewport)
  - [useMapBoundingBox](#usemapboundingbox)
  - [useMapMarkers](#usemapmarkers)
  - [useMapPolygons](#usemappolygons)
  - [useMapLines](#usemaplines)
  - [useMapSettings](#usemapsettings)
  - [useMapEvents](#usemapevents)
  - [useMapCursorPosition](#usemapcursorposition)
  - [useMapDistance](#usemapdistance)
  - [useMapInstance](#usemapinstance)
  - [useMapLayerSync](#usemaplayersync)
- [Type Reference](#type-reference)
- [Best Practices](#best-practices)
- [Example Patterns](#example-patterns)

---

## Architecture Overview

The map system consists of three main layers:

1. **MapboxMap Component** - The single map instance that renders in your layout
2. **Map Store (Zustand)** - Global state for viewport, markers, polygons, lines, and settings
3. **React Hooks** - Convenient, typed interfaces for reading and updating the store

```
┌─────────────────────────────────────────┐
│  Your Components (anywhere in tree)    │
│  ↓ use hooks                            │
├─────────────────────────────────────────┤
│  Map Store (Zustand)                    │
│  • center, zoom, pitch, bearing         │
│  • markers, polygons, lines             │
│  • style, projection, cursor            │
├─────────────────────────────────────────┤
│  MapboxMap Component                    │
│  • Renders the Mapbox GL instance       │
│  • Syncs store ↔ map bidirectionally   │
└─────────────────────────────────────────┘
```

**Key Benefits:**
- **Centralized state** - All map data lives in one place
- **Reactive updates** - Changes to the store automatically sync to the map
- **Type-safe** - Full TypeScript support throughout
- **Decoupled** - Components can control the map without direct Mapbox API access

---

## Getting Started

### 1. Add the MapboxMap Component

The `MapboxMap` component should be placed once in your layout (typically in a route file or layout component):

```tsx
import { MapboxMap } from '@/src/components/MapboxMap';

export function MyLayout() {
  return (
    <div className="relative h-screen">
      {/* Other UI elements */}
      <MapboxMap />
    </div>
  );
}
```

The component:
- Initializes the Mapbox GL map instance
- Registers it with the store
- Provides built-in controls (zoom, style switcher, coordinates, etc.)
- Never re-renders (memoized) when parent components update

### 2. Use Hooks to Control the Map

From any component in your tree, import and use the hooks:

```tsx
import { useMapCenter, useMapMarkers } from '@/src/hooks';

function MyComponent() {
  const { flyTo } = useMapCenter();
  const { addMarker } = useMapMarkers();

  const handleAddLocation = () => {
    const lngLat = { lng: -95.7129, lat: 37.0902 };
    
    flyTo({ center: lngLat, zoom: 14 });
    addMarker({
      id: 'my-marker',
      lngLat,
      color: '#10b981',
      popup: 'My Location',
    });
  };

  return <button onClick={handleAddLocation}>Add Location</button>;
}
```

---

## The MapboxMap Component

**Location:** `apps/simmer/src/components/MapboxMap.tsx`

### Usage

```tsx
<MapboxMap />
```

### What It Does

- Initializes a Mapbox GL JS map with a dark style by default
- Registers the map instance with `useMapStore`
- Listens for map `moveend` events and syncs viewport state back to the store
- Renders built-in UI controls:
  - `MapControls` - Zoom in/out, locate user, compass
  - `MapStyleSwitcher` - Toggle between map styles
  - `MapScaleBar` - Distance scale indicator
  - `MapCoordinateDisplay` - Current cursor coordinates
  - `MapAttribution` - Mapbox attribution
- Shows a loading spinner until the map is ready
- Can fly to user's location when available (via `useUserLocation`)

### Configuration

To customize the initial map settings, edit the `MapboxMap.tsx` file:

```tsx
const map = new mapboxgl.Map({
  container: containerRef.current,
  style: 'mapbox://styles/mapbox/dark-v11',  // Change style
  center: [-95.7129, 37.0902],                // Change initial center
  zoom: 4,                                     // Change initial zoom
  // ... other Mapbox GL options
});
```

---

## The Map Store

**Location:** `apps/simmer/src/stores/map-store.ts`

The map store is built with Zustand and the `subscribeWithSelector` middleware. It contains:

### State

| Property | Type | Description |
|----------|------|-------------|
| `map` | `mapboxgl.Map \| null` | The live Mapbox GL instance |
| `mapLoaded` | `boolean` | Whether the map has finished loading |
| `center` | `LngLat` | Current map center |
| `zoom` | `number` | Current zoom level |
| `pitch` | `number` | Current pitch (0-60°) |
| `bearing` | `number` | Current bearing/rotation (0-360°) |
| `bounds` | `BoundingBox \| null` | Current viewport bounds |
| `style` | `MapStyle` | Current map style URL |
| `projection` | `MapProjection` | Map projection (mercator, globe, etc.) |
| `cursor` | `CursorStyle` | Cursor style (auto, pointer, crosshair, etc.) |
| `interactionsEnabled` | `boolean` | Whether user interactions are enabled |
| `terrain3D` | `boolean` | Whether 3D terrain is enabled |
| `markers` | `Map<string, MapMarker>` | All markers by ID |
| `polygons` | `Map<string, MapPolygon>` | All polygons by ID |
| `lines` | `Map<string, MapLine>` | All lines/polylines by ID |

### Actions

See [Type Reference](#type-reference) for full method signatures.

**Navigation:**
- `setCenter`, `flyTo`, `fitBounds`, `easeTo`, `zoomTo`, `resetNorth`, `setBearing`, `setPitch`

**Settings:**
- `setStyle`, `setProjection`, `setCursor`, `setInteractionsEnabled`, `setTerrain3D`

**Markers:**
- `addMarker`, `addMarkers`, `updateMarker`, `removeMarker`, `removeAllMarkers`, `setMarkerVisibility`

**Polygons:**
- `addPolygon`, `addPolygons`, `updatePolygon`, `removePolygon`, `removeAllPolygons`, `setPolygonVisibility`

**Lines:**
- `addLine`, `addLines`, `updateLine`, `removeLine`, `removeAllLines`, `setLineVisibility`

**Bulk:**
- `clearAllLayers` - Remove all markers, polygons, and lines at once

### Direct Store Access

You can access the store directly if needed:

```tsx
import { useMapStore } from '@/src/stores/map-store';

// In a component
const zoom = useMapStore((s) => s.zoom);
const flyTo = useMapStore((s) => s.flyTo);

// Outside React
const { center, zoom } = useMapStore.getState();
useMapStore.getState().flyTo({ center: { lng: -95, lat: 37 }, zoom: 10 });
```

---

## Hooks Reference

All hooks are exported from `@/src/hooks/index.ts` for convenience.

---

### useMapCenter

**File:** `use-map-center.ts`

Controls the map center and navigation.

#### Returns

```ts
{
  center: LngLat;
  setCenter: (center: LngLat) => void;
  flyTo: (opts: FlyToOptions) => void;
  flyToCenter: (lngLat: LngLat, zoom?: number, duration?: number) => void;
  easeTo: (opts: Partial<FlyToOptions>) => void;
}
```

#### Example

```tsx
import { useMapCenter } from '@/src/hooks';

function NavigationButtons() {
  const { center, flyTo } = useMapCenter();

  return (
    <>
      <p>Current: {center.lat.toFixed(4)}°, {center.lng.toFixed(4)}°</p>
      <button
        onClick={() => flyTo({ 
          center: { lng: -74.006, lat: 40.7128 },
          zoom: 12,
          duration: 2000 
        })}
      >
        Fly to NYC
      </button>
    </>
  );
}
```

#### Methods

- **`flyTo`** - Smooth animated transition to a location
- **`flyToCenter`** - Convenience wrapper for flying to a center point
- **`easeTo`** - Similar to flyTo but with a different easing curve
- **`setCenter`** - Instantly move to a location (no animation)

---

### useMapViewport

**File:** `use-map-viewport.ts`

Controls zoom, pitch, and bearing.

#### Returns

```ts
{
  zoom: number;
  pitch: number;
  bearing: number;
  zoomTo: (zoom: number, duration?: number) => void;
  setPitch: (pitch: number) => void;
  setBearing: (bearing: number) => void;
  resetNorth: (duration?: number) => void;
}
```

#### Example

```tsx
import { useMapViewport } from '@/src/hooks';

function ViewportControls() {
  const { zoom, pitch, bearing, zoomTo, setPitch, resetNorth } = useMapViewport();

  return (
    <div>
      <p>Zoom: {zoom.toFixed(2)} | Pitch: {pitch}° | Bearing: {bearing}°</p>
      <button onClick={() => zoomTo(14)}>Zoom to 14</button>
      <button onClick={() => setPitch(60)}>Tilt 60°</button>
      <button onClick={() => resetNorth()}>Reset North</button>
    </div>
  );
}
```

---

### useMapBoundingBox

**File:** `use-map-bounding-box.ts`

Access and control the visible map bounds.

#### Returns

```ts
{
  bounds: BoundingBox | null;
  boundsCenter: LngLat | null;
  dimensions: { width: number; height: number } | null;
  fitBounds: (bounds: BoundingBox, options?: { padding?: number; duration?: number }) => void;
  getCurrentBounds: () => BoundingBox | null;
  containsPoint: (point: LngLat) => boolean;
}
```

#### Example

```tsx
import { useMapBoundingBox } from '@/src/hooks';

function BoundsInfo() {
  const { bounds, dimensions, fitBounds, containsPoint } = useMapBoundingBox();

  const checkIfContainsNYC = () => {
    const isVisible = containsPoint({ lng: -74.006, lat: 40.7128 });
    console.log('NYC is visible:', isVisible);
  };

  return (
    <>
      {bounds && (
        <p>
          SW: {bounds.sw.lat.toFixed(3)}°, {bounds.sw.lng.toFixed(3)}° |
          NE: {bounds.ne.lat.toFixed(3)}°, {bounds.ne.lng.toFixed(3)}°
        </p>
      )}
      {dimensions && (
        <p>Size: {dimensions.width.toFixed(3)}° × {dimensions.height.toFixed(3)}°</p>
      )}
      <button onClick={checkIfContainsNYC}>Check NYC</button>
      <button
        onClick={() =>
          fitBounds(
            { sw: { lng: -80.5, lat: 25.0 }, ne: { lng: -79.5, lat: 26.0 } },
            { padding: 40 }
          )
        }
      >
        Fit to Miami
      </button>
    </>
  );
}
```

---

### useMapMarkers

**File:** `use-map-markers.ts`

Manage map markers (pins).

#### Returns

```ts
{
  markers: MapMarker[];
  visibleMarkers: MapMarker[];
  markerCount: number;
  getMarker: (id: string) => MapMarker | undefined;
  getNearestMarker: (point: LngLat) => MapMarker | null;
  addMarker: (marker: MapMarker) => void;
  addMarkers: (markers: MapMarker[]) => void;
  setMarkers: (markers: MapMarker[]) => void;
  updateMarker: (id: string, patch: Partial<Omit<MapMarker, 'id'>>) => void;
  removeMarker: (id: string) => void;
  removeAllMarkers: () => void;
  setMarkerVisibility: (id: string, visible: boolean) => void;
}
```

#### Example

```tsx
import { useMapMarkers, useMapCenter } from '@/src/hooks';

function MarkerManager() {
  const { markers, addMarker, removeMarker, setMarkerVisibility } = useMapMarkers();
  const { center } = useMapCenter();

  const handleAddMarker = () => {
    addMarker({
      id: `marker-${Date.now()}`,
      lngLat: center,
      color: '#10b981',
      popup: 'New marker',
      data: { createdAt: new Date().toISOString() },
    });
  };

  return (
    <div>
      <p>{markers.length} markers on map</p>
      <button onClick={handleAddMarker}>Add Marker at Center</button>
      {markers.map((m) => (
        <div key={m.id}>
          {m.id}
          <input
            type="checkbox"
            checked={m.visible !== false}
            onChange={(e) => setMarkerVisibility(m.id, e.target.checked)}
          />
          <button onClick={() => removeMarker(m.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
```

#### MapMarker Interface

```ts
interface MapMarker {
  id: string;
  lngLat: LngLat;
  popup?: string;              // HTML/text for popup
  color?: string;              // Hex color for default marker
  className?: string;          // CSS class for custom styling
  data?: Record<string, unknown>;  // Arbitrary metadata
  visible?: boolean;           // Default: true
}
```

---

### useMapPolygons

**File:** `use-map-polygons.ts`

Manage GeoJSON-based polygons (regions, areas).

#### Returns

```ts
{
  polygons: MapPolygon[];
  visiblePolygons: MapPolygon[];
  polygonCount: number;
  getPolygon: (id: string) => MapPolygon | undefined;
  addPolygon: (polygon: MapPolygon) => void;
  addPolygons: (polygons: MapPolygon[]) => void;
  setPolygons: (polygons: MapPolygon[]) => void;
  updatePolygon: (id: string, patch: Partial<Omit<MapPolygon, 'id'>>) => void;
  removePolygon: (id: string) => void;
  removeAllPolygons: () => void;
  setPolygonVisibility: (id: string, visible: boolean) => void;
}
```

#### Example

```tsx
import { useMapPolygons } from '@/src/hooks';

function RegionManager() {
  const { polygons, addPolygon, removePolygon } = useMapPolygons();

  const addMiamiRegion = () => {
    addPolygon({
      id: 'miami-region',
      coordinates: [
        [
          [-80.3, 25.7],
          [-80.1, 25.7],
          [-80.1, 25.9],
          [-80.3, 25.9],
          [-80.3, 25.7],
        ],
      ],
      fillColor: '#10b981',
      fillOpacity: 0.3,
      strokeColor: '#059669',
      strokeWidth: 2,
    });
  };

  return (
    <div>
      <button onClick={addMiamiRegion}>Add Miami Region</button>
      {polygons.map((p) => (
        <div key={p.id}>
          {p.id}
          <button onClick={() => removePolygon(p.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
```

#### MapPolygon Interface

```ts
interface MapPolygon {
  id: string;
  coordinates: [number, number][][];  // GeoJSON format: [lng, lat][][]
  fillColor?: string;
  fillOpacity?: number;       // Default: 0.3
  strokeColor?: string;
  strokeWidth?: number;       // Default: 2
  data?: Record<string, unknown>;
  visible?: boolean;
}
```

---

### useMapLines

**File:** `use-map-lines.ts`

Manage GeoJSON-based lines (routes, paths).

#### Returns

```ts
{
  lines: MapLine[];
  visibleLines: MapLine[];
  lineCount: number;
  getLine: (id: string) => MapLine | undefined;
  addLine: (line: MapLine) => void;
  addLines: (lines: MapLine[]) => void;
  setLines: (lines: MapLine[]) => void;
  updateLine: (id: string, patch: Partial<Omit<MapLine, 'id'>>) => void;
  removeLine: (id: string) => void;
  removeAllLines: () => void;
  setLineVisibility: (id: string, visible: boolean) => void;
}
```

#### Example

```tsx
import { useMapLines } from '@/src/hooks';

function RouteManager() {
  const { lines, addLine, removeLine } = useMapLines();

  const addRoute = () => {
    addLine({
      id: 'route-1',
      coordinates: [
        [-74.006, 40.7128],  // NYC
        [-118.2437, 34.0522], // LA
      ],
      color: '#f59e0b',
      width: 3,
      dashArray: [2, 2],  // Dashed line
    });
  };

  return (
    <div>
      <button onClick={addRoute}>Add NYC → LA Route</button>
      {lines.map((line) => (
        <div key={line.id}>
          {line.id}
          <button onClick={() => removeLine(line.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
```

#### MapLine Interface

```ts
interface MapLine {
  id: string;
  coordinates: [number, number][];  // GeoJSON format: [lng, lat][]
  color?: string;
  width?: number;            // Default: 2
  dashArray?: number[];      // e.g., [2, 2] for dashed
  data?: Record<string, unknown>;
  visible?: boolean;
}
```

---

### useMapSettings

**File:** `use-map-settings.ts`

Control map appearance and interaction settings.

#### Returns

```ts
{
  style: MapStyle;
  projection: MapProjection;
  cursor: CursorStyle;
  interactionsEnabled: boolean;
  terrain3D: boolean;
  setStyle: (style: MapStyle) => void;
  setProjection: (projection: MapProjection) => void;
  setCursor: (cursor: CursorStyle) => void;
  setInteractionsEnabled: (enabled: boolean) => void;
  setTerrain3D: (enabled: boolean) => void;
}
```

#### Example

```tsx
import { useMapSettings } from '@/src/hooks';

function SettingsPanel() {
  const {
    style,
    projection,
    terrain3D,
    interactionsEnabled,
    setStyle,
    setProjection,
    setTerrain3D,
    setInteractionsEnabled,
    setCursor,
  } = useMapSettings();

  return (
    <div>
      <select value={style} onChange={(e) => setStyle(e.target.value as MapStyle)}>
        <option value="mapbox://styles/mapbox/dark-v11">Dark</option>
        <option value="mapbox://styles/mapbox/light-v11">Light</option>
        <option value="mapbox://styles/mapbox/satellite-v9">Satellite</option>
        <option value="mapbox://styles/mapbox/streets-v12">Streets</option>
        <option value="mapbox://styles/mapbox/outdoors-v12">Outdoors</option>
      </select>

      <label>
        <input
          type="checkbox"
          checked={terrain3D}
          onChange={(e) => setTerrain3D(e.target.checked)}
        />
        3D Terrain
      </label>

      <label>
        <input
          type="checkbox"
          checked={interactionsEnabled}
          onChange={(e) => setInteractionsEnabled(e.target.checked)}
        />
        User Interactions
      </label>

      <button onClick={() => setCursor('crosshair')}>Crosshair Cursor</button>
      <button onClick={() => setCursor('auto')}>Auto Cursor</button>
    </div>
  );
}
```

#### Types

```ts
type MapStyle =
  | 'mapbox://styles/mapbox/dark-v11'
  | 'mapbox://styles/mapbox/light-v11'
  | 'mapbox://styles/mapbox/streets-v12'
  | 'mapbox://styles/mapbox/outdoors-v12'
  | 'mapbox://styles/mapbox/satellite-v9'
  | 'mapbox://styles/mapbox/satellite-streets-v12'
  | (string & {});

type MapProjection =
  | 'mercator'
  | 'globe'
  | 'equalEarth'
  | 'naturalEarth'
  | 'winkelTripel'
  | (string & {});

type CursorStyle = 'auto' | 'pointer' | 'crosshair' | 'grab' | 'move';
```

---

### useMapEvents

**File:** `use-map-events.ts`

Subscribe to map interaction events.

#### Parameters

```ts
{
  onClick?: (e: MapClickEvent) => void;
  onDblClick?: (e: MapClickEvent) => void;
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
  onZoomEnd?: () => void;
  onMouseMove?: (e: MapClickEvent) => void;
  onContextMenu?: (e: MapClickEvent) => void;
}
```

#### MapClickEvent

```ts
interface MapClickEvent {
  lngLat: LngLat;
  point: { x: number; y: number };  // Screen coordinates
  features?: mapboxgl.MapboxGeoJSONFeature[];
}
```

#### Example

```tsx
import { useState } from 'react';
import { useMapEvents } from '@/src/hooks';
import type { LngLat } from '@/src/stores/map-store';

function MapEventListener() {
  const [lastClick, setLastClick] = useState<LngLat | null>(null);
  const [moveCount, setMoveCount] = useState(0);

  useMapEvents({
    onClick: ({ lngLat }) => {
      console.log('Clicked at:', lngLat);
      setLastClick(lngLat);
    },
    onMoveEnd: () => {
      setMoveCount((c) => c + 1);
    },
    onDblClick: ({ lngLat }) => {
      console.log('Double-clicked at:', lngLat);
    },
  });

  return (
    <div>
      <p>Last click: {lastClick ? `${lastClick.lat}, ${lastClick.lng}` : 'None'}</p>
      <p>Move events: {moveCount}</p>
    </div>
  );
}
```

---

### useMapCursorPosition

**File:** `use-map-events.ts`

Track the cursor's live lng/lat coordinates as the mouse moves over the map.

#### Returns

```ts
LngLat | null
```

#### Example

```tsx
import { useMapCursorPosition } from '@/src/hooks';

function CursorDisplay() {
  const position = useMapCursorPosition();

  return (
    <div>
      {position ? (
        <p>
          Cursor: {position.lat.toFixed(4)}°, {position.lng.toFixed(4)}°
        </p>
      ) : (
        <p>Hover over map</p>
      )}
    </div>
  );
}
```

---

### useMapDistance

**File:** `use-map-events.ts`

Calculate distances between points using the Haversine formula.

#### Returns

```ts
{
  distanceMetres: (a: LngLat, b: LngLat) => number;
  distanceKm: (a: LngLat, b: LngLat) => number;
  distanceMiles: (a: LngLat, b: LngLat) => number;
}
```

#### Example

```tsx
import { useMapDistance } from '@/src/hooks';

function DistanceCalculator() {
  const { distanceKm, distanceMiles } = useMapDistance();

  const nyc = { lng: -74.006, lat: 40.7128 };
  const la = { lng: -118.2437, lat: 34.0522 };

  return (
    <div>
      <p>NYC → LA: {distanceKm(nyc, la).toFixed(0)} km</p>
      <p>NYC → LA: {distanceMiles(nyc, la).toFixed(0)} miles</p>
    </div>
  );
}
```

---

### useMapInstance

**File:** `use-map-instance.ts`

Access the raw Mapbox GL JS map instance for advanced operations.

#### Returns

```ts
{
  map: mapboxgl.Map | null;
  mapLoaded: boolean;
}
```

#### Example

```tsx
import { useMapInstance } from '@/src/hooks';
import { useEffect } from 'react';

function AdvancedMapFeature() {
  const { map, mapLoaded } = useMapInstance();

  useEffect(() => {
    if (!map || !mapLoaded) return;

    // Direct Mapbox GL API access
    map.addSource('my-custom-source', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    map.addLayer({
      id: 'my-custom-layer',
      type: 'circle',
      source: 'my-custom-source',
      paint: {
        'circle-radius': 6,
        'circle-color': '#007cbf',
      },
    });

    return () => {
      if (map.getLayer('my-custom-layer')) {
        map.removeLayer('my-custom-layer');
      }
      if (map.getSource('my-custom-source')) {
        map.removeSource('my-custom-source');
      }
    };
  }, [map, mapLoaded]);

  return null;
}
```

> **Note:** Use this hook only when you need operations not covered by the store hooks. For most use cases, the higher-level hooks are preferred.

---

### useMapLayerSync

**File:** `use-map-layer-sync.ts`

**(Internal)** This hook is used internally by the `MapboxMap` component to synchronize markers, polygons, and lines from the store to the live map. You typically don't need to use this directly.

It subscribes to store changes and updates Mapbox GL layers/sources accordingly.

---

## Type Reference

### Core Types

```ts
interface LngLat {
  lng: number;
  lat: number;
}

interface BoundingBox {
  sw: LngLat;  // south-west corner
  ne: LngLat;  // north-east corner
}

interface FlyToOptions {
  center: LngLat;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;  // milliseconds, default 2000
}
```

### Layer Types

See [useMapMarkers](#usemapmarkers), [useMapPolygons](#usemappolygons), and [useMapLines](#usemaplines) for full type definitions.

---

## Best Practices

### 1. Use Hooks Instead of Direct Store Access

Always prefer hooks over `useMapStore` directly:

```tsx
// ✅ Good
import { useMapMarkers } from '@/src/hooks';
const { addMarker } = useMapMarkers();

// ❌ Avoid (unless you have a specific reason)
import { useMapStore } from '@/src/stores/map-store';
const addMarker = useMapStore((s) => s.addMarker);
```

### 2. Wait for Map to Load

Many operations require the map to be fully loaded:

```tsx
const { map, mapLoaded } = useMapInstance();

useEffect(() => {
  if (!map || !mapLoaded) return;
  // Safe to perform advanced operations
}, [map, mapLoaded]);
```

### 3. Clean Up Markers/Polygons/Lines

Always remove layers when they're no longer needed:

```tsx
useEffect(() => {
  addMarker({ id: 'temp-marker', lngLat: { lng: -95, lat: 37 } });
  
  return () => {
    removeMarker('temp-marker');
  };
}, [addMarker, removeMarker]);
```

### 4. Use Stable IDs

Use predictable, stable IDs for layers to avoid duplicates:

```tsx
// ✅ Good - based on data ID
addMarker({ id: `trap-${trap.id}`, lngLat: trap.location });

// ❌ Bad - timestamp-based IDs create duplicates on re-render
addMarker({ id: `marker-${Date.now()}`, lngLat });
```

### 5. Batch Updates

When adding many items, use the batch methods:

```tsx
// ✅ Good
const markers = traps.map(trap => ({
  id: `trap-${trap.id}`,
  lngLat: trap.location,
  color: '#10b981',
}));
addMarkers(markers);

// ❌ Less efficient
traps.forEach(trap => {
  addMarker({
    id: `trap-${trap.id}`,
    lngLat: trap.location,
    color: '#10b981',
  });
});
```

### 6. Store Metadata in `data` Fields

Use the `data` field to attach arbitrary information:

```tsx
addMarker({
  id: 'trap-1',
  lngLat: { lng: -95, lat: 37 },
  color: '#10b981',
  data: {
    trapType: 'BGS',
    lastCollection: '2026-02-10',
    mosquitoCount: 42,
  },
});

// Later...
const marker = getMarker('trap-1');
console.log(marker?.data?.mosquitoCount);
```

---

## Example Patterns

### Pattern 1: Display User's Current Location

```tsx
import { useMapCenter, useMapMarkers } from '@/src/hooks';
import { useUserLocation } from '@/src/hooks/use-user-location';

function ShowMyLocation() {
  const { location } = useUserLocation();
  const { flyTo } = useMapCenter();
  const { addMarker } = useMapMarkers();

  useEffect(() => {
    if (!location) return;

    flyTo({ center: location, zoom: 14 });
    addMarker({
      id: 'my-location',
      lngLat: location,
      color: '#3b82f6',
      popup: 'You are here',
    });

    return () => {
      removeMarker('my-location');
    };
  }, [location]);

  return null;
}
```

### Pattern 2: Click to Add Markers

```tsx
import { useMapEvents, useMapMarkers } from '@/src/hooks';

function ClickToAdd() {
  const { addMarker } = useMapMarkers();

  useMapEvents({
    onClick: ({ lngLat }) => {
      addMarker({
        id: `marker-${Date.now()}`,
        lngLat,
        color: '#f59e0b',
      });
    },
  });

  return null;
}
```

### Pattern 3: Sync External Data to Map

```tsx
import { useEffect } from 'react';
import { useMapMarkers } from '@/src/hooks';
import { useTrapQuery } from '@/src/hooks/use-trap-query';

function TrapMarkers() {
  const { data: traps } = useTrapQuery();
  const { setMarkers } = useMapMarkers();

  useEffect(() => {
    if (!traps) return;

    const markers = traps.map((trap) => ({
      id: `trap-${trap.id}`,
      lngLat: { lng: trap.longitude, lat: trap.latitude },
      color: trap.status === 'active' ? '#10b981' : '#ef4444',
      popup: `<strong>${trap.name}</strong><br/>${trap.status}`,
      data: { trapId: trap.id, status: trap.status },
    }));

    setMarkers(markers);
  }, [traps, setMarkers]);

  return null;
}
```

### Pattern 4: Draw Regions from GeoJSON

```tsx
import { useEffect } from 'react';
import { useMapPolygons } from '@/src/hooks';

function RegionOverlays({ regions }: { regions: GeoJSONFeature[] }) {
  const { setPolygons } = useMapPolygons();

  useEffect(() => {
    const polygons = regions.map((region) => ({
      id: region.properties.id,
      coordinates: region.geometry.coordinates,
      fillColor: region.properties.color || '#10b981',
      fillOpacity: 0.2,
      strokeColor: region.properties.color || '#059669',
      strokeWidth: 2,
      data: region.properties,
    }));

    setPolygons(polygons);
  }, [regions, setPolygons]);

  return null;
}
```

### Pattern 5: Measure Distance Between Clicks

```tsx
import { useState } from 'react';
import { useMapEvents, useMapDistance, useMapLines } from '@/src/hooks';
import type { LngLat } from '@/src/stores/map-store';

function DistanceTool() {
  const [points, setPoints] = useState<LngLat[]>([]);
  const { distanceKm } = useMapDistance();
  const { addLine, removeAllLines } = useMapLines();

  useMapEvents({
    onClick: ({ lngLat }) => {
      if (points.length === 0) {
        setPoints([lngLat]);
      } else if (points.length === 1) {
        const newPoints = [...points, lngLat];
        setPoints(newPoints);
        
        addLine({
          id: 'distance-line',
          coordinates: newPoints.map((p) => [p.lng, p.lat]),
          color: '#f59e0b',
          width: 3,
        });
      } else {
        // Reset
        setPoints([]);
        removeAllLines();
      }
    },
  });

  const distance = points.length === 2 ? distanceKm(points[0], points[1]) : null;

  return (
    <div>
      {points.length === 0 && <p>Click to start measuring</p>}
      {points.length === 1 && <p>Click second point</p>}
      {distance && <p>Distance: {distance.toFixed(2)} km</p>}
    </div>
  );
}
```

### Pattern 6: Fit Map to Show All Markers

```tsx
import { useMapMarkers, useMapBoundingBox } from '@/src/hooks';

function FitToMarkers() {
  const { markers } = useMapMarkers();
  const { fitBounds } = useMapBoundingBox();

  const handleFit = () => {
    if (markers.length === 0) return;

    const lngs = markers.map((m) => m.lngLat.lng);
    const lats = markers.map((m) => m.lngLat.lat);

    const bounds = {
      sw: { lng: Math.min(...lngs), lat: Math.min(...lats) },
      ne: { lng: Math.max(...lngs), lat: Math.max(...lats) },
    };

    fitBounds(bounds, { padding: 50, duration: 1500 });
  };

  return (
    <button onClick={handleFit} disabled={markers.length === 0}>
      Fit to All Markers
    </button>
  );
}
```

---

## Demo Route

**File:** `apps/simmer/src/routes/(app)/map-example.tsx`

Visit the `/map-example` route in the app to see a live, interactive demo of all hooks and store features. The page includes:

- Navigation controls (flyTo different cities)
- Viewport controls (zoom, pitch, bearing)
- Bounding box queries
- Adding/removing markers, polygons, and lines
- Map settings (style, terrain, cursor, interactions)
- Event listeners (click, moveEnd, cursor position)
- Distance calculations

This route serves as both documentation and a test suite for the map system.

---

## Environment Setup

Ensure you have the following in your `.env` file:

```bash
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
```

Without a valid Mapbox token, the map will fail to load.

---

## Troubleshooting

### Map doesn't appear
- Verify `VITE_MAPBOX_ACCESS_TOKEN` is set correctly
- Check browser console for errors
- Ensure `<MapboxMap />` is rendered in your layout

### Markers/polygons don't appear
- Verify the map is loaded: `const { mapLoaded } = useMapInstance();`
- Check that IDs are unique (duplicate IDs replace existing items)
- Ensure `visible` is not set to `false`

### Map interactions not working
- Check `interactionsEnabled` state: `const { interactionsEnabled } = useMapSettings();`
- Verify no overlaying elements with higher `z-index` are blocking the map

### Performance issues with many markers
- Use `visible: false` to hide markers without removing them
- Consider clustering (future enhancement)
- Use `removeAllMarkers()` and `addMarkers()` for bulk updates

---

## Additional Resources

- [Mapbox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js/api/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [GeoJSON Specification](https://geojson.org/)

---

**Last Updated:** February 11, 2026
