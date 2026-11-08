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
- OpenStreetMap/Overpass: geometrias e nomes de edificios/POIs; Phaser renderiza volumes
   2.5D, sem imagem de mapa ou ruas como fundo.

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
3. A API consulta geometrias nomeadas de edificios e POIs do OpenStreetMap no tile ativo;
   o Phaser renderiza volumes 2.5D e rótulos, sem basemap ou ruas. A area configurada tem
   limite de 5 km por lado. Coordenadas publicas sao aproximadas; nao armazenar trilhas.
4. Perfil publico e configuracao privada de email usam operacoes distintas e verificadas
    pelo dono da conta.

## Posicionamento e distancia

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
   A divisao por tiles e canais separados ainda e proposta; ver
   [world-tiles-and-realtime.md](world-tiles-and-realtime.md).
- Pedir permissao somente ao entrar no mundo, explicar o uso para proximidade entre jogadores,
   permitir pausar/optar por sair e nunca expor coordenadas em perfil publico. Aplicar RLS,
   tokens curtos por evento, validacao de idade do dado e limites contra abuso.

## API

- `GET /api/health`: verificacao simples da funcao, sem depender de MongoDB/Supabase.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- `POST /api/account/email` e `GET /api/account/email`; `POST /api/auth/verify-email`.
- `POST /api/auth/recovery` e `POST /api/auth/reset` para email confirmado.
- `GET /api/profiles/me`, `PATCH /api/profiles/me` e `GET /api/profiles/{username}`.
- `GET /api/world`, `POST /api/world/center` e `PUT /api/admin/event` para configurar
   o centro compartilhado e a area do evento.
- `POST /api/realtime/token` para autorizacao curta restrita ao usuario e ao evento.

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

Hoje cada evento usa um unico canal privado `event:<event_id>`. O mundo tem uma unica
area de ate 5 × 5 km; nao ha canais por tile nem conversas separadas por area. A
arquitetura-alvo para eventos que ultrapassem esse limite esta especificada no documento
de tiles; implementa-la exige atualizar tokens, cliente Realtime e politicas RLS juntos.

1. Implementar os canais e conversas por tile definidos em `world-tiles-and-realtime.md`.
2. Adicionar rate limiting distribuido no gateway e limites de uso por evento.
3. Operar beacons BLE somente apos calibracao e testes nos aparelhos usados no evento.
4. Adicionar observabilidade sem registrar senhas, tokens, email ou mensagens privadas.