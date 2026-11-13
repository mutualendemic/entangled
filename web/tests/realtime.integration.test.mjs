import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const projectEnvFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(projectEnvFile)) {
  process.loadEnvFile(projectEnvFile);
}

const requiredEnv = [
  "REALTIME_TEST_USER_A",
  "REALTIME_TEST_PASSWORD_A",
  "REALTIME_TEST_USER_B",
  "REALTIME_TEST_PASSWORD_B",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
const skipReason = missingEnv.length
  ? `Set these variables to run the live two-player test: ${missingEnv.join(", ")}`
  : false;
const apiBase = (process.env.REALTIME_TEST_API_URL || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const tileX = Number.parseInt(process.env.REALTIME_TEST_TILE_X || "999", 10);
const tileY = Number.parseInt(process.env.REALTIME_TEST_TILE_Y || "999", 10);
const timeoutMs = Number.parseInt(process.env.REALTIME_TEST_TIMEOUT_MS || "12000", 10);

async function postJson(path, body, accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${result.error || "request failed"}`);
  }
  return result;
}

async function createPlayerSession(username, password) {
  const login = await postJson("/auth/login", { username, password });
  const realtime = await postJson(
    "/realtime/token",
    { tile_x: tileX, tile_y: tileY },
    login.token,
  );
  return { user: login.user, token: realtime.token, topic: realtime.channel };
}

function waitForSubscription(channel) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out subscribing to ${channel.topic}`)), timeoutMs);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timer);
        reject(new Error(`Channel ${status}: ${error?.message || "no server detail"}`));
      }
    });
  });
}

function currentPresenceIds(channel) {
  return Object.values(channel.presenceState())
    .flat()
    .map((entry) => entry.id)
    .filter((id) => typeof id === "string");
}

function withTimeout(promise, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function waitForBothPlayersInPresence(channel, expectedIds) {
  return new Promise((resolve) => {
    const check = () => {
      const ids = currentPresenceIds(channel);
      if (expectedIds.every((id) => ids.includes(id))) resolve(ids);
    };
    channel.on("presence", { event: "sync" }, check);
    check();
  });
}

function waitForBroadcast(channel, event, predicate) {
  return new Promise((resolve) => {
    channel.on("broadcast", { event }, ({ payload }) => {
      if (predicate(payload)) resolve(payload);
    });
  });
}

function createRealtimeClient(token) {
  const client = createClient(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 8 } },
  });
  return client.realtime.setAuth(token).then(() => client);
}

test("two players share presence and exchange position/chat over Realtime", {
  skip: skipReason,
  timeout: 60000,
}, async () => {
  const [playerA, playerB] = await Promise.all([
    createPlayerSession(process.env.REALTIME_TEST_USER_A, process.env.REALTIME_TEST_PASSWORD_A),
    createPlayerSession(process.env.REALTIME_TEST_USER_B, process.env.REALTIME_TEST_PASSWORD_B),
  ]);
  assert.notEqual(playerA.user.id, playerB.user.id, "Use two distinct player accounts");
  assert.equal(playerA.topic, playerB.topic, "Both players must join the same tile topic");

  const sessions = [];
  try {
    for (const player of [playerA, playerB]) {
      const client = await createRealtimeClient(player.token);
      const channel = client.channel(player.topic, {
        config: {
          private: true,
          presence: { key: player.user.id },
          broadcast: { self: false, ack: true },
        },
      });
      sessions.push({ client, channel, player });
    }

    const [sessionA, sessionB] = sessions;
    const expectedIds = [playerA.user.id, playerB.user.id];
    const presenceA = waitForBothPlayersInPresence(sessionA.channel, expectedIds);
    const presenceB = waitForBothPlayersInPresence(sessionB.channel, expectedIds);

    await Promise.all(sessions.map(({ channel }) => waitForSubscription(channel)));
    const trackResults = await Promise.all(
      sessions.map(({ channel, player }) => channel.track({
        id: player.user.id,
        username: player.user.username,
        avatar: player.user.avatar,
      })),
    );
    assert.deepEqual(trackResults, ["ok", "ok"], "Both clients must publish presence successfully");
    await Promise.all([
      withTimeout(presenceA, `Presence did not contain both players within ${timeoutMs} ms`),
      withTimeout(presenceB, `Presence did not contain both players within ${timeoutMs} ms`),
    ]);

    const runId = randomUUID();
    const positionFromA = {
      id: playerA.user.id,
      username: playerA.user.username,
      avatar: playerA.user.avatar,
      source: "local",
      x: 1800,
      y: 2100,
      sentAt: Date.now(),
      testRunId: runId,
    };
    const positionFromB = {
      id: playerB.user.id,
      username: playerB.user.username,
      avatar: playerB.user.avatar,
      source: "local",
      x: 3200,
      y: 2900,
      sentAt: Date.now(),
      testRunId: runId,
    };
    const receivedPositionA = waitForBroadcast(
      sessionA.channel,
      "position",
      (payload) => payload?.testRunId === runId && payload.id === playerB.user.id,
    );
    const receivedPositionB = waitForBroadcast(
      sessionB.channel,
      "position",
      (payload) => payload?.testRunId === runId && payload.id === playerA.user.id,
    );
    const positionResults = await Promise.all([
      sessionA.channel.send({ type: "broadcast", event: "position", payload: positionFromA }),
      sessionB.channel.send({ type: "broadcast", event: "position", payload: positionFromB }),
    ]);
    assert.deepEqual(positionResults, ["ok", "ok"], "Both position broadcasts must be accepted");
    const [positionAtA, positionAtB] = await Promise.all([
      withTimeout(receivedPositionA, `Player A did not receive player B's position within ${timeoutMs} ms`),
      withTimeout(receivedPositionB, `Player B did not receive player A's position within ${timeoutMs} ms`),
    ]);
    assert.equal(positionAtA.id, playerB.user.id);
    assert.equal(positionAtB.id, playerA.user.id);

    const chatA = {
      id: randomUUID(),
      senderId: playerA.user.id,
      username: playerA.user.username,
      avatar: playerA.user.avatar,
      text: `Realtime test ${runId} from player A`,
      sentAt: Date.now(),
    };
    const chatB = {
      id: randomUUID(),
      senderId: playerB.user.id,
      username: playerB.user.username,
      avatar: playerB.user.avatar,
      text: `Realtime test ${runId} from player B`,
      sentAt: Date.now(),
    };
    const receivedChatA = waitForBroadcast(
      sessionA.channel,
      "chat",
      (payload) => payload?.id === chatB.id,
    );
    const receivedChatB = waitForBroadcast(
      sessionB.channel,
      "chat",
      (payload) => payload?.id === chatA.id,
    );
    const chatResults = await Promise.all([
      sessionA.channel.send({ type: "broadcast", event: "chat", payload: chatA }),
      sessionB.channel.send({ type: "broadcast", event: "chat", payload: chatB }),
    ]);
    assert.deepEqual(chatResults, ["ok", "ok"], "Both chat broadcasts must be accepted");
    const [chatAtA, chatAtB] = await Promise.all([
      withTimeout(receivedChatA, `Player A did not receive player B's chat within ${timeoutMs} ms`),
      withTimeout(receivedChatB, `Player B did not receive player A's chat within ${timeoutMs} ms`),
    ]);
    assert.equal(chatAtA.senderId, playerB.user.id);
    assert.equal(chatAtB.senderId, playerA.user.id);
  } finally {
    await Promise.allSettled(sessions.map(async ({ client, channel }) => {
      await client.removeChannel(channel);
      await client.realtime.disconnect();
    }));
  }
});
