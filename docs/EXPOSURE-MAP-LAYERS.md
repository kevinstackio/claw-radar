# Exposure Map

## Goal

- Record the current exposure map behavior.
- Make it explicit that the map now renders one emoji marker per raw country/region code.

## Current Behavior

- The map renders the Leaflet/OpenStreetMap base layer.
- Each raw country/region code renders exactly one static `🦞` marker.
- Codes are grouped exactly as stored in the snapshot; region codes like `HK` and `CN` stay separate.
- Codes with a single instance stay fixed on that one point.
- Codes with multiple instances periodically switch to another instance from that same code.
- Each point uses a fixed `5s` timing window: `1s` fade in, `3s` steady, `1s` fade out.
- The switch is sequential: one `🦞` fully fades out before the next `🦞` fades in.
- The map does not render popups, ripple effects, or world-view rotation logic.
- Zooming and panning remain available as plain map navigation.
- IP search no longer drives map focus or popup state.

## Implementation

- `/Users/kevin/Documents/git/claw-radar/components/exposure-map-client.tsx`
  - renders the base map and one rotating marker per raw country/region code
- `/Users/kevin/Documents/git/claw-radar/components/exposure-map.tsx`
  - client-only wrapper for the map panel
- `/Users/kevin/Documents/git/claw-radar/lib/map-region-rotation.mjs`
  - picks one active point per raw country/region code without merging codes like `HK` into `CN`
