import { useState } from "react";
import { LETTERS, SCORE_RULE, reportCsv, downloadText, type HostState } from "@/lib/saber/logic";
import { Dialog, remainingSeconds } from "./bits";

export function HostPanel({
  state,
  projecting,
  now,
  busy,
  onCommand,
  onRemove,
  onProject,
}: {
  state: HostState;
  projecting: boolean;
  now: number;
  busy: boolean;
  onCommand: (command: "start" | "reveal" | "next" | "finish" | "ranking") => void;
  onRemove: (participantId: string, nickname: string) => void;
  onProject: () => void;
}) {
  const [invite, setInvite] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const seconds = remainingSeconds(state.deadlineMs, state.serverNowMs, now);
  const active = state.players.filter((player) => !player.removed);
  const answered = active.filter((player) => player.answered).length;
  const waitingNames = active.filter((player) => !player.answered).map((player) => player.nickname);
  const question = state.question;
  const totalBars = question?.counts.reduce((sum, count) => sum + count, 0) ?? 0;
  const link = typeof window !== "undefined" ? `${window.location.origin}/jogar?codigo=${state.code}` : state.code;

  const share = async () => {
    const text = `Entre na sala ${state.code}: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Convite Saber em Jogo", text });
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setInvite(text);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
    } catch {
      setInvite(state.code);
    }
  };

  return (
    <section className="live" aria-live="polite">
      <div className="spread">
        <h2>
          {state.title} · {state.code}
        </h2>
        <div className="row">
          <button type="button" className="btn btn-small" onClick={onProject}>
            {projecting ? "Sair da projeção" : "Modo de projeção"}
          </button>
          {state.status !== "finished" ? (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onCommand("finish")}>
              Encerrar sala
            </button>
          ) : null}
        </div>
      </div>

      {state.status === "waiting" ? (
        <>
          <p>Compartilhe o código e espere a turma. {state.seconds ? `${state.seconds} segundos por questão.` : "Sem cronômetro."}</p>
          <div className="row">
            <button type="button" className="btn btn-small" onClick={() => void copyCode()}>
              Copiar código
            </button>
            <button type="button" className="btn btn-small" onClick={() => void share()}>
              Compartilhar convite
            </button>
            <button type="button" className="btn btn-coral" disabled={busy} onClick={() => onCommand("start")}>
              Começar partida
            </button>
          </div>
        </>
      ) : null}

      <p>
        {active.length} na sala
        {state.status === "active" ? ` · ${answered} responderam · questão ${state.questionIndex + 1} de ${state.questionCount}` : ""}
      </p>

      {state.status === "active" && question ? (
        <div>
          <p className="timer" role="timer">
            {seconds == null ? "Sem cronômetro" : seconds === 0 ? "Tempo encerrado" : `${seconds}s restantes`}
          </p>
          {question.context ? <p className="support">{question.context}</p> : null}
          {question.imageData ? (
            <figure className="figure">
              <button type="button" className="image-zoom" onClick={() => setZoom(true)} aria-label="Ampliar imagem">
                <img src={question.imageData} alt={question.imageAlt} />
              </button>
            </figure>
          ) : null}
          <h3 className="prompt">{question.text}</h3>
          <div className="answers">
            {question.options.map((option, index) => (
              <div
                key={option}
                className={`answer${state.revealed && question.correct === index ? " is-correct" : ""}`}
              >
                <span>{LETTERS[index]}</span>
                {option}
              </div>
            ))}
          </div>
          <div className="bars" aria-label="Distribuição das respostas">
            {question.options.map((option, index) => {
              const count = question.counts[index] ?? 0;
              const width = totalBars ? Math.round((count / totalBars) * 100) : 0;
              return (
                <div key={`${option}-bar`}>
                  <div className="bar-label">
                    <span>
                      {LETTERS[index]}. {option}
                    </span>
                    <span>{count}</span>
                  </div>
                  <div className={`track${state.revealed && question.correct === index ? " is-correct" : ""}`}>
                    <i style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="note">As letras mudam em cada aparelho. As barras seguem o texto, não a letra do aluno.</p>
          {state.revealed ? (
            <div className="explain">
              <strong>Resposta: {LETTERS[question.correct]}</strong>
              <p>{question.explanation || "Você pode comentar esta resposta com a turma."}</p>
            </div>
          ) : null}
          <div className="row">
            {state.revealed ? (
              state.questionIndex + 1 < state.questionCount ? (
                <button type="button" className="btn btn-coral" disabled={busy} onClick={() => onCommand("next")}>
                  Próxima questão
                </button>
              ) : (
                <button type="button" className="btn btn-coral" disabled={busy} onClick={() => onCommand("finish")}>
                  Concluir partida
                </button>
              )
            ) : (
              <button type="button" className="btn btn-coral" disabled={busy} onClick={() => onCommand("reveal")}>
                Encerrar questão e mostrar resposta
              </button>
            )}
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => onCommand("ranking")}>
              {state.showRanking ? "Ocultar placar da turma" : "Mostrar placar depois da correção"}
            </button>
          </div>
          {projecting ? (
            <p className="misses">{waitingNames.length ? `Ainda não responderam: ${waitingNames.join(", ")}` : "Todo mundo já respondeu."}</p>
          ) : null}
        </div>
      ) : null}

      {state.status === "finished" ? (
        <div>
          <h3>Resultado final</h3>
          <div className="podium">
            {state.ranking.slice(0, 3).map((row) => (
              <article key={`${row.place}-${row.nickname}`}>
                <p className="kicker">{row.place}º</p>
                <strong>{row.nickname}</strong>
                <p>{row.score} pts</p>
              </article>
            ))}
          </div>
          <ol className="rank">
            {state.ranking.map((row) => (
              <li key={`${row.place}-${row.nickname}`}>
                <span>
                  {row.place}. {row.nickname}
                  {row.removed ? " (removido)" : ""}
                </span>
                <strong>{row.score} pts</strong>
              </li>
            ))}
          </ol>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Questão</th>
                  <th>Respostas</th>
                  <th>Acertos</th>
                  <th>Erros</th>
                  <th>Sem resposta</th>
                  <th>Entre respostas</th>
                  <th>Na turma</th>
                </tr>
              </thead>
              <tbody>
                {state.report.map((row) => (
                  <tr key={row.index}>
                    <th scope="row">
                      {row.index}. {row.text}
                    </th>
                    <td>
                      {row.answered}/{row.roster}
                    </td>
                    <td>{row.correct}</td>
                    <td>{row.wrong}</td>
                    <td>{row.missing}</td>
                    <td>{row.percentAnswered == null ? "—" : `${row.percentAnswered}%`}</td>
                    <td>{row.percentRoster == null ? "—" : `${row.percentRoster}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-sun"
            onClick={() => downloadText(`saber-em-jogo-${state.code}.csv`, reportCsv(state), "text/csv")}
          >
            Exportar relatório CSV
          </button>
          <p className="note">{SCORE_RULE}</p>
        </div>
      ) : projecting ? null : (
        <ul className="players">
          {active.map((player) => (
            <li key={player.id}>
              <span>
                {player.nickname}
                {state.status === "active" ? (player.answered ? " · respondeu" : " · aguardando") : ""}
                {state.revealed ? ` · ${player.score} pts` : ""}
              </span>
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => onRemove(player.id, player.nickname)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {invite ? (
        <Dialog title="Convite da sala" onClose={() => setInvite(null)}>
          <label className="field">
            Convite
            <textarea readOnly rows={4} value={invite} />
          </label>
        </Dialog>
      ) : null}
      {zoom && question?.imageData ? (
        <Dialog title="Imagem da questão" onClose={() => setZoom(false)}>
          <img className="zoom-img" src={question.imageData} alt={question.imageAlt} />
        </Dialog>
      ) : null}
    </section>
  );
}
