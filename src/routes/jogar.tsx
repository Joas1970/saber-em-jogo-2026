import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Frame, Flash, useNow } from "@/components/saber/bits";
import { PlayView } from "@/components/saber/play-view";
import { fetchPlay, joinRoom, submitAnswer } from "@/lib/saber/api";
import { codeFromSearch, friendlyError, loadSeat, saveSeat, type PlayState } from "@/lib/saber/logic";

export const Route = createFileRoute("/jogar")({
  validateSearch: (search: Record<string, unknown>) => {
    const nameRaw = typeof search.apelido === "string" ? search.apelido : "";
    return {
      codigo: codeFromSearch(search.codigo),
      apelido: nameRaw.slice(0, 32),
    };
  },
  component: PlayPage,
});

function PlayPage() {
  const { codigo, apelido } = Route.useSearch();
  const [nickname, setNickname] = useState(apelido);
  const [code, setCode] = useState(codigo);
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<PlayState | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "info" | "error" }>({ text: "", kind: "info" });
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const now = useNow(Boolean(state && state.status === "active" && state.question && !state.question.revealed));

  useEffect(() => {
    const seat = loadSeat();
    if (seat) setToken(seat.token);
  }, []);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    const tick = async () => {
      try {
        const next = await fetchPlay({ data: { token } });
        if (stop) return;
        setState(next);
        setOnline(true);
      } catch (error) {
        if (stop) return;
        setOnline(false);
        setMessage({ text: friendlyError(error), kind: "error" });
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [token]);

  const join = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const seat = loadSeat();
      const joined = await joinRoom({
        data: {
          code,
          nickname,
          token: seat && seat.code === code.replace(/\D/g, "") ? seat.token : "",
        },
      });
      saveSeat({ token: joined.token, roomId: joined.roomId, code: joined.code, nickname: joined.nickname });
      setToken(joined.token);
      setMessage({
        text: joined.reclaimed ? "Este aparelho retomou o lugar. O outro foi desconectado." : "",
        kind: "info",
      });
    } catch (error) {
      setMessage({ text: friendlyError(error), kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    saveSeat(null);
    setToken(null);
    setState(null);
  };

  return (
    <Frame online={online} status={state ? `Sala ${state.code}` : online ? "Pronto para entrar" : "Sem conexão. Tentando de novo"}>
      <Flash kind={message.kind} text={message.text} />
      {state && token ? (
        <PlayView
          state={state}
          now={now}
          busy={busy}
          onLeave={leave}
          onAnswer={(choice) => {
            if (!token) return;
            setBusy(true);
            void submitAnswer({ data: { token, choice } })
              .then((next) => {
                setState(next);
                setOnline(true);
              })
              .catch((error) => setMessage({ text: friendlyError(error), kind: "error" }))
              .finally(() => setBusy(false));
          }}
        />
      ) : (
        <section className="card stage">
          <p className="kicker">Estudante</p>
          <h1>Entre no jogo</h1>
          <p>Digite o código que o professor compartilhou e escolha como quer aparecer na sala.</p>
          <form className="stack" onSubmit={(event) => void join(event)}>
            <label className="field">
              Seu nome
              <input
                name="nickname"
                maxLength={32}
                autoComplete="nickname"
                placeholder="Como podemos chamar você?"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                required
              />
            </label>
            <label className="field">
              Código da sala
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="code-input"
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </label>
            <button className="btn btn-coral" type="submit" disabled={busy}>
              Entrar na sala
            </button>
          </form>
          <p className="hint">Se você já entrou neste aparelho com o mesmo nome, a sala te reconhece. Não pedimos e-mail.</p>
        </section>
      )}
    </Frame>
  );
}
