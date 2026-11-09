# Tiles do Mundo e Realtime

## Decisao

Manter um documento de arquitetura geral e este documento de detalhe e a divisao
recomendada. A arquitetura geral registra decisoes estaveis entre servicos; este ADR
especifica o particionamento espacial, a conexao de jogadores e as conversas locais.

Um evento pode ocupar varias celulas logicas de 5 × 5 km. Cada celula tem um identificador
estavel dentro do evento, jogadores/presenca temporarios e uma conversa propria. Celulas
adjacentes continuam conectadas: ao atravessar uma borda, o jogador muda de celula sem
sair do evento nem perder a sessao. Celulas a mais de uma borda de distancia nao recebem
posicoes umas das outras.

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

  O recorte inclui edificios nomeados e POIs; nao consulta vias nem carrega imagens OSM.
  O Phaser desenha os footprints como volumes 2.5D e coloca nomes sobre os edificios.
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

O viewport Phaser e limitado a celula atual. Perto de uma borda, pode carregar as features
da celula vizinha para a transicao; o jogador nao deve ser teletransportado nem bloqueado
na borda. O estado local e expresso em coordenadas da celula e convertido ao trocar de
celula, preservando a posicao geografica.

## Canais e conversas

Separar presenca de conversa, mesmo quando ambos pertencem ao mesmo tile. Topicos
privados sugeridos:

```text
event:<event_id>:tile:<tile_x>:<tile_y>:presence
event:<event_id>:tile:<tile_x>:<tile_y>:chat
```

- O jogador publica sua posicao e estado de presenca no canal de presenca da celula atual.
- Cada celula tem uma conversa efemera propria no canal `chat`; mensagens nao sao
  persistidas no MongoDB. Chat de uma celula nao e retransmitido automaticamente para
  outras celulas. Um canal de anuncios do evento pode ser adicionado separadamente.
- Para mostrar movimento contiguo na borda, o cliente assina presenca da celula atual e
  das celulas vizinhas que intersectam o raio visual configurado. Assina chat somente da
  celula atual, salvo escolha explicita de outro canal.
- O raio visual deve ser aplicado ao fanout/autorizacao, nao apenas a renderizacao no
  cliente. Uma politica que permite ler um topico vizinho expoe os broadcasts daquele
  topico aos seus assinantes, mesmo que o cliente esconda jogadores distantes. Se a
  privacidade exigir um limite rigoroso, usar microcelulas de presenca ou um relay que
  encaminhe posicoes apenas aos destinatarios no raio; manter a conversa no tile de 5 km.
- Deduplicar jogadores que aparecam por duas assinaturas de fronteira, descartar updates
  antigos e remover estados ao sair/expirar a assinatura.
- Ao mudar de celula, assinar a nova celula, publicar estado inicial, manter uma curta
  sobreposicao de presenca e so entao remover a assinatura antiga. Isso evita um intervalo
  em que o jogador desaparece.

Assim, jogadores a mais de 5 km podem estar em celulas e canais diferentes dentro do mesmo
evento. Eles nao precisam ver a posicao nem receber a conversa local uns dos outros. Ao se
aproximarem ou atravessarem celulas adjacentes, a presenca reaparece via os canais de
borda; nao sao instancias independentes do aplicativo.

## Autorizacao e privacidade

- `POST /api/realtime/token` deve emitir JWT curto vinculado a `sub`, `event_id`, celula
  atual e celulas de presenca adjacentes autorizadas. O cliente nao pode escolher um
  `event_id` arbitrario nem assinar topicos publicos.
- As politicas RLS devem comparar `realtime.topic()` com os claims do token. Para chat,
  autorizar apenas a celula atual; para presenca, autorizar somente a celula atual e os
  vizinhos concedidos pelo servidor.
- Validar que cada mensagem de posicao pertence ao evento e a celula declarada, esta dentro
  dos limites e tem timestamp recente. O JWT confirma identidade, mas nao prova que o GPS
  do aparelho seja verdadeiro; anti-cheat geografico forte requer validacao adicional.
- Transmitir localizacao precisa apenas quando o jogador consentiu com GPS/BLE. Nunca
  incluir email, token de sessao ou trilha historica nos canais.
- Limitar tamanho/frequencia de mensagens e numero de inscricoes por jogador para conter
  uso de Realtime e evitar abuso.

## Carregamento e renderizacao de edificios

`GET /api/world/features` consulta Overpass para o bbox exato configurado no evento, com
no maximo 5000 m de largura e 5000 m de altura, sem buffer nem celulas vizinhas. Se
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

A implementacao ainda nao possui celulas multiplas. Hoje `EVENT_ID` identifica uma unica
area de ate 5 × 5 km; `/api/world/center` inicializa o centro compartilhado, `/api/world`
retorna as dimensoes e `/api/realtime/token` autoriza o unico topico `event:<event_id>`.
Presence, posicoes e chat usam esse mesmo topico e nao existem conversas por tile.

A API ja consulta features OSM e o Phaser as desenha sem basemap; as celulas independentes
e a continuidade entre elas descritas aqui ainda precisam ser implementadas em conjunto
com a nova politica RLS.

## Sequencia de implementacao

1. Criar e testar utilitarios comuns de projecao, `tile_x/tile_y` e vizinhanca, incluindo
   coordenadas negativas e pontos exatamente sobre uma borda.
2. Atualizar o endpoint de mundo e os claims JWT para a celula atual e vizinhos de
   presenca; manter `event_id` como escopo principal.
3. Separar Realtime em presenca por celula e chat por celula; aplicar RLS correspondente
   antes de liberar o cliente.
4. Implementar handoff entre celulas, deduplicacao e expiracao de presenca; testar dois
   clientes na mesma celula, em celulas adjacentes e em celulas distantes.
5. Carregar geometrias/POIs conforme a celula e validar atribuicao, cache e limites do
  Overpass publico.