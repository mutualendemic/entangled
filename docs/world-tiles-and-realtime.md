# Tiles do Mundo e Realtime

## Decisao

Manter um documento de arquitetura geral e este documento de detalhe e a divisao
recomendada. A arquitetura geral registra decisoes estaveis entre servicos; este ADR
especifica o particionamento espacial, a conexao de jogadores e as conversas locais.

Um evento ocupa celulas logicas contiguas de 5 × 5 km, indexadas em relacao ao centro
geografico compartilhado, definido uma vez e imutavel depois da criacao. Cada celula tem presenca e conversa temporarias
proprias. Ao cruzar a borda, o cliente encerra imediatamente a comunicacao com a celula
anterior, solicita autorizacao para a proxima e entra somente no canal da nova celula.
Jogadores e mensagens de outras celulas nao sao compartilhados, inclusive nas adjacentes.

Uma celula nao e um servidor, deploy ou banco separado. Os dados persistentes continuam
no mesmo evento/MongoDB; o particionamento e uma estrategia de roteamento de canais
Supabase Realtime e de carregamento do mapa.

Um tile quadrado de 5 km por lado nao e um raio de proximidade de 5 km: dois jogadores
em cantos opostos podem estar ate aproximadamente 7,1 km distantes e ainda pertencer a
mesma celula. O tile determina a conversa/roteamento; a visibilidade de jogadores deve
usar distancia geodesica separadamente. Se a regra de produto for que ninguem a mais de
5 km compartilhe posicao ou conversa, usar um filtro circular de 5 km ou celulas menores;
nao inferir essa regra apenas pelo indice do tile.

## Dados OSM e celulas do jogo

  O recorte inclui edificios nomeados, POIs e corpos d'agua; nao consulta vias nem carrega
  imagens OSM. O Phaser desenha agua e footprints como volumes 2.5D e coloca nomes sobre os
  edificios. Uma imagem satelite Esri/Maxar pode ser carregada sob demanda como camada de fundo.
 **Feature OSM:** geometria, tags e nome consultados sob demanda pela API via Overpass.
uma celula de jogo. O identificador logico depende do evento e da coordenada da celula.
 **Celula do mundo:** area logica fixa de 5 × 5 km para dividir presenca e conversas.

 Atribuir os dados a OpenStreetMap/Overpass de forma visivel e respeitar limites do servico
 publico. A API usa cache efemero em memoria com TTL para evitar repetir a consulta; nao
## Indice espacial

O evento tem um centro geografico estavel, definido pelo organizador ou pela configuracao
inicial do evento. Converter GPS para coordenadas locais em metros, usando uma projecao
local centrada nesse ponto. Seja `east_m` o deslocamento para leste e `north_m` o
deslocamento para norte. Com `CELL_SIZE_M = 5000`, o tile cujo centro inicial e o centro
do evento e `(0, 0)`:

```text
tile_x = floor((east_m + CELL_SIZE_M / 2) / CELL_SIZE_M)
tile_y = floor((north_m + CELL_SIZE_M / 2) / CELL_SIZE_M)
```

Cada par de indices cobre exatamente 5000 metros por lado no plano local. A conversao
geodesica deve ser compartilhada entre backend, Phaser e testes de fronteira; nao
calcular tile a partir de pixels, zoom ou tiles cartograficos OSM. Para eventos muito
extensos, substituir a projecao local por uma projecao geodesica adequada e versionar essa
mudanca, pois ela altera os limites das celulas.

O viewport Phaser e limitado a celula atual. Ao cruzar uma borda, o movimento pausa, o
cliente encerra o canal atual e solicita `POST /api/world/tile` para autorizar o destino.
Depois da resposta, carrega as features desse tile e converte a posicao local, preservando
a coordenada geografica sem teletransportar o jogador para o centro. Se a autorizacao
falhar, o jogador permanece na borda e pode continuar na celula anterior. Arrastar o
viewport desloca somente a camera dentro dos limites da celula; joystick, GPS e BLE continuam
controlando a posicao do avatar. Um comando separado recentraliza a camera no jogador.
O limite geografico do tile e desenhado em amarelo dentro da cena, com espessura ajustada
ao zoom para continuar visivel no enquadramento completo de 5 km.
Os controles incluem enquadrar toda a celula de 5 km e abrir a viewport Phaser em tela cheia;
o navegador restaura o layout normal ao sair da tela cheia.

## Canais e conversas

Cada tile usa um topico privado exclusivo para presenca, posicoes e conversa:

```text
event:<event_id>:tile:<tile_x>:<tile_y>
```

- O jogador publica posicao, estado de presenca e conversa efemera no topico exclusivo da
  celula atual. Mensagens e posicoes nao sao persistidas no MongoDB.
- O cliente assina exatamente um tile. Nao existem assinaturas de vizinhos, sobreposicao
  entre canais ou retransmissao de mensagens entre celulas.
- Ao detectar a fronteira, o cliente remove a assinatura antiga antes de requisitar a
  autorizacao do novo tile. Assim, a comunicacao antiga cessa imediatamente; durante a
  autorizacao/carregamento pode haver um curto periodo sem Realtime.
- Ao sair, limpar imediatamente jogadores remotos e mensagens mantidos no cliente. Ao
  entrar no novo tile, publicar nova presenca e posicao apenas depois de assinar seu canal.

Assim, jogadores em tiles diferentes do mesmo evento nao veem as posicoes nem recebem as
conversas uns dos outros. A comunicacao so volta quando ambos estao autorizados e conectados
ao mesmo tile; nao ha canais de borda ou visibilidade cruzada.

## Autorizacao e privacidade

- `POST /api/world/tile` valida o indice da celula dentro do evento autenticado. O cliente
  nao pode trocar o `event_id`; indices fora do limite ou centros geograficos invalidos
  sao recusados.
- `POST /api/realtime/token` emite JWT curto vinculado a `sub`, `event_id`, `tile_x` e
  `tile_y`. O topico retornado e exatamente `event:<event_id>:tile:<tile_x>:<tile_y>`.
- As politicas RLS comparam `realtime.topic()` com os claims do token e recusam assinatura
  de qualquer outro tile. O cliente nao pode escolher um `event_id` arbitrario nem assinar
  topicos publicos.
- Validar que cada mensagem de posicao pertence ao evento e a celula declarada, esta dentro
  dos limites e tem timestamp recente. O JWT confirma identidade, mas nao prova que o GPS
  do aparelho seja verdadeiro; anti-cheat geografico forte requer validacao adicional.
- Transmitir localizacao precisa apenas quando o jogador consentiu com GPS/BLE. Nunca
  incluir email, token de sessao ou trilha historica nos canais.
- Limitar tamanho/frequencia de mensagens e numero de inscricoes por jogador para conter
  uso de Realtime e evitar abuso.

## Carregamento e renderizacao de edificios

`GET /api/world/features?tile_x=<x>&tile_y=<y>` consulta Overpass para o bbox exato da
celula autorizada, com 5000 m de largura e altura, sem buffer nem celulas vizinhas. O
centro do tile e projetado a partir da origem geografica do evento. Se
Overpass expirar, o fallback na API de dados OSM usa os mesmos quatro limites geograficos.
Ambas as fontes pedem edificios com nome e POIs nomeados de interesse. A resposta contem o
footprint convertido para metros locais, nome, categoria e altura OSM quando disponivel.
Sem altura, o cliente usa uma altura visual padrao. O Phaser desenha paredes, sombra,
telhado e detalhes de fachada com uma extrusao 2.5D estilizada; POIs pontuais viram marcos
com rotulo. Nao renderizar ruas nem um basemap por baixo.

A query usa uma lista permitida de categorias de amenity, shop, tourism, historic, leisure
e natural; nao inclui tags tecnicas como `stop_position` ou `parking_entrance`. POIs sao
deduplicados por nome/categoria e proximidade, e a lista final e ordenada de forma estavel.

Atribuir os dados a OpenStreetMap/Overpass de forma visivel e respeitar limites do servico
publico. A API mantem cache efemero em memoria com TTL para evitar repetir a consulta; nao
persistir a resposta nem as geometrias em colecoes MongoDB. Se os provedores estiverem
indisponiveis, manter o mundo jogavel e mostrar erro/retry. As APIs OSM publicas nao garantem
disponibilidade nem aceitam todos os bboxes urbanos; a API de dados pode rejeitar areas
densas pelo limite de elementos. A ordenacao/deduplicacao torna a lista estavel quando a
fonte responde, mas nao substitui disponibilidade. Para uso confiavel sem chave de terceiros,
operar uma instancia Overpass propria ou servir extratos regionais atualizados; nao compensar
uma rejeicao com dezenas de chamadas a API publica.

## Estado atual

`/api/world` devolve a celula inicial `(0, 0)`. `/api/world/tile` autoriza uma nova celula;
`/api/world/features` recebe os indices para consultar o bbox correspondente, e
`/api/realtime/token` concede um JWT curto para o topico exclusivo desse tile. O Phaser
preserva a coordenada geografica ao rebasear o jogador na nova celula. A politica RLS deve
ser atualizada e aplicada no Supabase para que a troca de topicos funcione em producao.

## Sequencia de implementacao

1. Manter a projecao e a regra de borda sincronizadas entre backend e Phaser, incluindo
  coordenadas negativas e pontos exatamente sobre uma borda.
2. Aplicar e validar a politica RLS atualizada no Supabase antes de publicar a mudanca.
3. Testar com duas sessoes reais que tiles iguais compartilham posicoes/chat e tiles
  diferentes nao recebem broadcasts entre si.
4. Monitorar cache e limites do Overpass publico ao consultar celulas adicionais.