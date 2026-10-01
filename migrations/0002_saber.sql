-- Saber em Jogo: acervo do professor, salas ao vivo e respostas.
-- O gabarito mora só nestas tabelas. A visão do aluno é montada no servidor.

create table if not exists activities (
  id text primary key,
  user_id text not null,
  title text not null,
  subject text not null,
  show_ranking boolean not null default true,
  archived boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_user_idx on activities (user_id, updated_at desc);

create table if not exists questions (
  activity_id text not null references activities (id) on delete cascade,
  position integer not null,
  text text not null,
  context text not null default '',
  explanation text not null default '',
  options_json text not null,
  correct integer not null,
  image_data text,
  image_alt text not null default '',
  primary key (activity_id, position)
);

create table if not exists rooms (
  id text primary key,
  user_id text not null,
  activity_id text not null,
  code text not null,
  title text not null,
  subject text not null,
  status text not null default 'waiting',
  question_index integer not null default 0,
  revealed boolean not null default false,
  seconds_per_question integer not null default 0,
  show_ranking boolean not null default true,
  deadline timestamptz,
  snapshot_json text not null,
  created_at timestamptz not null default now(),
  constraint rooms_status_chk check (status in ('waiting', 'active', 'finished')),
  constraint rooms_seconds_chk check (seconds_per_question = 0 or (seconds_per_question >= 10 and seconds_per_question <= 600))
);

create index if not exists rooms_user_idx on rooms (user_id, created_at desc);
create unique index if not exists rooms_open_code_idx on rooms (code) where status <> 'finished';

create table if not exists participants (
  id text primary key,
  room_id text not null references rooms (id) on delete cascade,
  nickname text not null,
  secret_hash text not null unique,
  score integer not null default 0,
  removed_at timestamptz,
  joined_at timestamptz not null default now()
);

create unique index if not exists participants_room_nick_idx on participants (room_id, lower(nickname));
create index if not exists participants_room_idx on participants (room_id);

create table if not exists answers (
  participant_id text not null references participants (id) on delete cascade,
  room_id text not null,
  question_index integer not null,
  canonical_option integer not null,
  is_correct boolean not null,
  points integer not null,
  answered_at timestamptz not null default now(),
  primary key (participant_id, question_index)
);

create index if not exists answers_room_idx on answers (room_id, question_index);

create table if not exists teacher_recovery (
  user_id text primary key references "user" (id) on delete cascade,
  code_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists join_attempts (
  code text not null,
  created_at timestamptz not null default now()
);

create index if not exists join_attempts_code_idx on join_attempts (code, created_at desc);

create table if not exists recovery_attempts (
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists recovery_attempts_email_idx on recovery_attempts (email, created_at desc);
