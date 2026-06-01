-- ═══════════════════════════════════════════════════════════════════════════
-- PorteàPorte — Expansion massive des points de rencontre sécuritaires
-- Tim Hortons, IGA, Metro/Maxi + nouvelles villes : Montréal, Laval,
-- Trois-Rivières, Sherbrooke, Saguenay
-- À copier dans Supabase SQL Editor → RUN
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  insert into public.safe_meeting_points (city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  select * from (values

    -- ═════ TIM HORTONS SUPPLÉMENTAIRES — LÉVIS ═════
    ('Lévis', 'Lévis (centre)', 'Tim Hortons Lévis Traverse',       '5750 Rue St-Laurent, Lévis, QC G6V 3V6',           46.8090::double precision, -71.1825::double precision, 'restaurant', '5h-23h',     true, true, true, 'Près de la traverse'),
    ('Lévis', 'Pintendre',      'Tim Hortons Pintendre',            '660 Rte Pintendre, Lévis, QC G6C 1G6',             46.7380::double precision, -71.1345::double precision, 'restaurant', '5h-22h',     true, true, true, ''),
    ('Lévis', 'St-Jean-Chrysostome', 'Tim Hortons St-Jean',         '1100 Bd de l''Etrier, Lévis, QC G6Z 2C8',          46.7335::double precision, -71.2200::double precision, 'restaurant', '24/7',       true, true, true, ''),

    -- ═════ TIM HORTONS SUPPLÉMENTAIRES — QUÉBEC ═════
    ('Québec', 'Centre-Ville',  'Tim Hortons St-Joseph',            '500 Rue St-Joseph E, Québec, QC G1K 3B6',          46.8175::double precision, -71.2175::double precision, 'restaurant', '5h-23h',     true, true, false,'Centre-ville, stationnement limité'),
    ('Québec', 'Charlesbourg',  'Tim Hortons Henri-Bourassa',       '8000 Bd Henri-Bourassa, Québec, QC G1G 4C7',       46.8615::double precision, -71.2820::double precision, 'restaurant', '24/7',       true, true, true, ''),
    ('Québec', 'Sillery',       'Tim Hortons Chemin St-Louis',      '2750 Ch St-Louis, Québec, QC G1W 1P9',             46.7795::double precision, -71.2615::double precision, 'restaurant', '5h-22h',     true, true, true, ''),
    ('Québec', 'Lebourgneuf',   'Tim Hortons Lebourgneuf',          '2360 Bd Lebourgneuf, Québec, QC G2K 1T6',          46.8420::double precision, -71.2890::double precision, 'restaurant', '24/7',       true, true, true, ''),

    -- ═════ IGA / IGA PLUS — QUÉBEC ═════
    ('Québec', 'Lebourgneuf',   'IGA Lebourgneuf',                  '825 Bd Lebourgneuf, Québec, QC G2J 1C1',           46.8395::double precision, -71.2925::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, 'Grand stationnement'),
    ('Québec', 'Charlesbourg',  'IGA Extra Charlesbourg',           '8500 Bd Henri-Bourassa, Québec, QC G1G 5X1',       46.8625::double precision, -71.2825::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, ''),
    ('Québec', 'Sainte-Foy',    'IGA Extra Plaza Laval',            '900 Av Roland-Beaudin, Québec, QC G1V 3W6',        46.7800::double precision, -71.2820::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, ''),
    ('Québec', 'Vanier',        'IGA Vanier',                       '380 Av Saint-Sacrement, Québec, QC G1N 3X6',       46.8190::double precision, -71.2540::double precision, 'commerce',   'Lun-Dim 7h-22h', true, true, true, ''),

    -- ═════ METRO — QUÉBEC ═════
    ('Québec', 'Sainte-Foy',    'Metro Plus Sainte-Foy',            '2700 Bd Laurier, Québec, QC G1V 2L8',              46.7800::double precision, -71.2700::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),
    ('Québec', 'Limoilou',      'Metro Plus Limoilou',              '740 18e Rue, Québec, QC G1J 1Z4',                  46.8320::double precision, -71.2095::double precision, 'commerce',   'Lun-Dim 7h-22h', true, true, true, ''),
    ('Québec', 'Beauport',      'Metro Beauport',                   '480 Rue Clemenceau, Québec, QC G1C 5A2',           46.8665::double precision, -71.1975::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),
    ('Québec', 'Charlesbourg',  'Metro Charlesbourg',               '700 76e Rue O, Québec, QC G1H 7H1',                46.8615::double precision, -71.2925::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),

    -- ═════ MAXI — QUÉBEC ═════
    ('Québec', 'Sainte-Foy',    'Maxi Sainte-Foy',                  '2120 Bd Hochelaga, Québec, QC G1V 4P1',            46.7755::double precision, -71.2685::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),
    ('Québec', 'Beauport',      'Maxi Beauport',                    '795 Bd des Chutes, Québec, QC G1E 6Y3',            46.8770::double precision, -71.1620::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),

    -- ═════ IGA / METRO — LÉVIS ═════
    ('Lévis', 'St-Romuald',     'IGA St-Romuald',                   '1199 Bd Etienne-Dallaire, Lévis, QC G6W 7H7',      46.7448::double precision, -71.2425::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),
    ('Lévis', 'Lévis (centre)', 'Metro Lévis',                      '5700 Rue J-B Michaud, Lévis, QC G6V 7Y5',          46.7875::double precision, -71.1810::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),

    -- ═════════════════════════════════════════════════════════════════════
    -- ═════ MONTRÉAL — NOUVELLES VILLES ═════
    -- ═════════════════════════════════════════════════════════════════════
    ('Montréal', 'Centre-Ville', 'Tim Hortons Métro McGill',        '1212 Rue McGill College, Montréal, QC H3B 4N4',    45.5025::double precision, -73.5720::double precision, 'restaurant', '5h-23h',     true, true, false,'Proche métro McGill'),
    ('Montréal', 'Plateau',     'Tim Hortons Mont-Royal',           '1700 Av du Mont-Royal E, Montréal, QC H2H 1R1',    45.5345::double precision, -73.5755::double precision, 'restaurant', '5h-23h',     true, true, false,''),
    ('Montréal', 'Centre-Ville', 'McDonald''s Sainte-Catherine',    '1455 Rue Sainte-Catherine O, Montréal, QC H3G 1S5',45.4990::double precision, -73.5755::double precision, 'restaurant', '24/7',       true, true, false,''),
    ('Montréal', 'Centre-Ville', 'Couche-Tard Sainte-Catherine',    '1240 Rue Sainte-Catherine O, Montréal, QC H3G 1P9',45.4995::double precision, -73.5720::double precision, 'station_essence', '24/7', true, true, false,''),
    ('Montréal', 'Plateau',     'IGA Mont-Royal',                   '101 Av du Mont-Royal E, Montréal, QC H2T 1N6',     45.5215::double precision, -73.5870::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, false,''),
    ('Montréal', 'Rosemont',    'IGA Extra Rosemont',               '6125 Bd St-Michel, Montréal, QC H1Y 2Z9',          45.5535::double precision, -73.5860::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, ''),
    ('Montréal', 'Centre-Ville', 'Gare Centrale',                   '895 Rue de la Gauchetière O, Montréal, QC H3B 4G1',45.5005::double precision, -73.5660::double precision, 'gare',       '5h-1h',      true, true, false,'Stationnement payant'),
    ('Montréal', 'Hochelaga',   'Metro Plus Hochelaga',             '4051 Rue Ontario E, Montréal, QC H1W 1S9',         45.5485::double precision, -73.5400::double precision, 'commerce',   'Lun-Dim 8h-22h', true, true, true, ''),
    ('Montréal', 'Verdun',      'McDonald''s Verdun',               '4060 Bd LaSalle, Verdun, QC H4G 2A6',              45.4570::double precision, -73.5760::double precision, 'restaurant', '5h-23h',     true, true, true, ''),
    ('Montréal', 'Saint-Laurent', 'Tim Hortons Marcel-Laurin',      '2855 Bd Marcel-Laurin, Saint-Laurent, QC H4R 1J5', 45.5180::double precision, -73.7220::double precision, 'restaurant', '24/7',       true, true, true, ''),

    -- ═════ LAVAL ═════
    ('Laval', 'Chomedey',       'Carrefour Laval',                  '3035 Bd Le Carrefour, Laval, QC H7T 1C8',          45.5570::double precision, -73.7405::double precision, 'commerce',   'Lun-Dim 9h-21h', true, true, true, 'Grand centre commercial'),
    ('Laval', 'Chomedey',       'Tim Hortons Carrefour',            '3007 Bd Le Carrefour, Laval, QC H7T 1C7',          45.5575::double precision, -73.7410::double precision, 'restaurant', '5h-23h',     true, true, true, ''),
    ('Laval', 'Vimont',         'McDonald''s Bd des Laurentides',   '2200 Bd des Laurentides, Laval, QC H7M 2P1',       45.5950::double precision, -73.7110::double precision, 'restaurant', '5h-23h',     true, true, true, ''),
    ('Laval', 'Pont-Viau',      'Couche-Tard Pont-Viau',            '15 Bd Lévesque E, Laval, QC H7G 1B7',              45.5675::double precision, -73.6920::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Laval', 'Sainte-Rose',    'IGA Extra Sainte-Rose',            '110 Bd Curé-Labelle, Laval, QC H7L 3A3',           45.6230::double precision, -73.7860::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, ''),

    -- ═════ TROIS-RIVIÈRES ═════
    ('Trois-Rivières', 'Centre', 'McDonald''s Bd des Récollets',    '750 Bd des Récollets, Trois-Rivières, QC G8T 4G2', 46.3490::double precision, -72.5635::double precision, 'restaurant', '5h-23h',     true, true, true, ''),
    ('Trois-Rivières', 'Centre', 'Tim Hortons Bd des Forges',       '4055 Bd des Forges, Trois-Rivières, QC G8Y 1V8',   46.3585::double precision, -72.5690::double precision, 'restaurant', '24/7',       true, true, true, ''),
    ('Trois-Rivières', 'Cap-de-la-Madeleine', 'Couche-Tard Cap',    '500 Bd Ste-Madeleine, Trois-Rivières, QC G8T 3J7', 46.3675::double precision, -72.5145::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Trois-Rivières', 'Centre', 'IGA Trois-Rivières',              '1900 Bd des Récollets, Trois-Rivières, QC G8Z 4H3',46.3520::double precision, -72.5710::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, ''),
    ('Trois-Rivières', 'Centre', 'Galeries du Cap',                 '625 Bd Thibeau, Trois-Rivières, QC G8T 7B4',       46.3690::double precision, -72.5125::double precision, 'commerce',   'Lun-Dim 9h-21h', true, true, true, ''),

    -- ═════ SHERBROOKE ═════
    ('Sherbrooke', 'Centre',    'McDonald''s King Ouest',           '2125 Rue King O, Sherbrooke, QC J1J 2G3',          45.4040::double precision, -71.9215::double precision, 'restaurant', '5h-23h',     true, true, true, ''),
    ('Sherbrooke', 'Centre',    'Tim Hortons King Est',             '2755 Rue King E, Sherbrooke, QC J1G 5G6',          45.4110::double precision, -71.8635::double precision, 'restaurant', '24/7',       true, true, true, ''),
    ('Sherbrooke', 'Centre',    'IGA Sherbrooke',                   '4205 Rue King O, Sherbrooke, QC J1L 1P3',          45.4045::double precision, -71.9530::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, ''),
    ('Sherbrooke', 'Centre',    'Carrefour de l''Estrie',           '3050 Bd de Portland, Sherbrooke, QC J1L 1K1',      45.4080::double precision, -71.9500::double precision, 'commerce',   'Lun-Dim 9h-21h', true, true, true, 'Grand centre commercial'),
    ('Sherbrooke', 'Centre',    'Couche-Tard King O',               '1825 Rue King O, Sherbrooke, QC J1J 2E1',          45.4035::double precision, -71.9180::double precision, 'station_essence', '24/7', true, true, true, ''),

    -- ═════ SAGUENAY (Chicoutimi/Jonquière) ═════
    ('Saguenay', 'Chicoutimi',  'McDonald''s Talbot',               '1925 Bd Talbot, Saguenay, QC G7H 4B5',             48.4015::double precision, -71.0855::double precision, 'restaurant', '5h-23h',     true, true, true, ''),
    ('Saguenay', 'Chicoutimi',  'Tim Hortons Racine',               '414 Rue Racine E, Saguenay, QC G7H 1S8',           48.4290::double precision, -71.0590::double precision, 'restaurant', '5h-22h',     true, true, true, ''),
    ('Saguenay', 'Jonquière',   'McDonald''s du Royaume',           '2655 Bd du Royaume, Saguenay, QC G7S 5B8',         48.4090::double precision, -71.2375::double precision, 'restaurant', '5h-23h',     true, true, true, ''),
    ('Saguenay', 'Chicoutimi',  'IGA Place du Royaume',             '1401 Bd Talbot, Saguenay, QC G7H 4B5',             48.4060::double precision, -71.0820::double precision, 'commerce',   'Lun-Dim 7h-23h', true, true, true, ''),
    ('Saguenay', 'Chicoutimi',  'Place du Royaume',                 '1401 Bd Talbot, Saguenay, QC G7H 4B5',             48.4060::double precision, -71.0820::double precision, 'commerce',   'Lun-Dim 9h-21h', true, true, true, 'Grand centre commercial')

  ) as v(city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  where not exists (
    select 1 from public.safe_meeting_points sp
    where sp.city = v.city and sp.name = v.name
  );
end $$;

-- ✅ VÉRIFICATION : total par ville
select city, count(*) as nb_points
from public.safe_meeting_points
where active = true
group by city
order by nb_points desc;

-- Détail par ville et type
select city, type, count(*) as nb
from public.safe_meeting_points
where active = true
group by city, type
order by city, type;
