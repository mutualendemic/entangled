import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { apiRequest, type User } from "./api";
import type { GeoPosition } from "./location";
import type { RemotePlayer } from "../world/WorldScene";

export interface ChatMessage {
  id: string;
  senderId: string;
  username: string;
  avatar: string;
  text: string;
  sentAt: number;
}

interface PresenceMeta {
  id: string;
  username: string;
  avatar: string;
}

interface PositionPayload extends RemotePlayer {
  sentAt: number;
}

const SUPABASE_URL = import.meta.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const REALTIME_DEBUG_STORAGE_KEY = "entanglement.realtime.debug";

export function downloadRealtimeDebugLog(): boolean {
  try {
    const entries = JSON.parse(sessionStorage.getItem(REALTIME_DEBUG_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(entries) || entries.length === 0) {
      return false;
    }
    const download = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(download);
    const link = document.createElement("a");
    link.href = url;
    link.download = "entanglement-realtime-debug.json";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

export class RealtimeSession {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private refreshTimer = 0;
  private refreshInFlight: Promise<void> | null = null;
  private resumeReconnectInFlight: Promise<void> | null = null;
  private lastResumeReconnectAt = 0;
  private readonly refreshOnVisibility = (): void => {
    if (document.visibilityState === "visible") void this.reconnectAfterResume();
  };
  private readonly refreshOnOnline = (): void => { void this.reconnectAfterResume(); };
  private positions = new Map<string, PositionPayload>();
  private tileX = 0;
  private tileY = 0;
  private broadcastFailed = false;

  constructor(
    private readonly user: User,
    private readonly onPlayers: (players: PositionPayload[]) => void,
    private readonly onPlayerLeft: (id: string) => void,
    private readonly onMessage: (message: ChatMessage) => void,
    private readonly onStatus: (status: string) => void,
  ) {}

  async start(tileX = 0, tileY = 0): Promise<void> {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      this.onStatus("Configure Supabase para habilitar presenca e mensagens.");
      return;
    }
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 8 } },
    });
    await this.joinTile(tileX, tileY);
    this.refreshTimer = window.setInterval(() => {
      void this.refreshAccessToken();
    }, 4 * 60 * 1000);
    document.addEventListener("visibilitychange", this.refreshOnVisibility);
    window.addEventListener("online", this.refreshOnOnline);
  }

  async sendPosition(position: Omit<PositionPayload, "sentAt">, geo?: GeoPosition): Promise<void> {
    if (!this.channel) {
      return;
    }
    const payload: PositionPayload = {
      ...position,
      ...(geo ? { lat: geo.lat, lon: geo.lon, accuracy: geo.accuracy } : {}),
      sentAt: Date.now(),
    };
    this.positions.set(this.user.id, payload);
    const result = await this.channel.send({ type: "broadcast", event: "position", payload });
    this.reportBroadcastResult("position", result);
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.channel) {
      throw new Error("Chat indisponivel: conecte o Supabase Realtime.");
    }
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: this.user.id,
      username: this.user.username,
      avatar: this.user.avatar,
      text,
      sentAt: Date.now(),
    };
    const result = await this.channel.send({ type: "broadcast", event: "chat", payload: message });
    this.reportBroadcastResult("chat", result);
    if (result !== "ok") {
      throw new Error(`Nao foi possivel enviar a mensagem (${result}).`);
    }
    this.onMessage(message);
  }

  async stop(): Promise<void> {
    window.clearInterval(this.refreshTimer);
    document.removeEventListener("visibilitychange", this.refreshOnVisibility);
    window.removeEventListener("online", this.refreshOnOnline);
    await this.leaveTile();
    this.client = null;
  }

  async leaveTile(): Promise<void> {
    const channel = this.channel;
    this.channel = null;
    this.clearRemotePlayers();
    if (this.client && channel) {
      await this.client.removeChannel(channel);
    }
  }

  async switchTile(tileX: number, tileY: number): Promise<void> {
    await this.leaveTile();
    await this.joinTile(tileX, tileY);
  }

  private logRealtimeDebug(context: Record<string, unknown>): void {
    try {
      const previous = JSON.parse(sessionStorage.getItem(REALTIME_DEBUG_STORAGE_KEY) ?? "[]") as Array<Record<string, unknown>>;
      const entry = { ts: new Date().toISOString(), ...context };
      const next = [...previous.slice(-19), entry];
      sessionStorage.setItem(REALTIME_DEBUG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage issues; keep logs only in console
    }
    console.warn("Realtime debug:", context);
  }

  private reportBroadcastResult(event: "chat" | "position", result: string): void {
    if (result !== "ok") {
      if (!this.broadcastFailed) {
        this.logRealtimeDebug({ event: "broadcast_send", name: event, result });
        this.onStatus(`Falha ao enviar ${event} (${result}). Verifique a policy Realtime.`);
      }
      this.broadcastFailed = true;
      return;
    }
    if (this.broadcastFailed) {
      this.broadcastFailed = false;
      this.logRealtimeDebug({ event: "broadcast_recovered", name: event });
      this.onStatus(`Conectado ao tile ${this.tileX}, ${this.tileY}`);
    }
  }

  private async reconnectAfterResume(): Promise<void> {
    if (this.resumeReconnectInFlight || Date.now() - this.lastResumeReconnectAt < 2_000) {
      return this.resumeReconnectInFlight ?? Promise.resolve();
    }
    const client = this.client;
    if (!client || !this.channel) {
      return;
    }

    this.lastResumeReconnectAt = Date.now();
    const reconnect = (async () => {
      await this.refreshAccessToken();
      if (this.client !== client || !this.channel) {
        return;
      }

      this.logRealtimeDebug({
        event: "realtime_resume_reconnect",
        connectionState: client.realtime.connectionState(),
        tileX: this.tileX,
        tileY: this.tileY,
      });
      await client.realtime.disconnect();
      if (this.client === client && this.channel) {
        client.realtime.connect();
      }
    })();
    this.resumeReconnectInFlight = reconnect;
    try {
      await reconnect;
    } catch (error) {
      this.logRealtimeDebug({
        event: "realtime_resume_reconnect",
        result: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      this.onStatus("A reconectar ao Realtime...");
    } finally {
      if (this.resumeReconnectInFlight === reconnect) {
        this.resumeReconnectInFlight = null;
      }
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const client = this.client;
    if (!client) {
      return;
    }

    const refresh = (async () => {
      try {
        const { token, expires_in: expiresIn } = await apiRequest<{ token: string; expires_in?: number }>("/realtime/token", {
          method: "POST",
          body: { tile_x: this.tileX, tile_y: this.tileY },
        });
        if (this.client !== client) {
          return;
        }
        await client.realtime.setAuth(token);
        this.logRealtimeDebug({
          event: "realtime_auth_refresh",
          result: "ok",
          tileX: this.tileX,
          tileY: this.tileY,
          expiresIn,
        });
      } catch (error) {
        this.logRealtimeDebug({
          event: "realtime_auth_refresh",
          result: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        this.onStatus("A conexao em tempo real expirou. Entre novamente no jogo.");
      }
    })();
    this.refreshInFlight = refresh;
    try {
      await refresh;
    } finally {
      if (this.refreshInFlight === refresh) this.refreshInFlight = null;
    }
  }

  private async joinTile(tileX: number, tileY: number): Promise<void> {
    if (!this.client) {
      return;
    }
    const { token, channel: topic } = await apiRequest<{ token: string; channel: string }>("/realtime/token", {
      method: "POST",
      body: { tile_x: tileX, tile_y: tileY },
    });
    await this.client.realtime.setAuth(token);
    this.tileX = tileX;
    this.tileY = tileY;
    const channel = this.client.channel(topic, {
      config: { private: true, presence: { key: this.user.id }, broadcast: { self: false, ack: true } },
    });
    this.channel = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        if (this.channel === channel) this.syncPresence();
      })
      .on("broadcast", { event: "position" }, ({ payload }) => {
        if (this.channel === channel) this.receivePosition(payload);
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        if (this.channel === channel) this.receiveMessage(payload);
      });
    try {
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status, err) => {
          console.error("Realtime subscribe status:", status, err);
          this.logRealtimeDebug({
            topic,
            tileX,
            tileY,
            supabaseUrl: SUPABASE_URL,
            hasAnonKey: Boolean(SUPABASE_KEY),
            clientState: this.client?.realtime ? "ready" : "missing",
            status,
            err: err ? {
              name: err.name,
              message: err.message,
              code: "code" in err ? err.code : undefined,
            } : null,
          });
          this.onStatus(status === "SUBSCRIBED" ? `Conectado ao tile ${tileX}, ${tileY}` : status);
          if (status === "SUBSCRIBED") {
            const presence: PresenceMeta = {
              id: this.user.id,
              username: this.user.username,
              avatar: this.user.avatar,
            };
            void channel.track(presence).then((result) => {
              this.logRealtimeDebug({ topic, event: "presence_track", result });
              if (result !== "ok") {
                this.onStatus(`Falha ao publicar presença: ${result}`);
              }
            }).catch((error: unknown) => {
              this.logRealtimeDebug({
                topic,
                event: "presence_track",
                error: error instanceof Error ? error.message : String(error),
              });
              this.onStatus("Falha ao publicar presença no tile.");
            });
            resolve();
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            reject(new Error(err ? err.message ?? "Nao foi possivel conectar ao tile autorizado." : "Nao foi possivel conectar ao tile autorizado."));
          }
        });
      });
    } catch (error) {
      if (this.channel === channel) {
        this.channel = null;
      }
      await this.client.removeChannel(channel);
      throw error;
    }
  }

  private clearRemotePlayers(): void {
    for (const id of this.positions.keys()) {
      if (id !== this.user.id) {
        this.onPlayerLeft(id);
      }
    }
    this.positions.clear();
  }

  private syncPresence(): void {
    if (!this.channel) {
      return;
    }
    const state = this.channel.presenceState<PresenceMeta>();
    const online = new Set<string>();
    for (const metas of Object.values(state)) {
      const meta = metas[0];
      if (!meta || meta.id === this.user.id) {
        continue;
      }
      online.add(meta.id);
      const previous = this.positions.get(meta.id);
      const remote: PositionPayload = previous
        ? { ...previous, username: meta.username, avatar: meta.avatar }
        : {
            id: meta.id,
            username: meta.username,
            avatar: meta.avatar,
            x: 0,
            y: 0,
            sentAt: Date.now(),
          };
      this.positions.set(meta.id, remote);
      this.onPlayers([remote]);
    }
    for (const id of this.positions.keys()) {
      if (id !== this.user.id && !online.has(id)) {
        this.positions.delete(id);
        this.onPlayerLeft(id);
      }
    }
    this.logRealtimeDebug({
      event: "presence_sync",
      presenceCount: new Set(Object.values(state).flat().map((meta) => meta.id).filter(Boolean)).size,
      remotePlayerIds: [...online],
    });
  }

  private receivePosition(payload: PositionPayload): void {
    if (!payload || payload.id === this.user.id || typeof payload.x !== "number" || typeof payload.y !== "number") {
      return;
    }
    if (Date.now() - payload.sentAt > 15_000) {
      return;
    }
    this.positions.set(payload.id, payload);
    this.onPlayers([payload]);
  }

  private receiveMessage(payload: ChatMessage): void {
    if (
      !payload
      || !payload.id
      || payload.senderId === this.user.id
      || typeof payload.text !== "string"
      || payload.text.length > 500
    ) {
      return;
    }
    this.onMessage(payload);
  }
}