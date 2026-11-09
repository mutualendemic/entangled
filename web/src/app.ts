import Phaser from "phaser";
import { apiRequest, getToken, setToken, type Profile, type User } from "./services/api";
import { startBeaconScan } from "./services/bluetooth";
import { distanceBetween, stopWatchingLocation, watchLocation, type GeoPosition } from "./services/location";
import { RealtimeSession, type ChatMessage } from "./services/realtime";
import { WorldScene, type RemotePlayer, type WorldData, type WorldFeature } from "./world/WorldScene";

const AVATARS = ["moss", "ember", "wave", "sun", "comet", "bloom"] as const;
const AVATAR_LABELS: Record<(typeof AVATARS)[number], string> = {
  moss: "Musgo",
  ember: "Brasa",
  wave: "Onda",
  sun: "Sol",
  comet: "Cometa",
  bloom: "Flor",
};

type AuthMode = "login" | "register" | "recovery";

export async function mountApp(root: HTMLElement): Promise<void> {
  const query = new URLSearchParams(window.location.search);
  const verifyToken = query.get("verify-email");
  const resetToken = query.get("reset-password");
  if (verifyToken || resetToken) {
    window.history.replaceState(null, "", window.location.pathname);
  }

  if (verifyToken) {
    try {
      await apiRequest("/auth/verify-email", {
        method: "POST",
        body: { token: verifyToken },
        authenticated: false,
      });
      renderAuth(root, "Email confirmado. Voce ja pode usar a recuperacao de senha.");
    } catch (error) {
      renderAuth(root, errorMessage(error));
    }
    return;
  }

  if (resetToken) {
    renderReset(root, resetToken);
    return;
  }

  const token = getToken();
  if (token) {
    try {
      const { user } = await apiRequest<{ user: User }>("/auth/me");
      await renderGame(root, user);
      return;
    } catch {
      setToken(null);
    }
  }
  renderAuth(root);
}

function renderAuth(root: HTMLElement, initialNotice = ""): void {
  let mode: AuthMode = "login";
  let selectedAvatar: typeof AVATARS[number] = "moss";

  const draw = (notice = initialNotice): void => {
    root.innerHTML = `
      <main class="gate-layout">
        <section class="gate-brand" aria-label="Entanglement">
          <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="eyebrow">MUNDO SOCIAL DE EVENTOS</p>
          <h1>Entanglement</h1>
          <p class="brand-caption">Encontre pessoas, lugares e histórias no mesmo mapa.</p>
          <div class="map-lines" aria-hidden="true"></div>
          <span class="brand-coordinate">38°43' N&nbsp;&nbsp; 9°08' W</span>
        </section>
        <section class="gate-form-wrap">
          <div class="gate-form">
            <p class="eyebrow">ACESSO AO EVENTO</p>
            <div class="mode-switch" role="tablist" aria-label="Acesso">
              <button type="button" data-mode="login" class="${mode === "login" ? "active" : ""}">Entrar</button>
              <button type="button" data-mode="register" class="${mode === "register" ? "active" : ""}">Criar conta</button>
            </div>
            <h2>${mode === "register" ? "Escolha sua identidade" : mode === "recovery" ? "Recuperar acesso" : "Bom te ver"}</h2>
            <p class="form-caption">${mode === "register" ? "Seu nome aparece para os outros jogadores." : mode === "recovery" ? "Enviaremos um link ao email confirmado da conta." : "Entre no mundo do seu evento."}</p>
            <form id="auth-form" class="form-stack">
              <label>Nome de jogador
                <input name="username" autocomplete="username" minlength="3" maxlength="24" required placeholder="seu_nome" />
              </label>
              ${mode === "recovery" ? "" : `<label>Senha
                <input name="password" type="password" autocomplete="${mode === "register" ? "new-password" : "current-password"}" minlength="${mode === "register" ? "10" : "1"}" maxlength="256" required placeholder="${mode === "register" ? "10 caracteres ou mais" : "Sua senha"}" />
              </label>`}
              ${mode === "register" ? `<fieldset class="avatar-picker"><legend>Avatar</legend><div class="avatar-options">${AVATARS.map((avatar) => `<button type="button" class="avatar-option avatar-${avatar} ${avatar === selectedAvatar ? "selected" : ""}" data-avatar="${avatar}" aria-label="${AVATAR_LABELS[avatar]}" title="${AVATAR_LABELS[avatar]}">${avatarGlyph(avatar)}</button>`).join("")}</div></fieldset>` : ""}
              <button class="primary-button" type="submit">${mode === "register" ? "Criar conta" : mode === "recovery" ? "Enviar link" : "Entrar no mundo"}</button>
              ${mode === "login" ? `<button class="text-button" type="button" data-mode="recovery">Esqueci minha senha</button>` : ""}
              ${mode === "recovery" ? `<button class="text-button" type="button" data-mode="login">Voltar ao login</button>` : ""}
              <p class="notice" role="status">${escapeHtml(notice)}</p>
            </form>
          </div>
        </section>
      </main>`;

    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.mode as AuthMode;
        draw("");
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-avatar]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedAvatar = button.dataset.avatar as typeof selectedAvatar;
        draw("");
      });
    });
    root.querySelector<HTMLFormElement>("#auth-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const values = new FormData(form);
      const username = String(values.get("username") ?? "").trim();
      const password = String(values.get("password") ?? "");
      const submit = form.querySelector<HTMLButtonElement>("[type=submit]");
      if (submit) submit.disabled = true;

      try {
        if (mode === "recovery") {
          const result = await apiRequest<{ message: string }>("/auth/recovery", {
            method: "POST",
            body: { username },
            authenticated: false,
          });
          draw(result.message);
          return;
        }
        const path = mode === "register" ? "/auth/register" : "/auth/login";
        const body = mode === "register"
          ? { username, password, avatar: selectedAvatar }
          : { username, password };
        const result = await apiRequest<{ token: string; user: User }>(path, {
          method: "POST",
          body,
          authenticated: false,
        });
        setToken(result.token);
        await renderGame(root, result.user);
      } catch (error) {
        if (submit) submit.disabled = false;
        const notice = form.querySelector<HTMLElement>(".notice");
        if (notice) notice.textContent = errorMessage(error);
      }
    });
  };

  draw();
}

function renderReset(root: HTMLElement, token: string): void {
  root.innerHTML = `
    <main class="reset-layout">
      <form id="reset-form" class="gate-form reset-card">
        <p class="eyebrow">SEGURANCA DA CONTA</p>
        <h1>Defina uma nova senha</h1>
        <label>Nova senha
          <input name="password" type="password" minlength="10" maxlength="256" autocomplete="new-password" required />
        </label>
        <button class="primary-button" type="submit">Atualizar senha</button>
        <p class="notice" role="status"></p>
      </form>
    </main>`;
  root.querySelector<HTMLFormElement>("#reset-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const password = String(new FormData(form).get("password") ?? "");
    const notice = form.querySelector<HTMLElement>(".notice");
    try {
      const result = await apiRequest<{ message: string }>("/auth/reset", {
        method: "POST",
        body: { token, password },
        authenticated: false,
      });
      if (notice) notice.textContent = result.message;
      window.setTimeout(() => renderAuth(root, result.message), 1200);
    } catch (error) {
      if (notice) notice.textContent = errorMessage(error);
    }
  });
}

async function renderGame(root: HTMLElement, user: User): Promise<void> {
  const [{ event_id: eventId, event }, { profile }, emailState] = await Promise.all([
    apiRequest<{ event_id: string; event: WorldData }>("/world"),
    apiRequest<{ profile: Profile }>("/profiles/me"),
    apiRequest<{ email: string | null; pending: boolean; verified: boolean }>("/account/email"),
  ]);
  event.width_m = Math.min(event.width_m || 5000, 5000);
  event.height_m = Math.min(event.height_m || 5000, 5000);
  if (!event.center) {
    event.width_m = 5000;
    event.height_m = 5000;
  }

  root.innerHTML = `
    <main class="game-app">
      <header class="topbar">
        <a class="wordmark" href="#world"><span class="mini-mark" aria-hidden="true">∿</span> entanglement</a>
        <div class="event-chip"><span class="live-dot"></span><span id="event-name">${escapeHtml(event.name)}</span><span class="event-id">${escapeHtml(eventId)}</span></div>
        <div class="account-actions"><span class="account-name">${escapeHtml(profile.display_name || user.username)}</span><button class="icon-button" type="button" data-action="logout" title="Sair" aria-label="Sair">↗</button></div>
      </header>
      <div class="game-layout">
        <section class="world-column">
          <div class="world-toolbar">
            <div><p class="eyebrow">MAPA DO EVENTO</p><h1>${escapeHtml(event.name)}</h1></div>
            <div class="world-coordinates" id="location-status">${event.center ? "Localizacao desligada" : "Centro do evento pendente"}</div>
          </div>
          <div class="world-frame">
            <div id="world-canvas" aria-label="Personagens e pontos do mundo"></div>
            <div class="map-area-label">ÁREA DO EVENTO <strong>${(event.width_m / 1000).toFixed(1)} × ${(event.height_m / 1000).toFixed(1)} KM</strong></div>
            <div class="city-indicator">
              <span id="city-status" class="city-status" aria-live="polite">${event.center ? "Carregando edifícios e POIs..." : "Aguardando centro do evento"}</span>
              <button id="city-retry" class="city-retry" type="button" title="Tentar carregar edifícios novamente" aria-label="Tentar carregar edifícios novamente" hidden>↻</button>
            </div>
            <div class="map-credit">Dados © OpenStreetMap contributors</div>
            <div id="map-center-prompt" class="map-center-prompt" ${event.center ? "hidden" : ""}>
              <div class="map-center-content">
                <p class="eyebrow">MAPA DO EVENTO</p>
                <h2>Escolha o centro da cidade</h2>
                <p>Use uma leitura GPS para fixar o centro compartilhado e carregar edifícios nomeados e POIs no tile de 5 km.</p>
                <button class="primary-button" id="initialize-world" type="button">Definir centro pelo GPS</button>
                <p class="notice" id="map-center-notice" role="status"></p>
              </div>
            </div>
            <div id="movement-stick" class="movement-stick" role="application" aria-label="Controle de movimento" hidden><span class="movement-stick-knob"></span></div>
          </div>
          <div class="gps-control">
            <div class="location-modes">
              <label class="gps-toggle"><input id="gps-toggle" type="checkbox" /><span class="toggle-track"></span><span>Compartilhar GPS</span></label>
              <label class="gps-toggle" title="${event.beacons.length >= 3 ? "Scan BLE experimental para este evento" : "O evento precisa configurar pelo menos 3 beacons"}"><input id="ble-toggle" type="checkbox" ${event.beacons.length >= 3 ? "" : "disabled"} /><span class="toggle-track"></span><span>Bluetooth indoor</span></label>
            </div>
            <span class="privacy-note">Participantes conectados recebem sua posicao e precisao reportada.</span>
          </div>
        </section>
        <aside class="social-panel">
          <div class="panel-tabs" role="tablist" aria-label="Painel social">
            <button type="button" data-panel="players" class="active">Jogadores</button>
            <button type="button" data-panel="chat">Mensagens</button>
            <button type="button" data-panel="profile">Perfil</button>
          </div>
          <p class="connection-status" id="connection-status">Conectando...</p>
          <section class="panel-content" data-panel-content="players">
            <div class="section-heading"><h2>Por perto</h2><span id="player-count">1 online</span></div>
            <div class="player-list" id="player-list"></div>
            <div class="teleport-panel">
              <div class="section-heading compact-heading"><h2>Teleportar</h2><span>POIs</span></div>
              <label class="teleport-search">
                <span class="sr-only">Buscar destino</span>
                <input id="poi-search" type="search" placeholder="Buscar lugar ou POI" autocomplete="off" />
              </label>
              <button id="teleport-gps" class="secondary-button teleport-button" type="button">Usar GPS atual</button>
              <div id="poi-list" class="poi-list" aria-live="polite"></div>
            </div>
          </section>
          <section class="panel-content hidden" data-panel-content="chat">
            <div class="section-heading"><h2>Conversa do evento</h2><span>temporaria</span></div>
            <div class="message-list" id="message-list" aria-live="polite"></div>
            <form id="chat-form" class="chat-form"><input name="message" maxlength="500" placeholder="Escreva uma mensagem" autocomplete="off" required /><button class="send-button" type="submit" title="Enviar mensagem" aria-label="Enviar mensagem">↑</button></form>
          </section>
          <section class="panel-content hidden" data-panel-content="profile">
            <div class="section-heading"><h2>Seu perfil</h2><span>visivel no evento</span></div>
            <form id="profile-form" class="form-stack compact-form">
              <label>Nome publico<input name="display_name" maxlength="40" value="${escapeHtml(profile.display_name)}" required /></label>
              <label>Sobre voce<textarea name="bio" maxlength="280" rows="3">${escapeHtml(profile.bio)}</textarea></label>
              <label>Interesses, separados por virgula<input name="interests" maxlength="320" value="${escapeHtml(profile.interests.join(", "))}" /></label>
              <button class="primary-button" type="submit">Salvar perfil</button>
              <p class="notice" id="profile-notice" role="status"></p>
            </form>
            <div class="private-email">
              <p class="eyebrow">RECUPERACAO PRIVADA</p>
              <p class="email-state" id="email-state">${emailState.verified ? `Email confirmado: ${escapeHtml(emailState.email ?? "")}` : emailState.pending ? "Aguardando confirmacao do email." : "Nenhum email confirmado."}</p>
              <form id="email-form" class="email-form"><label>Email, nao publico<input name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(emailState.email ?? "")}" required /></label><button class="secondary-button" type="submit">${emailState.verified ? "Atualizar email" : "Associar email"}</button><p class="notice" id="email-notice" role="status"></p></form>
            </div>
          </section>
          <footer class="panel-footer"><span class="avatar-chip avatar-${user.avatar}">${avatarGlyph(user.avatar)}</span><span>Conectado como <strong>${escapeHtml(user.username)}</strong></span><span class="app-version">#${__APP_VERSION__}</span></footer>
        </aside>
      </div>
    </main>`;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "world-canvas",
    transparent: true,
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    scene: [WorldScene],
  });

  const remotePlayers = new Map<string, RemotePlayer>();
  let localGeo: GeoPosition | null = null;
  let geoWatch = -1;
  let stopBleScan: (() => void) | null = null;
  let localSource: "gps" | "ble" | "local" = "local";
  let localAccuracy = 0;
  let scene: WorldScene | null = null;
  let cityFeatures: WorldFeature[] = [];
  const messages = root.querySelector<HTMLElement>("#message-list")!;
  const positionList = root.querySelector<HTMLElement>("#player-list")!;
  const status = root.querySelector<HTMLElement>("#connection-status")!;
  const locationStatus = root.querySelector<HTMLElement>("#location-status")!;
  const cityStatus = root.querySelector<HTMLElement>("#city-status")!;
  const cityRetry = root.querySelector<HTMLButtonElement>("#city-retry")!;
  const poiSearch = root.querySelector<HTMLInputElement>("#poi-search")!;
  const poiList = root.querySelector<HTMLElement>("#poi-list")!;
  const teleportGpsButton = root.querySelector<HTMLButtonElement>("#teleport-gps")!;
  const realtime = new RealtimeSession(
    user,
    (players) => {
      for (const player of players) {
        remotePlayers.set(player.id, player);
        scene?.updateRemotePlayer(player);
      }
      drawPlayers();
    },
    (id) => {
      remotePlayers.delete(id);
      scene?.removeRemotePlayer(id);
      drawPlayers();
    },
    (message) => appendMessage(messages, message, false),
    (text) => { status.textContent = text; },
  );

  function drawPlayers(): void {
    const localPosition = scene?.getLocalPosition() ?? { x: 0, y: 0 };
    const online: RemotePlayer[] = [
      { id: user.id, username: user.username, avatar: user.avatar, ...localPosition },
      ...Array.from(remotePlayers.values()),
    ];
    root.querySelector<HTMLElement>("#player-count")!.textContent = `${online.length} online`;
    positionList.replaceChildren();
    for (const player of online) {
      const row = document.createElement("div");
      row.className = "player-row";
      const avatar = document.createElement("span");
      avatar.className = `avatar-chip avatar-${player.avatar}`;
      avatar.textContent = avatarGlyph(player.avatar);
      const info = document.createElement("span");
      info.className = "player-info";
      const name = document.createElement("strong");
      name.textContent = player.username + (player.id === user.id ? " (voce)" : "");
      const distance = document.createElement("small");
      distance.textContent = playerDistance(player);
      info.append(name, distance);
      row.append(avatar, info);
      positionList.append(row);
    }
  }

  function renderPoiList(): void {
    const query = poiSearch.value.trim().toLowerCase();
    const results = [...cityFeatures]
      .filter((feature) => {
        const text = `${feature.name} ${feature.category}`.toLowerCase();
        return !query || text.includes(query);
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    poiList.replaceChildren();
    if (!results.length) {
      const empty = document.createElement("p");
      empty.className = "poi-empty";
      empty.textContent = query ? "Nenhum POI encontrado." : "Carregue o mapa do evento para ver locais.";
      poiList.append(empty);
      return;
    }

    for (const feature of results.slice(0, 25)) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "poi-item";
      const meta = feature.kind === "building" ? "Edifício" : "POI";
      item.innerHTML = `<span><strong>${escapeHtml(feature.name)}</strong><small>${meta}</small></span><span class="poi-kind">${escapeHtml(feature.category)}</span>`;
      item.addEventListener("click", () => {
        if (!scene) {
          return;
        }
        scene.setLocalMapPosition(feature.x, feature.y);
        locationStatus.textContent = `Teletransportado para ${feature.name}`;
        localSource = "local";
        drawPlayers();
      });
      poiList.append(item);
    }
  }

  async function loadCityFeatures(): Promise<void> {
    cityRetry.hidden = true;
    cityStatus.textContent = "Consultando edifícios e pontos de interesse...";
    try {
      const result = await apiRequest<{ features: WorldFeature[] }>("/world/features");
      cityFeatures = result.features;
      scene?.setFeatures(cityFeatures);
      renderPoiList();
      const buildings = cityFeatures.filter((feature) => feature.kind === "building").length;
      const points = cityFeatures.length - buildings;
      cityStatus.textContent = cityFeatures.length
        ? `${buildings} edifícios · ${points} POIs`
        : "Nenhum edifício nomeado ou POI encontrado neste tile.";
    } catch (error) {
      cityStatus.textContent = errorMessage(error);
      cityRetry.hidden = false;
    }
  }
  cityRetry.addEventListener("click", () => { void loadCityFeatures(); });

  function playerDistance(player: RemotePlayer): string {
    if (player.id === user.id) return localSource === "local" ? "Posicao local" : `${localSource.toUpperCase()} ±${Math.round(localAccuracy)} m`;
    const sentAt = (player as RemotePlayer & { sentAt?: number }).sentAt;
    if (sentAt === undefined || Date.now() - sentAt > 15_000) {
      return "GPS desatualizado";
    }
    if (localSource === "gps" && player.source === "gps" && localGeo
      && player.lat !== undefined && player.lon !== undefined && player.accuracy !== undefined) {
      const estimate = distanceBetween(localGeo, {
        lat: player.lat,
        lon: player.lon,
        accuracy: player.accuracy,
      });
      return `${Math.round(estimate.meters)} m ±${Math.round(estimate.uncertainty)} m`;
    }
    if (event.center && localSource !== "local" && player.source !== "local" && player.accuracy !== undefined) {
      const localPosition = scene?.getLocalPosition();
      if (localPosition) {
        const meters = Math.hypot(player.x - localPosition.x, player.y - localPosition.y);
        return `${Math.round(meters)} m ±${Math.round(Math.hypot(localAccuracy, player.accuracy))} m`;
      }
    }
    return "Distancia indisponivel";
  }

  game.events.once(Phaser.Core.Events.READY, () => {
    scene = game.scene.getScene("world") as WorldScene;
    scene.setWorld(event);
    scene.setFeatures(cityFeatures);
    scene.setLocalIdentity(user.username, user.avatar);
    scene.events.on("position", (position: { x: number; y: number }) => {
      void realtime.sendPosition({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        source: localSource,
        accuracy: localSource === "local" ? undefined : localAccuracy,
        ...position,
      }, localGeo ?? undefined);
    });
  });

  const centerPrompt = root.querySelector<HTMLElement>("#map-center-prompt")!;
  const centerNotice = root.querySelector<HTMLElement>("#map-center-notice")!;
  const initializeWorldButton = root.querySelector<HTMLButtonElement>("#initialize-world")!;
  initializeWorldButton.addEventListener("click", () => {
    if (!navigator.geolocation || !window.isSecureContext) {
      centerNotice.textContent = "A localizacao requer GPS e uma conexao HTTPS.";
      return;
    }
    initializeWorldButton.disabled = true;
    centerNotice.textContent = "Obtendo localizacao para configurar o evento...";
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const result = await apiRequest<{ center: { lat: number; lon: number } }>("/world/center", {
          method: "POST",
          body: { lat: coords.latitude, lon: coords.longitude },
        });
        event.center = result.center;
        event.width_m = 5000;
        event.height_m = 5000;
        centerPrompt.hidden = true;
        movementStick.hidden = !supportsTouch;
        scene?.setWorld(event);
        const position = scene?.setLocalGeoPosition(coords.latitude, coords.longitude);
        locationStatus.textContent = "Centro do evento configurado";
        void loadCityFeatures();
      } catch (error) {
        centerNotice.textContent = errorMessage(error);
        initializeWorldButton.disabled = false;
      }
    }, (error) => {
      centerNotice.textContent = error.code === error.PERMISSION_DENIED
        ? "Permita a localizacao para definir o centro do evento."
        : "Nao foi possivel obter a localizacao GPS.";
      initializeWorldButton.disabled = false;
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 });
  });

  const movementStick = root.querySelector<HTMLElement>("#movement-stick")!;
  const movementKnob = root.querySelector<HTMLElement>(".movement-stick-knob")!;
  const supportsTouch = navigator.maxTouchPoints > 0;
  movementStick.hidden = !supportsTouch || !event.center;
  let movementPointer: number | null = null;
  const updateMovementStick = (pointer: PointerEvent): void => {
    const bounds = movementStick.getBoundingClientRect();
    const dx = pointer.clientX - (bounds.left + bounds.width / 2);
    const dy = pointer.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    const maximum = bounds.width * 0.32;
    const magnitude = Math.min(distance / maximum, 1);
    const x = distance > 0 ? (dx / distance) * magnitude : 0;
    const y = distance > 0 ? (dy / distance) * magnitude : 0;
    scene?.setTouchMovement(x, y);
    movementKnob.style.transform = `translate(${x * maximum}px, ${y * maximum}px)`;
  };
  movementStick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    movementPointer = event.pointerId;
    movementStick.setPointerCapture(event.pointerId);
    updateMovementStick(event);
  });
  movementStick.addEventListener("pointermove", (event) => {
    if (event.pointerId === movementPointer) updateMovementStick(event);
  });
  const releaseMovement = (event: PointerEvent): void => {
    if (event.pointerId !== movementPointer) return;
    movementPointer = null;
    scene?.setTouchMovement(0, 0);
    movementKnob.style.transform = "translate(0, 0)";
  };
  movementStick.addEventListener("pointerup", releaseMovement);
  movementStick.addEventListener("pointercancel", releaseMovement);

  poiSearch.addEventListener("input", renderPoiList);
  teleportGpsButton.addEventListener("click", () => {
    if (localGeo) {
      const projected = scene?.setLocalGeoPosition(localGeo.lat, localGeo.lon);
      if (projected) {
        locationStatus.textContent = "Teletransportado para o GPS atual";
        localSource = "gps";
        drawPlayers();
      }
      return;
    }
    if (!navigator.geolocation || !window.isSecureContext) {
      locationStatus.textContent = "GPS nao disponivel para teleporte imediato.";
      return;
    }
    teleportGpsButton.disabled = true;
    locationStatus.textContent = "Obtendo GPS para teleporte...";
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const projected = scene?.setLocalGeoPosition(coords.latitude, coords.longitude);
      if (projected) {
        localGeo = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy || 25, timestamp: Date.now() };
        localSource = "gps";
        locationStatus.textContent = "Teletransportado para o GPS atual";
        drawPlayers();
      }
      teleportGpsButton.disabled = false;
    }, () => {
      locationStatus.textContent = "Nao foi possivel obter a posicao GPS atual.";
      teleportGpsButton.disabled = false;
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 });
  });

  drawPlayers();
  renderPoiList();
  if (event.center) {
    void loadCityFeatures();
  }
  void realtime.start().catch((error: unknown) => { status.textContent = errorMessage(error); });
  root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll("[data-panel]").forEach((item) => item.classList.remove("active"));
      root.querySelectorAll("[data-panel-content]").forEach((item) => item.classList.add("hidden"));
      button.classList.add("active");
      root.querySelector(`[data-panel-content="${button.dataset.panel}"]`)?.classList.remove("hidden");
    });
  });

  root.querySelector<HTMLInputElement>("#gps-toggle")?.addEventListener("change", (event) => {
    const enabled = (event.currentTarget as HTMLInputElement).checked;
    if (!enabled) {
      stopWatchingLocation(geoWatch);
      geoWatch = -1;
      localGeo = null;
      localSource = "local";
      localAccuracy = 0;
      locationStatus.textContent = "Localizacao desligada";
      drawPlayers();
      return;
    }
    stopBleScan?.();
    stopBleScan = null;
    root.querySelector<HTMLInputElement>("#ble-toggle")!.checked = false;
    localSource = "gps";
    geoWatch = watchLocation((position) => {
      localGeo = position;
      localAccuracy = position.accuracy;
      const projected = scene?.setLocalGeoPosition(position.lat, position.lon);
      locationStatus.textContent = `${position.accuracy < 20 ? "GPS preciso" : "GPS estimado"} ±${Math.round(position.accuracy)} m`;
      if (projected || scene) {
        const localPosition = projected ?? scene!.getLocalPosition();
        void realtime.sendPosition({
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          source: "gps",
          accuracy: position.accuracy,
          ...localPosition,
        }, position);
      }
      drawPlayers();
    }, (message) => {
      localGeo = null;
      localSource = "local";
      localAccuracy = 0;
      locationStatus.textContent = message;
      root.querySelector<HTMLInputElement>("#gps-toggle")!.checked = false;
      stopWatchingLocation(geoWatch);
      geoWatch = -1;
    });
    if (geoWatch < 0) {
      (event.currentTarget as HTMLInputElement).checked = false;
    } else {
      locationStatus.textContent = "Aguardando GPS...";
    }
  });

  root.querySelector<HTMLInputElement>("#ble-toggle")?.addEventListener("change", (toggleEvent) => {
    const enabled = (toggleEvent.currentTarget as HTMLInputElement).checked;
    if (!enabled) {
      stopBleScan?.();
      stopBleScan = null;
      localSource = "local";
      localAccuracy = 0;
      locationStatus.textContent = "Bluetooth desligado";
      drawPlayers();
      return;
    }
    stopWatchingLocation(geoWatch);
    geoWatch = -1;
    localGeo = null;
    root.querySelector<HTMLInputElement>("#gps-toggle")!.checked = false;
    localSource = "ble";
    locationStatus.textContent = "Solicitando permissao BLE...";
    void startBeaconScan(event.beacons, (estimate) => {
      localAccuracy = estimate.accuracy;
      scene?.setLocalMapPosition(estimate.x, estimate.y);
      locationStatus.textContent = `BLE estimado ±${Math.round(estimate.accuracy)} m`;
      drawPlayers();
    }).then((stop) => {
      stopBleScan = stop;
      locationStatus.textContent = "Procurando beacons...";
    }).catch((error: unknown) => {
      localSource = "local";
      localAccuracy = 0;
      (toggleEvent.currentTarget as HTMLInputElement).checked = false;
      locationStatus.textContent = errorMessage(error);
    });
  });

  root.querySelector<HTMLFormElement>("#chat-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem("message") as HTMLInputElement;
    const text = input.value.trim().slice(0, 500);
    if (!text) return;
    try {
      await realtime.sendMessage(text);
      input.value = "";
    } catch (error) {
      status.textContent = errorMessage(error);
    }
  });

  root.querySelector<HTMLFormElement>("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const interests = String(values.get("interests") ?? "")
      .split(",").map((item) => item.trim()).filter(Boolean).slice(0, 10);
    const notice = root.querySelector<HTMLElement>("#profile-notice")!;
    try {
      const result = await apiRequest<{ profile: Profile }>("/profiles/me", {
        method: "PATCH",
        body: {
          display_name: values.get("display_name"),
          bio: values.get("bio"),
          interests,
        },
      });
      notice.textContent = "Perfil salvo.";
      root.querySelector<HTMLElement>(".account-name")!.textContent = result.profile.display_name;
    } catch (error) {
      notice.textContent = errorMessage(error);
    }
  });

  root.querySelector<HTMLFormElement>("#email-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const email = String(new FormData(form).get("email") ?? "").trim();
    const notice = root.querySelector<HTMLElement>("#email-notice")!;
    try {
      const result = await apiRequest<{ message: string }>("/account/email", {
        method: "POST",
        body: { email },
      });
      notice.textContent = result.message;
      root.querySelector<HTMLElement>("#email-state")!.textContent = "Aguardando confirmacao do email.";
    } catch (error) {
      notice.textContent = errorMessage(error);
    }
  });

  root.querySelector<HTMLButtonElement>("[data-action=logout]")?.addEventListener("click", async () => {
    stopWatchingLocation(geoWatch);
    stopBleScan?.();
    await realtime.stop();
    game.destroy(true);
    setToken(null);
    renderAuth(root, "Voce saiu do evento.");
  });

  window.addEventListener("beforeunload", () => {
    stopWatchingLocation(geoWatch);
    stopBleScan?.();
    void realtime.stop();
  }, { once: true });
}

function appendMessage(container: HTMLElement, message: ChatMessage, mine: boolean): void {
  const row = document.createElement("article");
  row.className = `chat-message ${mine ? "mine" : ""}`;
  const heading = document.createElement("div");
  heading.className = "chat-author";
  const name = document.createElement("strong");
  name.textContent = message.username;
  const time = document.createElement("time");
  time.dateTime = new Date(message.sentAt).toISOString();
  time.textContent = new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const body = document.createElement("p");
  body.textContent = message.text;
  heading.append(name, time);
  row.append(heading, body);
  container.append(row);
  while (container.childElementCount > 80) {
    container.firstElementChild?.remove();
  }
  container.scrollTop = container.scrollHeight;
}

function avatarGlyph(avatar: string): string {
  const glyphs: Record<string, string> = { moss: "M", ember: "E", wave: "W", sun: "S", comet: "C", bloom: "B" };
  return glyphs[avatar] ?? "?";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado";
}