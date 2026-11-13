# Architecture

This document describes the overall components and contracts. World partitioning, tile boundaries, and conversations by area are covered in detail in [world-tiles-and-realtime.md](world-tiles-and-realtime.md); keeping them separate avoids turning the overview into an excessively long operational document.

## Overview

- `web/`: TypeScript client with Phaser 3, compiled as a static site by Vite.
- `backend/`: Flask API organized by app factory, routes, and domain services.
- `api/index.py`: WSGI adapter discovered by Vercel to run the Flask API.
- MongoDB Atlas: persistent source for accounts, profiles, and gamified locations.
- Supabase Realtime: ephemeral presence and messages between players.
- OpenStreetMap/Overpass: building/POI and water geometries and names for fixed 5 km tiles; Phaser renders 2.5D volumes without a basemap by default. An option loads a satellite image on demand as a background; game layers remain on top.

The client never receives MongoDB credentials, JWT secrets, or `service_role` keys. The Flask server validates identity and permissions; the client uses only the Supabase anon key and a short-lived token issued by the server for private channels.

## Domains and data

- `users`: normalized login name, scrypt password hash, avatar identifier, optional private email, and creation/update dates.
- `profiles`: public data chosen by the player, kept separate from access data.
- `locations`: approved geographic points for the world, with coordinates, public metadata, and a reference to versioned art in the game repository.
- `events`: geographic center and area configuration. The center is shared by all event participants.
- `teleport targets`: POIs and places marked on the map that appear in a filterable search list; the search can also be opened over the map. Selecting a POI shows its name, type, and category; the player can then teleport to its local coordinate in the event world. The same mechanism supports teleporting to the current GPS reading when available.
- Avatars: six existing local glyphs and 34 previews selected from the OpenGameArt “3/4 Directional Sprite Sets” collection and filtered for CC0 licensing. The local images power the registration/profile selector and player representation; authors and sources are listed in [avatar-assets.md](avatar-assets.md).
- Presence, live positions, and messages are not persisted. Supabase Broadcast/Presence avoids storing chat and position histories. When the page becomes visible again or the network is restored, the client refreshes the Realtime token and forces the socket to reconnect so it can resubscribe to the current tile; presence is published again and positions resume being transmitted by the game loop. State remains ephemeral: a disconnected client does not leave a persisted offline position.

Game code and assets can be versioned normally in the repository. Image optimization reduces downloads and speeds up loading; it is not intended to work around a Git quota. MongoDB stores metadata and references, never binaries. If player uploads are added in the future, they should go to object storage, not MongoDB.

Email must never appear in the public profile endpoint. Without an associated email, an account cannot use email recovery. In the first version, avatars are selectable local assets, with no image uploads by players.

## Flows

1. Registration and login send the name and password over HTTPS to the API. Passwords are stored only as scrypt hashes; responses do not confirm whether a name or email exists.
2. The API issues short-lived session tokens. A separate, also short-lived token authorizes the player to join private Supabase channels for presence and messages.
3. The API queries OpenStreetMap for buildings, POIs, and water in the authorized 5 km tile; Phaser draws these features over the 2.5D map or the optional satellite image. The tile does not include an OSM street basemap. When crossing a boundary, the client requests authorization for the next tile and preserves the geographic coordinate. Dragging the viewport moves only the camera.
4. Public profile operations and private email configuration use separate operations, verified by account ownership.

## Positioning and distance

- The player chooses one exclusive mode: joystick/manual, continuous GPS, or BLE. In manual mode, stop the GPS watcher and BLE scanner; publish only positions moved by the player. A one-time GPS teleport must not reactivate continuous updates.
- The avatar can be changed in Profile; the endpoint validates the allowed ID, saves the selection, and issues an updated token for the Realtime identity.
- The user can drag the map to explore the cell without moving the avatar and return the camera to the player with a dedicated control. Clicking a POI opens its name, type, and category; search and teleport are also available in a panel over the map.
- Zoom controls include an action to frame the full 5 km tile and another to open the Phaser viewport in fullscreen; the tile boundary is outlined in yellow, and exiting fullscreen restores the normal layout.
- The satellite option fetches an image of the current tile only when enabled, keeps POIs, buildings, and players as overlays, and shows Esri/Maxar and OpenStreetMap attribution. If the image source fails, the 2.5D map remains available.
- With explicit permission during the event session, the client uses the device's Geolocation API and sends latitude, longitude, reported accuracy, and capture time.
- GPS is suitable for outdoor positioning, but accuracy varies with the device and environment; the interface must show the error margin and not promise an exact distance. Ignore stale readings or readings with insufficient accuracy, and smooth noise without hiding uncertainty.
- Calculate outdoor horizontal distance using the geodesic (Haversine) between recent readings. The combined uncertainty of both positions must accompany the result; if the error margins overlap, show an estimate/range rather than an apparently exact distance.
- Indoors, BLE can be used with fixed, identified beacons mapped to known coordinates. RSSI without a calibrated beacon network only estimates proximity and does not provide an exact position. The browser may not allow BLE reading on all devices; provide a manual or GPS fallback when available.
- Improving indoor positioning requires planning the event infrastructure and calibrating the beacons on site. Sub-meter accuracy may require BLE with Angle of Arrival supported by compatible hardware or UWB; do not assume any method works without testing on the target devices.
- GPS/BLE are sources of physical coordinates; an event-specific transform converts those coordinates to the gamified 2D map. Distances use valid, recent physical coordinates, not visual distance on the map.
- Transmit coordinates in private Supabase Broadcast messages, limited to the room/event and a moderate frequency; Presence stores only basic connected state. Do not store trails, live coordinates, or distances in MongoDB. Discard state on exit/expiry. On `visibilitychange` to visible or an `online` event, refresh the token and force the socket to reconnect so the current tile's subscription and presence are restored. Positions resume being sent by the game loop; there is no queue or history for offline clients. Channels are exclusive to the current tile: when switching, remove the old subscription before joining the new one. Do not share positions or messages between tiles; see [world-tiles-and-realtime.md](world-tiles-and-realtime.md).
- The client should also offer manual teleportation to known map points: search by named POI or building, show a results list, click to move the avatar to the coordinate, and provide a “Use current GPS” button to reposition the player at the device's recent location without leaving the event world.
- Request permission only on entering the world, explain its use for proximity between players, allow pausing/opt-out, and never expose coordinates in a public profile. Apply RLS, short-lived per-event tokens, data-age validation, and abuse limits.

## API

- `GET /api/health`: simple function check that does not depend on MongoDB/Supabase.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- `POST /api/account/email` and `GET /api/account/email`; `POST /api/auth/verify-email`.
- `POST /api/auth/recovery` and `POST /api/auth/reset` for confirmed email.
- `GET /api/profiles/me`, `PATCH /api/profiles/me`, and `GET /api/profiles/{username}`.
- `GET /api/world`, `POST /api/world/center`, `POST /api/world/tile`, and `PUT /api/admin/event` to configure the shared center and authorize event tiles.
- `GET /api/world/features?tile_x=<x>&tile_y=<y>` to load POIs and buildings in the cell.
- `POST /api/realtime/token` for short-lived authorization restricted to the user and current tile.

Routes validate inputs and keep public fields separate from credentials. The Realtime policy checks sender identity, avatar, and payload size limits. In production, apply rate limiting for authentication and recovery at the API gateway.

## Deployment and operations

Vercel publishes `web/dist` and routes `/api/*` to the Python adapter. Each Flask invocation is ephemeral: do not use local disk for state, uploads, or sessions. MongoDB Atlas should allow connections only from the deployment environment and use small timeouts/pools. Supabase applies RLS to private channels; do not use public channels for private messages.

Set the `.env.example` variables in the local environment and in the Vercel dashboard. `VITE_*` is embedded in the bundle and must contain public values only. The Supabase JWT secret stays exclusively on the server and must be compatible with the Supabase project's JWT signing configuration. Never commit `.env`.

## State and evolution

Each event uses a fixed grid of 5 × 5 km tiles anchored at the shared geographic center. Presence, positions, and chat use the exclusive private channel `event:<event_id>:tile:<tile_x>:<tile_y>`. Switching immediately ends communication with the previous tile and requires authorization for the new one; there is no sharing between tiles. In mobile browsers, suspending the page can interrupt the socket; when the page becomes visible again, the client refreshes authorization and reconnects to the same tile. This restores communication, but does not persist the last position or keep an offline player visible. The corresponding RLS policy is in `supabase/realtime_policies.sql` and must be applied to the Supabase project.

1. Apply and validate the tile RLS policy in production Supabase.
2. Add distributed rate limiting at the gateway and usage limits per event.
3. Operate BLE beacons only after calibration and testing on the devices used at the event.
4. Add observability without logging passwords, tokens, email, or private messages.
