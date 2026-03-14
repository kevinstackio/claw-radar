# Exposure Map Points

## Goal

- Record the current exposure map behavior.
- Keep the popup field contract for every instance point.
- Explicitly state that the map no longer aggregates by country, region, or city.

## Current Behavior

- The map always renders every valid exposed instance point from the snapshot.
- One instance point corresponds to one unique public IP in `netlas_instances`.
- There is no country anchor, region aggregate, city aggregate, or zoom-dependent bucket logic.
- Zoom only changes how close the user is to the point cloud; it does not change the data model.
- In world view (`zoom <= 3`), points are display-only and do not open popups.
- Once the user zooms in beyond world view, each point can open its instance popup.

## Point Styling

- Default point radius: `2.8`
- Selected point radius: `3.8`
- Point style: fill only, no stroke
- Default fill color: `--map-marker-fill`
- Selected fill color: `--map-marker-selected-fill`
- Default fill opacity: `0.9`
- Selected fill opacity: `0.96`
- Every point also renders two animated ripple rings
- Primary ripple offset / weight / opacity: `+2.1 / 1.2 / 0.58`
- Secondary ripple offset / weight / opacity: `+4.1 / 1.0 / 0.40`

## Popup Contract

- Title: `IP`
- Subtitle: `Instance view`
- Fields:
  - `Country`
  - `City` when available
  - `ISP` when available
  - `ASN` when available
  - `Organization` when available
  - `Ports`
  - `Updated`

## Search Behavior

- IP search flies directly to the matched point.
- Search lands at max zoom, so the matched point popup can open immediately.
- The matched point is rendered last so it stays visually on top.
- When the target marker is mounted and the map is beyond world view, its popup opens automatically.

## Implementation

- `components/exposure-map-client.tsx`
  - renders every instance point
  - handles IP search focus and popup opening
- `lib/exposure-snapshot.ts`
  - provides the point list with coordinates and popup fields
- `lib/exposure-types.ts`
  - defines the instance-point shape shared by the map and API
