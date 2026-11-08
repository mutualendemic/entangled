# Entanglement

Jogo social 2D para eventos: Phaser 3 no navegador, API Flask, MongoDB Atlas e
Supabase Realtime. A Vercel publica o cliente e executa a API.

## Estrutura

Veja [docs/architecture.md](docs/architecture.md) para dominios, seguranca e contratos.

```text
api/       adaptador Flask para Vercel
backend/   aplicacao Flask e dominios da API
web/       cliente Phaser + TypeScript + Vite
tests/     testes da API
```

## Desenvolvimento local

Requisitos: Python 3.11+, Node.js 20+ e MongoDB local ou Atlas.

```sh
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
npm install
npm run dev
```

Abra http://localhost:5173. O comando inicia Flask em `localhost:5000` e o Vite,
que encaminha `/api` para Flask. `npm run dev:web` e `npm run dev:api` iniciam os
servicos separadamente. Rode `pytest` para os testes da API e `npm run build` para
validar o cliente de producao.

Configure `MONGODB_URI`, `JWT_SECRET` e `EVENT_ADMIN_TOKEN` no `.env`. Para chat e
presenca, configure as tres variaveis Supabase e aplique
[`supabase/realtime_policies.sql`](supabase/realtime_policies.sql) no projeto. Para
associar email e recuperar senha, configure o servidor SMTP. Sem SMTP, os fluxos de
email retornam erro de configuracao e nenhuma conta confirma endereco.

Valores `VITE_*` sao incorporados ao bundle e devem ser publicos. Nunca use neles
segredos JWT, senha SMTP, token administrativo ou chave Supabase `service_role`.

## Funcionalidades

- Cadastro com nome, senha protegida com scrypt e avatar predefinido; login e sessao JWT curta.
- Perfil publico com nome, bio e interesses; email de recuperacao separado, privado
	e utilizavel somente depois da confirmacao por link.
- Mapa Phaser com movimento WASD/setas e pontos de interesse geograficos do evento.
- GPS opcional; coordenadas ao vivo sao transmitidas apenas a membros
	autenticados do evento e nao sao persistidas. O chat tambem e temporario.
- Distancias aproximadas acompanhadas pela margem de erro dos dois aparelhos.

GPS exige permissao do participante e HTTPS fora de `localhost`. A precisao depende do
aparelho e do ambiente. O navegador nao oferece acesso BLE confiavel e multiplataforma
para ranging; indoor com BLE exige beacons mapeados, hardware testado e uma integracao
compativel com os aparelhos do evento. Consulte [docs/architecture.md](docs/architecture.md).

## Configurar um evento

O mapa comeca como um espaco local sem coordenadas reais. Um organizador pode cadastrar
o centro, dimensoes em metros e ate 100 locais fisicos usando `PUT /api/admin/event` e
o header `X-Admin-Token` definido em `EVENT_ADMIN_TOKEN`. Nenhuma imagem precisa ir ao
MongoDB; assets do jogo ficam no repositorio e o banco guarda somente metadados.