import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resetWithRecovery } from "@/lib/saber/api";
import { friendlyError } from "@/lib/saber/logic";
import { Flash, Frame } from "@/components/saber/bits";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"enter" | "reset">("enter");
  const [message, setMessage] = useState<{ text: string; kind: "info" | "error" }>({ text: "", kind: "info" });
  const [busy, setBusy] = useState(false);

  const submitEmail = async (form: HTMLFormElement, intent: "login" | "signup") => {
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim() || email.split("@")[0] || "Professor";
    if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    if (intent === "signup") {
      const result = await authClient.signUp.email({ email, password, name });
      if (result.error) throw new Error(result.error.message || "Não foi possível criar a conta.");
    } else {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "E-mail ou senha não conferem.");
    }
    await navigate({ to: "/" });
  };

  return (
    <Frame online status={isPending ? "Conectando…" : "Entrada do professor"}>
      <section className="card stage">
        <p className="kicker">Professor</p>
        <h1>{user ? "Você já entrou" : "Prepare a partida"}</h1>
        {user ? (
          <Link to="/" className="btn btn-dark">
            Ir para o acervo
          </Link>
        ) : (
          <>
            <p>Use um e-mail e uma senha, ou continue com Google ou X. A turma não cria conta.</p>
            <div className="row">
              {GROK_PROVIDERS.map((provider) => (
                <button
                  key={provider.providerId}
                  type="button"
                  className="btn"
                  onClick={() => void signIn(provider.providerId, { callbackURL: "/" })}
                >
                  Continuar com {provider.label}
                </button>
              ))}
            </div>
            {mode === "enter" ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
                  setBusy(true);
                  void submitEmail(event.currentTarget, intent === "signup" ? "signup" : "login")
                    .catch((error) => setMessage({ text: friendlyError(error), kind: "error" }))
                    .finally(() => setBusy(false));
                }}
              >
                <label className="field">
                  Nome, se for criar conta
                  <input name="name" autoComplete="name" maxLength={80} placeholder="Como a turma vê você" />
                </label>
                <label className="field">
                  E-mail
                  <input name="email" type="email" autoComplete="email" required />
                </label>
                <label className="field">
                  Senha
                  <input name="password" type="password" autoComplete="current-password" minLength={8} required />
                </label>
                <p className="hint">Mínimo de 8 caracteres. Depois, gere um código de recuperação no acervo. Não enviamos e-mail.</p>
                <div className="row">
                  <button className="btn btn-dark" type="submit" name="intent" value="login" disabled={busy}>
                    Entrar
                  </button>
                  <button className="btn" type="submit" name="intent" value="signup" disabled={busy}>
                    Criar conta
                  </button>
                </div>
              </form>
            ) : (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  setBusy(true);
                  void resetWithRecovery({
                    data: {
                      email: String(data.get("email") ?? ""),
                      code: String(data.get("code") ?? ""),
                      password: String(data.get("password") ?? ""),
                    },
                  })
                    .then(() => {
                      setMode("enter");
                      setMessage({ text: "Senha atualizada. Entre com a nova senha.", kind: "info" });
                    })
                    .catch((error) => setMessage({ text: friendlyError(error), kind: "error" }))
                    .finally(() => setBusy(false));
                }}
              >
                <label className="field">
                  E-mail
                  <input name="email" type="email" autoComplete="email" required />
                </label>
                <label className="field">
                  Código de recuperação
                  <input name="code" autoComplete="off" maxLength={10} required />
                </label>
                <label className="field">
                  Nova senha
                  <input name="password" type="password" autoComplete="new-password" minLength={8} required />
                </label>
                <button className="btn btn-dark" type="submit" disabled={busy}>
                  Atualizar senha
                </button>
              </form>
            )}
            <button type="button" className="btn btn-small" onClick={() => setMode(mode === "enter" ? "reset" : "enter")}>
              {mode === "enter" ? "Esqueci minha senha" : "Voltar ao login"}
            </button>
            <Flash kind={message.kind} text={message.text} />
          </>
        )}
      </section>
    </Frame>
  );
}
