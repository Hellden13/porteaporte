-- ═══════════════════════════════════════════════════════════════════════════
-- PorteàPorte — Catalogue de points de rencontre sécuritaires
-- Table : safe_meeting_points (déjà référencée par l'endpoint safe-meeting-points)
-- À copier dans Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) TABLE (crée si pas déjà)
create table if not exists public.safe_meeting_points (
  id              uuid primary key default gen_random_uuid(),
  city            text not null,
  name            text not null,
  address         text not null,
  lat             double precision not null,
  lng             double precision not null,
  type            text not null default 'autre',
  verified        boolean default true,
  active          boolean default true,
  created_at      timestamptz default now()
);

-- 2) AJOUT DE COLONNES (idempotent — si la table existait déjà avec moins de cols)
alter table public.safe_meeting_points add column if not exists sector text;
alter table public.safe_meeting_points add column if not exists hours text;
alter table public.safe_meeting_points add column if not exists notes text;
alter table public.safe_meeting_points add column if not exists photo_url text;
alter table public.safe_meeting_points add column if not exists has_cameras boolean default false;
alter table public.safe_meeting_points add column if not exists well_lit boolean default true;
alter table public.safe_meeting_points add column if not exists parking_free boolean default true;
alter table public.safe_meeting_points add column if not exists created_by uuid;
alter table public.safe_meeting_points add column if not exists updated_at timestamptz default now();

create index if not exists idx_safe_meeting_points_city on public.safe_meeting_points(city) where active = true;
create index if not exists idx_safe_meeting_points_sector on public.safe_meeting_points(city, sector) where active = true;

-- 3) RLS : lecture publique, écriture admin
alter table public.safe_meeting_points enable row level security;

drop policy if exists "safe_meeting_points_read_all" on public.safe_meeting_points;
create policy "safe_meeting_points_read_all" on public.safe_meeting_points
  for select using (active = true);

drop policy if exists "safe_meeting_points_admin_write" on public.safe_meeting_points;
create policy "safe_meeting_points_admin_write" on public.safe_meeting_points
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 4) SEED : points sécuritaires pour le corridor Lévis ↔ Québec
-- Coordonnées vérifiées via Google Maps. Conflits évités par (city, name).
do $$
begin
  -- LÉVIS
  insert into public.safe_meeting_points (city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  select * from (values
    ('Lévis', 'St-Nicolas',     'Tim Hortons St-Nicolas',           '435 Route 116, Lévis, QC G7A 2N1',           46.7058::double precision, -71.3530::double precision, 'restaurant',     '24/7',         true,  true, true, 'Grand stationnement, accès Route 116'),
    ('Lévis', 'St-Nicolas',     'IGA St-Nicolas',                   '750 Route des Rivières, Lévis, QC G7A 2T5',  46.6905::double precision, -71.3678::double precision, 'commerce',       'Lun-Dim 7h-23h', true, true, true, 'Stationnement éclairé'),
    ('Lévis', 'St-Romuald',     'Tim Hortons St-Romuald',           '180 Route Lagueux, Lévis, QC G6W 5M6',       46.7457::double precision, -71.2476::double precision, 'restaurant',     '24/7',         true,  true, true, 'Près A-20 sortie 311'),
    ('Lévis', 'St-Romuald',     'Couche-Tard St-Romuald',           '485 Route Cameron, Lévis, QC G6W 2C7',       46.7522::double precision, -71.2387::double precision, 'station_essence','24/7',         true,  true, true, ''),
    ('Lévis', 'Lévis (centre)', 'Galeries Chagnon',                 '1200 Bd Alphonse-Desjardins, Lévis, QC G6V 6Y8', 46.7867::double precision, -71.1869::double precision, 'commerce',  'Lun-Dim 9h-21h', true, true, true, 'Grand stationnement, plusieurs commerces'),
    ('Lévis', 'Lévis (centre)', 'Traverse Lévis-Québec',            '5995 Rue St-Laurent, Lévis, QC G6V 3P7',     46.8081::double precision, -71.1801::double precision, 'gare',           '24/7',         true,  true, true, 'Stationnement payant 2h gratuites'),
    ('Lévis', 'Lévis (centre)', 'Tim Hortons Bd Alphonse-Desjardins','1100 Bd Alphonse-Desjardins, Lévis, QC G6V 0A2', 46.7891::double precision, -71.1893::double precision, 'restaurant', '24/7',         true,  true, true, ''),
    ('Lévis', 'Charny',         'Métro Plus Charny',                '8255 Bd des Étudiants, Lévis, QC G6X 1H1',   46.7156::double precision, -71.2701::double precision, 'commerce',       'Lun-Dim 8h-22h', true, true, true, ''),
    ('Lévis', 'Pintendre',      'Marché Goyette Pintendre',         '660 Rte Pintendre, Lévis, QC G6C 1G6',       46.7378::double precision, -71.1340::double precision, 'commerce',       'Lun-Dim 7h-22h', false, true, true, ''),
    -- QUÉBEC
    ('Québec', 'Sainte-Foy',    'Université Laval — Stationnement A','2325 Rue de l''Université, Québec, QC G1V 0A6', 46.7817::double precision, -71.2752::double precision, 'stationnement', '24/7', true, true, true, 'Stationnement public, contrôle 24h'),
    ('Québec', 'Sainte-Foy',    'Place Sainte-Foy',                 '2450 Bd Laurier, Québec, QC G1V 2L1',        46.7782::double precision, -71.2768::double precision, 'commerce',       'Lun-Dim 9h30-21h', true, true, true, 'Grand stationnement'),
    ('Québec', 'Sainte-Foy',    'Tim Hortons Bd Laurier',           '2700 Bd Laurier, Québec, QC G1V 2L8',        46.7799::double precision, -71.2693::double precision, 'restaurant',     '24/7',         true,  true, true, ''),
    ('Québec', 'Cap-Rouge',     'IGA Cap-Rouge',                    '1304 Rue Provancher, Québec, QC G1Y 1R2',    46.7456::double precision, -71.3501::double precision, 'commerce',       'Lun-Dim 7h-23h', true, true, true, ''),
    ('Québec', 'Vanier',        'Galeries Charlesbourg',            '8500 Bd Henri-Bourassa, Québec, QC G1G 5X1', 46.8623::double precision, -71.2818::double precision, 'commerce',       'Lun-Dim 9h-21h', true, true, true, ''),
    ('Québec', 'Vanier',        'Tim Hortons Hamel',                '2580 Bd Hamel, Québec, QC G1P 2J2',          46.8259::double precision, -71.2789::double precision, 'restaurant',     '24/7',         true,  true, true, 'Près A-440'),
    ('Québec', 'Limoilou',      'IGA Limoilou',                     '750 3e Avenue, Québec, QC G1L 2W7',          46.8312::double precision, -71.2191::double precision, 'commerce',       'Lun-Dim 7h-23h', true, true, true, ''),
    ('Québec', 'Limoilou',      'Couche-Tard 1re Avenue',           '825 1re Avenue, Québec, QC G1L 3K3',         46.8231::double precision, -71.2179::double precision, 'station_essence','24/7',         true,  true, true, ''),
    ('Québec', 'Centre-Ville',  'Gare du Palais',                   '450 Rue de la Gare-du-Palais, Québec, QC G1K 3X2', 46.8170::double precision, -71.2126::double precision, 'gare',     '5h30-23h30',   true,  true, false, 'Stationnement payant'),
    ('Québec', 'Centre-Ville',  'Place D''Youville',                '995 Place D''Youville, Québec, QC G1R 3P1',  46.8136::double precision, -71.2126::double precision, 'autre',          '24/7',         true,  true, false, 'Lieu public très passant'),
    ('Québec', 'Beauport',      'IGA Beauport',                     '650 Av. Royale, Québec, QC G1E 1Z3',         46.8636::double precision, -71.2003::double precision, 'commerce',       'Lun-Dim 7h-23h', true, true, true, ''),
    ('Québec', 'Beauport',      'Tim Hortons Bd Sainte-Anne',       '4150 Bd Sainte-Anne, Québec, QC G1C 2C5',    46.8743::double precision, -71.1715::double precision, 'restaurant',     '24/7',         true,  true, true, '')
  ) as v(city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  where not exists (
    select 1 from public.safe_meeting_points sp
    where sp.city = v.city and sp.name = v.name
  );
end $$;

-- ─── TRIGGER updated_at ─────────────────────────────────────────────────────
create or replace function public.touch_safe_meeting_points_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_safe_meeting_points_updated on public.safe_meeting_points;
create trigger trg_safe_meeting_points_updated
  before update on public.safe_meeting_points
  for each row execute function public.touch_safe_meeting_points_updated();

-- ✅ VÉRIFICATION
select city, count(*) as nb_points
from public.safe_meeting_points
where active = true
group by city
order by city;
