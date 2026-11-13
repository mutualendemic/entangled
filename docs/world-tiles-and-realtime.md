# World Tiles and Realtime

## Decision

Keeping an overall architecture document and this detailed document is the recommended division. The overall architecture records stable decisions across services; this ADR specifies spatial partitioning, player connections, and local conversations.

An event occupies contiguous logical cells of 5 × 5 km, indexed relative to the shared geographic center, which is defined once and immutable after creation. Each cell has its own temporary presence and conversation. When crossing a boundary, the client immediately ends communication with the previous cell, requests authorization for the next one, and joins only the new cell's channel. Players and messages from other cells are not shared, including from adjacent cells.

A cell is not a separate server, deployment, or database. Persistent data remains in the same event/MongoDB; partitioning is a routing strategy for Supabase Realtime channels and map loading.

A square tile measuring 5 km per side is not a 5 km proximity radius: two players at opposite corners can be approximately 7.1 km apart and still belong to the same cell. The tile determines conversation/routing; player visibility must use geodesic distance separately. If the product rule is that no one more than 5 km away can share a position or conversation, use a 5 km circular filter or smaller cells; do not infer that rule from the tile index alone.

## OSM data and game cells

The extract includes named buildings, POIs, and bodies of water; it does not query streets or load OSM images. Phaser draws water and footprints as 2.5D volumes and places names over buildings. An Esri/Maxar satellite image can be loaded on demand as a background layer.

- **OSM feature:** geometry, tags, and name queried on demand by the API through Overpass.
- **World cell:** a fixed logical area of 5 × 5 km used to partition presence and conversations. Its logical identifier depends on the event and the cell's coordinates.

Visibly attribute OpenStreetMap/Overpass data and respect the public service's limits. The API uses an ephemeral in-memory cache with a TTL to avoid repeating requests; do not persist the response or geometries in MongoDB collections.

## Spatial index

The event has a stable geographic center, set by the organizer or by the event's initial configuration. Convert GPS to local coordinates in meters using a local projection centered on that point. Let `east_m` be the displacement east and `north_m` the displacement north. With `CELL_SIZE_M = 5000`, the tile whose initial center is the event center is `(0, 0)`:

```text
tile_x = floor((east_m + CELL_SIZE_M / 2) / CELL_SIZE_M)
tile_y = floor((north_m + CELL_SIZE_M / 2) / CELL_SIZE_M)
```

Each index pair covers exactly 5000 meters per side in the local plane. The geodesic conversion must be shared between the backend, Phaser, and boundary tests; do not calculate tiles from pixels, zoom, or OSM map tiles. For very large events, replace the local projection with an appropriate geodesic projection and version that change, since it alters cell boundaries.

The Phaser viewport is limited to the current cell. When crossing a boundary, movement pauses, the client closes the current channel, and requests `POST /api/world/tile` to authorize the destination. After the response, it loads that tile's features and converts the local position while preserving the geographic coordinate, without teleporting the player to the center. If authorization fails, the player remains at the boundary and can continue in the previous cell. Dragging the viewport moves only the camera within the cell boundaries; the joystick, GPS, and BLE continue to control the avatar's position. A separate command recenters the camera on the player. The tile's geographic boundary is drawn in yellow in the scene, with thickness adjusted for zoom so it remains visible when framing the full 5 km tile.

The controls include framing the entire 5 km cell and opening the Phaser viewport in fullscreen; the browser restores the normal layout when fullscreen is exited.

## Channels and conversations

Each tile uses an exclusive private topic for presence, positions, and conversation:

```text
event:<event_id>:tile:<tile_x>:<tile_y>
```

- The player publishes position, presence state, and ephemeral conversation to the exclusive topic for the current cell. Messages and positions are not persisted in MongoDB.
- The client subscribes to exactly one tile. There are no neighboring subscriptions, channel overlap, or message forwarding between cells.
- When it detects a boundary, the client removes the old subscription before requesting authorization for the new tile. This immediately ends the old communication; there may be a short period without Realtime during authorization/loading.
- On exit, immediately clear remote players and messages held by the client. On entering the new tile, publish new presence and position only after subscribing to its channel.

Thus, players in different tiles of the same event do not see one another's positions or receive one another's conversations. Communication resumes only when both are authorized and connected to the same tile; there are no boundary channels or cross-tile visibility.

### Resuming connections in mobile browsers

Android and other mobile systems may suspend a background page and interrupt its WebSocket. When the page becomes visible again or the network is restored, the client refreshes the Realtime token and forces the socket to reconnect. The current tile's channel subscribes again and presence is published again, without authorizing or joining another tile. There may be a brief interruption while the subscription is restored.

Positions are ephemeral broadcasts, with no queue or history for disconnected clients. When the game resumes execution, its loop resumes transmitting the current position (approximately every 250 ms); other clients see it only after receiving a new broadcast. Presence and position are not retained to represent an offline player. A new game instance or another browser, such as Chrome or Brave, does not inherit the in-memory position from the previous browser. Persisting the last position for offline use would require a product decision and storage with specific expiration and privacy controls.

## Authorization and privacy

- `POST /api/world/tile` validates the cell index within the authenticated event. The client cannot change `event_id`; out-of-range indices or invalid geographic centers are rejected.
- `POST /api/realtime/token` issues a short-lived JWT bound to `sub`, `event_id`, `tile_x`, and `tile_y`. The returned topic is exactly `event:<event_id>:tile:<tile_x>:<tile_y>`.
- RLS policies compare `realtime.topic()` with the token claims and reject subscriptions to any other tile. The client cannot choose an arbitrary `event_id` or subscribe to public topics.
- Validate that each position message belongs to the event and declared cell, is within the limits, and has a recent timestamp. The JWT confirms identity but does not prove that the device's GPS is truthful; strong geographic anti-cheat requires additional validation.
- Transmit precise location only when the player has consented to GPS/BLE. Never include email, session tokens, or historical trails in the channels.
- Limit message size/frequency and the number of subscriptions per player to control Realtime usage and prevent abuse.

## Building loading and rendering

`GET /api/world/features?tile_x=<x>&tile_y=<y>` queries Overpass for the exact bounding box of the authorized cell, 5000 m wide and high, with no buffer or neighboring cells. The tile center is projected from the event's geographic origin. If Overpass times out, the OSM data API fallback uses the same four geographic boundaries. Both sources request named buildings and named POIs of interest. The response contains the footprint converted to local meters, name, category, and OSM height when available. If there is no height, the client uses a default visual height. Phaser draws walls, shadow, roof, and facade details with a stylized 2.5D extrusion; point POIs become labeled landmarks. Do not render streets or a basemap underneath.

The query uses an allowlist of amenity, shop, tourism, historic, leisure, and natural categories; it excludes technical tags such as `stop_position` or `parking_entrance`. POIs are deduplicated by name/category and proximity, and the final list is sorted consistently.

Visibly attribute OpenStreetMap/Overpass data and respect the public service's limits. The API keeps an ephemeral in-memory cache with a TTL to avoid repeating queries; do not persist the response or geometries in MongoDB collections. If providers are unavailable, keep the world playable and show an error/retry option. Public OSM APIs do not guarantee availability and do not accept every urban bounding box; the data API may reject dense areas due to its element limit. Sorting/deduplication makes the list consistent when the source responds, but does not replace availability. For reliable use without a third-party key, operate a private Overpass instance or serve updated regional extracts; do not compensate for a rejection with dozens of calls to the public API.

## Current state

`/api/world` returns the initial cell `(0, 0)`. `/api/world/tile` authorizes a new cell; `/api/world/features` receives the indices to query the corresponding bounding box, and `/api/realtime/token` grants a short-lived JWT for that tile's exclusive topic. Phaser preserves the geographic coordinate while rebasing the player in the new cell. The RLS policy must be updated and applied in Supabase for topic switching to work in production.

## Implementation sequence

1. Keep the projection and boundary rule synchronized between the backend and Phaser, including negative coordinates and points exactly on a boundary.
2. Apply and validate the updated RLS policy in Supabase before publishing the change.
3. Test with two real sessions that identical tiles share positions/chat and different tiles do not receive each other's broadcasts.
4. Monitor the cache and public Overpass limits when querying additional cells.
