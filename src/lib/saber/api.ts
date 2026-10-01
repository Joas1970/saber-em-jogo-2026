import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  GameError,
  buildReport,
  normalizeActivity,
  presentQuestion,
  randomToken,
  rankPlayers,
  scoreAnswer,
  sha256Hex,
  shuffleOrder,
  type DraftActivity,
  type HostState,
  type PlayState,
  type RankRow,
  type Snapshot,
} from "./logic";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

async function db(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function parseSnapshot(raw: unknown): Snapshot {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return value as Snapshot;
}

function statusOf(value: unknown): PlayState["status"] {
  if (value === "active" || value === "finished") return value;
  return "waiting";
}

async function loadOwnedRoom(sql: Sql, roomId: string, userId: string) {
  const rows = await sql<Record<string, unknown>>`
    select id, user_id, code, title, subject, status, question_index, revealed,
      seconds_per_question, show_ranking, snapshot_json,
      (extract(epoch from deadline) * 1000) as deadline_ms,
      (extract(epoch from now()) * 1000) as now_ms,
      (deadline is null or deadline > now()) as accepting
    from rooms
    where id = ${roomId} and user_id = ${userId}
  `;
  const room = rows[0];
  if (!room) throw new GameError("Sala não encontrada.");
  return room;
}

async function hostPayload(sql: Sql, room: Record<string, unknown>): Promise<HostState> {
  const snapshot = parseSnapshot(room.snapshot_json);
  const roomId = String(room.id);
  const index = num(room.question_index);
  const players = await sql<Record<string, unknown>>`
    select p.id, p.nickname, p.score, p.removed_at,
      (extract(epoch from p.joined_at) * 1000) as joined_ms,
      (extract(epoch from (
        select max(a.answered_at) from answers a
        where a.participant_id = p.id and a.is_correct
      )) * 1000) as last_correct_ms
    from participants p
    where p.room_id = ${roomId}
    order by p.joined_at, p.id
  `;
  const answers = await sql<Record<string, unknown>>`
    select participant_id, question_index, canonical_option, is_correct, points
    from answers
    where room_id = ${roomId}
  `;
  const question = snapshot.questions[index] ?? null;
  const activeIds = new Set(
    players.filter((player) => !player.removed_at).map((player) => String(player.id)),
  );
  const currentAnswers = answers.filter(
    (answer) => num(answer.question_index) === index && activeIds.has(String(answer.participant_id)),
  );
  const counts = question ? question.options.map(() => 0) : [];
  for (const answer of currentAnswers) {
    const option = num(answer.canonical_option);
    if (counts[option] != null) counts[option] += 1;
  }
  const answeredIds = new Set(currentAnswers.map((answer) => String(answer.participant_id)));
  const ranking = rankPlayers(
    players.map((player) => ({
      nickname: String(player.nickname),
      score: num(player.score),
      removed: Boolean(player.removed_at),
      joinedAt: num(player.joined_ms),
      lastCorrectAt: player.last_correct_ms == null ? null : num(player.last_correct_ms),
    })),
  );
  return {
    roomId,
    code: String(room.code),
    title: snapshot.title,
    subject: snapshot.subject,
    status: statusOf(room.status),
    questionIndex: index,
    questionCount: snapshot.questions.length,
    seconds: num(room.seconds_per_question),
    deadlineMs: room.deadline_ms == null ? null : num(room.deadline_ms),
    serverNowMs: num(room.now_ms),
    showRanking: asBool(room.show_ranking),
    revealed: asBool(room.revealed) || statusOf(room.status) === "finished",
    question: question
      ? {
          text: question.text,
          context: question.context,
          options: question.options,
          imageData: question.imageData,
          imageAlt: question.imageAlt,
          correct: question.correct,
          explanation: question.explanation,
          counts,
        }
      : null,
    players: players.map((player) => ({
      id: String(player.id),
      nickname: String(player.nickname),
      score: num(player.score),
      removed: Boolean(player.removed_at),
      answered: answeredIds.has(String(player.id)) && activeIds.has(String(player.id)),
    })),
    ranking,
    report: buildReport(
      snapshot.questions,
      activeIds,
      answers
        .filter((answer) => activeIds.has(String(answer.participant_id)))
        .map((answer) => ({
          participantId: String(answer.participant_id),
          questionIndex: num(answer.question_index),
          isCorrect: asBool(answer.is_correct),
        })),
    ),
  };
}

async function playPayload(sql: Sql, tokenHash: string): Promise<PlayState> {
  const seats = await sql<Record<string, unknown>>`
    select id, room_id, nickname, score, removed_at
    from participants
    where secret_hash = ${tokenHash}
  `;
  const seat = seats[0];
  if (!seat) throw new GameError("Sua entrada nesta sala expirou. Entre de novo com o código.");
  const rooms = await sql<Record<string, unknown>>`
    select id, code, status, question_index, revealed, show_ranking, snapshot_json,
      (extract(epoch from deadline) * 1000) as deadline_ms,
      (extract(epoch from now()) * 1000) as now_ms
    from rooms
    where id = ${String(seat.room_id)}
  `;
  const room = rooms[0];
  if (!room) throw new GameError("Essa sala não está mais disponível.");
  const snapshot = parseSnapshot(room.snapshot_json);
  const roomId = String(room.id);
  const participantId = String(seat.id);
  const status = statusOf(room.status);
  const finished = status === "finished";
  const revealed = asBool(room.revealed) || finished;
  const index = num(room.question_index);
  const mine = await sql<Record<string, unknown>>`
    select question_index, canonical_option, is_correct, points
    from answers
    where participant_id = ${participantId}
  `;
  const counts = await sql<Record<string, unknown>>`
    select
      (select count(*) from participants where room_id = ${roomId} and removed_at is null) as joined,
      (select count(*) from answers a
        join participants p on p.id = a.participant_id
        where a.room_id = ${roomId} and a.question_index = ${index} and p.removed_at is null) as answered
  `;
  const present = (questionIndex: number, showAnswer: boolean) => {
    const question = snapshot.questions[questionIndex];
    if (!question) return null;
    const answer = mine.find((row) => num(row.question_index) === questionIndex);
    const order = shuffleOrder(`${roomId}:${participantId}:${questionIndex}`, question.options.length);
    return presentQuestion(
      question,
      order,
      answer ? num(answer.canonical_option) : null,
      showAnswer,
      answer ? num(answer.points) : null,
    );
  };
  const removed = Boolean(seat.removed_at);
  const ranking = await rankingFor(sql, roomId);
  const showRanking = asBool(room.show_ranking) && (revealed || finished);
  return {
    roomId,
    code: String(room.code),
    title: snapshot.title,
    subject: snapshot.subject,
    status,
    questionIndex: index,
    questionCount: snapshot.questions.length,
    deadlineMs: room.deadline_ms == null ? null : num(room.deadline_ms),
    serverNowMs: num(room.now_ms),
    showRanking: asBool(room.show_ranking),
    me: { nickname: String(seat.nickname), score: num(seat.score), removed },
    counts: { joined: num(counts[0]?.joined), answered: num(counts[0]?.answered) },
    question: status === "active" && !removed ? present(index, revealed) : null,
    review:
      status === "finished" && !removed
        ? snapshot.questions.map((_, questionIndex) => ({
            index: questionIndex,
            ...(present(questionIndex, true) as NonNullable<ReturnType<typeof present>>),
          }))
        : null,
    ranking: showRanking && !removed ? ranking : null,
  };
}

async function rankingFor(sql: Sql, roomId: string): Promise<RankRow[]> {
  const players = await sql<Record<string, unknown>>`
    select nickname, score, removed_at,
      (extract(epoch from joined_at) * 1000) as joined_ms,
      (extract(epoch from (
        select max(answered_at) from answers a
        where a.participant_id = participants.id and a.is_correct
      )) * 1000) as last_correct_ms
    from participants
    where room_id = ${roomId}
  `;
  return rankPlayers(
    players.map((player) => ({
      nickname: String(player.nickname),
      score: num(player.score),
      removed: Boolean(player.removed_at),
      joinedAt: num(player.joined_ms),
      lastCorrectAt: player.last_correct_ms == null ? null : num(player.last_correct_ms),
    })),
  );
}

function requireNickname(value: unknown): string {
  if (typeof value !== "string") throw new GameError("Diga como quer aparecer na sala.");
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 32) {
    throw new GameError("O nome precisa ter de 2 a 32 caracteres.");
  }
  if (/[\u0000-\u001f]/.test(nickname)) throw new GameError("Esse nome não pode ser usado.");
  return nickname;
}

export const fetchLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const activities = await sql<Record<string, unknown>>`
      select a.id, a.title, a.subject, a.archived, a.revision, a.show_ranking,
        a.updated_at::text as updated_at,
        (select count(*) from questions q where q.activity_id = a.id) as question_count
      from activities a
      where a.user_id = ${context.userId}
      order by a.updated_at desc, a.id
    `;
    const rooms = await sql<Record<string, unknown>>`
      select id, code, status, title, created_at::text as created_at
      from rooms
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `;
    return {
      activities: activities.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        subject: String(row.subject),
        archived: asBool(row.archived),
        revision: num(row.revision),
        showRanking: asBool(row.show_ranking),
        questionCount: num(row.question_count),
        updatedAt: String(row.updated_at),
      })),
      rooms: rooms.map((row) => ({
        id: String(row.id),
        code: String(row.code),
        status: statusOf(row.status),
        title: String(row.title),
        createdAt: String(row.created_at),
      })),
    };
  });

export const fetchActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = typeof input === "object" && input && "id" in input ? String(input.id) : "";
    if (!id) throw new GameError("Atividade não encontrada.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    const activities = await sql<Record<string, unknown>>`
      select id, title, subject, show_ranking, revision
      from activities
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const activity = activities[0];
    if (!activity) throw new GameError("Atividade não encontrada.");
    const questions = await sql<Record<string, unknown>>`
      select text, context, explanation, options_json, correct, image_data, image_alt
      from questions
      where activity_id = ${data.id}
      order by position
    `;
    return {
      id: String(activity.id),
      revision: num(activity.revision),
      title: String(activity.title),
      subject: String(activity.subject),
      showRanking: asBool(activity.show_ranking),
      questions: questions.map((question) => ({
        key: crypto.randomUUID(),
        text: String(question.text),
        context: String(question.context ?? ""),
        explanation: String(question.explanation ?? ""),
        options: JSON.parse(String(question.options_json)) as string[],
        correct: num(question.correct),
        imageData: question.image_data ? String(question.image_data) : null,
        imageAlt: String(question.image_alt ?? ""),
      })),
    } satisfies DraftActivity;
  });

export const saveActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input as DraftActivity)
  .handler(async ({ data, context }) => {
    const snapshot = normalizeActivity(data);
    const sql = await db();
    const id = data.id || crypto.randomUUID();
    if (data.id) {
      const current = await sql<{ revision: number }>`
        select revision from activities where id = ${id} and user_id = ${context.userId}
      `;
      if (!current[0]) throw new GameError("Atividade não encontrada.");
      if (num(current[0].revision) !== num(data.revision)) {
        throw new GameError(
          "Esta atividade foi alterada em outra janela. Duplique o rascunho como um jogo novo para não perder o que você escreveu.",
        );
      }
      const updated = await sql`
        update activities
        set title = ${snapshot.title}, subject = ${snapshot.subject},
          show_ranking = ${snapshot.showRanking}, revision = revision + 1, updated_at = now()
        where id = ${id} and user_id = ${context.userId} and revision = ${num(data.revision)}
        returning id
      `;
      if (!updated.length) {
        throw new GameError(
          "Esta atividade foi alterada em outra janela. Duplique o rascunho como um jogo novo para não perder o que você escreveu.",
        );
      }
      await sql`delete from questions where activity_id = ${id}`;
    } else {
      await sql`
        insert into activities (id, user_id, title, subject, show_ranking)
        values (${id}, ${context.userId}, ${snapshot.title}, ${snapshot.subject}, ${snapshot.showRanking})
      `;
    }
    for (let position = 0; position < snapshot.questions.length; position += 1) {
      const question = snapshot.questions[position];
      if (!question) continue;
      await sql`
        insert into questions (
          activity_id, position, text, context, explanation, options_json, correct, image_data, image_alt
        ) values (
          ${id}, ${position}, ${question.text}, ${question.context}, ${question.explanation},
          ${JSON.stringify(question.options)}, ${question.correct}, ${question.imageData}, ${question.imageAlt}
        )
      `;
    }
    const saved = await sql<{ revision: number }>`select revision from activities where id = ${id}`;
    return { id, revision: num(saved[0]?.revision) };
  });

export const setActivityArchived = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const data = input as { id?: string; archived?: boolean };
    if (!data?.id) throw new GameError("Atividade não encontrada.");
    return { id: String(data.id), archived: Boolean(data.archived) };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    const rows = await sql`
      update activities set archived = ${data.archived}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!rows.length) throw new GameError("Atividade não encontrada.");
    return { ok: true as const };
  });

export const deleteActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = typeof input === "object" && input && "id" in input ? String(input.id) : "";
    if (!id) throw new GameError("Atividade não encontrada.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    const rows = await sql`
      delete from activities where id = ${data.id} and user_id = ${context.userId} returning id
    `;
    if (!rows.length) throw new GameError("Atividade não encontrada.");
    return { ok: true as const };
  });

export const createRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const data = input as { activityId?: string; seconds?: number; showRanking?: boolean };
    const seconds = Number(data?.seconds);
    if (!data?.activityId) throw new GameError("Escolha uma atividade.");
    if (!Number.isInteger(seconds) || (seconds !== 0 && (seconds < 10 || seconds > 600))) {
      throw new GameError("Use 0 ou de 10 a 600 segundos.");
    }
    return {
      activityId: String(data.activityId),
      seconds,
      showRanking: data.showRanking !== false,
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    const activities = await sql<Record<string, unknown>>`
      select title, subject, show_ranking from activities
      where id = ${data.activityId} and user_id = ${context.userId} and archived = false
    `;
    const activity = activities[0];
    if (!activity) throw new GameError("Atividade não encontrada ou arquivada.");
    const questions = await sql<Record<string, unknown>>`
      select text, context, explanation, options_json, correct, image_data, image_alt
      from questions where activity_id = ${data.activityId} order by position
    `;
    if (!questions.length) throw new GameError("Essa atividade ainda não tem questões.");
    const snapshot: Snapshot = {
      title: String(activity.title),
      subject: String(activity.subject),
      showRanking: data.showRanking,
      questions: questions.map((question) => ({
        text: String(question.text),
        context: String(question.context ?? ""),
        explanation: String(question.explanation ?? ""),
        options: JSON.parse(String(question.options_json)) as string[],
        correct: num(question.correct),
        imageData: question.image_data ? String(question.image_data) : null,
        imageAlt: String(question.image_alt ?? ""),
      })),
    };
    const roomId = crypto.randomUUID();
    let code = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      try {
        await sql`
          insert into rooms (
            id, user_id, activity_id, code, title, subject, seconds_per_question, show_ranking, snapshot_json
          ) values (
            ${roomId}, ${context.userId}, ${data.activityId}, ${code}, ${snapshot.title}, ${snapshot.subject},
            ${data.seconds}, ${data.showRanking}, ${JSON.stringify(snapshot)}
          )
        `;
        return { roomId, code };
      } catch (error) {
        if (attempt === 7 || !(error instanceof Error) || !/unique|duplicate/i.test(error.message)) throw error;
      }
    }
    throw new GameError("Não foi possível abrir a sala. Tente de novo.");
  });

export const fetchHost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const roomId = typeof input === "object" && input && "roomId" in input ? String(input.roomId) : "";
    if (!roomId) throw new GameError("Sala não encontrada.");
    return { roomId };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    const room = await loadOwnedRoom(sql, data.roomId, context.userId);
    return hostPayload(sql, room);
  });

export const controlRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const data = input as { roomId?: string; command?: string };
    const command = data?.command;
    if (!data?.roomId) throw new GameError("Sala não encontrada.");
    if (command !== "start" && command !== "reveal" && command !== "next" && command !== "finish" && command !== "ranking") {
      throw new GameError("Comando não reconhecido.");
    }
    return { roomId: String(data.roomId), command };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    const room = await loadOwnedRoom(sql, data.roomId, context.userId);
    const status = statusOf(room.status);
    const snapshot = parseSnapshot(room.snapshot_json);
    const index = num(room.question_index);
    const seconds = num(room.seconds_per_question);
    if (data.command === "ranking") {
      if (status === "finished") throw new GameError("A sala já foi encerrada.");
      await sql`
        update rooms set show_ranking = not show_ranking where id = ${data.roomId} and user_id = ${context.userId}
      `;
    } else if (data.command === "start") {
      if (status !== "waiting") throw new GameError("Essa partida já começou.");
      if (seconds > 0) {
        await sql`
          update rooms
          set status = 'active', question_index = 0, revealed = false,
            deadline = now() + (${seconds} * interval '1 second')
          where id = ${data.roomId} and user_id = ${context.userId}
        `;
      } else {
        await sql`
          update rooms
          set status = 'active', question_index = 0, revealed = false, deadline = null
          where id = ${data.roomId} and user_id = ${context.userId}
        `;
      }
    } else if (data.command === "reveal") {
      if (status !== "active" || asBool(room.revealed)) throw new GameError("Não há questão aberta para encerrar.");
      await sql`
        update rooms set revealed = true, deadline = null
        where id = ${data.roomId} and user_id = ${context.userId}
      `;
    } else if (data.command === "next") {
      if (status !== "active" || !asBool(room.revealed)) {
        throw new GameError("Mostre a resposta antes de avançar.");
      }
      if (index + 1 >= snapshot.questions.length) throw new GameError("Esta era a última questão.");
      const next = index + 1;
      if (seconds > 0) {
        await sql`
          update rooms
          set question_index = ${next}, revealed = false,
            deadline = now() + (${seconds} * interval '1 second')
          where id = ${data.roomId} and user_id = ${context.userId}
        `;
      } else {
        await sql`
          update rooms
          set question_index = ${next}, revealed = false, deadline = null
          where id = ${data.roomId} and user_id = ${context.userId}
        `;
      }
    } else if (status !== "finished") {
      await sql`
        update rooms set status = 'finished', revealed = true, deadline = null
        where id = ${data.roomId} and user_id = ${context.userId}
      `;
    }
    const nextRoom = await loadOwnedRoom(sql, data.roomId, context.userId);
    return hostPayload(sql, nextRoom);
  });

export const removePlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const data = input as { roomId?: string; participantId?: string };
    if (!data?.roomId || !data.participantId) throw new GameError("Participante não encontrado.");
    return { roomId: String(data.roomId), participantId: String(data.participantId) };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    await loadOwnedRoom(sql, data.roomId, context.userId);
    const rows = await sql`
      update participants set removed_at = coalesce(removed_at, now())
      where id = ${data.participantId} and room_id = ${data.roomId}
      returning id
    `;
    if (!rows.length) throw new GameError("Participante não encontrado.");
    const room = await loadOwnedRoom(sql, data.roomId, context.userId);
    return hostPayload(sql, room);
  });

export const joinRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { code?: string; nickname?: string; token?: string };
    const code = String(data?.code ?? "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) throw new GameError("Digite os seis números do código da sala.");
    return {
      code,
      nickname: requireNickname(data?.nickname),
      token: typeof data?.token === "string" ? data.token : "",
    };
  })
  .handler(async ({ data }) => {
    const sql = await db();
    await sql`delete from join_attempts where created_at < now() - interval '15 minutes'`;
    const recent = await sql<Record<string, unknown>>`
      select count(*) as n from join_attempts
      where code = ${data.code} and created_at > now() - interval '10 minutes'
    `;
    if (num(recent[0]?.n) >= 40) {
      throw new GameError("Muitas tentativas neste código. Espere alguns minutos.");
    }
    const rooms = await sql<Record<string, unknown>>`
      select id, status from rooms
      where code = ${data.code} and status <> 'finished'
      limit 1
    `;
    const room = rooms[0];
    if (!room) {
      await sql`insert into join_attempts (code) values (${data.code})`;
      throw new GameError("Não há sala aberta com esse código.");
    }
    const roomId = String(room.id);
    if (data.token) {
      const hash = await sha256Hex(data.token);
      const existing = await sql<Record<string, unknown>>`
        select id, nickname, removed_at from participants
        where room_id = ${roomId} and secret_hash = ${hash}
      `;
      if (existing[0] && !existing[0].removed_at) {
        return {
          token: data.token,
          roomId,
          code: data.code,
          nickname: String(existing[0].nickname),
          reclaimed: false,
        };
      }
    }
    const nick = data.nickname;
    const previous = await sql<Record<string, unknown>>`
      select id, removed_at from participants
      where room_id = ${roomId} and lower(nickname) = lower(${nick})
    `;
    const token = randomToken();
    const hash = await sha256Hex(token);
    if (previous[0]?.removed_at) {
      throw new GameError("O professor removeu este nome da sala.");
    }
    if (previous[0]) {
      await sql`
        update participants set secret_hash = ${hash}
        where id = ${String(previous[0].id)}
      `;
      return { token, roomId, code: data.code, nickname: nick, reclaimed: true };
    }
    try {
      await sql`
        insert into participants (id, room_id, nickname, secret_hash)
        values (${crypto.randomUUID()}, ${roomId}, ${nick}, ${hash})
      `;
    } catch (error) {
      if (!(error instanceof Error) || !/unique|duplicate/i.test(error.message)) throw error;
      const again = await sql<Record<string, unknown>>`
        select id, removed_at from participants
        where room_id = ${roomId} and lower(nickname) = lower(${nick})
      `;
      if (!again[0] || again[0].removed_at) throw new GameError("Esse nome já está na sala.");
      await sql`update participants set secret_hash = ${hash} where id = ${String(again[0].id)}`;
      return { token, roomId, code: data.code, nickname: nick, reclaimed: true };
    }
    return { token, roomId, code: data.code, nickname: nick, reclaimed: false };
  });

export const fetchPlay = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const token = typeof input === "object" && input && "token" in input ? String(input.token) : "";
    if (!token) throw new GameError("Entre de novo com o código da sala.");
    return { token };
  })
  .handler(async ({ data }) => {
    const sql = await db();
    return playPayload(sql, await sha256Hex(data.token));
  });

export const submitAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { token?: string; choice?: number };
    const choice = Number(data?.choice);
    if (!data?.token || !Number.isInteger(choice) || choice < 0 || choice > 4) {
      throw new GameError("Escolha uma alternativa.");
    }
    return { token: String(data.token), choice };
  })
  .handler(async ({ data }) => {
    const sql = await db();
    const hash = await sha256Hex(data.token);
    const seats = await sql<Record<string, unknown>>`
      select p.id, p.room_id, p.removed_at
      from participants p
      where p.secret_hash = ${hash}
    `;
    const seat = seats[0];
    if (!seat) throw new GameError("Sua entrada nesta sala expirou. Entre de novo com o código.");
    if (seat.removed_at) throw new GameError("O professor removeu você desta sala.");
    const rooms = await sql<Record<string, unknown>>`
      select id, status, question_index, revealed, seconds_per_question, snapshot_json,
        (deadline is null or deadline > now()) as accepting,
        extract(epoch from (deadline - now())) as remain_seconds
      from rooms
      where id = ${String(seat.room_id)}
    `;
    const room = rooms[0];
    if (!room || statusOf(room.status) !== "active") throw new GameError("A sala não está em jogo.");
    if (asBool(room.revealed)) throw new GameError("O professor já encerrou esta questão.");
    if (!asBool(room.accepting)) throw new GameError("O tempo desta questão acabou.");
    const snapshot = parseSnapshot(room.snapshot_json);
    const index = num(room.question_index);
    const question = snapshot.questions[index];
    if (!question) throw new GameError("Essa questão não está disponível.");
    const order = shuffleOrder(`${String(room.id)}:${String(seat.id)}:${index}`, question.options.length);
    const canonical = order[data.choice];
    if (canonical == null) throw new GameError("Escolha uma alternativa.");
    const correct = canonical === question.correct;
    const remain = room.remain_seconds == null ? null : num(room.remain_seconds);
    const points = scoreAnswer(correct, num(room.seconds_per_question), remain);
    try {
      await sql`
        insert into answers (participant_id, room_id, question_index, canonical_option, is_correct, points)
        values (${String(seat.id)}, ${String(room.id)}, ${index}, ${canonical}, ${correct}, ${points})
      `;
    } catch (error) {
      if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
        throw new GameError("Você já respondeu esta questão.");
      }
      throw error;
    }
    await sql`
      update participants
      set score = coalesce((select sum(points) from answers where participant_id = ${String(seat.id)}), 0)
      where id = ${String(seat.id)}
    `;
    return playPayload(sql, hash);
  });

export const saveRecoveryCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const code = typeof input === "object" && input && "code" in input ? String(input.code) : "";
    const normal = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{10}$/.test(normal)) throw new GameError("Código de recuperação inválido.");
    return { code: normal };
  })
  .handler(async ({ data, context }) => {
    const sql = await db();
    const hash = await sha256Hex(data.code);
    await sql`
      insert into teacher_recovery (user_id, code_hash)
      values (${context.userId}, ${hash})
      on conflict (user_id) do update set code_hash = excluded.code_hash, updated_at = now()
    `;
    return { ok: true as const };
  });

export const accountInfo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await db();
    const rows = await sql<Record<string, unknown>>`
      select
        (select count(*) from "account" where "userId" = ${context.userId} and "providerId" = 'credential' and password is not null) as passwords,
        (select count(*) from teacher_recovery where user_id = ${context.userId}) as recoveries
    `;
    return {
      hasPassword: num(rows[0]?.passwords) > 0,
      hasRecovery: num(rows[0]?.recoveries) > 0,
    };
  });

export const resetWithRecovery = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { email?: string; code?: string; password?: string };
    const email = String(data?.email ?? "").trim().toLowerCase();
    const code = String(data?.code ?? "").trim().toUpperCase();
    const password = String(data?.password ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GameError("Digite um e-mail válido.");
    if (!/^[A-Z2-9]{10}$/.test(code)) throw new GameError("O código de recuperação tem 10 caracteres.");
    if (password.length < 8 || password.length > 128) {
      throw new GameError("A nova senha precisa ter de 8 a 128 caracteres.");
    }
    return { email, code, password };
  })
  .handler(async ({ data }) => {
    const sql = await db();
    await sql`delete from recovery_attempts where created_at < now() - interval '30 minutes'`;
    const recent = await sql<Record<string, unknown>>`
      select count(*) as n from recovery_attempts
      where email = ${data.email} and created_at > now() - interval '15 minutes'
    `;
    if (num(recent[0]?.n) >= 5) {
      throw new GameError("Muitas tentativas. Espere alguns minutos.");
    }
    const users = await sql<Record<string, unknown>>`
      select id from "user" where lower(email) = ${data.email}
    `;
    const userId = users[0] ? String(users[0].id) : "";
    const recovery = userId
      ? await sql<Record<string, unknown>>`
          select code_hash from teacher_recovery where user_id = ${userId}
        `
      : [];
    const hash = await sha256Hex(data.code);
    if (!userId || !recovery[0] || String(recovery[0].code_hash) !== hash) {
      await sql`insert into recovery_attempts (email) values (${data.email})`;
      throw new GameError("E-mail ou código de recuperação não conferem.");
    }
    const { hashPassword } = await import("better-auth/crypto");
    const passwordHash = await hashPassword(data.password);
    const updated = await sql`
      update "account"
      set password = ${passwordHash}, "updatedAt" = now()
      where "userId" = ${userId} and "providerId" = 'credential'
      returning id
    `;
    if (!updated.length) {
      throw new GameError("Esta conta entra com Google ou X, sem senha própria.");
    }
    await sql`delete from "session" where "userId" = ${userId}`;
    return { ok: true as const };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const phrase = typeof input === "object" && input && "phrase" in input ? String(input.phrase) : "";
    if (phrase !== "APAGAR") throw new GameError("Digite APAGAR para confirmar.");
    return { phrase };
  })
  .handler(async ({ context }) => {
    const sql = await db();
    const userId = context.userId;
    await sql`delete from answers where room_id in (select id from rooms where user_id = ${userId})`;
    await sql`delete from participants where room_id in (select id from rooms where user_id = ${userId})`;
    await sql`delete from rooms where user_id = ${userId}`;
    await sql`delete from questions where activity_id in (select id from activities where user_id = ${userId})`;
    await sql`delete from activities where user_id = ${userId}`;
    await sql`delete from "user" where id = ${userId}`;
    return { ok: true as const };
  });
