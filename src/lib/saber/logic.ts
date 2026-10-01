export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

export type DraftQuestion = {
  key: string;
  text: string;
  context: string;
  explanation: string;
  options: string[];
  correct: number;
  imageData: string | null;
  imageAlt: string;
};

export type DraftActivity = {
  id?: string;
  revision?: number;
  title: string;
  subject: string;
  showRanking: boolean;
  questions: DraftQuestion[];
};

export type SnapQuestion = {
  text: string;
  context: string;
  explanation: string;
  options: string[];
  correct: number;
  imageData: string | null;
  imageAlt: string;
};

export type Snapshot = {
  title: string;
  subject: string;
  showRanking: boolean;
  questions: SnapQuestion[];
};

export type PlayQuestion = {
  text: string;
  context: string;
  options: string[];
  imageData: string | null;
  imageAlt: string;
  picked: number | null;
  revealed: boolean;
  correctChoice: number | null;
  explanation: string | null;
  wasCorrect: boolean | null;
  points: number | null;
};

export type RankRow = {
  place: number;
  nickname: string;
  score: number;
  removed: boolean;
};

export type PlayState = {
  roomId: string;
  code: string;
  title: string;
  subject: string;
  status: "waiting" | "active" | "finished";
  questionIndex: number;
  questionCount: number;
  deadlineMs: number | null;
  serverNowMs: number;
  showRanking: boolean;
  me: { nickname: string; score: number; removed: boolean };
  counts: { joined: number; answered: number };
  question: PlayQuestion | null;
  review: Array<PlayQuestion & { index: number }> | null;
  ranking: RankRow[] | null;
};

export type HostPlayer = {
  id: string;
  nickname: string;
  score: number;
  removed: boolean;
  answered: boolean;
};

export type ReportRow = {
  index: number;
  text: string;
  roster: number;
  answered: number;
  correct: number;
  wrong: number;
  missing: number;
  percentAnswered: number | null;
  percentRoster: number | null;
};

export type HostQuestion = {
  text: string;
  context: string;
  options: string[];
  imageData: string | null;
  imageAlt: string;
  correct: number;
  explanation: string;
  counts: number[];
};

export type HostState = {
  roomId: string;
  code: string;
  title: string;
  subject: string;
  status: "waiting" | "active" | "finished";
  questionIndex: number;
  questionCount: number;
  seconds: number;
  deadlineMs: number | null;
  serverNowMs: number;
  showRanking: boolean;
  revealed: boolean;
  question: HostQuestion | null;
  players: HostPlayer[];
  ranking: RankRow[];
  report: ReportRow[];
};

export const LETTERS = ["A", "B", "C", "D", "E"] as const;
export const MAX_QUESTIONS = 50;
export const POINTS_BASE = 100;
export const POINTS_SPEED = 50;

export const SCORE_RULE =
  "Acerto vale 100 pontos. Com cronômetro, entram até 50 pontos extras pelo tempo que ainda restava. Erro vale zero. Empate no placar favorece quem fez o último acerto antes.";

export function emptyQuestion(): DraftQuestion {
  return {
    key: crypto.randomUUID(),
    text: "",
    context: "",
    explanation: "",
    options: ["", "", ""],
    correct: 0,
    imageData: null,
    imageAlt: "",
  };
}

export function emptyDraft(): DraftActivity {
  return {
    title: "",
    subject: "",
    showRanking: true,
    questions: [emptyQuestion()],
  };
}

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const clean = raw.replace(/^GameError:\s*/, "").trim();
  if (/unauthorized/i.test(clean)) return "Entre como professor para continuar.";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(clean)) {
    return "Sem conexão. Tente de novo.";
  }
  if (
    /select |insert |update |delete from|duplicate key|syntax error|relation "|postgres|sqlstate|failed query/i.test(
      clean,
    )
  ) {
    return "Não foi possível agora. Tente de novo.";
  }
  if (clean && clean.length <= 220 && !clean.includes("\n")) return clean;
  return "Não foi possível agora. Tente de novo.";
}

function clip(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== "string") throw new GameError(`${label}: escreva um texto.`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new GameError(
      min === 0
        ? `${label}: use no máximo ${max} caracteres.`
        : `${label}: use de ${min} a ${max} caracteres.`,
    );
  }
  return text;
}

export function normalizeActivity(input: DraftActivity): Snapshot {
  const title = clip(input.title, 1, 100, "Título");
  const subject = clip(input.subject, 1, 80, "Disciplina e turma");
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > MAX_QUESTIONS) {
    throw new GameError(`O jogo precisa ter de 1 a ${MAX_QUESTIONS} questões.`);
  }
  const questions = input.questions.map((question, index) => {
    const label = `Questão ${index + 1}`;
    const text = clip(question.text, 1, 1000, label);
    const context = clip(question.context ?? "", 0, 1200, `${label}, texto de apoio`);
    const explanation = clip(question.explanation ?? "", 0, 2000, `${label}, explicação`);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 5) {
      throw new GameError(`${label}: use de 2 a 5 alternativas.`);
    }
    const options = question.options.map((option, optionIndex) =>
      clip(option, 1, 300, `${label}, alternativa ${LETTERS[optionIndex] ?? optionIndex + 1}`),
    );
    if (new Set(options.map((option) => option.toLocaleLowerCase("pt-BR"))).size !== options.length) {
      throw new GameError(`${label}: as alternativas precisam ser diferentes.`);
    }
    if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct >= options.length) {
      throw new GameError(`${label}: escolha a resposta correta.`);
    }
    let imageData: string | null = null;
    let imageAlt = "";
    if (question.imageData) {
      if (
        typeof question.imageData !== "string" ||
        !/^data:image\/(webp|jpeg|png);base64,[a-z0-9+/=\s]+$/i.test(question.imageData) ||
        question.imageData.length > 280_000
      ) {
        throw new GameError(`${label}: envie a imagem de novo, menor.`);
      }
      imageData = question.imageData;
      imageAlt = clip(question.imageAlt, 1, 300, `${label}, descrição da imagem`);
    }
    return { text, context, explanation, options, correct: question.correct, imageData, imageAlt };
  });
  return {
    title,
    subject,
    showRanking: Boolean(input.showRanking),
    questions,
  };
}

export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleOrder(seedKey: string, length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  const random = mulberry32(hashSeed(seedKey));
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i];
    order[i] = order[j] ?? i;
    order[j] = swap ?? j;
  }
  return order;
}

export function presentQuestion(
  question: SnapQuestion,
  order: number[],
  pickedCanonical: number | null,
  revealed: boolean,
  points: number | null,
): PlayQuestion {
  const picked = pickedCanonical == null ? null : order.indexOf(pickedCanonical);
  const view: PlayQuestion = {
    text: question.text,
    context: question.context,
    options: order.map((index) => question.options[index] ?? ""),
    imageData: question.imageData,
    imageAlt: question.imageAlt,
    picked: picked != null && picked >= 0 ? picked : null,
    revealed,
    correctChoice: null,
    explanation: null,
    wasCorrect: null,
    points: null,
  };
  if (!revealed) return view;
  return {
    ...view,
    correctChoice: order.indexOf(question.correct),
    explanation: question.explanation,
    wasCorrect: pickedCanonical != null ? pickedCanonical === question.correct : null,
    points: points ?? 0,
  };
}

export function scoreAnswer(correct: boolean, seconds: number, remainSeconds: number | null): number {
  if (!correct) return 0;
  if (!seconds || remainSeconds == null) return POINTS_BASE;
  const ratio = Math.min(1, Math.max(0, remainSeconds / seconds));
  return POINTS_BASE + Math.round(POINTS_SPEED * ratio);
}

export function rankPlayers(
  players: Array<{
    nickname: string;
    score: number;
    removed: boolean;
    joinedAt: number;
    lastCorrectAt: number | null;
  }>,
): RankRow[] {
  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.lastCorrectAt ?? Number.POSITIVE_INFINITY;
    const bTime = b.lastCorrectAt ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.nickname.localeCompare(b.nickname, "pt-BR");
  });
  return sorted.map((player, index) => ({
    place: index + 1,
    nickname: player.nickname,
    score: player.score,
    removed: player.removed,
  }));
}

export function buildReport(
  questions: SnapQuestion[],
  rosterIds: Set<string>,
  answers: Array<{ participantId: string; questionIndex: number; isCorrect: boolean }>,
): ReportRow[] {
  return questions.map((question, index) => {
    const rows = answers.filter((answer) => answer.questionIndex === index && rosterIds.has(answer.participantId));
    const correct = rows.filter((answer) => answer.isCorrect).length;
    const answered = rows.length;
    const roster = rosterIds.size;
    return {
      index: index + 1,
      text: question.text,
      roster,
      answered,
      correct,
      wrong: answered - correct,
      missing: Math.max(0, roster - answered),
      percentAnswered: answered ? Math.round((correct / answered) * 100) : null,
      percentRoster: roster ? Math.round((correct / roster) * 100) : null,
    };
  });
}

export function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export function downloadText(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportCsv(state: HostState): string {
  return toCsv([
    ["Jogo", state.title],
    ["Sala", state.code],
    ["Regra", SCORE_RULE],
    [],
    [
      "Questão",
      "Enunciado",
      "Turma",
      "Respostas",
      "Acertos",
      "Erros",
      "Sem resposta",
      "Acerto entre respostas %",
      "Acerto da turma %",
    ],
    ...state.report.map((row) => [
      row.index,
      row.text,
      row.roster,
      row.answered,
      row.correct,
      row.wrong,
      row.missing,
      row.percentAnswered ?? "",
      row.percentRoster ?? "",
    ]),
    [],
    ["Participante", "Pontos", "Situação", "Lugar"],
    ...state.ranking.map((row) => [
      row.nickname,
      row.score,
      row.removed ? "Removido" : "Participante",
      row.place,
    ]),
  ]);
}

export function activityToJson(draft: DraftActivity): string {
  const snapshot = normalizeActivity(draft);
  return JSON.stringify(
    {
      title: snapshot.title,
      subject: snapshot.subject,
      showRanking: snapshot.showRanking,
      questions: snapshot.questions.map((question) => ({
        text: question.text,
        context: question.context,
        explanation: question.explanation,
        options: question.options,
        correct: question.correct,
        imageData: question.imageData,
        imageAlt: question.imageAlt,
      })),
    },
    null,
    2,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GameError("O arquivo não parece uma atividade.");
  }
  return value as Record<string, unknown>;
}

export function activityFromJson(raw: string): DraftActivity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GameError("Não foi possível ler o JSON.");
  }
  const data = asRecord(parsed);
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const draft: DraftActivity = {
    title: String(data.title ?? ""),
    subject: String(data.subject ?? ""),
    showRanking: data.showRanking !== false,
    questions: questions.map((item) => {
      const question = asRecord(item);
      const options = Array.isArray(question.options) ? question.options.map((option) => String(option)) : [];
      return {
        key: crypto.randomUUID(),
        text: String(question.text ?? ""),
        context: String(question.context ?? ""),
        explanation: String(question.explanation ?? ""),
        options,
        correct: Number(question.correct ?? 0),
        imageData: typeof question.imageData === "string" ? question.imageData : null,
        imageAlt: String(question.imageAlt ?? ""),
      };
    }),
  };
  normalizeActivity(draft);
  return draft;
}

function splitCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const headerLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((items) => items.some((item) => item.length > 0));
}

function headerKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function activityFromCsv(raw: string): DraftActivity {
  const table = splitCsv(raw);
  if (table.length < 2) throw new GameError("A planilha precisa de um cabeçalho e ao menos uma questão.");
  const headers = (table[0] ?? []).map(headerKey);
  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const textAt = indexOf("enunciado", "pergunta", "questao", "text");
  const a = indexOf("alternativa_a", "a", "opcao_a");
  const b = indexOf("alternativa_b", "b", "opcao_b");
  if (textAt < 0 || a < 0 || b < 0) {
    throw new GameError("Use as colunas enunciado, alternativa_a, alternativa_b e correta.");
  }
  const c = indexOf("alternativa_c", "c");
  const d = indexOf("alternativa_d", "d");
  const e = indexOf("alternativa_e", "e");
  const correctAt = indexOf("correta", "gabarito", "correct");
  const contextAt = indexOf("contexto", "texto_de_apoio", "apoio");
  const explanationAt = indexOf("explicacao", "explanation");
  const titleAt = indexOf("titulo", "title");
  const subjectAt = indexOf("disciplina", "turma", "subject");
  if (correctAt < 0) throw new GameError("Falta a coluna correta (A, B, C, D ou E).");
  const questions: DraftQuestion[] = [];
  let title = "";
  let subject = "";
  for (const row of table.slice(1)) {
    const cell = (index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");
    if (!title) title = cell(titleAt);
    if (!subject) subject = cell(subjectAt);
    const options = [cell(a), cell(b), cell(c), cell(d), cell(e)].filter((option, index) => index < 2 || option);
    const mark = cell(correctAt).toLocaleUpperCase("pt-BR");
    const letter = LETTERS.indexOf(mark as (typeof LETTERS)[number]);
    const numeric = /^[1-5]$/.test(mark) ? Number(mark) - 1 : letter;
    questions.push({
      key: crypto.randomUUID(),
      text: cell(textAt),
      context: cell(contextAt),
      explanation: cell(explanationAt),
      options,
      correct: numeric,
      imageData: null,
      imageAlt: "",
    });
  }
  const draft: DraftActivity = {
    title: title || "Atividade importada",
    subject: subject || "Importada",
    showRanking: true,
    questions,
  };
  normalizeActivity(draft);
  return draft;
}

export const CSV_TEMPLATE = toCsv([
  ["titulo", "disciplina", "contexto", "enunciado", "alternativa_a", "alternativa_b", "alternativa_c", "correta", "explicacao"],
  [
    "Maria Leopoldina e a Independência",
    "História · 8º ano",
    "Texto de apoio opcional desta questão.",
    "Quem participou das decisões políticas mencionadas no texto?",
    "Maria Leopoldina",
    "Tiradentes",
    "Princesa Isabel",
    "A",
    "O texto fala da atuação de Leopoldina.",
  ],
]);

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function recoveryCode(): string {
  const values = new Uint8Array(10);
  crypto.getRandomValues(values);
  return [...values].map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
}

export async function compressImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new GameError("Use uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > 10 * 1024 * 1024) throw new GameError("A imagem original deve ter até 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) {
      throw new GameError("Use uma imagem de até 40 megapixels.");
    }
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new GameError("Não foi possível ler a imagem.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
    if (!blob || blob.size > 180 * 1024) {
      throw new GameError("Não foi possível reduzir a imagem para 180 KB. Escolha uma menor.");
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new GameError("Não foi possível ler a imagem."));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

export function draftStorageKey(userId: string) {
  return `saber-em-jogo-v-grok:draft:${userId}`;
}

export function codeFromSearch(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1_000_000) {
    return String(value).padStart(6, "0");
  }
  if (typeof value === "string") return value.replace(/\D/g, "").slice(0, 6);
  return "";
}

export const SEAT_KEY = "saber-em-jogo-v-grok:seat";

export type Seat = { token: string; roomId: string; code: string; nickname: string };

export function loadSeat(): Seat | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEAT_KEY) || "null") as Seat | null;
    if (!parsed?.token || !parsed.roomId || !/^\d{6}$/.test(parsed.code)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSeat(seat: Seat | null) {
  if (!seat) localStorage.removeItem(SEAT_KEY);
  else localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
}
