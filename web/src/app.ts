import Phaser from "phaser";
import { AVATAR_OPTIONS, getAvatarOption } from "./avatarCatalog";
import { apiRequest, getToken, setToken, type Profile, type User } from "./services/api";
import { startBeaconScan } from "./services/bluetooth";
import { distanceBetween, stopWatchingLocation, watchLocation, type GeoPosition } from "./services/location";
import { downloadRealtimeDebugLog, RealtimeSession, type ChatMessage } from "./services/realtime";
import { WorldScene, type RemotePlayer, type WorldData, type WorldFeature } from "./world/WorldScene";

type AuthMode = "login" | "register" | "recovery";
type PlayerControlMode = "joystick" | "gps" | "ble";

interface TileTransition {
  tile_x: number;
  tile_y: number;
  x: number;
  y: number;
}

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
  let selectedAvatar = "moss";

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
              ${mode === "register" ? `<fieldset class="avatar-picker"><legend>Avatar</legend><div class="avatar-options">${renderAvatarOptions(selectedAvatar)}</div></fieldset>` : ""}
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
        selectedAvatar = button.dataset.avatar ?? "moss";
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
            <div id="map-credit" class="map-credit">Dados © OpenStreetMap contributors</div>
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
            <article id="map-feature-card" class="map-feature-card" aria-live="polite" hidden>
              <button id="close-map-feature" class="map-feature-close" type="button" aria-label="Fechar detalhes do local">×</button>
              <span id="map-feature-kind" class="map-feature-kind"></span>
              <h2 id="map-feature-name"></h2>
              <p id="map-feature-category"></p>
              <button id="teleport-map-feature" class="secondary-button" type="button">Teleportar para este local</button>
            </article>
            <section id="map-destinations-panel" class="map-destinations-panel" aria-label="Destinos do mapa" hidden>
              <div class="map-destinations-heading">
                <strong>Teleportar</strong>
                <button id="close-map-destinations" class="map-feature-close" type="button" aria-label="Fechar destinos">×</button>
              </div>
              <label class="teleport-search">
                <span class="sr-only">Buscar destino no mapa</span>
                <input id="map-poi-search" type="search" placeholder="Buscar POI" autocomplete="off" />
              </label>
              <div id="map-poi-list" class="poi-list" aria-live="polite"></div>
            </section>
            <div class="zoom-controls" aria-label="Zoom do mapa">
              <button id="zoom-in" class="zoom-button" type="button" aria-label="Ampliar mapa">+</button>
              <button id="zoom-out" class="zoom-button" type="button" aria-label="Reduzir mapa">−</button>
              <button id="zoom-5km" class="zoom-button zoom-reset-button" type="button" aria-label="Enquadrar tile de 5 km" title="Mostrar o tile completo de 5 km">5 km</button>
              <button id="toggle-satellite" class="zoom-button satellite-map-button" type="button" aria-label="Ativar imagem de satelite" aria-pressed="false" title="Ativar imagem de satelite" ${event.center ? "" : "disabled"}>Sat</button>
              <button id="fullscreen-map" class="zoom-button fullscreen-map-button" type="button" aria-label="Abrir mapa em tela cheia" title="Abrir mapa em tela cheia">⛶</button>
              <button id="toggle-map-names" class="zoom-button map-names-button" type="button" aria-label="Mostrar nomes no mapa" aria-pressed="false" title="Mostrar nomes no mapa quando o zoom estiver aproximado">Aa</button>
              <button id="toggle-map-destinations" class="zoom-button map-destinations-button" type="button" aria-label="Mostrar destinos" aria-expanded="false" title="Buscar e teleportar para um local">POI</button>
              <button id="recenter-map" class="zoom-button recenter-map-button" type="button" aria-label="Voltar ao jogador" title="Centralizar no jogador" hidden>◎</button>
            </div>
          </div>
          <div class="gps-control">
            <div class="control-mode-wrap">
              <span class="control-mode-label">Controle do jogador</span>
              <div class="control-modes" role="radiogroup" aria-label="Controle do jogador">
                <label class="control-mode"><input type="radio" name="player-control" value="joystick" checked /><span>Joystick</span></label>
                <label class="control-mode" title="${event.center ? "Ativar localizacao GPS continua" : "Defina primeiro o centro pelo botao do mapa"}"><input type="radio" name="player-control" value="gps" ${event.center ? "" : "disabled"} /><span>GPS</span></label>
                <label class="control-mode" title="${event.beacons.length >= 3 ? "Posicao por beacons BLE" : "O evento precisa configurar pelo menos 3 beacons"}"><input type="radio" name="player-control" value="ble" ${event.beacons.length >= 3 ? "" : "disabled"} /><span>Bluetooth</span></label>
              </div>
            </div>
            <span id="control-mode-status" class="privacy-note">Movimento manual. GPS automatico desligado.</span>
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
              <input id="profile-avatar" name="avatar" type="hidden" value="${escapeHtml(profile.avatar)}" />
              <fieldset class="avatar-picker profile-avatar-picker"><legend>Avatar</legend><div class="avatar-options">${renderAvatarOptions(profile.avatar, true)}</div></fieldset>
              <button class="primary-button" type="submit">Salvar perfil</button>
              <p class="notice" id="profile-notice" role="status"></p>
            </form>
            <div class="private-email">
              <p class="eyebrow">RECUPERACAO PRIVADA</p>
              <p class="email-state" id="email-state">${emailState.verified ? `Email confirmado: ${escapeHtml(emailState.email ?? "")}` : emailState.pending ? "Aguardando confirmacao do email." : "Nenhum email confirmado."}</p>
              <form id="email-form" class="email-form"><label>Email, nao publico<input name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(emailState.email ?? "")}" required /></label><button class="secondary-button" type="submit">${emailState.verified ? "Atualizar email" : "Associar email"}</button><p class="notice" id="email-notice" role="status"></p></form>
            </div>
          </section>
          <footer class="panel-footer">${avatarMarkup(user.avatar)}<span>Conectado como <strong>${escapeHtml(user.username)}</strong></span><button id="download-realtime-debug" class="debug-download-button" type="button" title="Descarregar logs de diagnóstico" aria-label="Descarregar logs de diagnóstico">Baixar logs</button><span class="app-version">#${__APP_VERSION__}</span></footer>
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
  let controlMode: PlayerControlMode = "joystick";
  let controlModeRequestId = 0;
  let scene: WorldScene | null = null;
  let cityFeatures: WorldFeature[] = [];
  let tileX = event.tile_x ?? 0;
  let tileY = event.tile_y ?? 0;
  let tileTransitionInProgress = false;
  let cityFeaturesRequestId = 0;
  const messages = root.querySelector<HTMLElement>("#message-list")!;
  const positionList = root.querySelector<HTMLElement>("#player-list")!;
  const status = root.querySelector<HTMLElement>("#connection-status")!;
  root.querySelector<HTMLButtonElement>("#download-realtime-debug")?.addEventListener("click", () => {
    if (!downloadRealtimeDebugLog()) {
      status.textContent = "Ainda nao ha logs de Realtime para descarregar.";
    }
  });
  const locationStatus = root.querySelector<HTMLElement>("#location-status")!;
  const cityStatus = root.querySelector<HTMLElement>("#city-status")!;
  const cityRetry = root.querySelector<HTMLButtonElement>("#city-retry")!;
  const poiSearch = root.querySelector<HTMLInputElement>("#poi-search")!;
  const poiList = root.querySelector<HTMLElement>("#poi-list")!;
  const mapPoiSearch = root.querySelector<HTMLInputElement>("#map-poi-search")!;
  const mapPoiList = root.querySelector<HTMLElement>("#map-poi-list")!;
  const mapDestinationsPanel = root.querySelector<HTMLElement>("#map-destinations-panel")!;
  const mapDestinationsButton = root.querySelector<HTMLButtonElement>("#toggle-map-destinations")!;
  const recenterMapButton = root.querySelector<HTMLButtonElement>("#recenter-map")!;
  const satelliteMapButton = root.querySelector<HTMLButtonElement>("#toggle-satellite")!;
  const mapCredit = root.querySelector<HTMLElement>("#map-credit")!;
  const worldFrame = root.querySelector<HTMLElement>(".world-frame")!;
  const teleportGpsButton = root.querySelector<HTMLButtonElement>("#teleport-gps")!;
  const mapFeatureCard = root.querySelector<HTMLElement>("#map-feature-card")!;
  const mapFeatureKind = root.querySelector<HTMLElement>("#map-feature-kind")!;
  const mapFeatureName = root.querySelector<HTMLElement>("#map-feature-name")!;
  const mapFeatureCategory = root.querySelector<HTMLElement>("#map-feature-category")!;
  const selectedFeatureTeleport = root.querySelector<HTMLButtonElement>("#teleport-map-feature")!;
  let selectedFeature: WorldFeature | null = null;
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
      const avatarOption = getAvatarOption(player.avatar);
      if (avatarOption?.image) {
        const image = document.createElement("img");
        image.src = avatarOption.image;
        image.alt = "";
        avatar.append(image);
      } else {
        avatar.textContent = avatarGlyph(player.avatar);
      }
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

  function showFeatureDetails(feature: WorldFeature): void {
    selectedFeature = feature;
    mapFeatureKind.textContent = feature.kind === "building" ? "Edifício" : "POI";
    mapFeatureName.textContent = feature.name;
    mapFeatureCategory.textContent = feature.category || "Categoria não informada";
    mapFeatureCard.hidden = false;
  }

  function teleportToFeature(feature: WorldFeature): void {
    if (!scene) {
      return;
    }
    scene.setLocalMapPosition(feature.x, feature.y);
    locationStatus.textContent = `Teletransportado para ${feature.name}`;
    localSource = "local";
    drawPlayers();
  }

  function renderPoiList(search = poiSearch, list = poiList): void {
    const query = search.value.trim().toLowerCase();
    const results = [...cityFeatures]
      .filter((feature) => feature.kind !== "water")
      .filter((feature) => {
        const text = `${feature.name} ${feature.category}`.toLowerCase();
        return !query || text.includes(query);
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    list.replaceChildren();
    if (!results.length) {
      const empty = document.createElement("p");
      empty.className = "poi-empty";
      empty.textContent = query ? "Nenhum POI encontrado." : "Carregue o mapa do evento para ver locais.";
      list.append(empty);
      return;
    }

    for (const feature of results.slice(0, 25)) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "poi-item";
      const meta = feature.kind === "building" ? "Edifício" : "POI";
      const description = feature.category || meta;
      item.innerHTML = `
        <span class="poi-item-main">
          <strong>${escapeHtml(feature.name)}</strong>
          <small>${escapeHtml(description)}</small>
        </span>
        <span class="poi-item-meta">
          <span class="poi-kind">${escapeHtml(meta)}</span>
          <span class="poi-description">${escapeHtml(feature.category)}</span>
        </span>
      `;
      item.addEventListener("click", () => {
        showFeatureDetails(feature);
        teleportToFeature(feature);
        mapDestinationsPanel.hidden = true;
        mapDestinationsButton.setAttribute("aria-expanded", "false");
      });
      list.append(item);
    }
  }

  async function loadCityFeatures(): Promise<void> {
    const requestId = ++cityFeaturesRequestId;
    const requestedTileX = tileX;
    const requestedTileY = tileY;
    cityRetry.hidden = true;
    cityStatus.textContent = "Consultando edifícios e pontos de interesse...";
    try {
      const result = await apiRequest<{ features: WorldFeature[] }>(`/world/features?tile_x=${tileX}&tile_y=${tileY}`);
      if (requestId !== cityFeaturesRequestId || requestedTileX !== tileX || requestedTileY !== tileY) {
        return;
      }
      cityFeatures = result.features;
      scene?.setFeatures(cityFeatures);
      renderPoiList();
      renderPoiList(mapPoiSearch, mapPoiList);
      const buildings = cityFeatures.filter((feature) => feature.kind === "building").length;
      const points = cityFeatures.filter((feature) => feature.kind === "poi").length;
      const waterAreas = cityFeatures.filter((feature) => feature.kind === "water").length;
      cityStatus.textContent = cityFeatures.length
        ? `${buildings} edifícios · ${points} POIs · ${waterAreas} áreas de água`
        : "Nenhum edifício nomeado ou POI encontrado neste tile.";
    } catch (error) {
      if (requestId !== cityFeaturesRequestId || requestedTileX !== tileX || requestedTileY !== tileY) {
        return;
      }
      cityStatus.textContent = errorMessage(error);
      cityRetry.hidden = false;
    }
  }
  cityRetry.addEventListener("click", () => { void loadCityFeatures(); });
  root.querySelector<HTMLButtonElement>("#close-map-feature")!.addEventListener("click", () => {
    mapFeatureCard.hidden = true;
    selectedFeature = null;
  });
  selectedFeatureTeleport.addEventListener("click", () => {
    if (selectedFeature) teleportToFeature(selectedFeature);
  });

  async function transitionToTile(transition: TileTransition): Promise<void> {
    if (tileTransitionInProgress) {
      return;
    }
    tileTransitionInProgress = true;
    const previousTile = { tile_x: tileX, tile_y: tileY };
    let sceneChanged = false;
    const featureRequestId = ++cityFeaturesRequestId;
    locationStatus.textContent = `Autorizando tile ${transition.tile_x}, ${transition.tile_y}...`;
    try {
      cityRetry.hidden = true;
      await realtime.leaveTile();
      messages.replaceChildren();
      const authorizedTile = await apiRequest<{
        tile_x: number;
        tile_y: number;
        width_m: number;
        height_m: number;
      }>("/world/tile", {
        method: "POST",
        body: { tile_x: transition.tile_x, tile_y: transition.tile_y },
      });
      let nextFeatures: WorldFeature[] = [];
      try {
        const result = await apiRequest<{ features: WorldFeature[] }>(
          `/world/features?tile_x=${authorizedTile.tile_x}&tile_y=${authorizedTile.tile_y}`,
        );
        if (featureRequestId === cityFeaturesRequestId) {
          nextFeatures = result.features;
          cityStatus.textContent = `${nextFeatures.filter((feature) => feature.kind === "building").length} edifícios · ${nextFeatures.filter((feature) => feature.kind === "poi").length} POIs · ${nextFeatures.filter((feature) => feature.kind === "water").length} áreas de água`;
          cityRetry.hidden = true;
        }
      } catch (error) {
        cityStatus.textContent = errorMessage(error);
        cityRetry.hidden = false;
      }

      tileX = authorizedTile.tile_x;
      tileY = authorizedTile.tile_y;
      event.tile_x = tileX;
      event.tile_y = tileY;
      event.width_m = authorizedTile.width_m;
      event.height_m = authorizedTile.height_m;
      cityFeatures = nextFeatures;
      scene?.setTile(tileX, tileY, transition.x, transition.y);
      sceneChanged = true;
      scene?.setFeatures(cityFeatures);
      renderPoiList();
      renderPoiList(mapPoiSearch, mapPoiList);
      await realtime.switchTile(tileX, tileY);
      locationStatus.textContent = `Tile ${tileX}, ${tileY}`;
      drawPlayers();
    } catch (error) {
      if (sceneChanged) {
        locationStatus.textContent = `Tile ${tileX}, ${tileY} sem conexão: ${errorMessage(error)}`;
      } else {
        scene?.cancelTileTransition();
        locationStatus.textContent = `Mudança de tile recusada: ${errorMessage(error)}`;
        try {
          await realtime.switchTile(previousTile.tile_x, previousTile.tile_y);
        } catch {
          status.textContent = "Sem conexão com o tile atual.";
        }
      }
    } finally {
      tileTransitionInProgress = false;
    }
  }

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
    const worldScene = game.scene.getScene("world") as WorldScene;
    worldScene.events.once(Phaser.Scenes.Events.CREATE, () => {
      scene = worldScene;
      worldScene.setWorld(event);
      worldScene.setFeatures(cityFeatures);
      worldScene.setLocalIdentity(user.username, user.avatar);
      worldScene.events.on("position", (position: { x: number; y: number }) => {
        void realtime.sendPosition({
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          source: localSource,
          accuracy: localSource === "local" ? undefined : localAccuracy,
          ...position,
        }, localGeo ?? undefined);
      });
      worldScene.events.on("tile-request", (transition: TileTransition) => {
        void transitionToTile(transition);
      });
      worldScene.events.on("satellite-error", (message: string) => {
        satelliteToggleButton.setAttribute("aria-pressed", "false");
        satelliteToggleButton.setAttribute("aria-label", "Ativar imagem de satelite");
        satelliteToggleButton.title = "Ativar imagem de satelite";
        mapCredit.textContent = "Dados © OpenStreetMap contributors";
        void scene?.setSatelliteEnabled(false);
        status.textContent = message;
      });
      worldScene.events.on("feature-selected", (feature: WorldFeature) => {
        showFeatureDetails(feature);
      });
      worldScene.events.on("camera-mode", (followingPlayer: boolean) => {
        recenterMapButton.hidden = followingPlayer;
      });
      recenterMapButton.hidden = worldScene.isCameraFollowingPlayer();
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
        satelliteMapButton.disabled = false;
        centerPrompt.hidden = true;
        movementStick.hidden = !supportsTouch || controlMode !== "joystick";
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
  const zoomInButton = root.querySelector<HTMLButtonElement>("#zoom-in")!;
  const zoomOutButton = root.querySelector<HTMLButtonElement>("#zoom-out")!;
  const zoom5kmButton = root.querySelector<HTMLButtonElement>("#zoom-5km")!;
  const satelliteToggleButton = root.querySelector<HTMLButtonElement>("#toggle-satellite")!;
  const fullscreenMapButton = root.querySelector<HTMLButtonElement>("#fullscreen-map")!;
  const mapNamesButton = root.querySelector<HTMLButtonElement>("#toggle-map-names")!;
  const supportsTouch = navigator.maxTouchPoints > 0;
  movementStick.hidden = !supportsTouch || !event.center || controlMode !== "joystick";
  let movementPointer: number | null = null;

  const adjustSceneZoom = (delta: number): void => {
    if (!scene) {
      return;
    }
    scene.setZoom(scene.getZoom() + delta);
  };

  zoomInButton.addEventListener("click", () => adjustSceneZoom(0.2));
  zoomOutButton.addEventListener("click", () => adjustSceneZoom(-0.2));
  zoom5kmButton.addEventListener("click", () => scene?.fitWorldToView());
  satelliteToggleButton.addEventListener("click", () => {
    if (!scene) {
      return;
    }
    const enabled = satelliteToggleButton.getAttribute("aria-pressed") !== "true";
    satelliteToggleButton.disabled = true;
    locationStatus.textContent = enabled ? "Carregando imagem de satelite..." : "Voltando ao mapa do jogo...";
    void scene.setSatelliteEnabled(enabled).then(() => {
      satelliteToggleButton.setAttribute("aria-pressed", String(enabled));
      satelliteToggleButton.setAttribute("aria-label", enabled ? "Desativar imagem de satelite" : "Ativar imagem de satelite");
      satelliteToggleButton.title = enabled ? "Desativar imagem de satelite" : "Ativar imagem de satelite";
      mapCredit.textContent = enabled
        ? "Imagem © Esri, Maxar, Earthstar Geographics | Dados © OpenStreetMap"
        : "Dados © OpenStreetMap contributors";
    }).catch((error: unknown) => {
      status.textContent = errorMessage(error);
      void scene?.setSatelliteEnabled(false);
    }).finally(() => {
      satelliteToggleButton.disabled = false;
    });
  });
  const syncFullscreenButton = (): void => {
    const isFullscreen = document.fullscreenElement === worldFrame;
    fullscreenMapButton.setAttribute("aria-label", isFullscreen ? "Sair da tela cheia" : "Abrir mapa em tela cheia");
    fullscreenMapButton.title = isFullscreen ? "Sair da tela cheia" : "Abrir mapa em tela cheia";
    fullscreenMapButton.textContent = isFullscreen ? "×" : "⛶";
  };
  fullscreenMapButton.disabled = !document.fullscreenEnabled || typeof worldFrame.requestFullscreen !== "function";
  fullscreenMapButton.addEventListener("click", () => {
    const toggleFullscreen = document.fullscreenElement === worldFrame
      ? document.exitFullscreen()
      : worldFrame.requestFullscreen();
    void toggleFullscreen.catch((error: unknown) => {
      locationStatus.textContent = errorMessage(error);
    });
  });
  document.addEventListener("fullscreenchange", syncFullscreenButton);
  recenterMapButton.addEventListener("click", () => scene?.centerCameraOnPlayer());
  mapDestinationsButton.addEventListener("click", () => {
    mapDestinationsPanel.hidden = !mapDestinationsPanel.hidden;
    mapDestinationsButton.setAttribute("aria-expanded", String(!mapDestinationsPanel.hidden));
    if (!mapDestinationsPanel.hidden) mapPoiSearch.focus();
  });
  root.querySelector<HTMLButtonElement>("#close-map-destinations")!.addEventListener("click", () => {
    mapDestinationsPanel.hidden = true;
    mapDestinationsButton.setAttribute("aria-expanded", "false");
  });
  mapPoiSearch.addEventListener("input", () => renderPoiList(mapPoiSearch, mapPoiList));
  mapNamesButton.addEventListener("click", () => {
    const visible = mapNamesButton.getAttribute("aria-pressed") !== "true";
    mapNamesButton.setAttribute("aria-pressed", String(visible));
    mapNamesButton.setAttribute("aria-label", visible ? "Ocultar nomes no mapa" : "Mostrar nomes no mapa");
    mapNamesButton.title = visible
      ? "Nomes ativos; visíveis quando o zoom estiver aproximado"
      : "Mostrar nomes no mapa quando o zoom estiver aproximado";
    scene?.setFeatureNamesVisible(visible);
  });

  let mapPointer: {
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null = null;
  const activeMapPointers = new Map<number, { x: number; y: number }>();
  let pinchGesture: { pointerIds: [number, number]; startDistance: number; startZoom: number } | null = null;
  const pointerDistance = (first: { x: number; y: number }, second: { x: number; y: number }): number =>
    Math.hypot(first.x - second.x, first.y - second.y);

  worldFrame.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (event.target.closest("button, input, .movement-stick, .city-indicator, .map-feature-card, .map-destinations-panel, .map-center-prompt, .zoom-controls")) return;
    if (activeMapPointers.size >= 2) return;
    activeMapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    worldFrame.setPointerCapture(event.pointerId);
    if (activeMapPointers.size === 2) {
      const pointerIds = [...activeMapPointers.keys()] as [number, number];
      const first = activeMapPointers.get(pointerIds[0])!;
      const second = activeMapPointers.get(pointerIds[1])!;
      mapPointer = null;
      pinchGesture = {
        pointerIds,
        startDistance: Math.max(pointerDistance(first, second), 1),
        startZoom: scene?.getZoom() ?? 1,
      };
      worldFrame.classList.remove("is-panning");
      event.preventDefault();
      return;
    }
    mapPointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    event.preventDefault();
  });
  worldFrame.addEventListener("pointermove", (event) => {
    if (activeMapPointers.has(event.pointerId)) {
      activeMapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchGesture) {
      const first = activeMapPointers.get(pinchGesture.pointerIds[0]);
      const second = activeMapPointers.get(pinchGesture.pointerIds[1]);
      if (first && second) {
        const distance = pointerDistance(first, second);
        scene?.setZoom(pinchGesture.startZoom * distance / pinchGesture.startDistance);
        event.preventDefault();
      }
      return;
    }
    if (!mapPointer || mapPointer.id !== event.pointerId) return;
    const totalX = event.clientX - mapPointer.startX;
    const totalY = event.clientY - mapPointer.startY;
    if (!mapPointer.moved && Math.hypot(totalX, totalY) < 5) return;
    if (mapPointer.moved) {
      scene?.panCameraBy(event.clientX - mapPointer.lastX, event.clientY - mapPointer.lastY);
    } else {
      mapPointer.moved = true;
      scene?.panCameraBy(totalX, totalY);
      worldFrame.classList.add("is-panning");
    }
    mapPointer.lastX = event.clientX;
    mapPointer.lastY = event.clientY;
    event.preventDefault();
  });
  const finishMapPointer = (event: PointerEvent): void => {
    if (!activeMapPointers.has(event.pointerId)) return;
    activeMapPointers.delete(event.pointerId);
    if (worldFrame.hasPointerCapture(event.pointerId)) worldFrame.releasePointerCapture(event.pointerId);
    if (pinchGesture) {
      pinchGesture = null;
      worldFrame.classList.remove("is-panning");
      const remainingPointer = activeMapPointers.entries().next().value as [number, { x: number; y: number }] | undefined;
      mapPointer = remainingPointer
        ? {
            id: remainingPointer[0],
            startX: remainingPointer[1].x,
            startY: remainingPointer[1].y,
            lastX: remainingPointer[1].x,
            lastY: remainingPointer[1].y,
            moved: true,
          }
        : null;
      return;
    }
    if (!mapPointer || mapPointer.id !== event.pointerId) return;
    const wasDragged = mapPointer.moved;
    mapPointer = null;
    worldFrame.classList.remove("is-panning");
    if (!wasDragged && scene) {
      const bounds = game.canvas.getBoundingClientRect();
      const screenX = (event.clientX - bounds.left) * (scene.scale.width / bounds.width);
      const screenY = (event.clientY - bounds.top) * (scene.scale.height / bounds.height);
      scene.selectFeatureAtScreenPoint(screenX, screenY);
    }
  };
  worldFrame.addEventListener("pointerup", finishMapPointer);
  worldFrame.addEventListener("pointercancel", finishMapPointer);
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

  poiSearch.addEventListener("input", () => renderPoiList());
  teleportGpsButton.addEventListener("click", () => {
    if (controlMode === "gps" && localGeo) {
      const projected = scene?.setLocalGeoPosition(localGeo.lat, localGeo.lon);
      if (projected) {
        locationStatus.textContent = "Teletransportado para o GPS atual";
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
        if (controlMode === "gps") {
          localGeo = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy || 25, timestamp: Date.now() };
          localSource = "gps";
          localAccuracy = coords.accuracy || 25;
        }
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
  void realtime.start(tileX, tileY).catch((error: unknown) => { status.textContent = errorMessage(error); });
  root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll("[data-panel]").forEach((item) => item.classList.remove("active"));
      root.querySelectorAll("[data-panel-content]").forEach((item) => item.classList.add("hidden"));
      button.classList.add("active");
      root.querySelector(`[data-panel-content="${button.dataset.panel}"]`)?.classList.remove("hidden");
    });
  });

  const controlModeStatus = root.querySelector<HTMLElement>("#control-mode-status")!;
  const updateControlModeUi = (mode: PlayerControlMode): void => {
    const radio = root.querySelector<HTMLInputElement>(`input[name="player-control"][value="${mode}"]`);
    if (radio) radio.checked = true;
    movementStick.hidden = !supportsTouch || !event.center || mode !== "joystick";
  };

  const selectControlMode = (mode: PlayerControlMode, errorStatus?: string): void => {
    const requestId = ++controlModeRequestId;
    controlMode = mode;
    updateControlModeUi(mode);
    stopWatchingLocation(geoWatch);
    geoWatch = -1;
    stopBleScan?.();
    stopBleScan = null;
    localGeo = null;
    localAccuracy = 0;
    localSource = "local";
    scene?.setCenterPlayerOnZoom(mode === "gps");
    scene?.setTouchMovement(0, 0);
    movementKnob.style.transform = "translate(0, 0)";

    if (mode === "joystick") {
      locationStatus.textContent = errorStatus ?? "Controle manual pelo joystick. GPS automatico desligado.";
      controlModeStatus.textContent = errorStatus ?? "Joystick manual; GPS desligado. Sua posicao de jogo e compartilhada no tile.";
      drawPlayers();
      return;
    }

    if (mode === "gps") {
      if (!event.center) {
        selectControlMode("joystick", "Defina primeiro o centro pelo botao GPS no mapa.");
        return;
      }
      if (!navigator.geolocation || !window.isSecureContext) {
        selectControlMode("joystick", "GPS requer permissao e HTTPS ou localhost.");
        return;
      }
      controlModeStatus.textContent = "GPS ativo; sua posicao e precisao sao compartilhadas no tile atual.";
      geoWatch = watchLocation((position) => {
        if (controlMode !== "gps" || requestId !== controlModeRequestId) return;
        localGeo = position;
        localAccuracy = position.accuracy;
        localSource = "gps";
        locationStatus.textContent = `${position.accuracy < 20 ? "GPS preciso" : "GPS estimado"} ±${Math.round(position.accuracy)} m`;
        scene?.setLocalGeoPosition(position.lat, position.lon);
        drawPlayers();
      }, (message) => {
        if (requestId !== controlModeRequestId) return;
        selectControlMode("joystick", message);
      });
      if (geoWatch < 0) {
        selectControlMode("joystick", "Nao foi possivel iniciar o GPS.");
      } else {
        locationStatus.textContent = "Aguardando GPS...";
      }
      return;
    }

    if (event.beacons.length < 3) {
      selectControlMode("joystick", "O evento precisa configurar pelo menos 3 beacons.");
      return;
    }
    controlModeStatus.textContent = "Bluetooth ativo; estimativa e precisao sao compartilhadas no tile atual.";
    locationStatus.textContent = "Solicitando permissao BLE...";
    void startBeaconScan(event.beacons, (estimate) => {
      if (controlMode !== "ble" || requestId !== controlModeRequestId) return;
      localAccuracy = estimate.accuracy;
      localSource = "ble";
      scene?.setLocalEventPosition(estimate.x, estimate.y);
      locationStatus.textContent = `BLE estimado ±${Math.round(estimate.accuracy)} m`;
      drawPlayers();
    }).then((stop) => {
      if (requestId !== controlModeRequestId || controlMode !== "ble") {
        stop();
        return;
      }
      stopBleScan = stop;
      locationStatus.textContent = "Procurando beacons...";
    }).catch((error: unknown) => {
      if (requestId !== controlModeRequestId) return;
      selectControlMode("joystick", errorMessage(error));
    });
  };

  root.querySelectorAll<HTMLInputElement>('input[name="player-control"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) selectControlMode(radio.value as PlayerControlMode);
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
      const result = await apiRequest<{ profile: Profile; token?: string }>("/profiles/me", {
        method: "PATCH",
        body: {
          display_name: values.get("display_name"),
          bio: values.get("bio"),
          interests,
          avatar: values.get("avatar"),
        },
      });
      if (result.token) {
        setToken(result.token);
        window.location.reload();
        return;
      }
      notice.textContent = "Perfil salvo.";
      root.querySelector<HTMLElement>(".account-name")!.textContent = result.profile.display_name;
    } catch (error) {
      notice.textContent = errorMessage(error);
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-profile-avatar]").forEach((button) => {
    button.addEventListener("click", () => {
      const avatar = button.dataset.profileAvatar;
      if (!avatar) return;
      root.querySelector<HTMLInputElement>("#profile-avatar")!.value = avatar;
      root.querySelectorAll("[data-profile-avatar]").forEach((option) => option.classList.remove("selected"));
      button.classList.add("selected");
    });
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

function renderAvatarOptions(selected: string, profile = false): string {
  return AVATAR_OPTIONS.map((avatar) => {
    const dataAttribute = profile ? "data-profile-avatar" : "data-avatar";
    const visual = avatar.image
      ? `<img src="${avatar.image}" alt="" loading="lazy" />`
      : `<span class="avatar-option-glyph">${avatarGlyph(avatar.id)}</span>`;
    return `<button type="button" class="avatar-option ${avatar.id === selected ? "selected" : ""}" ${dataAttribute}="${avatar.id}" aria-label="${escapeHtml(avatar.name)}" title="${escapeHtml(avatar.name)}">${visual}<span class="avatar-option-name">${escapeHtml(avatar.name)}</span></button>`;
  }).join("");
}

function avatarMarkup(avatar: string): string {
  const option = getAvatarOption(avatar);
  if (option?.image) {
    return `<span class="avatar-chip"><img src="${option.image}" alt="" /></span>`;
  }
  return `<span class="avatar-chip avatar-${avatar}">${avatarGlyph(avatar)}</span>`;
}

function avatarGlyph(avatar: string): string {
  const glyphs: Record<string, string> = { moss: "M", ember: "E", wave: "W", sun: "S", comet: "C", bloom: "B", girl8: "G" };
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