# Arquitetura

Este documento descreve os componentes e contratos gerais. O particionamento do mundo,
os limites dos tiles e as conversas por area ficam detalhados em
[world-tiles-and-realtime.md](world-tiles-and-realtime.md); manter essa separacao evita
transformar a visao geral em um documento operacional excessivamente longo.

## Visao geral

- `web/`: cliente TypeScript com Phaser 3, compilado como site estatico pelo Vite.
- `backend/`: API Flask organizada por app factory, rotas e servicos de dominio.
- `api/index.py`: adaptador WSGI descoberto pela Vercel para executar a API Flask.
- MongoDB Atlas: fonte persistente para contas, perfis e locais gamificados.
- Supabase Realtime: presenca e mensagens efemeras entre jogadores.
- OpenStreetMap/Overpass: geometrias, nomes de edificios/POIs e agua por tile fixo de 5 km;
   Phaser renderiza volumes 2.5D sem mapa base por padrao. Uma opcao carrega imagem satelite
   sob demanda como fundo; as camadas do jogo continuam por cima.

O cliente nunca recebe credenciais MongoDB, segredos JWT ou chaves `service_role`.
O servidor Flask valida identidade e permissao; o cliente usa apenas a chave anonima
do Supabase e um token de curta duracao emitido pelo servidor para os canais privados.

## Dominios e dados

- `users`: nome de acesso normalizado, hash scrypt da senha, avatar por identificador,
  email privado opcional e datas de criacao/alteracao.
- `profiles`: dados publicos escolhidos pelo jogador, separados dos dados de acesso.
- `locations`: pontos geograficos aprovados para o mundo, com coordenadas, metadados
  publicos e referencia a arte versionada no repositorio do jogo.
- `events`: centro geografico e configuracao da area. O centro e compartilhado por todos
   os participantes do evento.
- `teleport targets`: POIs e locais marcados no mapa que aparecem em uma lista filtravel por
   busca; a busca tambem pode ser aberta sobre o mapa. Selecionar um POI mostra nome, tipo e
   categoria; o jogador pode entao teleportar para sua coordenada local no mundo do evento.
   O mesmo mecanismo aceita teleporte para a leitura GPS atual quando ela estiver disponivel.
- Avatares: seis glyphs locais existentes e 34 previews selecionados da colecao OpenGameArt
   “3/4 Directional Sprite Sets”, filtrados por licenca CC0. As imagens locais alimentam o
   seletor de cadastro/perfil e a representacao do jogador; autores e fontes estao em
   [avatar-assets.md](avatar-assets.md).
- Presenca, posicoes ao vivo e mensagens nao sao persistidas inicialmente. Supabase
   Broadcast/Presence evita gravar historicos de chat e reduz o uso da cota do banco.

Codigo e assets do jogo podem ser versionados normalmente no repositorio. A otimizacao
de imagens serve para reduzir o download e acelerar o carregamento, nao para contornar
uma cota do Git. O MongoDB guarda metadados e referencias, nunca binarios. Caso uploads
de jogadores sejam adicionados futuramente, devem ir para storage de objetos, nao MongoDB.

O email nunca deve aparecer no endpoint publico de perfil. Sem email associado, a conta
nao pode usar recuperacao por email. Na primeira versao, avatares sao assets locais
selecionaveis, sem upload de imagem pelos jogadores.

## Fluxos

1. Cadastro e login enviam nome e senha por HTTPS para a API. Senhas sao armazenadas
   somente como hash scrypt; respostas nao confirmam se um nome ou email existe.
2. A API entrega tokens de sessao curtos. Um token separado, tambem curto, autoriza o
   jogador a entrar nos canais privados de Supabase para presenca e mensagens.
3. A API consulta edificios, POIs e agua do OpenStreetMap no tile autorizado de 5 km; Phaser
   desenha essas feicoes sobre o mapa 2.5D ou sobre a imagem satelite opcional. O tile nao
   inclui uma base de ruas OSM. Ao cruzar a borda, o cliente pede autorizacao para o proximo
   tile e preserva a coordenada geografica. Arrastar o viewport desloca somente a camera.
4. Perfil publico e configuracao privada de email usam operacoes distintas e verificadas
    pelo dono da conta.

## Posicionamento e distancia

- O jogador escolhe um modo exclusivo: joystick/manual, GPS continuo ou BLE. No modo manual,
   encerrar o watcher GPS e o scanner BLE; publicar somente as posicoes movidas pelo jogador.
   Teleporte GPS pontual nao deve reativar atualizacao continua.
- O avatar pode ser alterado em Perfil; o endpoint valida o ID permitido, salva a escolha e
   emite um token atualizado para a identidade em Realtime.
- O usuario pode arrastar o mapa para explorar a celula sem mover o avatar e retornar a camera
   ao jogador por um controle dedicado. Clicar em um POI abre nome, tipo e categoria; a busca e
   o teleporte tambem ficam acessiveis em um painel sobre o mapa.
- Os controles de zoom incluem uma acao para enquadrar o tile completo de 5 km e outra para
   abrir a viewport Phaser em tela cheia; o limite do tile aparece com contorno amarelo, e
   sair da tela cheia restaura o layout normal.
- A opcao de satelite busca a imagem do tile atual somente quando ativada, mantem POIs,
   edificios e jogadores como overlays e mostra a atribuicao Esri/Maxar e OpenStreetMap.
   Se a fonte de imagem falhar, o mapa 2.5D permanece disponivel.
- Com permissao explicita durante a sessao do evento, o cliente usa Geolocation API do
   dispositivo e envia latitude, longitude, precisao reportada e horario de captura.
- GPS e adequado para posicionamento externo, mas a precisao varia com aparelho e ambiente;
   a interface deve mostrar a margem de erro e nao prometer distancia exata. Ignorar leituras
   antigas ou com precisao insuficiente e suavizar ruido sem esconder a incerteza.
- Calcular distancia horizontal externa pela geodesica (Haversine) entre leituras recentes.
   A incerteza combinada das duas posicoes deve acompanhar o resultado; se as margens se
   sobrepoem, mostrar uma estimativa/faixa, nao uma distancia aparentemente exata.
- Em locais fechados, BLE pode ser usado com beacons fixos, identificados e mapeados para
   coordenadas conhecidas. RSSI sem uma rede de beacons calibrada so estima proximidade e
   nao fornece posicao exata. O navegador pode nao permitir leitura BLE em todos os aparelhos;
   oferecer fallback manual ou GPS quando disponivel.
- Para melhorar o indoor, e necessario planejar a infraestrutura do evento e calibrar os
   beacons no local. Precisao sub-metrica pode exigir BLE com Angle of Arrival suportado por
   hardware compativel ou UWB; nenhum metodo deve ser assumido sem teste nos aparelhos-alvo.
- GPS/BLE sao fontes de coordenada fisica; uma transformacao por evento converte essas
   coordenadas para o mapa 2D gamificado. Distancias usam coordenadas fisicas validas e
   recentes, nao a distancia visual no mapa.
- Transmitir coordenadas em mensagens Supabase Broadcast privadas, limitadas a sala/evento
   e a uma frequencia moderada; Presence guarda apenas estado basico de conectado. Nao gravar
   trilhas, coordenadas ao vivo ou distancias no MongoDB. Descartar estado ao sair/expirar.
   Os canais sao exclusivos do tile atual: ao trocar, remover a assinatura antiga antes
   de entrar na nova. Nao compartilhar posicoes ou mensagens entre tiles; ver
   [world-tiles-and-realtime.md](world-tiles-and-realtime.md).
- O cliente tambem deve oferecer teleporte manual para pontos conhecidos do mapa: busca por POI
  nomeado ou edificio, lista de resultados, clique para mover o avatar para a coordenada e um
  botao "Usar GPS atual" para reposicionar o jogador na localizacao recente do aparelho sem
  sair do mundo do evento.
- Pedir permissao somente ao entrar no mundo, explicar o uso para proximidade entre jogadores,
   permitir pausar/optar por sair e nunca expor coordenadas em perfil publico. Aplicar RLS,
   tokens curtos por evento, validacao de idade do dado e limites contra abuso.

## API

- `GET /api/health`: verificacao simples da funcao, sem depender de MongoDB/Supabase.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- `POST /api/account/email` e `GET /api/account/email`; `POST /api/auth/verify-email`.
- `POST /api/auth/recovery` e `POST /api/auth/reset` para email confirmado.
- `GET /api/profiles/me`, `PATCH /api/profiles/me` e `GET /api/profiles/{username}`.
- `GET /api/world`, `POST /api/world/center`, `POST /api/world/tile` e `PUT /api/admin/event`
   para configurar o centro compartilhado e autorizar tiles do evento.
- `GET /api/world/features?tile_x=<x>&tile_y=<y>` para carregar POIs e edificios da celula.
- `POST /api/realtime/token` para autorizacao curta restrita ao usuario e ao tile atual.

As rotas validam entradas e mantem campos publicos separados de credenciais. A politica
Realtime confere identidade de remetente, avatar e limites de tamanho no payload. Em
producao, aplicar rate limiting para autenticacao e recuperacao no gateway da API.

## Deploy e operacao

Vercel publica `web/dist` e encaminha `/api/*` para o adaptador Python. Cada invocacao
Flask e efemera: nao usar disco local para estado, uploads ou sessoes. MongoDB Atlas
deve permitir somente conexoes do ambiente de deploy e usar timeouts/pool pequenos.
Supabase aplica RLS nos canais privados; nao usar canais publicos para mensagens privadas.

Definir variaveis do `.env.example` no ambiente local e no painel da Vercel. `VITE_*`
fica embutido no bundle e deve conter somente valores publicos. O segredo JWT de Supabase
fica exclusivamente no servidor e precisa ser compativel com a configuracao de assinatura
JWT do projeto Supabase. Nunca commitar `.env`.

## Estado e evolucao

Cada evento usa uma grade fixa de tiles de 5 × 5 km ancorada no centro geografico
compartilhado. Presenca, posicoes e chat usam o canal privado exclusivo
`event:<event_id>:tile:<tile_x>:<tile_y>`. A troca encerra imediatamente a comunicacao do
tile anterior e requer autorizacao para o novo; nao ha compartilhamento entre tiles. A
politica RLS correspondente esta em `supabase/realtime_policies.sql` e deve ser aplicada
ao projeto Supabase.

1. Aplicar e validar a politica RLS de tiles no Supabase de producao.
2. Adicionar rate limiting distribuido no gateway e limites de uso por evento.
3. Operar beacons BLE somente apos calibracao e testes nos aparelhos usados no evento.
4. Adicionar observabilidade sem registrar senhas, tokens, email ou mensagens privadas.