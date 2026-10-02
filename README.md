# Saber em Jogo

Plataforma de quizzes para professores e estudantes, com identidade visual em grafite, cinza e dourado.

## Funcionalidades

- Entrada do professor por e-mail e senha, criação de conta e recuperação de acesso.
- Criação de quizzes e salas para a turma.
- Entrada do estudante com nome e código de seis números.
- Interface responsiva e ilustração de aprendizagem conectada.

## Tecnologias

React, TypeScript, TanStack Start, Vite, Tailwind CSS, Better Auth e PostgreSQL. O ambiente local utiliza PGLite quando não existe uma conexão PostgreSQL configurada.

## Desenvolvimento

Requer Node.js 22 ou superior.

```sh
npm ci
npm run dev
```

No Windows, `startup.ps1` inicia o servidor. No ambiente App Builder, `startup.sh` mantém o contrato de inicialização da plataforma.

## Verificação

```sh
npm run typecheck
npm run build
```

## Publicação

O projeto usa TanStack Start com o preset Vercel do Nitro. Ao importar o repositório no Vercel, use a raiz do projeto e configure:

- **Node.js:** 22 ou superior.
- **Install Command:** `npm ci --include=dev --no-audit --no-fund` (já definido em `vercel.json`).
- **Build Command:** `npm run build`.
- **Output Directory:** deixe sem substituição manual; o Nitro gera a saída compatível com Vercel.

Antes do primeiro deploy, configure no ambiente Production:

- `DATABASE_URL`: conexão com PostgreSQL persistente (por exemplo, Neon). Sem ela, o app usa PGLite em memória, que não persiste dados entre execuções serverless.
- `BETTER_AUTH_URL`: URL pública canônica do app, como `https://seu-dominio.vercel.app`.
- `BETTER_AUTH_SECRET`: segredo aleatório forte e estável para assinar sessões.
- `VITE_AUTH_ENABLED=true`: habilita autenticação explicitamente.
- `GROK_AUTH_CLIENT_ID` e `GROK_AUTH_CLIENT_SECRET` (e `GROK_AUTH_ISSUER`, quando fornecido): credenciais do broker necessárias ao login social. As credenciais de preview embutidas são exclusivas do ambiente de preview e não substituem credenciais de produção.

Adicione credenciais também aos ambientes Preview se for testar deploys de prévia; prefira um banco separado para evitar misturar os dados. Nunca coloque segredos no repositório. O comando de build aplica as migrações pendentes em `migrations/` quando `DATABASE_URL` está definido; confira as permissões do banco caso essa etapa falhe.

Os elementos de integração e marca da plataforma App Builder permanecem preservados.

## Conteúdo da exportação

A exportação contém o código-fonte, os recursos visuais finais, as migrações, os scripts e o arquivo de dependências travadas. Dependências instaladas, cópias antigas, capturas de verificação e arquivos temporários ficam fora do repositório.
