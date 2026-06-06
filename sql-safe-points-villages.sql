-- ═══════════════════════════════════════════════════════════════════════════
-- PorteàPorte — POINTS DE RENCONTRE : VILLAGES & PETITES PAROISSES DU QUÉBEC
-- Lieux publics fiables du village : église, hôtel de ville / mairie,
-- dépanneur, centre communautaire.
--
-- ⚠️ COORDONNÉES APPROXIMATIVES (centre du village). Elles servent à situer
--    le village sur la carte ; le point de rencontre exact est le bâtiment
--    nommé (église, mairie, dépanneur). C'est précisé dans la colonne "notes".
--
-- Types utilisés (cohérents avec l'icône front-end) :
--   'autre'           📍  → église, mairie/hôtel de ville, centre communautaire
--   'commerce'        🛒  → dépanneur / épicerie de village
--   'station_essence' ⛽  → dépanneur avec poste d'essence (Couche-Tard, etc.)
--
-- À copier dans Supabase → SQL Editor → RUN
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  insert into public.safe_meeting_points (city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  select * from (values

    -- ═════ PORTNEUF / CAPITALE-NATIONALE ═════
    ('Pont-Rouge',          'Centre', 'Église Sainte-Jeanne-de-Chantal', 'Rue Dupont, Pont-Rouge, QC',          46.7560::double precision, -71.6960::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village). Stationnement de l''église.'),
    ('Saint-Raymond',       'Centre', 'Place de l''Hôtel de Ville',       'Av Saint-Jacques, Saint-Raymond, QC', 46.9010::double precision, -71.8390::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Donnacona',           'Centre', 'Dépanneur centre Donnacona',      'Rue Notre-Dame, Donnacona, QC',       46.6790::double precision, -71.7270::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Neuville',            'Centre', 'Église Saint-François-de-Sales',  'Rue des Érables, Neuville, QC',        46.6960::double precision, -71.5790::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Marc-des-Carrières','Centre','Hôtel de ville',               'Bd Bona-Dussault, St-Marc-des-Carrières, QC', 46.6800::double precision, -72.0490::double precision, 'autre', 'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Cap-Santé',           'Centre', 'Église Sainte-Famille',           'Rue Notre-Dame, Cap-Santé, QC',       46.6720::double precision, -71.7880::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ ÎLE D'ORLÉANS / CÔTE-DE-BEAUPRÉ ═════
    ('Sainte-Famille',      'Île d''Orléans', 'Église Sainte-Famille',   'Ch Royal, Sainte-Famille, QC',        46.9670::double precision, -70.9560::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Pierre-de-l''Île-d''Orléans','Île d''Orléans','Église Saint-Pierre','Ch Royal, St-Pierre, QC',       46.9080::double precision, -71.0640::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Beaupré',             'Centre', 'Dépanneur centre Beaupré',        'Av Royale, Beaupré, QC',              47.0470::double precision, -70.8930::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Château-Richer',      'Centre', 'Église Notre-Dame-de-la-Visitation','Av Royale, Château-Richer, QC',     46.9670::double precision, -71.0190::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ CHARLEVOIX ═════
    ('Baie-Saint-Paul',     'Centre', 'Hôtel de ville',                  'Rue Forget, Baie-Saint-Paul, QC',     47.4420::double precision, -70.4990::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('La Malbaie',          'Centre', 'Dépanneur centre La Malbaie',     'Bd de Comporté, La Malbaie, QC',      47.6540::double precision, -70.1520::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Siméon',        'Centre', 'Église Saint-Siméon',             'Rue Saint-Laurent, Saint-Siméon, QC', 47.8430::double precision, -69.8810::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ CHAUDIÈRE-APPALACHES / BELLECHASSE ═════
    ('Saint-Henri',         'Centre', 'Église Saint-Henri',              'Rue Commerciale, Saint-Henri, QC',    46.6940::double precision, -71.0680::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Anselme',       'Centre', 'Dépanneur centre Saint-Anselme',  'Rue Principale, Saint-Anselme, QC',   46.6320::double precision, -70.9650::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Lazare-de-Bellechasse','Centre','Église Saint-Lazare',       'Rue Principale, St-Lazare, QC',       46.6590::double precision, -70.7530::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Claire',       'Centre', 'Hôtel de ville',                  'Rue Principale, Sainte-Claire, QC',   46.6050::double precision, -70.8650::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Charles-de-Bellechasse','Centre','Église Saint-Charles',     'Av Royale, St-Charles, QC',           46.7290::double precision, -70.9510::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Michel-de-Bellechasse','Centre','Quai / Église Saint-Michel','Rue Principale, St-Michel, QC',       46.8740::double precision, -70.9020::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Lac-Etchemin',        'Centre', 'Dépanneur centre Lac-Etchemin',   '2e Avenue, Lac-Etchemin, QC',         46.3950::double precision, -70.5060::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Justine',      'Centre', 'Église Sainte-Justine',           'Rue Principale, Sainte-Justine, QC',  46.3360::double precision, -70.3550::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ BEAUCE ═════
    ('Beauceville',         'Centre', 'Église Saint-François-d''Assise',  'Bd Renault, Beauceville, QC',         46.2090::double precision, -70.7790::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Joseph-de-Beauce','Centre','Hôtel de ville',                 'Av du Palais, St-Joseph-de-Beauce, QC',46.3010::double precision, -70.8740::double precision, 'autre',   'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Prosper',       'Centre', 'Dépanneur centre Saint-Prosper',  '20e Avenue, Saint-Prosper, QC',       46.2310::double precision, -70.4880::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Lac-Mégantic',        'Centre', 'Hôtel de ville',                  'Rue Notre-Dame, Lac-Mégantic, QC',    45.5830::double precision, -70.8830::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Vallée-Jonction',     'Centre', 'Église / gare patrimoniale',      'Rue Principale, Vallée-Jonction, QC', 46.3680::double precision, -70.9170::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ LOTBINIÈRE ═════
    ('Laurier-Station',     'Centre', 'Dépanneur centre Laurier-Station','Rue de la Station, Laurier-Station, QC',46.5410::double precision, -71.6390::double precision, 'commerce','Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Apollinaire',   'Centre', 'Église Saint-Apollinaire',        'Rue Principale, St-Apollinaire, QC',  46.6080::double precision, -71.5160::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Croix',        'Centre', 'Église Sainte-Croix',             'Rue Principale, Sainte-Croix, QC',    46.6240::double precision, -71.7280::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ MONTMAGNY / L'ISLET ═════
    ('Montmagny',           'Centre', 'Hôtel de ville',                  'Av Sainte-Marie, Montmagny, QC',      46.9810::double precision, -70.5560::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Jean-Port-Joli','Centre', 'Église Saint-Jean-Baptiste',      'Av de Gaspé, St-Jean-Port-Joli, QC',  47.2150::double precision, -70.2680::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('L''Islet',            'Centre', 'Église Notre-Dame-de-Bonsecours', 'Ch des Pionniers, L''Islet, QC',      47.1230::double precision, -70.3490::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ ESTRIE ═════
    ('Coaticook',           'Centre', 'Hôtel de ville',                  'Rue Child, Coaticook, QC',            45.1340::double precision, -71.8010::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Windsor',             'Centre', 'Dépanneur centre Windsor',        'Rue Principale, Windsor, QC',         45.5680::double precision, -72.0010::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('East Angus',          'Centre', 'Hôtel de ville',                  'Rue Angus, East Angus, QC',           45.4880::double precision, -71.6650::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Valcourt',            'Centre', 'Église Saint-Joseph',             'Rue Saint-Joseph, Valcourt, QC',      45.5050::double precision, -72.3170::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Asbestos (Val-des-Sources)','Centre','Hôtel de ville',             'Bd Saint-Luc, Val-des-Sources, QC',   45.7740::double precision, -71.9320::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ MONTÉRÉGIE / CANTONS ═════
    ('Bromont',             'Centre', 'Hôtel de ville',                  'Bd de Bromont, Bromont, QC',          45.3190::double precision, -72.6510::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Cowansville',         'Centre', 'Dépanneur centre Cowansville',    'Rue Principale, Cowansville, QC',     45.2070::double precision, -72.7470::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Farnham',             'Centre', 'Église Saint-Romuald',            'Rue Principale, Farnham, QC',         45.2840::double precision, -72.9870::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Lac-Brome (Knowlton)','Centre', 'Hôtel de ville',                  'Ch Lakeside, Lac-Brome, QC',          45.2230::double precision, -72.5160::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ CENTRE-DU-QUÉBEC ═════
    ('Plessisville',        'Centre', 'Hôtel de ville',                  'Av Saint-Louis, Plessisville, QC',    46.2230::double precision, -71.7660::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Princeville',         'Centre', 'Église Saint-Eusèbe',             'Rue Saint-Jean-Baptiste, Princeville, QC',46.1690::double precision, -71.8770::double precision, 'autre', 'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Nicolet',             'Centre', 'Cathédrale de Nicolet',           'Rue Mgr-Brunault, Nicolet, QC',       46.2230::double precision, -72.6140::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Bécancour',          'Centre', 'Hôtel de ville',                  'Av Nicolas-Perrot, Bécancour, QC',    46.3380::double precision, -72.4320::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Warwick',             'Centre', 'Dépanneur centre Warwick',        'Rue Saint-Louis, Warwick, QC',        45.9530::double precision, -71.9750::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ MAURICIE ═════
    ('Shawinigan',          'Centre', 'Hôtel de ville',                  'Av de la Station, Shawinigan, QC',    46.5670::double precision, -72.7440::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Louiseville',         'Centre', 'Église Saint-Antoine-de-Padoue',  'Av Saint-Laurent, Louiseville, QC',   46.2540::double precision, -72.9450::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Tite',          'Centre', 'Dépanneur centre Saint-Tite',     'Rue Notre-Dame, Saint-Tite, QC',      46.7320::double precision, -72.5680::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village). Festival western.'),
    ('La Tuque',            'Centre', 'Hôtel de ville',                  'Rue Saint-Joseph, La Tuque, QC',      47.4380::double precision, -72.7820::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ LANAUDIÈRE ═════
    ('Berthierville',       'Centre', 'Église Sainte-Geneviève',         'Rue De Bienville, Berthierville, QC', 46.0850::double precision, -73.1810::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Rawdon',              'Centre', 'Hôtel de ville',                  'Rue Queen, Rawdon, QC',               46.0530::double precision, -73.7140::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Gabriel-de-Brandon','Centre','Dépanneur centre St-Gabriel',  'Rue Maskinongé, St-Gabriel, QC',      46.2950::double precision, -73.3870::double precision, 'commerce','Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ LAURENTIDES ═════
    ('Sainte-Adèle',        'Centre', 'Hôtel de ville',                  'Rue Meilleur, Sainte-Adèle, QC',      45.9510::double precision, -74.1330::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Mont-Tremblant',      'Centre', 'Hôtel de ville',                  'Ch du Village, Mont-Tremblant, QC',   46.1190::double precision, -74.5970::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Mont-Laurier',        'Centre', 'Cathédrale Notre-Dame-de-Fourvière','Bd Albiny-Paquette, Mont-Laurier, QC',46.5510::double precision, -75.4990::double precision, 'autre', 'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ OUTAOUAIS ═════
    ('Maniwaki',            'Centre', 'Hôtel de ville',                  'Rue Notre-Dame, Maniwaki, QC',        46.3790::double precision, -75.9660::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Buckingham',          'Centre', 'Église Saint-Grégoire',           'Rue Maclaren, Gatineau (Buckingham), QC',45.5870::double precision, -75.4180::double precision, 'autre',  'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ BAS-SAINT-LAURENT ═════
    ('Trois-Pistoles',      'Centre', 'Église Notre-Dame-des-Neiges',    'Rue Notre-Dame, Trois-Pistoles, QC',  48.1230::double precision, -69.1810::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Témiscouata-sur-le-Lac','Centre','Hôtel de ville',                 'Rue Commerciale, Témiscouata, QC',    47.6790::double precision, -68.8780::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Amqui',               'Centre', 'Dépanneur centre Amqui',          'Bd Saint-Benoît, Amqui, QC',          48.4660::double precision, -67.4310::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Mont-Joli',           'Centre', 'Hôtel de ville',                  'Av du Sanatorium, Mont-Joli, QC',     48.5840::double precision, -68.1920::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ GASPÉSIE ═════
    ('Sainte-Anne-des-Monts','Centre','Hôtel de ville',                  '1re Avenue, Sainte-Anne-des-Monts, QC',49.1290::double precision, -66.4940::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Chandler',            'Centre', 'Église / centre-ville Chandler',  'Rue Commerciale, Chandler, QC',       48.3470::double precision, -64.6800::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Carleton-sur-Mer',    'Centre', 'Hôtel de ville',                  'Rue de la Montagne, Carleton, QC',    48.1050::double precision, -66.1320::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ CÔTE-NORD ═════
    ('Port-Cartier',        'Centre', 'Hôtel de ville',                  'Bd des Îles, Port-Cartier, QC',       50.0350::double precision, -66.8680::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Forestville',         'Centre', 'Dépanneur centre Forestville',    'Rue de la Verdure, Forestville, QC',  48.7370::double precision, -69.0850::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ SAGUENAY–LAC-SAINT-JEAN ═════
    ('Alma',                'Centre', 'Hôtel de ville',                  'Rue du Pont, Alma, QC',               48.5500::double precision, -71.6490::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Roberval',            'Centre', 'Église Notre-Dame-de-Roberval',   'Bd Saint-Joseph, Roberval, QC',       48.5180::double precision, -72.2280::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Félicien',      'Centre', 'Dépanneur centre Saint-Félicien', 'Bd Sacré-Cœur, Saint-Félicien, QC',   48.6500::double precision, -72.4490::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Dolbeau-Mistassini',  'Centre', 'Hôtel de ville',                  'Bd Wallberg, Dolbeau-Mistassini, QC', 48.8770::double precision, -72.2300::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ ABITIBI-TÉMISCAMINGUE ═════
    ('Amos',                'Centre', 'Cathédrale Sainte-Thérèse',       '11e Avenue, Amos, QC',                48.5660::double precision, -78.1160::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('La Sarre',            'Centre', 'Hôtel de ville',                  '6e Avenue, La Sarre, QC',             48.7980::double precision, -79.1970::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Ville-Marie',         'Centre', 'Dépanneur centre Ville-Marie',    'Rue Notre-Dame, Ville-Marie, QC',     47.3340::double precision, -79.4310::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).')

  ) as v(city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  where not exists (
    select 1 from public.safe_meeting_points sp
    where sp.city = v.city and sp.name = v.name
  );
end $$;

-- ✅ VÉRIFICATION : points par ville (du plus récent au plus fourni)
select city, count(*) as nb_points
from public.safe_meeting_points
where active = true
group by city
order by nb_points desc;
