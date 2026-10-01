import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import {
  accountInfo,
  controlRoom,
  createRoom,
  deleteActivity,
  deleteMyAccount,
  fetchActivity,
  fetchHost,
  fetchLibrary,
  removePlayer,
  saveActivity,
  saveRecoveryCode,
  setActivityArchived,
} from "@/lib/saber/api";
import { DEMO_ACTIVITY } from "@/lib/saber/demo";
import {
  SCORE_RULE,
  draftStorageKey,
  emptyDraft,
  friendlyError,
  recoveryCode,
  type DraftActivity,
  type HostState,
} from "@/lib/saber/logic";
import { Dialog, Flash, Frame, useNow } from "./bits";
import { Editor } from "./editor";
import { HostPanel } from "./host-panel";

type Library = Awaited<ReturnType<typeof fetchLibrary>>;
type Ask = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  phrase?: boolean;
  run: () => Promise<void> | void;
};

function readDraft(userId: string): DraftActivity {
  try {
    const parsed = JSON.parse(localStorage.getItem(draftStorageKey(userId)) || "null") as {
      version?: number;
      activity?: DraftActivity;
    } | null;
    if (parsed?.version === 1 && Array.isArray(parsed.activity?.questions) && parsed.activity.questions.length) {
      return parsed.activity;
    }
  } catch {
    /* o rascunho antigo fica para trás */
  }
  return emptyDraft();
}

function fresh(activity: DraftActivity, copy: boolean): DraftActivity {
  return {
    title: copy ? `${activity.title.slice(0, 92)} (cópia)` : activity.title,
    subject: activity.subject,
    showRanking: activity.showRanking,
    questions: activity.questions.map((question) => ({
      ...question,
      key: crypto.randomUUID(),
      options: [...question.options],
    })),
  };
}

const STATUS_LABEL = { waiting: "Aguardando", active: "Em andamento", finished: "Encerrada" } as const;

export function Teacher({ userId }: { userId: string }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [draft, setDraft] = useState<DraftActivity>(() => readDraft(userId));
  const [dirty, setDirty] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [roomId, setRoomId] = useState<string | null>(null);
  const [host, setHost] = useState<HostState | null>(null);
  const [projecting, setProjecting] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "info" | "error" }>({ text: "", kind: "info" });
  const [filter, setFilter] = useState("");
  const [subject, setSubject] = useState("");
  const [archive, setArchive] = useState<"active" | "archived" | "all">("active");
  const [launch, setLaunch] = useState<{ id: string; title: string; ranking: boolean } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [phrase, setPhrase] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const now = useNow(Boolean(host && host.status === "active" && !host.revealed && host.deadlineMs));

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!dirty && !busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty, busy]);

  const reload = async () => {
    const next = await fetchLibrary();
    setLibrary(next);
    setOnline(true);
  };

  useEffect(() => {
    let stop = false;
    void reload().catch((error) => {
      if (!stop) setMessage({ text: friendlyError(error), kind: "error" });
    });
    void accountInfo()
      .then((info) => {
        if (stop) return;
        setHasRecovery(info.hasRecovery);
        setHasPassword(info.hasPassword);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!roomId) return;
    let stop = false;
    const tick = async () => {
      try {
        const next = await fetchHost({ data: { roomId } });
        if (!stop) {
          setHost(next);
          setOnline(true);
        }
      } catch {
        if (!stop) setOnline(false);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [roomId]);

  const changeDraft = (next: DraftActivity) => {
    setDraft(next);
    setDirty(true);
    localStorage.setItem(draftStorageKey(userId), JSON.stringify({ version: 1, activity: next }));
  };

  const stageLoad = (next: DraftActivity, markDirty = true) => {
    const apply = () => {
      setDraft(next);
      setDirty(markDirty);
      setClosed({});
      localStorage.setItem(draftStorageKey(userId), JSON.stringify({ version: 1, activity: next }));
    };
    if (!dirty) {
      apply();
      return;
    }
    setAsk({
      title: "Substituir o rascunho?",
      body: "O que ainda não foi salvo no acervo sai deste navegador.",
      confirmLabel: "Substituir",
      run: apply,
    });
  };

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setMessage({ text: friendlyError(error), kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const subjects = useMemo(
    () => [...new Set((library?.activities ?? []).map((item) => item.subject))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [library],
  );
  const visible = (library?.activities ?? []).filter((item) => {
    if (archive !== "all" && item.archived !== (archive === "archived")) return false;
    if (subject && item.subject !== subject) return false;
    const haystack = `${item.title} ${item.subject}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(filter.toLocaleLowerCase("pt-BR"));
  });

  const status = online ? (host ? "Conectado à sala" : "Acervo pronto") : "Conexão instável. Tentando de novo";

  return (
    <Frame online={online} status={status} projecting={projecting}>
      <section className="spread dashboard-head">
        <h1>
          Espaço do <em>professor</em>
        </h1>
        <div className="row">
          <Link to="/jogar" search={{ codigo: "", apelido: "" }} className="btn btn-small">
            Entrar como aluno
          </Link>
          <UserButton />
        </div>
      </section>
      <Flash kind={message.kind} text={message.text} />
      <p className="hint hide-project">{SCORE_RULE}</p>

      {host ? (
        <HostPanel
          state={host}
          projecting={projecting}
          now={now}
          busy={busy}
          onProject={() => setProjecting((value) => !value)}
          onCommand={(command) =>
            void run(async () => {
              if (command === "finish") {
                setAsk({
                  title: "Encerrar a sala?",
                  body: "A turma vê o resultado e não envia mais respostas.",
                  confirmLabel: "Encerrar",
                  danger: true,
                  run: async () => {
                    const next = await controlRoom({ data: { roomId: host.roomId, command: "finish" } });
                    setHost(next);
                    await reload();
                  },
                });
                return;
              }
              const next = await controlRoom({ data: { roomId: host.roomId, command } });
              setHost(next);
              if (command === "start" || command === "next") await reload();
            })
          }
          onRemove={(participantId, nickname) =>
            setAsk({
              title: `Remover ${nickname}?`,
              body: "As respostas já enviadas ficam no histórico.",
              confirmLabel: "Remover",
              danger: true,
              run: async () => {
                const next = await removePlayer({ data: { roomId: host.roomId, participantId } });
                setHost(next);
              },
            })
          }
        />
      ) : null}

      <section className="card hide-project room-history">
        <h2>Salas e histórico</h2>
        <div className="row">
          {(library?.rooms ?? []).map((room) => (
            <button
              key={room.id}
              type="button"
              className="btn btn-small"
              aria-current={room.id === roomId}
              onClick={() => setRoomId(room.id)}
            >
              {room.code} · {STATUS_LABEL[room.status]} · {new Date(room.createdAt).toLocaleDateString("pt-BR")}
            </button>
          ))}
          {!library?.rooms.length ? <p className="hint">Nenhuma sala criada.</p> : null}
        </div>
      </section>

      <div className="workspace hide-project">
        <div className="stack">
          <div className="row">
            <button type="button" className="btn btn-small" onClick={() => stageLoad(fresh(DEMO_ACTIVITY, false))}>
              Carregar exemplo
            </button>
          </div>
          <Editor
            draft={draft}
            closed={closed}
            busy={busy}
            onChange={changeDraft}
            onClosed={setClosed}
            onLoad={stageLoad}
            onMessage={(text, kind) => setMessage({ text, kind: kind ?? "info" })}
            onSave={() =>
              void run(async () => {
                const saved = await saveActivity({ data: draft });
                const next = { ...draft, id: saved.id, revision: saved.revision };
                setDraft(next);
                setDirty(false);
                localStorage.setItem(draftStorageKey(userId), JSON.stringify({ version: 1, activity: next }));
                await reload();
                setMessage({ text: "Atividade salva no acervo.", kind: "info" });
              })
            }
          />
        </div>
        <aside className="stack">
          <section className="card">
            <h2>Seu acervo</h2>
            <label className="field">
              Pesquisar
              <input value={filter} onChange={(event) => setFilter(event.target.value)} type="search" />
            </label>
            <label className="field">
              Disciplina e turma
              <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                <option value="">Todas</option>
                {subjects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Mostrar
              <select value={archive} onChange={(event) => setArchive(event.target.value as typeof archive)}>
                <option value="active">Ativas</option>
                <option value="archived">Arquivadas</option>
                <option value="all">Todas</option>
              </select>
            </label>
            {visible.length ? (
              visible.map((item) => (
                <article key={item.id} className="library-item">
                  <h3>
                    {item.title}
                    {item.archived ? " · Arquivado" : ""}
                  </h3>
                  <p>
                    {item.subject} · {item.questionCount} questões
                  </p>
                  <div className="row">
                    {item.archived ? null : (
                      <button
                        type="button"
                        className="btn btn-small btn-coral"
                        onClick={() => setLaunch({ id: item.id, title: item.title, ranking: item.showRanking })}
                      >
                        Abrir sala
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() =>
                        void run(async () => {
                          stageLoad(await fetchActivity({ data: { id: item.id } }), false);
                        })
                      }
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() =>
                        void run(async () => {
                          stageLoad(fresh(await fetchActivity({ data: { id: item.id } }), true));
                        })
                      }
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() =>
                        void run(async () => {
                          await setActivityArchived({ data: { id: item.id, archived: !item.archived } });
                          await reload();
                        })
                      }
                    >
                      {item.archived ? "Restaurar" : "Arquivar"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() =>
                        setAsk({
                          title: `Excluir “${item.title}”?`,
                          body: "Sai do acervo. As partidas já feitas continuam no histórico.",
                          confirmLabel: "Excluir",
                          danger: true,
                          run: async () => {
                            await deleteActivity({ data: { id: item.id } });
                            await reload();
                            setMessage({ text: "Atividade excluída. Histórico preservado.", kind: "info" });
                          },
                        })
                      }
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="hint">Nenhuma atividade encontrada.</p>
            )}
          </section>
          <section className="card">
            <h2>Conta</h2>
            <p>
              {hasPassword
                ? "Guarde um código de recuperação. Não enviamos e-mail de senha."
                : "Esta entrada usa Google ou X. O código de recuperação vale para contas com senha."}
            </p>
            <p className="hint">{hasRecovery ? "Já existe um código. Gerar outro invalida o anterior." : "Nenhum código guardado ainda."}</p>
            <div className="row">
              <button
                type="button"
                className="btn btn-small"
                disabled={!hasPassword || busy}
                onClick={() =>
                  void run(async () => {
                    const code = recoveryCode();
                    await saveRecoveryCode({ data: { code } });
                    setHasRecovery(true);
                    setRecovery(code);
                  })
                }
              >
                Gerar código de recuperação
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setPhrase("");
                  setAsk({
                    title: "Apagar a conta?",
                    body: "Some o acervo, as salas e o login. Escreva APAGAR para confirmar.",
                    confirmLabel: "Apagar conta",
                    danger: true,
                    phrase: true,
                    run: async () => {
                      await deleteMyAccount({ data: { phrase: "APAGAR" } });
                      await signOut().catch(() => undefined);
                    },
                  });
                }}
              >
                Apagar conta
              </button>
            </div>
          </section>
        </aside>
      </div>

      {launch ? (
        <Dialog title={`Abrir sala: ${launch.title}`} onClose={() => setLaunch(null)}>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const ranking = formData.get("ranking") === "on";
              const chosen = Number(formData.get("seconds"));
              void run(async () => {
                if (!Number.isInteger(chosen) || (chosen !== 0 && (chosen < 10 || chosen > 600))) {
                  throw new Error("Use 0 ou de 10 a 600 segundos.");
                }
                const created = await createRoom({
                  data: { activityId: launch.id, seconds: chosen, showRanking: ranking },
                });
                setLaunch(null);
                setRoomId(created.roomId);
                await reload();
                setMessage({ text: `Sala ${created.code} aberta.`, kind: "info" });
              });
            }}
          >
            <label className="field">
              Tempo por questão, em segundos
              <input
                name="seconds"
                type="number"
                min={0}
                max={600}
                step={1}
                value={seconds}
                onChange={(event) => setSeconds(Number(event.target.value))}
                required
              />
            </label>
            <p className="hint">Use 0 para conduzir sem cronômetro, ou de 10 a 600. O tempo é conferido no servidor.</p>
            <label className="row">
              <input name="ranking" type="checkbox" defaultChecked={launch.ranking} />
              Mostrar placar para a turma depois de cada correção
            </label>
            <button className="btn btn-coral" type="submit" disabled={busy}>
              Abrir sala
            </button>
          </form>
        </Dialog>
      ) : null}

      {recovery ? (
        <Dialog title="Código de recuperação" onClose={() => setRecovery(null)}>
          <p>Anote agora. Ele não aparece de novo e substitui o código anterior.</p>
          <p className="score-xl">{recovery}</p>
          <button type="button" className="btn btn-dark" onClick={() => setRecovery(null)}>
            Já guardei
          </button>
        </Dialog>
      ) : null}

      {ask ? (
        <Dialog
          title={ask.title}
          onClose={() => {
            setAsk(null);
            setPhrase("");
          }}
        >
          <p>{ask.body}</p>
          {ask.phrase ? (
            <label className="field">
              Confirmação
              <input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" />
            </label>
          ) : null}
          <button
            type="button"
            className={ask.danger ? "btn btn-coral" : "btn btn-dark"}
            disabled={busy || (ask.phrase && phrase !== "APAGAR")}
            onClick={() =>
              void run(async () => {
                await ask.run();
                setAsk(null);
                setPhrase("");
              })
            }
          >
            {ask.confirmLabel}
          </button>
        </Dialog>
      ) : null}
    </Frame>
  );
}
