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

O projeto possui configuração para Vercel. Configure `DATABASE_URL` e as variáveis de autenticação no provedor de hospedagem; nunca coloque credenciais no repositório. Consulte os helpers existentes em `src/lib/auth` para a configuração de autenticação. As migrações são aplicadas pelo comando de build quando `DATABASE_URL` está disponível.

Os elementos de integração e marca da plataforma App Builder permanecem preservados.

## Conteúdo da exportação

A exportação contém o código-fonte, os recursos visuais finais, as migrações, os scripts e o arquivo de dependências travadas. Dependências instaladas, cópias antigas, capturas de verificação e arquivos temporários ficam fora do repositório.
