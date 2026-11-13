# Realtime integration test

`realtime.integration.test.mjs` uses the real local API and Supabase Realtime client to verify that two distinct players can:

- subscribe to the same private tile channel;
- publish and see both Presence records;
- exchange position broadcasts in both directions;
- exchange chat broadcasts in both directions.

Copy the `REALTIME_TEST_*` block from the repository root `.env.realtime-test.example` into `.env`, then fill in two disposable test accounts. Start the API (`npm run dev:api` from the repository root) and run:

```sh
npm run test:realtime --workspace web
```

The test loads `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the repository `.env`. It uses `http://127.0.0.1:5000/api` by default; override that with `REALTIME_TEST_API_URL` if needed. It uses tile `(999, 999)` by default to avoid normal player traffic; override with `REALTIME_TEST_TILE_X` and `REALTIME_TEST_TILE_Y` if your backend disallows that tile. Without both player credentials, the integration test is skipped with the missing variable names.
