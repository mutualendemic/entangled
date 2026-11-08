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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export class RealtimeSession {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private refreshTimer = 0;
  private positions = new Map<string, PositionPayload>();

  constructor(
    private readonly user: User,
    private readonly onPlayers: (players: PositionPayload[]) => void,
    private readonly onPlayerLeft: (id: string) => void,
    private readonly onMessage: (message: ChatMessage) => void,
    private readonly onStatus: (status: string) => void,
  ) {}

  async start(): Promise<void> {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      this.onStatus("Configure Supabase para habilitar presenca e mensagens.");
      return;
    }
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 8 } },
    });
    await this.connectWithFreshToken();
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
    if (this.client && this.channel) {
      await this.client.removeChannel(this.channel);
    }
    this.channel = null;
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      await this.connectWithFreshToken();
    } catch {
      this.onStatus("A conexao em tempo real expirou. Entre novamente no jogo.");
    }
  }

  private async connectWithFreshToken(): Promise<void> {
    if (!this.client) {
      return;
    }
    const { token, channel: topic } = await apiRequest<{ token: string; channel: string }>("/realtime/token", {
      method: "POST",
      body: {},
    });
    await this.client.realtime.setAuth(token);
    if (this.channel) {
      await this.client.removeChannel(this.channel);
    }
    this.channel = this.client.channel(topic, {
      config: { private: true, presence: { key: this.user.id }, broadcast: { self: false } },
    });
    this.channel
      .on("presence", { event: "sync" }, () => this.syncPresence())
      .on("broadcast", { event: "position" }, ({ payload }) => this.receivePosition(payload))
      .on("broadcast", { event: "chat" }, ({ payload }) => this.receiveMessage(payload));
    this.channel.subscribe((status) => {
      this.onStatus(status === "SUBSCRIBED" ? "Conectado ao evento" : status);
      if (status === "SUBSCRIBED") {
        const presence: PresenceMeta = {
          id: this.user.id,
          username: this.user.username,
          avatar: this.user.avatar,
        };
        void this.channel?.track(presence);
      }
    });
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
      if (previous) {
        this.onPlayers([{ ...previous, username: meta.username, avatar: meta.avatar }]);
      }
    }
    for (const id of this.positions.keys()) {
      if (id !== this.user.id && !online.has(id)) {
        this.positions.delete(id);
        this.onPlayerLeft(id);
      }
    }
  }

  private receivePosition(payload: PositionPayload): void {
    if (!payload || payload.id === this.user.id || Date.now() - payload.sentAt > 15_000) {
      return;
    }
    this.positions.set(payload.id, payload);
    this.onPlayers([payload]);
  }

  private receiveMessage(payload: ChatMessage): void {
    if (
      !payload
      || payload.senderId === this.user.id
      || typeof payload.text !== "string"
      || payload.text.length > 500
    ) {
      return;
    }
    this.onMessage(payload);
  }
}