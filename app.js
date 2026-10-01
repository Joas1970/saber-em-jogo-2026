const createModal = document.querySelector("#create-modal");
const liveModal = document.querySelector("#live-modal");
const joinModal = document.querySelector("#join-modal");
const toast = document.querySelector("#toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

document.querySelectorAll("[data-open-create]").forEach((button) => {
  button.addEventListener("click", () => createModal.showModal());
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

document.querySelector("#create-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = form.get("name").trim();
  const subject = form.get("subject");
  const grade = form.get("grade").trim() || "Sem turma";
  const card = document.createElement("article");
  card.className = "activity-card";
  const art = document.createElement("div");
  art.className = "activity-art art-created";
  const symbol = document.createElement("span");
  symbol.className = "art-symbol";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = "✦";
  const tag = document.createElement("span");
  tag.className = "subject-tag";
  tag.textContent = subject.toLocaleUpperCase("pt-BR");
  art.append(symbol, tag);

  const details = document.createElement("div");
  details.className = "activity-details";
  const meta = document.createElement("div");
  meta.className = "activity-meta";
  const metaText = document.createElement("span");
  metaText.textContent = `${grade} · Nova atividade`;
  meta.append(metaText);
  const title = document.createElement("h3");
  title.textContent = name;
  const footer = document.createElement("div");
  footer.className = "activity-footer";
  const status = document.createElement("span");
  status.className = "played";
  status.textContent = "Ainda não foi jogada";
  const play = document.createElement("button");
  play.className = "play-button";
  play.type = "button";
  play.textContent = "Preparar →";
  play.addEventListener("click", () => showToast(`"${name}" está pronta para receber perguntas.`));
  footer.append(status, play);
  details.append(meta, title, footer);
  card.append(art, details);
  document.querySelector("#activity-grid").prepend(card);
  const count = document.querySelector("#activity-count");
  count.textContent = Number(count.textContent) + 1;
  event.currentTarget.reset();
  createModal.close();
  showToast("Atividade criada! Agora é só adicionar suas perguntas.");
});

document.querySelector("#join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#join-code");
  const feedback = document.querySelector("#join-feedback");
  const code = input.value.trim().toLocaleUpperCase("pt-BR");
  input.value = code;
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    feedback.textContent = "Digite um código válido com 6 letras ou números.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  if (code === "ASTRO5") {
    document.querySelector("#join-welcome").hidden = false;
    document.querySelector("#join-question").hidden = true;
    document.querySelector("#student-form").reset();
    joinModal.showModal();
    return;
  }
  input.removeAttribute("aria-invalid");
  feedback.textContent = "Procurando sua partida...";
  window.setTimeout(() => {
    feedback.textContent = `Não encontramos uma partida ativa com o código ${code}. Confira com seu professor.`;
  }, 650);
});

document.querySelector("#student-form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#join-welcome").hidden = true;
  document.querySelector("#join-question").hidden = false;
  const feedback = document.querySelector("#answer-feedback");
  feedback.textContent = "";
  feedback.classList.remove("answer-feedback-wrong");
  document.querySelectorAll("[data-answer]").forEach((answer) => {
    answer.disabled = false;
    answer.classList.remove("answer-correct", "answer-wrong");
  });
});

document.querySelectorAll("[data-answer]").forEach((answer) => {
  answer.addEventListener("click", () => {
    document.querySelectorAll("[data-answer]").forEach((option) => {
      option.disabled = true;
      if (option.dataset.answer === "correct") option.classList.add("answer-correct");
    });
    const feedback = document.querySelector("#answer-feedback");
    if (answer.dataset.answer === "correct") {
      feedback.textContent = "Isso mesmo! Marte é o Planeta Vermelho. +100 pontos";
    } else {
      answer.classList.add("answer-wrong");
      feedback.textContent = "Quase! A resposta certa é Marte. Continue tentando!";
      feedback.classList.add("answer-feedback-wrong");
    }
  });
});

document.querySelector("#join-code").addEventListener("input", (event) => {
  event.currentTarget.value = event.currentTarget.value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLocaleUpperCase("pt-BR");
  document.querySelector("#join-feedback").textContent = "";
  event.currentTarget.removeAttribute("aria-invalid");
});

document.querySelectorAll("[data-live-details]").forEach((button) => {
  button.addEventListener("click", () => liveModal.showModal());
});

document.querySelector("[data-copy-code]").addEventListener("click", async (event) => {
  try {
    await navigator.clipboard.writeText("ASTRO5");
    event.currentTarget.textContent = "Copiado!";
  } catch {
    event.currentTarget.textContent = "ASTRO5";
  }
  window.setTimeout(() => { event.currentTarget.textContent = "Copiar código"; }, 1800);
});

document.querySelectorAll("[data-play]").forEach((button) => {
  button.addEventListener("click", () => showToast(`Preparando a partida "${button.dataset.play}"...`));
});

document.querySelectorAll("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.toast));
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});
