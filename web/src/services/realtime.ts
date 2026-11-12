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

const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL
  ?? import.meta.env.SUPABASE_URL
  ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
  ?? ""
) as string;
const SUPABASE_KEY = (
  import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? import.meta.env.SUPABASE_ANON_KEY
  ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? ""
) as string;

export class RealtimeSession {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private refreshTimer = 0;
  private positions = new Map<string, PositionPayload>();
  private tileX = 0;
  private tileY = 0;

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
    }, 8 * 60 * 1000);
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
    await this.channel.send({ type: "broadcast", event: "position", payload });
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
    await this.channel.send({ type: "broadcast", event: "chat", payload: message });
    this.onMessage(message);
  }

  async stop(): Promise<void> {
    window.clearInterval(this.refreshTimer);
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

  private async refreshAccessToken(): Promise<void> {
    try {
      if (!this.client) {
        return;
      }
      const { token } = await apiRequest<{ token: string }>("/realtime/token", {
        method: "POST",
        body: { tile_x: this.tileX, tile_y: this.tileY },
      });
      await this.client.realtime.setAuth(token);
    } catch {
      this.onStatus("A conexao em tempo real expirou. Entre novamente no jogo.");
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
      config: { private: true, presence: { key: this.user.id }, broadcast: { self: false } },
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
        channel.subscribe((status) => {
          this.onStatus(status === "SUBSCRIBED" ? `Conectado ao tile ${tileX}, ${tileY}` : status);
          if (status === "SUBSCRIBED") {
            const presence: PresenceMeta = {
              id: this.user.id,
              username: this.user.username,
              avatar: this.user.avatar,
            };
            void channel.track(presence);
            resolve();
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            reject(new Error("Nao foi possivel conectar ao tile autorizado."));
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