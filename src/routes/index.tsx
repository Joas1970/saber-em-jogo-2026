import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Flash, Frame, Hero } from "@/components/saber/bits";
import { Teacher } from "@/components/saber/teacher";
import { codeFromSearch, friendlyError } from "@/lib/saber/logic";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { codigo?: string } => {
    const raw = codeFromSearch(search.codigo);
    return raw.length === 6 ? { codigo: raw } : {};
  },
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codigo = Route.useSearch().codigo ?? "";
  const { user, isPending } = useCurrentUserState();
  if (/^\d{6}$/.test(codigo)) return <Navigate to="/jogar" search={{ codigo, apelido: "" }} />;
  if (!isPending && user) return <Teacher userId={user.id} />;
  return (
    <Frame online status={isPending ? "Conectando…" : user ? "Conta pronta" : "Pronto para entrar"}>
      {isPending ? <div className="skeleton" /> : null}
      {!isPending && !user ? (
        <>
          <Hero />
          <section className="grid-2 entry-grid">
            <article className="card entry-card">
              <p className="index-label"><span>01</span> Professor</p>
              <h2>Prepare uma partida</h2>
              <p>Crie quizzes e abra uma sala para sua turma.</p>
              <form className="stack" onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setBusy(true); setError("");
                void authClient.signIn.email({ email: String(data.get("email") ?? "").trim(), password: String(data.get("password") ?? "") })
                  .then(async (result) => { if (result.error) throw new Error(result.error.message || "E-mail ou senha não conferem."); await navigate({ to: "/" }); })
                  .catch((err) => setError(friendlyError(err))).finally(() => setBusy(false));
              }}>
                <label className="field">E-mail<input name="email" type="email" autoComplete="email" placeholder="Seu e-mail" required /></label>
                <label className="field">Senha<input name="password" type="password" autoComplete="current-password" placeholder="Sua senha" minLength={8} required /></label>
                <button className="btn btn-dark" disabled={busy}>{busy ? "Entrando…" : "Entrar como professor"}</button>
              </form>
              <Flash kind="error" text={error} />
              <Link to="/login" className="entry-link">Criar conta ou recuperar acesso</Link>
            </article>
            <article className="card entry-card">
              <p className="index-label"><span>02</span> Estudante</p>
              <h2>Entre no jogo</h2>
              <p>Use o código compartilhado pelo seu professor.</p>
              <form className="stack" onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void navigate({ to: "/jogar", search: { codigo: String(data.get("code") ?? ""), apelido: String(data.get("nickname") ?? "").trim() } });
              }}>
                <label className="field">Seu nome<input name="nickname" autoComplete="nickname" placeholder="Como podemos chamar você?" maxLength={32} required /></label>
                <label className="field">Código da sala<input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Digite o código" pattern="[0-9]{6}" maxLength={6} required title="Digite os seis números do código da sala" /></label>
                <button className="btn btn-coral">Entrar na partida</button>
              </form>
              <p className="hint entry-link">Não precisa de e-mail nem de conta.</p>
            </article>
          </section>
        </>
      ) : null}
    </Frame>
  );
}
