# Entanglement

A 2D social game for events: Phaser 3 in the browser, a Flask API, MongoDB Atlas, and Supabase Realtime. Vercel publishes the client and runs the API.

## Structure

See [docs/architecture.md](docs/architecture.md) for the overview and [docs/world-tiles-and-realtime.md](docs/world-tiles-and-realtime.md) for the design of 5 km cells, transitions between areas, and local conversations.

```text
api/       Flask adapter for Vercel
backend/   Flask application and API domains
web/       Phaser client + TypeScript + Vite
tests/     API tests
```

## Local development

Requirements: Python 3.11+, Node.js 20+, and local MongoDB or Atlas.

```sh
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
npm install
npm run dev
```

Open http://localhost:5173. The command starts Flask at `localhost:5000` and Vite, which forwards `/api` to Flask. `npm run dev:web` and `npm run dev:api` start the services separately. Run `pytest` for the API tests and `npm run build` to validate the production client.

Set `MONGODB_URI`, `JWT_SECRET`, and `EVENT_ADMIN_TOKEN` in `.env`. `JWT_SECRET` must be a long, unique random key for this project. During local development, an ephemeral key is generated if it is missing; sessions expire when the server restarts. On Vercel, set `JWT_SECRET` explicitly. For chat and presence, set all three Supabase variables and apply [`supabase/realtime_policies.sql`](supabase/realtime_policies.sql) to the project. To associate an email and recover passwords, configure the SMTP server. Without SMTP, email flows return a configuration error and no account can confirm its address.

In environments without `/etc/resolv.conf` that use a `mongodb+srv` URI, `MONGODB_DNS_NAMESERVERS` sets the DNS servers as a comma-separated list. The default `1.1.1.1,8.8.8.8` follows the fallback used in the Flutu project; adjust it if the network requires different resolvers.

`VITE_*` values are embedded in the bundle and must be public. Never put JWT secrets, the SMTP password, the admin token, or the Supabase `service_role` key in them.

## Features

- Registration with a name, a password protected with scrypt, and a predefined avatar; login and a short-lived JWT session.
- Public profile with name, bio, and interests; a separate, private recovery email that can be used only after confirmation through a link.
- A 2.5D Phaser city with named building volumes and OpenStreetMap POIs, limited to 5 × 5 km; no map image or background streets.
- If an event does not yet have a center, a participant sets the initial point with a one-time GPS reading; that center is shared across the event. Continuous GPS remains optional and separate.
- Optional GPS; live coordinates are transmitted only to authenticated event members and are not persisted. Chat is also temporary.
- Approximate distances accompanied by the error margin of both devices.

GPS requires the participant's permission and HTTPS except on `localhost`. Accuracy depends on the device and environment. The browser does not provide reliable, cross-platform BLE access for ranging; indoor BLE requires mapped beacons, tested hardware, and integration compatible with the event's devices. See [docs/architecture.md](docs/architecture.md).

## Configure an event

The map starts as a local space without real-world coordinates. An organizer can register the center, dimensions in meters, and up to 100 physical locations using `PUT /api/admin/event` and the `X-Admin-Token` header set in `EVENT_ADMIN_TOKEN`. No images need to be stored in MongoDB; game assets are in the repository and the database stores metadata only.
