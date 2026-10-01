import { createFileRoute, Link } from "@tanstack/react-router";
import { Frame } from "@/components/saber/bits";

export const Route = createFileRoute("/privacidade")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <Frame online status="Privacidade">
      <article className="legal">
        <p className="kicker">Saber em Jogo · edição grok</p>
        <h1>Privacidade</h1>
        <p>
          Esta página é uma sala de aula ao vivo. Não é o aplicativo de concursos que usa o mesmo nome. O professor tem
          conta. O estudante entra só com um apelido e um código.
        </p>
        <h2>O que fica guardado</h2>
        <ul>
          <li>Do professor: nome, e-mail, senha protegida ou o acesso Google/X, e um código de recuperação só em forma de hash.</li>
          <li>Da turma: apelido, respostas, pontos e o horário em que cada acerto aconteceu, para desempatar o placar.</li>
          <li>Da atividade: enunciados, alternativas, explicações e imagens que o professor envia. A imagem é reduzida neste aparelho antes de subir.</li>
        </ul>
        <h2>O que o aluno não recebe</h2>
        <p>
          O gabarito e a explicação só saem do servidor depois que o professor encerra a questão. Cada aluno vê as
          alternativas numa ordem diferente. A resposta dos colegas não viaja para o aparelho da turma, só a contagem
          para o professor.
        </p>
        <h2>Quanto tempo e como apagar</h2>
        <p>
          O rascunho que ainda não foi salvo fica só neste navegador. O acervo e as salas ficam enquanto a conta existir.
          Em Conta, o professor pode apagar tudo: atividades, salas, respostas e o login. Não vendemos esses dados e não
          pedimos e-mail de estudante.
        </p>
        <p>O apelido muitas vezes é o primeiro nome. Vale combinar com a turma um nome que ela aceite ver no placar e no CSV.</p>
        <Link to="/" className="btn">
          Voltar
        </Link>
      </article>
    </Frame>
  );
}
