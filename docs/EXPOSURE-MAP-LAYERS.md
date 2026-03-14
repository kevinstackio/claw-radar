# Exposure Map Points

## Goal

- Record the current exposure map behavior.
- Keep the popup field contract for every instance point.
- Explicitly state that world view and zoomed view use different presentation rules.

## Current Behavior

- In world view (`zoom <= 3`), the map renders one active point per country.
- Each country's active point rotates across that country's instance coordinates on an independent timer.
- Single-point countries stay visible continuously and do not fade out.
- Multi-point countries rotate through their points in fixed order so every point is shown.
- Each country's switch is sequential: the current point fades out completely, then the next point fades in.
- Country phases stay staggered so the world view does not hard-cut globally.
- Once the user zooms in beyond world view, the map renders every valid exposed instance point from the snapshot.
- One instance point corresponds to one unique public IP in `netlas_instances`.
- In world view (`zoom <= 3`), points are display-only and do not open popups.
- Once the user zooms in beyond world view, each point can open its instance popup.

## Point Styling

- Default point radius: `2.8`
- Selected point radius: `3.8`
- Point style: fill only, no stroke
- Default fill color: `--map-marker-fill`
- Selected fill color: `--map-marker-selected-fill`
- Default fill opacity: `0.76`
- Selected fill opacity: `0.88`
- Every rendered point also renders two animated ripple rings
- World-view points also use a slower marker breathe animation
- World-view country rotation cycle: `3.6s` to `6.4s` per country
- World-view crossfade window: `0.76s` to `1.04s` per country
- Primary ripple offset / weight / opacity: `+2.1 / 1.45 / 0.88`
- Secondary ripple offset / weight / opacity: `+4.1 / 1.2 / 0.62`
- Ripple colors come from `--map-marker-ripple` and `--map-marker-selected-ripple`

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
  - switches between world-view country rotation and zoomed full-instance rendering
  - handles IP search focus and popup opening
- `lib/world-view-country-rotation.mjs`
  - picks one active point per country on independent rotation clocks
- `lib/exposure-snapshot.ts`
  - provides the point list with coordinates and popup fields
- `lib/exposure-types.ts`
  - defines the instance-point shape shared by the map and API
