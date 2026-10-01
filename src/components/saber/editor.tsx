import { useRef } from "react";
import {
  LETTERS,
  MAX_QUESTIONS,
  activityFromCsv,
  activityFromJson,
  activityToJson,
  compressImage,
  downloadText,
  emptyQuestion,
  friendlyError,
  type DraftActivity,
  type DraftQuestion,
} from "@/lib/saber/logic";
import { CSV_TEMPLATE } from "@/lib/saber/logic";

function patchQuestion(draft: DraftActivity, key: string, recipe: (question: DraftQuestion) => DraftQuestion) {
  return {
    ...draft,
    questions: draft.questions.map((question) => (question.key === key ? recipe(question) : question)),
  };
}

export function Editor({
  draft,
  closed,
  busy,
  onChange,
  onClosed,
  onSave,
  onLoad,
  onMessage,
}: {
  draft: DraftActivity;
  closed: Record<string, boolean>;
  busy: boolean;
  onChange: (draft: DraftActivity) => void;
  onClosed: (closed: Record<string, boolean>) => void;
  onSave: () => void;
  onLoad: (draft: DraftActivity) => void;
  onMessage: (text: string, kind?: "info" | "error") => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const move = (index: number, direction: number) => {
    const next = index + direction;
    if (next < 0 || next >= draft.questions.length) return;
    const questions = [...draft.questions];
    const current = questions[index];
    const target = questions[next];
    if (!current || !target) return;
    questions[index] = target;
    questions[next] = current;
    onChange({ ...draft, questions });
  };
  return (
    <section className="card" aria-label="Editor da atividade">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{draft.id ? "Editar atividade" : "Nova atividade"}</h2>
        <div className="row">
          <button type="button" className="btn btn-small" onClick={() => onLoad({ title: "", subject: "", showRanking: true, questions: [emptyQuestion()] })}>
            Novo jogo
          </button>
          <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
            Importar
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              try {
                downloadText(
                  "atividade-saber-em-jogo.json",
                  activityToJson(draft),
                  "application/json",
                );
              } catch (error) {
                onMessage(friendlyError(error), "error");
              }
            }}
          >
            Exportar JSON
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="application/json,text/csv,.csv,.json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            const text = await file.text();
            onLoad(file.name.endsWith(".csv") || text.trimStart().startsWith("enunciado") || text.includes("alternativa_a")
              ? activityFromCsv(text)
              : activityFromJson(text));
            onMessage("Atividade importada no rascunho. Salve no acervo para guardar.", "info");
          } catch (error) {
            onMessage(friendlyError(error), "error");
          }
        }}
      />
      <p className="hint">
        CSV com colunas enunciado, alternativa_a, alternativa_b, correta.{" "}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => downloadText("modelo-saber-em-jogo.csv", CSV_TEMPLATE, "text/csv")}
        >
          Baixar modelo
        </button>
      </p>
      <div className="stack">
        <div className="grid-2">
          <label className="field">
            Título
            <input
              maxLength={100}
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="field">
            Disciplina e turma
            <input
              maxLength={80}
              value={draft.subject}
              onChange={(event) => onChange({ ...draft, subject: event.target.value })}
            />
          </label>
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={draft.showRanking}
            onChange={(event) => onChange({ ...draft, showRanking: event.target.checked })}
          />
          Mostrar placar para a turma depois de cada correção
        </label>
        <p className="hint">
          {draft.questions.length} de {MAX_QUESTIONS} questões · 2 a 5 alternativas
        </p>
        {draft.questions.map((question, index) => (
          <details
            key={question.key}
            className="question"
            open={!closed[question.key]}
            onToggle={(event) =>
              onClosed({ ...closed, [question.key]: !event.currentTarget.open })
            }
          >
            <summary>
              Questão {index + 1}
              <span>{question.text || "Nova questão"}</span>
            </summary>
            <div className="question-body">
              <div className="row">
                <button type="button" className="btn btn-small" disabled={index === 0} onClick={() => move(index, -1)}>
                  Subir
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={index === draft.questions.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Descer
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={draft.questions.length >= MAX_QUESTIONS}
                  onClick={() => {
                    const copy = { ...question, key: crypto.randomUUID(), options: [...question.options] };
                    const questions = [...draft.questions];
                    questions.splice(index + 1, 0, copy);
                    onChange({ ...draft, questions });
                  }}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={draft.questions.length === 1}
                  onClick={() =>
                    onChange({ ...draft, questions: draft.questions.filter((item) => item.key !== question.key) })
                  }
                >
                  Excluir
                </button>
              </div>
              <label className="field">
                Texto de apoio desta questão
                <textarea
                  rows={3}
                  maxLength={1200}
                  value={question.context}
                  onChange={(event) =>
                    onChange(patchQuestion(draft, question.key, (item) => ({ ...item, context: event.target.value })))
                  }
                />
              </label>
              <label className="field">
                Enunciado
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={question.text}
                  onChange={(event) =>
                    onChange(patchQuestion(draft, question.key, (item) => ({ ...item, text: event.target.value })))
                  }
                />
              </label>
              <div className="options">
                {question.options.map((option, optionIndex) => (
                  <label className="field" key={`${question.key}-${optionIndex}`}>
                    Alternativa {LETTERS[optionIndex]}
                    <input
                      maxLength={300}
                      value={option}
                      onChange={(event) =>
                        onChange(
                          patchQuestion(draft, question.key, (item) => {
                            const options = [...item.options];
                            options[optionIndex] = event.target.value;
                            return { ...item, options };
                          }),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={question.options.length <= 2}
                      onClick={() =>
                        onChange(
                          patchQuestion(draft, question.key, (item) => {
                            const options = item.options.filter((_, cursor) => cursor !== optionIndex);
                            let correct = item.correct;
                            if (correct === optionIndex) correct = 0;
                            else if (correct > optionIndex) correct -= 1;
                            return { ...item, options, correct };
                          }),
                        )
                      }
                    >
                      Remover
                    </button>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-small"
                disabled={question.options.length >= 5}
                onClick={() =>
                  onChange(
                    patchQuestion(draft, question.key, (item) => ({ ...item, options: [...item.options, ""] })),
                  )
                }
              >
                Adicionar alternativa
              </button>
              <label className="field">
                Resposta correta
                <select
                  value={question.correct}
                  onChange={(event) =>
                    onChange(
                      patchQuestion(draft, question.key, (item) => ({
                        ...item,
                        correct: Number(event.target.value),
                      })),
                    )
                  }
                >
                  {question.options.map((_, optionIndex) => (
                    <option key={optionIndex} value={optionIndex}>
                      Alternativa {LETTERS[optionIndex]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Explicação, mostrada só depois da correção
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={question.explanation}
                  onChange={(event) =>
                    onChange(
                      patchQuestion(draft, question.key, (item) => ({ ...item, explanation: event.target.value })),
                    )
                  }
                />
              </label>
              <label className="field">
                {question.imageData ? "Substituir imagem" : "Imagem do enunciado"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                      const imageData = await compressImage(file);
                      onChange(
                        patchQuestion(draft, question.key, (item) => ({
                          ...item,
                          imageData,
                          imageAlt: item.imageAlt,
                        })),
                      );
                      onMessage("Imagem pronta. Preencha a descrição para acessibilidade.", "info");
                    } catch (error) {
                      onMessage(friendlyError(error), "error");
                    }
                  }}
                />
              </label>
              {question.imageData ? (
                <>
                  <figure className="figure">
                    <img src={question.imageData} alt={question.imageAlt || ""} />
                  </figure>
                  <label className="field">
                    Descrição da imagem
                    <input
                      maxLength={300}
                      value={question.imageAlt}
                      onChange={(event) =>
                        onChange(
                          patchQuestion(draft, question.key, (item) => ({ ...item, imageAlt: event.target.value })),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() =>
                      onChange(
                        patchQuestion(draft, question.key, (item) => ({
                          ...item,
                          imageData: null,
                          imageAlt: "",
                        })),
                      )
                    }
                  >
                    Remover imagem
                  </button>
                </>
              ) : null}
            </div>
          </details>
        ))}
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={draft.questions.length >= MAX_QUESTIONS}
            onClick={() => onChange({ ...draft, questions: [...draft.questions, emptyQuestion()] })}
          >
            Adicionar questão
          </button>
          <button type="button" className="btn btn-dark" disabled={busy} onClick={onSave}>
            Salvar no acervo
          </button>
        </div>
        <p className="hint">O rascunho fica neste navegador até você salvar no acervo.</p>
      </div>
    </section>
  );
}
