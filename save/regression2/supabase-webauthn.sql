-- WebAuthn / Passkeys pour verifier les livreurs PorteaPorte.

create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_id text not null unique,
  public_key_jwk jsonb not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_name text,
  verified boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge text not null,
  type text not null check (type in ('registration', 'authentication')),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists webauthn_credentials_user_idx on public.webauthn_credentials(user_id);
create index if not exists webauthn_challenges_user_type_idx on public.webauthn_challenges(user_id, type, created_at desc);

alter table public.webauthn_credentials enable row level security;
alter table public.webauthn_challenges enable row level security;

drop policy if exists "webauthn_credentials_select_self_admin" on public.webauthn_credentials;
create policy "webauthn_credentials_select_self_admin" on public.webauthn_credentials
for select to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "webauthn_challenges_no_client_access" on public.webauthn_challenges;
create policy "webauthn_challenges_no_client_access" on public.webauthn_challenges
for select to authenticated
using (false);
