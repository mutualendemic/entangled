export type Locale = "en" | "pt-PT";

const LOCALE_STORAGE_KEY = "entanglement.locale";

const englishTranslations: Record<string, string> = {
  "MUNDO SOCIAL DE EVENTOS": "SOCIAL EVENT WORLD",
  "Encontre pessoas, lugares e histórias no mesmo mapa.": "Meet people, places, and stories on the same map.",
  "ACESSO AO EVENTO": "EVENT ACCESS",
  "Acesso": "Access",
  "Entrar": "Log in",
  "Criar conta": "Create account",
  "Escolha sua identidade": "Choose your identity",
  "Recuperar acesso": "Recover your account",
  "Bom te ver": "Welcome back",
  "Seu nome aparece para os outros jogadores.": "Your name is visible to other players.",
  "Enviaremos um link ao email confirmado da conta.": "We will send a link to the email address verified on your account.",
  "Entre no mundo do seu evento.": "Enter your event world.",
  "Nome de jogador": "Player name",
  "seu_nome": "your_name",
  "Senha": "Password",
  "10 caracteres ou mais": "10 characters or more",
  "Sua senha": "Your password",
  "Avatar": "Avatar",
  "Enviar link": "Send link",
  "Entrar no mundo": "Enter the world",
  "Esqueci minha senha": "Forgot my password?",
  "Voltar ao login": "Back to log in",
  "SEGURANCA DA CONTA": "ACCOUNT SECURITY",
  "Defina uma nova senha": "Set a new password",
  "Nova senha": "New password",
  "Atualizar senha": "Update password",
  "Mudar idioma": "Change language",
  "Idioma": "Language",
  "Sair": "Log out",
  "MAPA DO EVENTO": "EVENT MAP",
  "Localizacao desligada": "Location is off",
  "Centro do evento pendente": "Event center not set",
  "Personagens e pontos do mundo": "World characters and points of interest",
  "ÁREA DO EVENTO": "EVENT AREA",
  "Carregando edifícios e POIs...": "Loading buildings and points of interest...",
  "Aguardando centro do evento": "Waiting for the event center",
  "Tentar carregar edifícios novamente": "Retry loading buildings",
  "Escolha o centro da cidade": "Choose the city center",
  "Use uma leitura GPS para fixar o centro compartilhado e carregar edifícios nomeados e POIs no tile de 5 km.": "Use a GPS reading to set the shared center and load named buildings and points of interest in the 5 km tile.",
  "Definir centro pelo GPS": "Set center using GPS",
  "Controle de movimento": "Movement controls",
  "Fechar detalhes do local": "Close place details",
  "Teleportar para este local": "Teleport to this place",
  "Destinos do mapa": "Map destinations",
  "Fechar destinos": "Close destinations",
  "Buscar destino no mapa": "Search map destinations",
  "Buscar POI": "Search points of interest",
  "Zoom do mapa": "Map zoom",
  "Ampliar mapa": "Zoom in",
  "Reduzir mapa": "Zoom out",
  "Enquadrar tile de 5 km": "Fit 5 km tile",
  "Mostrar o tile completo de 5 km": "Show the entire 5 km tile",
  "Ativar imagem de satelite": "Enable satellite imagery",
  "Desativar imagem de satelite": "Disable satellite imagery",
  "Abrir mapa em tela cheia": "Open map in full screen",
  "Sair da tela cheia": "Exit full screen",
  "Mostrar nomes no mapa": "Show map labels",
  "Ocultar nomes no mapa": "Hide map labels",
  "Mostrar nomes no mapa quando o zoom estiver aproximado": "Show map labels when zoomed in",
  "Nomes ativos; visíveis quando o zoom estiver aproximado": "Labels are on; visible when zoomed in",
  "Buscar e teleportar para um local": "Search for and teleport to a place",
  "Mostrar destinos": "Show destinations",
  "Voltar ao jogador": "Return to player",
  "Centralizar no jogador": "Center on player",
  "Controle do jogador": "Player controls",
  "Ativar localizacao GPS continua": "Enable continuous GPS location",
  "Defina primeiro o centro pelo botao do mapa": "Set the center using the map button first",
  "Posicao por beacons BLE": "Position using BLE beacons",
  "O evento precisa configurar pelo menos 3 beacons": "The event must configure at least 3 beacons",
  "O evento precisa configurar pelo menos 3 beacons.": "The event must configure at least 3 beacons.",
  "Movimento manual. GPS automatico desligado.": "Manual movement. GPS is off.",
  "Painel social": "Social panel",
  "Jogadores": "Players",
  "Mensagens": "Messages",
  "Perfil": "Profile",
  "Conectando...": "Connecting...",
  "Por perto": "Nearby",
  "1 online": "1 online",
  "Buscar destino": "Search destinations",
  "Buscar lugar ou POI": "Search for a place or point of interest",
  "Usar GPS atual": "Use current GPS location",
  "Conversa do evento": "Event chat",
  "temporaria": "temporary",
  "Escreva uma mensagem": "Write a message",
  "Enviar mensagem": "Send message",
  "Seu perfil": "Your profile",
  "visivel no evento": "visible to event participants",
  "Nome publico": "Public name",
  "Sobre voce": "About you",
  "Interesses, separados por virgula": "Interests, separated by commas",
  "Salvar perfil": "Save profile",
  "RECUPERACAO PRIVADA": "PRIVATE ACCOUNT RECOVERY",
  "Email, nao publico": "Email (not public)",
  "Atualizar email": "Update email",
  "Associar email": "Add email",
  "Descarregar logs de diagnóstico": "Download diagnostic logs",
  "Baixar logs": "Download logs",
  "Conectado como": "Signed in as",
  "(voce)": "(you)",
  "Edifício": "Building",
  "Categoria não informada": "Category not provided",
  "Nenhum POI encontrado.": "No points of interest found.",
  "Carregue o mapa do evento para ver locais.": "Load the event map to see places.",
  "Consultando edifícios e pontos de interesse...": "Looking up buildings and points of interest...",
  "Nenhum edifício nomeado ou POI encontrado neste tile.": "No named buildings or points of interest found in this tile.",
  "áreas de água": "water areas",
  "Localizacao requer GPS e uma conexao HTTPS.": "Location requires GPS and an HTTPS connection.",
  "Obtendo localizacao para configurar o evento...": "Getting your location to set up the event...",
  "Centro do evento configurado": "Event center configured",
  "Permita a localizacao para definir o centro do evento.": "Allow location access to set the event center.",
  "Nao foi possivel obter a localizacao GPS.": "Could not get GPS location.",
  "Carregando imagem de satelite...": "Loading satellite imagery...",
  "Voltando ao mapa do jogo...": "Returning to the game map...",
  "Dados © OpenStreetMap contributors": "Data © OpenStreetMap contributors",
  "Imagem © Esri, Maxar, Earthstar Geographics | Dados © OpenStreetMap": "Imagery © Esri, Maxar, Earthstar Geographics | Data © OpenStreetMap",
  "Ainda nao ha logs de Realtime para descarregar.": "There are no Realtime logs to download yet.",
  "Falha ao enviar {event} ({result}). Verifique a policy Realtime.": "Failed to send {event} ({result}). Check the Realtime policy.",
  "Conectado ao tile {x}, {y}": "Connected to tile {x}, {y}",
  "Falha ao publicar presença: {result}": "Failed to publish presence: {result}",
  "Falha ao publicar presença no tile.": "Failed to publish presence in this tile.",
  "Configure Supabase para habilitar presenca e mensagens.": "Configure Supabase to enable presence and messaging.",
  "Chat indisponivel: conecte o Supabase Realtime.": "Chat unavailable: connect to Supabase Realtime.",
  "Nao foi possivel enviar a mensagem ({result}).": "Could not send the message ({result}).",
  "A reconectar ao Realtime...": "Reconnecting to Realtime...",
  "A conexao em tempo real expirou. Entre novamente no jogo.": "The Realtime connection expired. Please sign in to the game again.",
  "Nao foi possivel conectar ao tile autorizado.": "Could not connect to the authorized tile.",
  "Falha ao carregar imagem de satelite.": "Failed to load satellite imagery.",
  "GPS indisponivel": "GPS unavailable",
  "GPS desatualizado": "GPS data is stale",
  "Posicao local": "Local position",
  "Distancia indisponivel": "Distance unavailable",
  "Teletransportado para {name}": "Teleported to {name}",
  "Autorizando tile {x}, {y}...": "Authorizing tile {x}, {y}...",
  "Tile {x}, {y}": "Tile {x}, {y}",
  "Tile {x}, {y} sem conexão: {error}": "Tile {x}, {y} disconnected: {error}",
  "Mudança de tile recusada: {error}": "Tile change denied: {error}",
  "Sem conexão com o tile atual.": "No connection to the current tile.",
  "GPS nao disponivel para teleporte imediato.": "GPS is unavailable for immediate teleportation.",
  "Obtendo GPS para teleporte...": "Getting GPS location for teleportation...",
  "Teletransportado para o GPS atual": "Teleported to your current GPS location",
  "Nao foi possivel obter a posicao GPS atual.": "Could not get your current GPS location.",
  "Controle manual pelo joystick. GPS automatico desligado.": "Manual joystick control. GPS is off.",
  "Joystick manual; GPS desligado. Sua posicao de jogo e compartilhada no tile.": "Manual joystick control; GPS is off. Your game position is shared in this tile.",
  "Defina primeiro o centro pelo botao GPS no mapa.": "Set the center using the GPS button on the map first.",
  "GPS requer permissao e HTTPS ou localhost.": "GPS requires permission and HTTPS or localhost.",
  "GPS ativo; sua posicao e precisao sao compartilhadas no tile atual.": "GPS is on; your position and accuracy are shared in the current tile.",
  "GPS preciso": "Accurate GPS",
  "GPS estimado": "Estimated GPS",
  "Aguardando GPS...": "Waiting for GPS...",
  "Nao foi possivel iniciar o GPS.": "Could not start GPS.",
  "Bluetooth ativo; estimativa e precisao sao compartilhadas no tile atual.": "Bluetooth is on; the estimate and accuracy are shared in the current tile.",
  "Solicitando permissao BLE...": "Requesting BLE permission...",
  "BLE estimado": "Estimated BLE",
  "Procurando beacons...": "Searching for beacons...",
  "Perfil salvo.": "Profile saved.",
  "Aguardando confirmacao do email.": "Waiting for email confirmation.",
  "Email confirmado: {email}": "Email confirmed: {email}",
  "Nenhum email confirmado.": "No confirmed email address.",
  "Ocorreu um erro inesperado": "An unexpected error occurred",
  "Email confirmado. Voce ja pode usar a recuperacao de senha.": "Email confirmed. You can now use password recovery.",
  "Este dispositivo nao disponibiliza GPS pelo navegador.": "This device does not provide GPS through the browser.",
  "GPS requer HTTPS ou localhost.": "GPS requires HTTPS or localhost.",
  "Permissao de localizacao negada.": "Location permission denied.",
  "BLE requer HTTPS ou localhost.": "BLE requires HTTPS or localhost.",
  "Este navegador nao permite scan BLE. Use GPS ou movimento manual.": "This browser does not support BLE scanning. Use GPS or manual movement.",
  "Sao necessarios pelo menos 3 beacons mapeados para estimar a posicao.": "At least 3 mapped beacons are required to estimate a position.",
  "Nenhum": "None",
  "{buildings} edifícios · {points} POIs · {water} áreas de água": "{buildings} buildings · {points} POIs · {water} water areas",
  "Coordenadas de tile invalidas": "Invalid tile coordinates",
  "Defina o centro do evento antes de mudar de tile": "Set the event center before changing tiles",
  "Tile fora da area geografica suportada": "Tile is outside the supported geographic area",
  "Teleportar": "Teleport",
  "Voce saiu do evento.": "You signed out of the event.",
  "Musgo": "Moss",
  "Brasa": "Ember",
  "Onda": "Wave",
  "Sol": "Sun",
  "Cometa": "Comet",
  "Flor": "Blossom",
  "Voce": "You",
  "Evento local": "Local event",
  "Email confirmado": "Email confirmed",
  "Se a conta tiver um email confirmado, enviaremos um link de recuperacao": "If the account has a verified email address, we will send a recovery link.",
  "Se o envio estiver configurado, voce recebera um link de confirmacao": "If email delivery is configured, you will receive a confirmation link.",
  "Senha atualizada": "Password updated",
  "A senha deve ter pelo menos 10 caracteres": "Password must be at least 10 characters long",
  "Autenticacao indisponivel: JWT_SECRET nao configurado": "Authentication unavailable: JWT_SECRET is not configured",
  "Autenticacao necessaria": "Authentication required",
  "Avatar invalido": "Invalid avatar",
  "Banco indisponivel. Verifique a conexao e a configuracao DNS.": "Database unavailable. Check the connection and DNS configuration.",
  "Beacon invalido": "Invalid beacon",
  "Campo de perfil nao permitido": "Profile field is not allowed",
  "Centro geografico invalido": "Invalid geographic center",
  "Configure o envio SMTP para confirmar o email": "Configure SMTP delivery to verify the email address",
  "Conta nao encontrada": "Account not found",
  "Coordenadas invalidas": "Invalid coordinates",
  "Corpo JSON invalido": "Invalid JSON body",
  "Dados de beacon invalidos": "Invalid beacon data",
  "Dados de local invalidos": "Invalid location data",
  "Defina o centro do evento antes de carregar edificios": "Set the event center before loading buildings",
  "Descricao deve ter no maximo 280 caracteres": "Description must be at most 280 characters long",
  "Dimensoes do mapa devem estar entre 50 e 5000 metros": "Map dimensions must be between 50 and 5,000 meters",
  "Email invalido": "Invalid email address",
  "Este nome de jogador ja esta em uso. Entre na conta ou escolha outro nome.": "This player name is already in use. Sign in or choose another name.",
  "Informe ate 10 interesses de no maximo 32 caracteres": "Enter up to 10 interests, each no longer than 32 characters",
  "Informe no maximo 20 beacons": "Enter no more than 20 beacons",
  "Informe os campos do perfil": "Provide the profile fields",
  "Link invalido ou expirado": "Invalid or expired link",
  "Local invalido": "Invalid place",
  "Nao autorizado": "Not authorized",
  "Nao foi possivel confirmar este email": "Could not verify this email address",
  "Nao foi possivel enviar o email agora": "Could not send the email right now",
  "Nao foi possivel inicializar a area do evento": "Could not initialize the event area",
  "Nome de evento invalido": "Invalid event name",
  "Nome ou senha incorretos": "Incorrect name or password",
  "Nome publico deve ter de 1 a 40 caracteres": "Public name must be between 1 and 40 characters long",
  "O centro do evento nao pode ser alterado apos a criacao dos tiles": "The event center cannot be changed after tiles have been created",
  "Os dados de edificios estao temporariamente indisponiveis": "Building data is temporarily unavailable",
  "Perfil nao encontrado": "Profile not found",
  "Sessao invalida ou expirada": "Session is invalid or has expired",
  "Supabase Realtime nao esta configurado": "Supabase Realtime is not configured",
  "Use de 3 a 24 letras, numeros ou underscores no nome": "Use 3 to 24 letters, numbers, or underscores in the name",
  "Defina o centro do evento antes de ativar o satelite.": "Set the event center before enabling satellite imagery.",
  "Imagem de satelite indisponivel.": "Satellite imagery is unavailable.",
  "Erro no canal Realtime.": "Realtime channel error.",
  "Tempo limite da conexao Realtime excedido.": "Realtime connection timed out.",
  "Conexao Realtime encerrada.": "Realtime connection closed.",
};

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "en" || saved === "pt-PT") return saved;
  } catch {
    // Storage can be unavailable in private browsing contexts.
  }
  return navigator.language.toLowerCase().startsWith("pt") ? "pt-PT" : "en";
}

let locale: Locale = detectLocale();
document.documentElement.lang = locale;

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Keep the selected locale for this page even if storage is unavailable.
  }
  document.documentElement.lang = next;
}

export function t(key: string, values: Record<string, string | number> = {}): string {
  const portugueseKey = locale === "pt-PT"
    ? Object.entries(englishTranslations).find(([, translation]) => translation === key)?.[0]
    : undefined;
  let message = locale === "en" ? englishTranslations[key] ?? key : portugueseKey ?? key;
  for (const [name, value] of Object.entries(values)) {
    message = message.replaceAll(`{${name}}`, String(value));
  }
  return message;
}

export function playersOnline(count: number): string {
  if (locale === "en") return `${count} ${count === 1 ? "player" : "players"} online`;
  return `${count} ${count === 1 ? "jogador" : "jogadores"} online`;
}

export function languagePickerMarkup(): string {
  return `<label class="language-picker" aria-label="${t("Mudar idioma")}">
    <span class="sr-only">${t("Idioma")}</span>
    <select class="language-select" data-language-select aria-label="${t("Idioma")}">
      <option value="en" ${locale === "en" ? "selected" : ""}>English</option>
      <option value="pt-PT" ${locale === "pt-PT" ? "selected" : ""}>Português</option>
    </select>
  </label>`;
}

export const LOCALE_RESUME_KEY = "entanglement.locale.resume";
