import { useEffect, useState } from "react";
import { LETTERS, SCORE_RULE, type PlayState } from "@/lib/saber/logic";
import { Dialog, remainingSeconds } from "./bits";

export function PlayView({
  state,
  now,
  busy,
  onAnswer,
  onLeave,
}: {
  state: PlayState;
  now: number;
  busy: boolean;
  onAnswer: (choice: number) => void;
  onLeave: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const seconds = remainingSeconds(state.deadlineMs, state.serverNowMs, now);
  const question = state.question;
  const locked = !question || question.revealed || question.picked != null || seconds === 0 || busy || state.me.removed;

  useEffect(() => {
    setZoom(false);
  }, [state.questionIndex, state.status]);

  if (state.me.removed) {
    return (
      <section className="card stage">
        <h1>Você saiu desta sala</h1>
        <p>O professor removeu este nome. As respostas já enviadas continuam no histórico dele.</p>
        <button type="button" className="btn" onClick={onLeave}>
          Voltar à entrada
        </button>
      </section>
    );
  }

  if (state.status === "waiting") {
    return (
      <section className="card stage">
        <p className="kicker">Sala {state.code}</p>
        <h1>
          Você está na sala, <em>{state.me.nickname}</em>
        </h1>
        <p>
          Aguarde o professor começar. {state.counts.joined}{" "}
          {state.counts.joined === 1 ? "pessoa já entrou" : "pessoas já entraram"}.
        </p>
        <button type="button" className="btn" onClick={onLeave}>
          Sair da sala
        </button>
      </section>
    );
  }

  if (state.status === "finished") {
    return (
      <div className="stage stack">
        <section className="card">
          <p className="kicker">Fim de jogo</p>
          <p className="score-xl">
            {state.me.score}
            <small> pontos</small>
          </p>
          <h1>Atividade concluída</h1>
          <p>{SCORE_RULE}</p>
          {state.ranking ? (
            <ol className="rank">
              {state.ranking.map((row) => (
                <li key={`${row.place}-${row.nickname}`}>
                  <span>
                    {row.place}. {row.nickname}
                  </span>
                  <strong>{row.score}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">O professor deixou o placar só para a turma dele.</p>
          )}
          <button type="button" className="btn" onClick={onLeave}>
            Sair da sala
          </button>
        </section>
        <section className="stack">
          <h2>Revisão</h2>
          {state.review?.map((item) => (
            <details key={item.index} className="question">
              <summary>
                Questão {item.index + 1}
                <span>{item.wasCorrect ? "Você acertou" : item.picked == null ? "Sem resposta" : "Vale revisar"}</span>
              </summary>
              <div className="question-body">
                {item.context ? <p>{item.context}</p> : null}
                <p className="prompt">{item.text}</p>
                <div className="answers">
                  {item.options.map((option, index) => (
                    <div
                      key={`${item.index}-${option}`}
                      className={`answer${item.correctChoice === index ? " is-correct" : ""}${item.picked === index && item.correctChoice !== index ? " is-wrong" : ""}${item.picked === index ? " is-picked" : ""}`}
                    >
                      <span>{LETTERS[index]}</span>
                      {option}
                      {item.picked === index ? " · sua resposta" : ""}
                      {item.correctChoice === index ? " · gabarito" : ""}
                    </div>
                  ))}
                </div>
                <div className="explain">
                  <strong>
                    {item.wasCorrect ? `Você acertou · ${item.points ?? 0} pts` : item.picked == null ? "Você não respondeu" : "Não foi desta vez"}
                  </strong>
                  <p>{item.explanation || "O professor pode comentar esta resposta com a turma."}</p>
                </div>
              </div>
            </details>
          ))}
        </section>
      </div>
    );
  }

  if (!question) return null;
  const status = question.revealed
    ? question.wasCorrect
      ? `Você acertou. ${question.points ?? 0} pontos nesta questão.`
      : question.picked == null
        ? "Você não respondeu esta questão."
        : "Revise a explicação com o professor."
    : question.picked != null
      ? "Resposta enviada. Aguarde o professor encerrar a questão."
      : seconds === 0
        ? "Tempo encerrado. Aguarde o professor."
        : "Escolha uma alternativa.";

  return (
    <section className="live stage">
      <p className="kicker">
        {state.questionIndex + 1} / {state.questionCount}
      </p>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${((state.questionIndex + 1) / state.questionCount) * 100}%` }} />
      </div>
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
      <h1 className="prompt">{question.text}</h1>
      <div className="answers">
        {question.options.map((option, index) => (
          <button
            key={`${state.questionIndex}-${option}`}
            type="button"
            className={`answer${question.picked === index ? " is-picked" : ""}${question.revealed && question.correctChoice === index ? " is-correct" : ""}${question.revealed && question.picked === index && question.correctChoice !== index ? " is-wrong" : ""}`}
            disabled={locked}
            onClick={() => onAnswer(index)}
          >
            <span>{LETTERS[index]}</span>
            {option}
          </button>
        ))}
      </div>
      <p id="answerStatus" role="status">
        {status}
      </p>
      {question.revealed ? (
        <div className="explain">
          <strong>Resposta: {question.correctChoice == null ? "—" : LETTERS[question.correctChoice]}</strong>
          <p>{question.explanation || "O professor pode comentar esta resposta com a turma."}</p>
        </div>
      ) : null}
      {state.ranking ? (
        <ol className="rank">
          {state.ranking.map((row) => (
            <li key={`${row.place}-${row.nickname}`}>
              <span>
                {row.place}. {row.nickname}
              </span>
              <strong>{row.score}</strong>
            </li>
          ))}
        </ol>
      ) : null}
      <button type="button" className="btn btn-small" onClick={onLeave}>
        Sair da sala
      </button>
      {zoom && question.imageData ? (
        <Dialog title="Imagem da questão" onClose={() => setZoom(false)}>
          <img className="zoom-img" src={question.imageData} alt={question.imageAlt} />
        </Dialog>
      ) : null}
    </section>
  );
}
