# SalesForecast

Aplicação para que assessores comerciais acompanhem o planejamento semanal e a projeção de vendas. O sistema reúne o forecast de clientes, metas, vendas realizadas e indicadores para apoiar o acompanhamento do mês.

## O que a aplicação oferece

- Consulta e edição do forecast de clientes por semana.
- Indicadores de progresso em relação às metas e às vendas do mês.
- Inclusão de clientes no planejamento.
- Visão consolidada por assessor para coordenadores e gerentes.
- Upload de forecast e metas mensais para usuários administradores.
- Autenticação com Microsoft Entra ID.

## Tecnologias

- Frontend: React 18 e Vite.
- Backend: Node.js e Express.
- Dados: SQL Server para dados comerciais e SQLite local para informações auxiliares de autorização.

## Requisitos

- Node.js e npm.
- Acesso ao SQL Server usado pela aplicação.
- Aplicativo registrado no Microsoft Entra ID, com a URI de callback do backend configurada.

## Executar localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um arquivo `.env` na raiz do projeto e configure as variáveis necessárias para o ambiente:

   ```dotenv
   PORT=4000
   NODE_ENV=development
   FRONTEND_ORIGIN=http://localhost:5173
   APP_BASE_URL=http://localhost:4000
   APP_REDIRECT_URI=http://localhost:4000/api/auth/callback/microsoft

   AZURE_CLIENT_ID=
   AZURE_CLIENT_SECRET=
   AZURE_TENANT_ID=
   JWT_SECRET=

   DB_SERVER=
   DB_DATABASE=
   DB_USER=
   DB_PASSWORD=
   DB_PORT=1433
   ```

   Preencha os valores com as credenciais e os endereços do ambiente autorizado. Não compartilhe nem versione o arquivo `.env`.

3. No registro do aplicativo Microsoft Entra ID, cadastre como URI de redirecionamento:

   ```text
   http://localhost:4000/api/auth/callback/microsoft
   ```

4. Inicie o backend e o frontend:

   ```bash
   npm run dev
   ```

   O frontend fica disponível em `http://localhost:5173` e a API em `http://localhost:4000`. O Vite encaminha as chamadas `/api` ao backend.

## Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia backend e frontend para desenvolvimento |
| `npm run dev:server` | Inicia apenas o backend |
| `npm run dev:client` | Inicia apenas o frontend |
| `npm run build` | Gera a versão de produção do frontend em `dist/` |
| `npm run preview` | Faz preview local do build do frontend |
| `npm start` | Inicia o backend em modo de produção (Linux/macOS) |

No PowerShell do Windows, inicie o backend de produção com:

```powershell
$env:NODE_ENV = "production"
node server/app.js
```

## Configuração adicional

O backend também reconhece estas variáveis opcionais:

| Variável | Finalidade |
|---|---|
| `VITE_API_BASE` | Define uma base alternativa para as chamadas da API |
| `REDIRECT_PROD` | Exibe o link de acesso à produção na tela de login quando definido como `true` |
| `URL_PA_LOGIN` | Endpoint de notificação de login |
| `EMAIL_TEST` | E-mail de override para testes locais |
| `ALLOW_LOGIN_EMAIL_OVERRIDE` | Habilita o override de e-mail somente fora de produção |

As credenciais do Entra ID também podem ser fornecidas pelos nomes legados `APP_ID`, `SECRET_KEY` e `TENANT_ID`. Em produção, ajuste `APP_BASE_URL`, `FRONTEND_ORIGIN` e, se necessário, `APP_REDIRECT_URI` para os endereços HTTPS cadastrados no Entra ID.

## Dados e arquitetura

O SQL Server fornece os dados comerciais, como hierarquia de assessores, metas, forecast, vendas e calendário de dias úteis. O arquivo `server/auth.db` é criado e mantido localmente pelo backend; ele não deve ser compartilhado como parte do código-fonte.

Consulte [docs/architecture.md](docs/architecture.md) para detalhes sobre componentes, endpoints, acesso a dados e variáveis de ambiente.
