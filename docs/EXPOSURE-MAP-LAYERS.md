# Exposure Map

## Goal

- Record the current exposure map behavior.
- Make it explicit that the map now renders one emoji marker per country.

## Current Behavior

- The map renders the Leaflet/OpenStreetMap base layer.
- Each raw country/region code renders exactly one static `🦞` marker.
- Codes are grouped exactly as stored in the snapshot; region codes like `HK` and `CN` stay separate.
- The displayed marker uses a stable representative point from that code's instances.
- Each `🦞` marker is static and has no animation.
- The map does not render popups, ripple effects, or world-view rotation logic.
- Zooming and panning remain available as plain map navigation.
- IP search no longer drives map focus or popup state.

## Implementation

- `/Users/kevin/Documents/git/claw-radar/components/exposure-map-client.tsx`
  - renders the base map and one representative marker per country
- `/Users/kevin/Documents/git/claw-radar/components/exposure-map.tsx`
  - client-only wrapper for the map panel
