-- ═══════════════════════════════════════════════════════════════════════════
-- PorteàPorte — Ajout McDonald's + Couche-Tard pour Lévis/Québec
-- À copier dans Supabase SQL Editor → RUN
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  insert into public.safe_meeting_points (city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  select * from (values
    -- ═════ MCDONALD'S LÉVIS ═════
    ('Lévis', 'Lévis (centre)', 'McDonald''s Galeries Chagnon',     '1100 Bd Alphonse-Desjardins, Lévis, QC G6V 6Y5',  46.7872::double precision, -71.1880::double precision, 'restaurant', '5h-23h',  true, true, true, 'Drive + intérieur'),
    ('Lévis', 'St-Romuald',     'McDonald''s St-Romuald',           '120 Route Lagueux, Lévis, QC G6W 5M6',            46.7461::double precision, -71.2480::double precision, 'restaurant', '5h-23h',  true, true, true, 'Près A-20 sortie 311'),
    ('Lévis', 'St-Nicolas',     'McDonald''s St-Nicolas (Galeries)','500 Route 116, Lévis, QC G7A 2N1',                46.7060::double precision, -71.3525::double precision, 'restaurant', '5h-minuit',true, true, true, 'Drive 24h'),
    ('Lévis', 'Charny',         'McDonald''s Charny',               '3210 Av des Églises, Lévis, QC G6X 1X8',          46.7136::double precision, -71.2725::double precision, 'restaurant', '5h-23h',  true, true, true, ''),

    -- ═════ MCDONALD'S QUÉBEC ═════
    ('Québec', 'Sainte-Foy',    'McDonald''s Bd Laurier',           '2960 Bd Laurier, Québec, QC G1V 4P2',             46.7790::double precision, -71.2710::double precision, 'restaurant', '24/7',    true, true, true, 'Drive 24/7'),
    ('Québec', 'Sainte-Foy',    'McDonald''s Place Sainte-Foy',     '2450 Bd Laurier, Québec, QC G1V 2L1',             46.7782::double precision, -71.2768::double precision, 'restaurant', '6h-23h',  true, true, true, 'Aire de restauration du centre commercial'),
    ('Québec', 'Vanier',        'McDonald''s Hamel',                '2600 Bd Hamel, Québec, QC G1P 2J2',               46.8262::double precision, -71.2795::double precision, 'restaurant', '24/7',    true, true, true, 'Drive 24h + stationnement A-440'),
    ('Québec', 'Beauport',      'McDonald''s Bd Sainte-Anne',       '4200 Bd Sainte-Anne, Québec, QC G1C 2C7',         46.8748::double precision, -71.1710::double precision, 'restaurant', '5h30-23h',true, true, true, ''),
    ('Québec', 'Limoilou',      'McDonald''s 1re Avenue',           '700 1re Avenue, Québec, QC G1L 3K1',              46.8235::double precision, -71.2183::double precision, 'restaurant', '5h-23h',  true, true, true, ''),
    ('Québec', 'Centre-Ville',  'McDonald''s Cartier',              '1130 Av Cartier, Québec, QC G1R 2S5',             46.8081::double precision, -71.2305::double precision, 'restaurant', '6h-22h',  true, true, false,'Stationnement de rue'),
    ('Québec', 'Cap-Rouge',     'McDonald''s Cap-Rouge',            '4180 Rue Saint-Félix, Québec, QC G1Y 3A6',        46.7505::double precision, -71.3475::double precision, 'restaurant', '5h-23h',  true, true, true, 'Drive + intérieur'),
    ('Québec', 'Charlesbourg',  'McDonald''s Charlesbourg',         '8200 Bd Henri-Bourassa, Québec, QC G1G 4E2',      46.8620::double precision, -71.2812::double precision, 'restaurant', '5h-23h',  true, true, true, ''),

    -- ═════ COUCHE-TARD LÉVIS ═════
    ('Lévis', 'St-Nicolas',     'Couche-Tard St-Nicolas',           '750 Route 116, Lévis, QC G7A 2N1',                46.7065::double precision, -71.3540::double precision, 'station_essence', '24/7', true, true, true, 'Essence + dépanneur'),
    ('Lévis', 'Lévis (centre)', 'Couche-Tard Alphonse-Desjardins',  '1200 Bd Alphonse-Desjardins, Lévis, QC G6V 6Y8',  46.7870::double precision, -71.1875::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Lévis', 'Pintendre',      'Couche-Tard Pintendre',            '1000 Rte Pintendre, Lévis, QC G6C 1G4',           46.7385::double precision, -71.1350::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Lévis', 'Charny',         'Couche-Tard Charny',               '8300 Bd des Étudiants, Lévis, QC G6X 1H2',        46.7160::double precision, -71.2710::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Lévis', 'St-Jean-Chrysostome', 'Couche-Tard St-Jean',         '880 Bd de l''Etrier, Lévis, QC G6Z 1V7',          46.7330::double precision, -71.2225::double precision, 'station_essence', '24/7', true, true, true, ''),

    -- ═════ COUCHE-TARD QUÉBEC ═════
    ('Québec', 'Sainte-Foy',    'Couche-Tard Bd Laurier',           '2400 Bd Laurier, Québec, QC G1V 4M6',             46.7780::double precision, -71.2780::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Québec', 'Sainte-Foy',    'Couche-Tard Quatre-Bourgeois',     '2600 Ch des Quatre-Bourgeois, Québec, QC G1V 1W5',46.7825::double precision, -71.2950::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Québec', 'Vanier',        'Couche-Tard Hamel',                '2500 Bd Hamel, Québec, QC G1P 2J1',               46.8255::double precision, -71.2810::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Québec', 'Limoilou',      'Couche-Tard 1re Avenue',           '825 1re Avenue, Québec, QC G1L 3K3',              46.8231::double precision, -71.2179::double precision, 'station_essence', '24/7', true, true, true, 'Déjà existant — skip si conflit'),
    ('Québec', 'Beauport',      'Couche-Tard Bd Sainte-Anne',       '4500 Bd Sainte-Anne, Québec, QC G1C 2C9',         46.8755::double precision, -71.1695::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Québec', 'Charlesbourg',  'Couche-Tard 1re Avenue Nord',      '8500 1re Avenue, Québec, QC G1H 4E4',             46.8650::double precision, -71.2790::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Québec', 'Centre-Ville',  'Couche-Tard René-Lévesque',        '1255 Bd René-Lévesque E, Québec, QC G1R 4T8',     46.8120::double precision, -71.2210::double precision, 'station_essence', '24/7', true, true, false,'Stationnement limité'),
    ('Québec', 'Cap-Rouge',     'Couche-Tard Provancher',           '1450 Rue Provancher, Québec, QC G1Y 1R5',         46.7460::double precision, -71.3515::double precision, 'station_essence', '24/7', true, true, true, '')
  ) as v(city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  where not exists (
    select 1 from public.safe_meeting_points sp
    where sp.city = v.city and sp.name = v.name
  );
end $$;

-- ✅ VÉRIFICATION : nouveau total par ville
select city, type, count(*) as nb
from public.safe_meeting_points
where active = true
group by city, type
order by city, type;
