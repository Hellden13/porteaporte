-- ═══════════════════════════════════════════════════════════════════════════
-- PorteàPorte — MEGA EXPANSION : Subway, Provigo, Walmart, Canadian Tire
-- + Nouvelles villes : Rimouski, Drummondville, Gatineau, St-Jean-sur-Richelieu
-- + Plus de Montréal
-- À copier dans Supabase SQL Editor → RUN
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  insert into public.safe_meeting_points (city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  select * from (values

    -- ═════ MONTRÉAL — EXPANSION ═════
    ('Montréal', 'Côte-des-Neiges', 'Walmart Côte-des-Neiges',     '6700 Ch de la Côte-des-Neiges, Montréal, QC H3S 2A4', 45.4990::double precision, -73.6310::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, 'Grand stationnement'),
    ('Montréal', 'Anjou',           'Walmart Anjou',                '7077 Bd des Galeries d''Anjou, Anjou, QC H1M 3W2',    45.6020::double precision, -73.5615::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, 'Galeries d''Anjou'),
    ('Montréal', 'Lachine',         'Canadian Tire Lachine',        '775 Bd St-Joseph, Lachine, QC H8S 2L3',               45.4395::double precision, -73.6760::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),
    ('Montréal', 'Saint-Léonard',   'Canadian Tire Saint-Léonard',  '5300 Rue Jean-Talon E, Saint-Léonard, QC H1S 3G8',    45.5810::double precision, -73.6010::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),
    ('Montréal', 'Centre-Ville',    'Subway Sainte-Catherine',      '1255 Rue Sainte-Catherine O, Montréal, QC H3G 1P6',   45.4995::double precision, -73.5725::double precision, 'restaurant',      '7h-23h',         true, true, false,''),
    ('Montréal', 'Plateau',         'Provigo Mont-Royal',           '50 Av du Mont-Royal O, Montréal, QC H2T 2R6',         45.5215::double precision, -73.5870::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, false,''),
    ('Montréal', 'Verdun',          'Provigo Verdun',               '3690 Bd LaSalle, Verdun, QC H4G 1Z3',                 45.4565::double precision, -73.5740::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),
    ('Montréal', 'Pointe-Claire',   'Walmart Pointe-Claire',        '6700 Trans-Canada Hwy, Pointe-Claire, QC H9R 1C2',    45.4595::double precision, -73.8275::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, 'Près A-40'),
    ('Montréal', 'LaSalle',         'IGA Extra LaSalle',            '7919 Bd Newman, LaSalle, QC H8N 1X7',                 45.4350::double precision, -73.6090::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),

    -- ═════ QUÉBEC — AJOUTS SUBWAY/PROVIGO/WALMART ═════
    ('Québec', 'Sainte-Foy',        'Walmart Sainte-Foy',           '2450 Bd Laurier, Québec, QC G1V 2L1',                 46.7785::double precision, -71.2765::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, 'Place Sainte-Foy'),
    ('Québec', 'Beauport',          'Walmart Beauport',             '800 Bd des Chutes, Québec, QC G1E 6Y3',               46.8775::double precision, -71.1625::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),
    ('Québec', 'Sainte-Foy',        'Canadian Tire Sainte-Foy',     '2450 Bd Laurier, Québec, QC G1V 2L1',                 46.7785::double precision, -71.2755::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),
    ('Québec', 'Charlesbourg',      'Canadian Tire Charlesbourg',   '8000 Bd Henri-Bourassa, Québec, QC G1G 4C7',          46.8615::double precision, -71.2815::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),
    ('Québec', 'Sainte-Foy',        'Subway Bd Laurier',            '2700 Bd Laurier #150, Québec, QC G1V 2L8',            46.7800::double precision, -71.2705::double precision, 'restaurant',      '7h-22h',         true, true, true, ''),
    ('Québec', 'Limoilou',          'Provigo Limoilou',             '500 3e Avenue, Québec, QC G1L 2W6',                   46.8305::double precision, -71.2190::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),
    ('Québec', 'Vanier',            'Provigo Vanier',               '275 Av Saint-Sacrement, Québec, QC G1N 3X4',          46.8195::double precision, -71.2545::double precision, 'commerce',        'Lun-Dim 7h-22h', true, true, true, ''),

    -- ═════ LÉVIS — AJOUTS ═════
    ('Lévis', 'Lévis (centre)',     'Walmart Lévis',                '1200 Bd Alphonse-Desjardins, Lévis, QC G6V 6Y8',      46.7870::double precision, -71.1870::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, 'Galeries Chagnon'),
    ('Lévis', 'Lévis (centre)',     'Canadian Tire Lévis',          '1200 Bd Alphonse-Desjardins, Lévis, QC G6V 6Y8',      46.7872::double precision, -71.1865::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),
    ('Lévis', 'St-Romuald',         'Subway St-Romuald',            '465 Route Lagueux, Lévis, QC G6W 5M5',                46.7458::double precision, -71.2470::double precision, 'restaurant',      '7h-22h',         true, true, true, ''),
    ('Lévis', 'Lévis (centre)',     'Provigo Lévis',                '5700 Bd Guillaume-Couture, Lévis, QC G6V 4Z3',        46.7920::double precision, -71.1830::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),

    -- ═════ GATINEAU ═════
    ('Gatineau', 'Hull',            'Galeries de Hull',             '320 Bd St-Joseph, Gatineau, QC J8Y 3Y8',              45.4275::double precision, -75.7320::double precision, 'commerce',        'Lun-Dim 9h-21h', true, true, true, 'Grand centre commercial'),
    ('Gatineau', 'Hull',            'McDonald''s St-Joseph',        '155 Bd St-Joseph, Gatineau, QC J8Y 3W8',              45.4265::double precision, -75.7155::double precision, 'restaurant',      '5h-23h',         true, true, true, ''),
    ('Gatineau', 'Hull',            'Tim Hortons Maisonneuve',      '100 Promenade du Portage, Gatineau, QC J8X 4A4',      45.4225::double precision, -75.7180::double precision, 'restaurant',      '5h-22h',         true, true, false,'Centre-ville Hull'),
    ('Gatineau', 'Hull',            'Couche-Tard St-Joseph',        '420 Bd St-Joseph, Gatineau, QC J8Y 3Y8',              45.4280::double precision, -75.7340::double precision, 'station_essence', '24/7',           true, true, true, ''),
    ('Gatineau', 'Aylmer',          'IGA Aylmer',                   '181 Rue Principale, Gatineau, QC J9H 3M9',            45.3970::double precision, -75.8385::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),
    ('Gatineau', 'Hull',            'Walmart Gatineau',             '1100 Bd Maloney O, Gatineau, QC J8T 6G3',             45.4775::double precision, -75.7050::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),
    ('Gatineau', 'Hull',            'Canadian Tire Maloney',        '740 Bd Maloney O, Gatineau, QC J8T 3R8',              45.4765::double precision, -75.6985::double precision, 'commerce',        'Lun-Dim 8h-22h', true, true, true, ''),

    -- ═════ DRUMMONDVILLE ═════
    ('Drummondville', 'Centre',     'McDonald''s Bd Lemire',        '630 Bd Lemire, Drummondville, QC J2C 7W3',            45.8800::double precision, -72.4880::double precision, 'restaurant',      '5h-23h',         true, true, true, ''),
    ('Drummondville', 'Centre',     'Tim Hortons St-Joseph',        '975 Bd St-Joseph, Drummondville, QC J2C 2C7',         45.8835::double precision, -72.4775::double precision, 'restaurant',      '24/7',           true, true, true, ''),
    ('Drummondville', 'Centre',     'Promenades Drummondville',     '755 Bd René-Lévesque, Drummondville, QC J2C 7P7',     45.8760::double precision, -72.4845::double precision, 'commerce',        'Lun-Dim 9h-21h', true, true, true, 'Grand centre commercial'),
    ('Drummondville', 'Centre',     'Walmart Drummondville',        '755 Bd René-Lévesque, Drummondville, QC J2C 7P7',     45.8755::double precision, -72.4855::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),
    ('Drummondville', 'Centre',     'Couche-Tard Bd Lemire',        '720 Bd Lemire, Drummondville, QC J2C 7W4',            45.8810::double precision, -72.4895::double precision, 'station_essence', '24/7',           true, true, true, ''),
    ('Drummondville', 'Centre',     'IGA Drummondville',            '1180 Bd Mercure, Drummondville, QC J2B 3X2',          45.8895::double precision, -72.4720::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),

    -- ═════ SAINT-JEAN-SUR-RICHELIEU ═════
    ('Saint-Jean-sur-Richelieu', 'Centre', 'McDonald''s Bd du Séminaire', '1010 Bd du Séminaire N, Saint-Jean-sur-Richelieu, QC J3A 1K1', 45.3215::double precision, -73.2700::double precision, 'restaurant', '5h-23h', true, true, true, ''),
    ('Saint-Jean-sur-Richelieu', 'Centre', 'Tim Hortons Pierre-Caisse','750 Rue Pierre-Caisse, Saint-Jean-sur-Richelieu, QC J3A 1M1', 45.3170::double precision, -73.2730::double precision, 'restaurant', '24/7', true, true, true, ''),
    ('Saint-Jean-sur-Richelieu', 'Centre', 'Carrefour Richelieu',  '600 Rue Pierre-Caisse, Saint-Jean-sur-Richelieu, QC J3A 1M1', 45.3160::double precision, -73.2740::double precision, 'commerce', 'Lun-Dim 9h-21h', true, true, true, 'Grand centre commercial'),
    ('Saint-Jean-sur-Richelieu', 'Centre', 'Walmart St-Jean',      '900 Bd du Séminaire N, Saint-Jean-sur-Richelieu, QC J3A 1K1', 45.3200::double precision, -73.2710::double precision, 'commerce', 'Lun-Dim 7h-23h', true, true, true, ''),
    ('Saint-Jean-sur-Richelieu', 'Centre', 'Couche-Tard du Séminaire','555 Bd du Séminaire N, Saint-Jean-sur-Richelieu, QC J3B 5L4',45.3130::double precision, -73.2750::double precision, 'station_essence', '24/7', true, true, true, ''),
    ('Saint-Jean-sur-Richelieu', 'Centre', 'IGA Saint-Jean',       '395 Bd du Séminaire N, Saint-Jean-sur-Richelieu, QC J3B 8C2', 45.3105::double precision, -73.2770::double precision, 'commerce', 'Lun-Dim 7h-23h', true, true, true, ''),

    -- ═════ RIMOUSKI ═════
    ('Rimouski', 'Centre',          'McDonald''s René-Lepage',      '419 Bd René-Lepage E, Rimouski, QC G5L 1P3',          48.4495::double precision, -68.5285::double precision, 'restaurant',      '5h-23h',         true, true, true, ''),
    ('Rimouski', 'Centre',          'Tim Hortons St-Germain',       '170 Bd St-Germain O, Rimouski, QC G5L 4B4',           48.4480::double precision, -68.5380::double precision, 'restaurant',      '5h-22h',         true, true, true, ''),
    ('Rimouski', 'Centre',          'Carrefour Rimouski',           '419 Bd Jessop, Rimouski, QC G5L 1Z9',                 48.4510::double precision, -68.5340::double precision, 'commerce',        'Lun-Dim 9h-21h', true, true, true, 'Grand centre commercial'),
    ('Rimouski', 'Centre',          'Walmart Rimouski',             '410 Bd Jessop, Rimouski, QC G5L 1Z9',                 48.4515::double precision, -68.5335::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),
    ('Rimouski', 'Centre',          'IGA Extra Rimouski',           '370 Bd Jessop, Rimouski, QC G5L 1Z9',                 48.4520::double precision, -68.5330::double precision, 'commerce',        'Lun-Dim 7h-23h', true, true, true, ''),
    ('Rimouski', 'Centre',          'Couche-Tard René-Lepage',      '350 Bd René-Lepage E, Rimouski, QC G5L 1P2',          48.4485::double precision, -68.5300::double precision, 'station_essence', '24/7',           true, true, true, ''),

    -- ═════ SUBWAY POUR VILLES PRINCIPALES (multi-localisation) ═════
    ('Sherbrooke', 'Centre',        'Subway Bd Portland',           '3050 Bd de Portland, Sherbrooke, QC J1L 1K1',         45.4082::double precision, -71.9498::double precision, 'restaurant',      '8h-22h',         true, true, true, 'Carrefour de l''Estrie'),
    ('Trois-Rivières', 'Centre',    'Subway Bd des Récollets',      '2000 Bd des Récollets, Trois-Rivières, QC G8Z 4H1',   46.3518::double precision, -72.5705::double precision, 'restaurant',      '8h-22h',         true, true, true, ''),
    ('Laval', 'Chomedey',           'Subway Carrefour Laval',       '3035 Bd Le Carrefour, Laval, QC H7T 1C8',             45.5570::double precision, -73.7400::double precision, 'restaurant',      '8h-22h',         true, true, true, ''),
    ('Saguenay', 'Chicoutimi',      'Subway Talbot',                '1800 Bd Talbot, Saguenay, QC G7H 4B4',                48.4010::double precision, -71.0860::double precision, 'restaurant',      '8h-22h',         true, true, true, '')

  ) as v(city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  where not exists (
    select 1 from public.safe_meeting_points sp
    where sp.city = v.city and sp.name = v.name
  );
end $$;

-- ✅ TOTAL FINAL PAR VILLE
select city, count(*) as nb_points
from public.safe_meeting_points
where active = true
group by city
order by nb_points desc;
