# Arquitetura do SalesForecast

Referência técnica do estado atual da aplicação React + Node.js, incluindo autenticação Microsoft Entra ID, proxy reverso, cache em memória e integração com SQL Server.

> **Última atualização:** Julho de 2026

---

## Visão Geral

```text
┌──────────────────────────────┐      HTTPS /api/*      ┌─────────────────────┐
│ React + Vite                 │ ────────────────────►  │ Nginx               │
│ src/                         │  credentials: include │ proxy reverso        │
└──────────────────────────────┘                        └────────┬────────────┘
          ▲                                                       │
          │                                                       ▼
          │                                           ┌──────────────────────┐
          └────────────────────────────────────────── │ Node.js / Express     │
                                                      │ server/app.js         │
                                                      │ porta 4000            │
                                                      └────────┬─────────────┘
                                                               │
                                      ┌────────────────────────┼────────────────────────┐
                                      ▼                        ▼                        ▼
                             ┌────────────────┐      ┌──────────────────┐      ┌────────────────┐
                             │ auth.db        │      │ SQL Server       │      │ Power Automate  │
                             │ users / role   │      │ BDISECC          │      │ e-mail / login  │
                             └────────────────┘      └──────────────────┘      └────────────────┘
```

O frontend não fala diretamente com o banco. Toda chamada passa por `/api/*`, com cookie `HttpOnly` enviado automaticamente pelo browser.

---

## 1. Estrutura Atual

### Backend

- [server/app.js](../server/app.js) inicializa Express, CORS, JSON, cookie-parser, logger, rotas e fallback SPA.
- [server/routes/index.js](../server/routes/index.js) separa rotas públicas e protegidas.
- [server/routes/auth.routes.js](../server/routes/auth.routes.js) expõe login, callback, logout e sessão atual.
- [server/controllers/auth.microsoft.controller.js](../server/controllers/auth.microsoft.controller.js) implementa o fluxo OIDC com Microsoft Entra ID.
- [server/controllers/forecast.controller.js](../server/controllers/forecast.controller.js) concentra forecast, metas, upload e resumo por assessor.
- [server/controllers/assessores.controller.js](../server/controllers/assessores.controller.js) resolve camada, marca e filtros de assessores.
- [server/controllers/vendas.controller.js](../server/controllers/vendas.controller.js) entrega vendas do mês e calendário útil.
- [server/db/sqlite.js](../server/db/sqlite.js) mantém `auth.db` e migra a tabela `users` para o formato atual.
- [server/db/mssql.js](../server/db/mssql.js) gerencia o pool do SQL Server.
- [server/middleware/requireAuth.js](../server/middleware/requireAuth.js) valida o cookie JWT `auth_token`.
- [server/utils/forecastTable.js](../server/utils/forecastTable.js) resolve tabela de forecast por grupo e marca.
- [server/utils/cache.js](../server/utils/cache.js) faz cache em memória com TTL.

### Frontend

- [src/App.jsx](../src/App.jsx) orquestra autenticação, perfil, dados e renderização principal.
- [src/api/client.js](../src/api/client.js) centraliza `API_BASE`, `apiFetch` e callback de sessão expirada.
- [src/hooks/useAuth.js](../src/hooks/useAuth.js) controla login, logout, sessão e modal de expiração.
- [src/hooks/useUserProfile.js](../src/hooks/useUserProfile.js) carrega camada, marca e flags de acesso.
- [src/hooks/useForecastData.js](../src/hooks/useForecastData.js) concentra leitura e mutação dos dados de forecast.
- [src/hooks/useIndicators.js](../src/hooks/useIndicators.js) calcula os indicadores de tela.
- [src/components/auth/Login.jsx](../src/components/auth/Login.jsx) redireciona para o login Microsoft.
- [src/components/auth/SessaoExpiradaModal.jsx](../src/components/auth/SessaoExpiradaModal.jsx) trata re-login após expiração.
- [src/components/forecast/*](../src/components/forecast) exibe tabela, indicadores, resumo e modal de registro.
- [src/components/clientes/NovosClientes.jsx](../src/components/clientes/NovosClientes.jsx) inclui clientes na micro-região do assessor.
- [src/components/upload/UploadForecast.jsx](../src/components/upload/UploadForecast.jsx) faz upload de forecast para administradores.

---

## 2. Comunicação Frontend ↔ Backend

### 2.1 Base de API

```js
// src/api/client.js
export const API_BASE = import.meta.env.VITE_API_BASE || ''
```

- Em desenvolvimento, o valor vazio faz o Vite proxy interceptar `/api/*` e encaminhar para `http://localhost:4000`.
- Em produção, o Nginx assume esse papel no domínio final.
- Não há URL hardcoded nas chamadas do frontend.

### 2.2 Wrapper de fetch

```js
// src/api/client.js
const res = await fetch(url, { credentials: 'include', ...opts })
```

- `credentials: 'include'` é obrigatório para enviar o cookie `auth_token`.
- Quando uma resposta volta com `401`, o callback global dispara o modal de sessão expirada.

### 2.3 Proxy de desenvolvimento

```js
// vite.config.js
server: {
  proxy: {
    '/api': { target: 'http://localhost:4000', changeOrigin: true, secure: false }
  }
}
```

Isso elimina problemas de CORS durante o desenvolvimento local.

### 2.4 Proxy em produção

No Nginx, o proxy reverso encaminha o tráfego para o Node/Express e o backend serve o build em `dist/` como SPA.

---

## 3. Autenticação e Sessão

### 3.1 Fluxo atual

O login atual usa Microsoft Entra ID via OpenID Connect com authorization code flow e PKCE.

Fluxo resumido:

1. O usuário clica em Entrar com Microsoft.
2. O frontend abre `/api/auth/login/microsoft`.
3. O backend gera `state`, `nonce` e `code_verifier` e redireciona para o Microsoft Entra ID.
4. O Entra ID retorna para `/api/auth/callback/microsoft`.
5. O backend troca o código por tokens, valida o `id_token` e confere o e-mail em `SM_TDG_Pessoas`.
6. Se autorizado, o backend cria ou reaproveita o usuário em `auth.db` e assina o JWT de sessão.
7. O browser recebe o cookie `auth_token` e o app carrega normalmente.

### 3.2 Cookies usados pelo fluxo

- `auth_token`: cookie de sessão com JWT, `HttpOnly`, `SameSite: 'lax'`, duração de 8h.
- `oidc_state`, `oidc_nonce`, `oidc_code_verifier`: cookies temporários do fluxo OIDC, válidos por 10 minutos.
- `oidc_test_email`: override opcional de e-mail para testes locais em ambiente não produtivo.

### 3.3 Sessão atual

[server/routes/auth.routes.js](../server/routes/auth.routes.js) expõe:

- `GET /api/auth/login/microsoft`
- `GET /api/auth/callback/microsoft`
- `GET /api/auth/logout`
- `POST /api/auth/logout`
- `POST /api/logout`
- `GET /api/me`

O frontend usa `/api/me` para descobrir se a sessão existe e renderizar login ou aplicação principal.

### 3.4 Middleware de proteção

[server/middleware/requireAuth.js](../server/middleware/requireAuth.js) valida o cookie `auth_token` com `JWT_SECRET` e injeta `req.user`.

Rotas protegidas:

```js
// server/routes/index.js
router.use('/api', require('./auth.routes'))
router.use('/api', requireAuth, require('./forecast.routes'))
router.use('/api', requireAuth, require('./assessores.routes'))
router.use('/api', requireAuth, require('./vendas.routes'))
```

### 3.5 Logout

O logout limpa o cookie JWT local e também pode redirecionar para o endpoint de sign-out do Microsoft Entra ID.

---

## 4. Frontend e Estado de Tela

### 4.1 Orquestração em App

[src/App.jsx](../src/App.jsx) junta os hooks principais:

- `useAuth` controla autenticação e sessão expirada.
- `useUserProfile` define camada, marca e bloqueios de UI.
- `useForecastData` carrega e altera os dados do assessor selecionado.
- `useIndicators` calcula os KPIs apresentados no topo da tela.

### 4.2 Componentes principais

- Login e modal de sessão expirada ficam isolados em `components/auth`.
- A área de forecast é dividida entre indicadores, tabela, resumo e modal de confirmação.
- O botão de upload só aparece para `admin`.

### 4.3 Tema visual por marca

[src/hooks/useUserProfile.js](../src/hooks/useUserProfile.js) chama `/api/marca-usuario` e aplica variáveis CSS no `document.documentElement`.

- Neodent usa a paleta roxa padrão.
- Straumann usa a paleta azul.

---

## 5. Endpoints da API

| Método | Rota | Auth | Uso |
|---|---|---:|---|
| `GET` | `/api/me` | não | Verifica a sessão atual |
| `GET` | `/api/auth/login/microsoft` | não | Inicia login Microsoft |
| `GET` | `/api/auth/callback/microsoft` | não | Finaliza OIDC e cria sessão |
| `GET` / `POST` | `/api/auth/logout` | não | Limpa sessão local e/ou Entra ID |
| `GET` | `/api/camadas-usuario` | sim | Retorna role, categoria e hierarquia |
| `GET` | `/api/marca-usuario` | sim | Retorna a marca do usuário |
| `GET` | `/api/buscarassessores` | sim | Lista assessores permitidos |
| `GET` | `/api/forecast/all` | sim | Forecast do assessor selecionado |
| `GET` | `/api/forecast/target` | sim | Meta mensal do assessor |
| `GET` | `/api/forecast/target-semanas` | sim | Metas semanais do assessor |
| `GET` | `/api/forecast/resumo-assessores` | sim | Resumo por assessor para Coord/Gerente |
| `GET` | `/api/workdays` | sim | Dias úteis por semana |
| `GET` | `/api/vendas-mes-atual` | sim | Vendas do mês atual |
| `GET` | `/api/clientes-microregiao` | sim | Clientes disponíveis para inclusão |
| `POST` | `/api/forecast/inserir-add` | sim | Insere ou atualiza linha de forecast |
| `POST` | `/api/forecast/inserir-del` | sim | Marca linha como deletada |
| `POST` | `/api/forecast/target/upload` | sim | Upload de metas via JSON |
| `POST` | `/api/forecast/target/upload-file` | sim | Upload de metas via Excel |
| `POST` | `/api/forecast/upload-file` | sim | Upload de forecast via Excel |

---

## 6. Acesso e Regras

### 6.1 Roles no SQLite

| role | comportamento |
|---|---|
| `admin` | acesso total e botão de upload visível |
| `user` | acesso filtrado pela categoria |

### 6.2 Categorias vindas do SQL Server

| categoria | efeito |
|---|---|
| `SalesRep` | assessor travado no frontend e visão do próprio grupo |
| `Coord` | pode selecionar subordinados e ver consolidado |
| `Gerente` | pode selecionar escopo da regional |

### 6.3 Resolução da tabela de forecast

[server/utils/forecastTable.js](../server/utils/forecastTable.js) decide se a operação usa `SS_TFI_NDBR_Forecast` ou `SS_TFI_STBR_Forecast` conforme a marca/grupo do usuário.

Isso evita hardcode de tabela e garante que os dados persistam corretamente após recarga.

---

## 7. Dados, Cache e Persistência

### 7.1 SQLite

[server/db/sqlite.js](../server/db/sqlite.js) mantém o arquivo `server/auth.db` com a tabela `users` e uma tabela transitória `registration_codes` ainda preservada por compatibilidade.

O projeto está em transição para login Microsoft, então a coluna `role` continua sendo usada como fallback de autorização interna.

### 7.2 SQL Server

O backend consulta o banco `BDISECC` para validar e buscar:

- pessoas autorizadas em `SM_TDG_Pessoas`
- hierarquia em `SM_TRG_Mapping`
- grupo e marca em `SM_TRG_GrPe` e `SM_TRG_SgPe`
- forecast, metas, vendas e dias úteis nas tabelas de negócio

### 7.3 Cache em memória

[server/utils/cache.js](../server/utils/cache.js) reduz round-trips ao SQL Server. Os caches mais relevantes hoje são:

- `forecast:all:{grupoRegID}:{fechamento}`
- `vendas:mes:{grupoRegID}:{fechamento}`
- `workdays:{ano}`
- `forecastTable:grp:{grupoRegID}`
- `assessorIDs:{email}`

### 7.4 Inventário das tabelas do BDISECC

Estas são as tabelas do BDISECC que a aplicação consulta hoje, com o que busca em cada uma:

| Schema | Tabela | O que a aplicação busca |
|---|---|---|
| `mapping` | `SM_TDG_Pessoas` | valida e-mail autorizado, recupera `Unumber`, `NomeSistema` e, em alguns fluxos, a identificação do usuário para liberar acesso e montar o perfil |
| `mapping` | `SM_TRG_Mapping` | resolve a hierarquia do usuário logado, retornando a camada/categoria e os `GrupoRegID` que ele pode enxergar |
| `mapping` | `SM_TRG_GrPe` | faz o vínculo entre `GrupoRegID` e `Unumber`, permitindo mapear assessor, grupo e nome de sistema |
| `mapping` | `SM_TRG_SgPe` | identifica a marca e o `SalesGroup` do grupo do usuário, usada para decidir Neodent x Straumann |
| `sandbox` | `SS_TFI_NDBR_Forecast` | forecast da base Neodent por cliente, grupo e fechamento |
| `sandbox` | `SS_TFI_STBR_Forecast` | forecast da base Straumann por cliente, grupo e fechamento |
| `sandbox` | `SS_TFI_Forecast_Target` | metas mensais e semanais do assessor/grupo |
| `dbo` | `SE_VFI_VendasporDiaMesAtual` | vendas reais do mês atual para comparação com a meta |
| `dbo` | `SE_TRO_WorkDaysBR` | calendário de dias úteis por semana/mês para cálculo de metas e progresso |
| `dbo` | `SE_VRI_NeodentRaioXUltimo` / `SE_VRI_StraumannRaioXUltimo` | base de clientes/visitas/classificação usada na inclusão de novos clientes, escolhida conforme a marca do usuário |

Essencialmente, o app lê o cadastro de pessoas e a hierarquia em `mapping`, cruza a marca em `SM_TRG_SgPe`, busca forecast e metas em `sandbox` e usa as views `dbo` para vendas, calendário e clientes elegíveis, incluindo a RaioX correspondente à marca.

---

## 8. Variáveis de Ambiente

| Variável | Uso |
|---|---|
| `VITE_API_BASE` | base da API no frontend |
| `APP_BASE_URL` | base do backend para callback/logout do Entra ID |
| `APP_REDIRECT_URI` | sobrescreve a URI de callback OIDC |
| `FRONTEND_ORIGIN` | origem do frontend e destino pós-login/logout |
| `AZURE_CLIENT_ID` ou `APP_ID` | application client id |
| `AZURE_CLIENT_SECRET` ou `SECRET_KEY` | client secret |
| `AZURE_TENANT_ID` ou `TENANT_ID` | tenant do Microsoft Entra ID |
| `JWT_SECRET` | assinatura do cookie JWT |
| `URL_PA_LOGIN` | notificação de login para Power Automate |
| `EMAIL_TEST` | e-mail de override para teste local |
| `ALLOW_LOGIN_EMAIL_OVERRIDE` | habilita o override apenas fora de produção |
| `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` | conexão SQL Server |
| `NODE_ENV` | ativa comportamento de produção e cookie seguro |
| `PORT` | porta do Node/Express |

---

## 9. Checklist de Reuso

- [ ] Separar rotas públicas e protegidas no Express.
- [ ] Usar cookie `HttpOnly` para sessão.
- [ ] Validar login com OIDC e `state` / `nonce`.
- [ ] Manter fallback de role em SQLite enquanto a migração não termina.
- [ ] Usar `credentials: 'include'` em todas as chamadas do frontend.
- [ ] Manter proxy de desenvolvimento no Vite e proxy reverso em produção.
- [ ] Resolver tabelas de forecast por marca/grupo, sem hardcode.
- [ ] Invalidação de cache após gravação ou exclusão de forecast.
