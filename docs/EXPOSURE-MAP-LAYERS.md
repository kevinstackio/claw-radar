# Exposure Map

## Goal

- Record the current exposure map behavior.
- Make it explicit that world view and country/detail view use different point-display rules.

## Current Behavior

- The map renders the Leaflet/OpenStreetMap base layer.
- The map uses four zoom tiers with `maxZoom = 12` and `minZoom = 1`.
- `1-3`: world view
- `4-6`: country view
- `7-9`: regional view
- `10-12`: detail view
- In world view (`zoom <= 3`), each raw country/region code renders one active `🦞`.
- Codes are grouped exactly as stored in the snapshot; region codes like `HK` and `CN` stay separate.
- World-view codes with a single instance stay fixed on that one point.
- World-view codes with multiple instances periodically switch to another instance from that same code.
- World-view timing is fixed at `5s` per point: `1s` fade in, `3s` steady, `1s` fade out.
- World-view switching is sequential: one `🦞` fully fades out before the next `🦞` fades in.
- Once the user zooms beyond world view, the map renders all valid `🦞` instance points directly.
- Country, regional, and detail view do not do province aggregation.
- `🦞` marker size is `12` in world view and `16` in country/regional/detail view.
- From country view (`zoom >= 4`) onward, clicking a `🦞` opens a wider popup with `IP`, `Country`, `ISP`, `Protocol`, `Port`, and `Updated`.
- The popup masks the middle of the IP by default and includes a copy icon for the real IP.
- The map does not render ripple effects.
- Zooming and panning remain available as plain map navigation.
- IP search flies the map to the matched instance and opens its popup.

## Implementation

- `/Users/kevin/Documents/git/claw-radar/components/exposure-map-client.tsx`
  - switches between world-view region rotation and full instance-point rendering
- `/Users/kevin/Documents/git/claw-radar/components/exposure-map.tsx`
  - client-only wrapper for the map panel
- `/Users/kevin/Documents/git/claw-radar/lib/map-region-rotation.mjs`
  - picks one active point per raw country/region code without merging codes like `HK` into `CN`
