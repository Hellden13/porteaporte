-- ═══════════════════════════════════════════════════════════════════════════
-- PorteàPorte — GROS LOT 2 : points de rencontre villages & paroisses
-- Église / hôtel de ville / dépanneur — répartis sur les grands corridors.
-- ⚠️ COORDONNÉES APPROXIMATIVES (centre du village) — précisé dans "notes".
-- Anti-doublon : relançable sans risque.
-- À copier dans Supabase → SQL Editor → RUN
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  insert into public.safe_meeting_points (city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  select * from (values

    -- ═════ CÔTE-DU-SUD : L'ISLET / MONTMAGNY ═════
    ('Saint-Pamphile',          'Centre', 'Hôtel de ville',                  'Rue Principale, Saint-Pamphile, QC',     46.9720::double precision, -69.7870::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Perpétue',         'Centre', 'Église Sainte-Perpétue',          'Rue Principale, Sainte-Perpétue, QC',    47.0050::double precision, -69.9650::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Aubert',            'Centre', 'Église Saint-Aubert',             'Rue Principale, Saint-Aubert, QC',       47.1880::double precision, -70.2230::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Roch-des-Aulnaies', 'Centre', 'Seigneurie / Église',             'Route de la Seigneurie, St-Roch, QC',    47.2380::double precision, -70.2050::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Cap-Saint-Ignace',        'Centre', 'Église Cap-Saint-Ignace',         'Rue du Manoir, Cap-Saint-Ignace, QC',    47.0330::double precision, -70.4640::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Berthier-sur-Mer',        'Centre', 'Marina / Église',                 'Bd Blais, Berthier-sur-Mer, QC',         46.9320::double precision, -70.7340::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Fabien-de-Panet',   'Centre', 'Dépanneur centre Panet',          'Rue Principale, St-Fabien-de-Panet, QC', 46.8800::double precision, -70.0050::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ KAMOURASKA ═════
    ('Saint-Pascal',            'Centre', 'Hôtel de ville',                  'Av Patry, Saint-Pascal, QC',             47.5260::double precision, -69.8050::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('La Pocatière',            'Centre', 'Hôtel de ville',                  'Av Painchaud, La Pocatière, QC',         47.3650::double precision, -70.0330::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Kamouraska',              'Centre', 'Église Saint-Louis',              'Av Morel, Kamouraska, QC',               47.5650::double precision, -69.8650::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Alexandre-de-Kamouraska','Centre','Église / dépanneur',         'Rue Principale, St-Alexandre, QC',       47.4380::double precision, -69.6470::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Mont-Carmel',             'Centre', 'Église Mont-Carmel',              'Rue de l''Église, Mont-Carmel, QC',      47.4290::double precision, -69.8980::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Rivière-Ouelle',          'Centre', 'Église Rivière-Ouelle',           'Route 132, Rivière-Ouelle, QC',          47.4360::double precision, -70.0250::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ TÉMISCOUATA / RIVIÈRE-DU-LOUP ═════
    ('Cacouna',                 'Centre', 'Église Cacouna',                  'Rue de l''Église, Cacouna, QC',          47.9120::double precision, -69.5070::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('L''Isle-Verte',           'Centre', 'Hôtel de ville',                  'Rue Saint-Jean-Baptiste, L''Isle-Verte, QC',48.0100::double precision, -69.3400::double precision, 'autre',  'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Antonin',           'Centre', 'Dépanneur centre Saint-Antonin',  'Rue Principale, Saint-Antonin, QC',      47.7650::double precision, -69.4750::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Pohénégamook',            'Centre', 'Hôtel de ville',                  'Rue Principale, Pohénégamook, QC',       47.4690::double precision, -69.2240::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Dégelis',                 'Centre', 'Hôtel de ville',                  'Av Principale, Dégelis, QC',             47.5520::double precision, -68.6480::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Squatec',                 'Centre', 'Dépanneur centre Squatec',        'Rue Saint-Joseph, Squatec, QC',          47.8830::double precision, -68.7180::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ RIMOUSKI / LA MITIS ═════
    ('Le Bic',                  'Centre', 'Église du Bic',                   'Rue Saint-Cécile, Le Bic, QC',           48.3700::double precision, -68.6960::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Fabien',            'Centre', 'Église Saint-Fabien',             'Route 132, Saint-Fabien, QC',            48.2900::double precision, -68.8540::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Luce',             'Centre', 'Église / Promenade de l''Anse',   'Route du Fleuve, Sainte-Luce, QC',       48.5430::double precision, -68.3760::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Flavie',           'Centre', 'Centre d''art / Église',          'Route de la Mer, Sainte-Flavie, QC',     48.6080::double precision, -68.2280::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Gabriel-de-Rimouski','Centre','Dépanneur centre',               'Rue Principale, St-Gabriel-de-Rimouski, QC',48.3450::double precision, -68.1670::double precision, 'commerce','Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ MATAPÉDIA / MATANIE ═════
    ('Causapscal',              'Centre', 'Hôtel de ville',                  'Rue Saint-Jacques, Causapscal, QC',      48.3590::double precision, -67.2330::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sayabec',                 'Centre', 'Dépanneur centre Sayabec',        'Rue Keable, Sayabec, QC',                48.5670::double precision, -67.6850::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Ulric',             'Centre', 'Église Saint-Ulric',             'Route 132, Saint-Ulric, QC',             48.7800::double precision, -67.7150::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-René-de-Matane',    'Centre', 'Église Saint-René',              'Rue Principale, St-René-de-Matane, QC',  48.7060::double precision, -67.3900::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ GASPÉSIE ═════
    ('Cap-Chat',                'Centre', 'Hôtel de ville',                  'Rue Notre-Dame, Cap-Chat, QC',           49.0950::double precision, -66.6920::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Murdochville',            'Centre', 'Hôtel de ville',                  'Rue Dr-William-May, Murdochville, QC',   48.9590::double precision, -65.5050::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Grande-Rivière',          'Centre', 'Hôtel de ville',                  'Rue de la Cathédrale, Grande-Rivière, QC',48.3970::double precision, -64.4970::double precision, 'autre',   'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Paspébiac',               'Centre', 'Site historique / Église',        'Bd Gérard-D.-Levesque, Paspébiac, QC',   48.0470::double precision, -65.2400::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Bonaventure',             'Centre', 'Hôtel de ville',                  'Av Grand-Pré, Bonaventure, QC',          48.0470::double precision, -65.4920::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('New Richmond',            'Centre', 'Hôtel de ville',                  'Bd Perron, New Richmond, QC',            48.1580::double precision, -65.8590::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Maria',                   'Centre', 'Dépanneur centre Maria',          'Bd Perron, Maria, QC',                   48.1700::double precision, -65.9870::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Percé',                   'Centre', 'Bureau d''accueil touristique',   'Route 132, Percé, QC',                   48.5240::double precision, -64.2130::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ CÔTE-NORD ═════
    ('Tadoussac',               'Centre', 'Quai / Église la plus ancienne',  'Rue du Bord-de-l''Eau, Tadoussac, QC',   48.1430::double precision, -69.7160::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Les Escoumins',           'Centre', 'Hôtel de ville',                  'Rue de l''Église, Les Escoumins, QC',    48.3540::double precision, -69.4090::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sacré-Cœur',              'Centre', 'Dépanneur centre Sacré-Cœur',     'Route 172, Sacré-Cœur, QC',              48.2280::double precision, -69.8200::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Havre-Saint-Pierre',      'Centre', 'Hôtel de ville',                  'Rue de la Berge, Havre-Saint-Pierre, QC',50.2410::double precision, -63.5990::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Natashquan',              'Centre', 'Galerie / Église',                'Allée des Galets, Natashquan, QC',       50.1880::double precision, -61.8200::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ SAGUENAY–LAC-SAINT-JEAN ═════
    ('Saint-Félicien',          'Centre', 'Hôtel de ville',                  'Bd Sacré-Cœur, Saint-Félicien, QC',      48.6500::double precision, -72.4490::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Normandin',               'Centre', 'Hôtel de ville',                  'Rue Saint-Cyrille, Normandin, QC',       48.8330::double precision, -72.5320::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Métabetchouan-Lac-à-la-Croix','Centre','Église / dépanneur',          'Rue Saint-André, Métabetchouan, QC',     48.4350::double precision, -71.8480::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Hébertville',             'Centre', 'Église Hébertville',              'Rue Turgeon, Hébertville, QC',           48.4090::double precision, -71.6720::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Bruno',             'Centre', 'Dépanneur centre Saint-Bruno',    'Rue Saint-Alphonse, Saint-Bruno, QC',    48.4640::double precision, -71.6450::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Chambord',                'Centre', 'Église Chambord',                 'Rue Principale, Chambord, QC',           48.4280::double precision, -72.0640::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Prime',             'Centre', 'Fromagerie / Église',             'Rue Principale, Saint-Prime, QC',        48.5840::double precision, -72.3340::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Fulgence',          'Centre', 'Église Saint-Fulgence',           'Rue du Saguenay, Saint-Fulgence, QC',    48.4490::double precision, -70.8980::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Ambroise',          'Centre', 'Hôtel de ville',                  'Rue Simard, Saint-Ambroise, QC',         48.5500::double precision, -71.3340::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Honoré',            'Centre', 'Hôtel de ville',                  'Bd Martel, Saint-Honoré, QC',            48.5320::double precision, -71.0840::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ MAURICIE ═════
    ('Sainte-Anne-de-la-Pérade','Centre', 'Église Sainte-Anne',             'Rue Sainte-Anne, Ste-Anne-de-la-Pérade, QC',46.5790::double precision, -72.2010::double precision, 'autre','Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Narcisse',          'Centre', 'Église Saint-Narcisse',          'Rue Principale, Saint-Narcisse, QC',     46.5680::double precision, -72.4310::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Étienne-des-Grès',  'Centre', 'Dépanneur centre',               'Rue Principale, St-Étienne-des-Grès, QC',46.4380::double precision, -72.7720::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Alexis-des-Monts',  'Centre', 'Hôtel de ville',                  'Rue Saint-Olivier, St-Alexis-des-Monts, QC',46.4400::double precision, -73.1230::double precision, 'autre','Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Yamachiche',              'Centre', 'Église Yamachiche',              'Rue Sainte-Anne, Yamachiche, QC',        46.2700::double precision, -72.8270::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Thècle',           'Centre', 'Dépanneur centre Sainte-Thècle',  'Rue Saint-Jacques, Sainte-Thècle, QC',   46.8120::double precision, -72.4940::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ CENTRE-DU-QUÉBEC ═════
    ('Saint-Léonard-d''Aston',  'Centre', 'Dépanneur centre',               'Rue Principale, St-Léonard-d''Aston, QC', 46.0980::double precision, -72.3710::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Cyrille-de-Wendover','Centre','Église Saint-Cyrille',           'Rue Principale, St-Cyrille-de-Wendover, QC',45.9420::double precision, -72.4380::double precision, 'autre',  'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Germain-de-Grantham','Centre','Hôtel de ville',                 'Rue Principale, St-Germain-de-Grantham, QC',45.8350::double precision, -72.5640::double precision, 'autre',  'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Kingsey Falls',           'Centre', 'Hôtel de ville',                  'Rue Caron, Kingsey Falls, QC',           45.8530::double precision, -72.0640::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Ferdinand',         'Centre', 'Église Saint-Ferdinand',         'Rue Principale, Saint-Ferdinand, QC',    46.1000::double precision, -71.5650::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Inverness',               'Centre', 'Hôtel de ville',                  'Rue Dublin, Inverness, QC',              46.2080::double precision, -71.5560::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Pierreville',             'Centre', 'Église Pierreville',             'Rue Maurault, Pierreville, QC',          46.0700::double precision, -72.8200::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ ESTRIE ═════
    ('Stanstead',               'Centre', 'Hôtel de ville',                  'Rue Dufferin, Stanstead, QC',            45.0100::double precision, -72.0950::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('North Hatley',            'Centre', 'Quai / Église',                   'Rue Main, North Hatley, QC',             45.2900::double precision, -71.9650::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Compton',                 'Centre', 'Dépanneur centre Compton',        'Ch de la Station, Compton, QC',          45.2310::double precision, -71.8230::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Weedon',                  'Centre', 'Hôtel de ville',                  'Rue Saint-Janvier, Weedon, QC',          45.6940::double precision, -71.4640::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Cookshire-Eaton',         'Centre', 'Hôtel de ville',                  'Rue Principale, Cookshire-Eaton, QC',    45.4200::double precision, -71.6330::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sutton',                  'Centre', 'Hôtel de ville',                  'Rue Principale, Sutton, QC',             45.1020::double precision, -72.6120::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Dunham',                  'Centre', 'Église Dunham',                   'Rue Principale, Dunham, QC',             45.1320::double precision, -72.8000::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Waterloo',                'Centre', 'Hôtel de ville',                  'Rue Foster, Waterloo, QC',               45.3470::double precision, -72.5160::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ MONTÉRÉGIE ═════
    ('Acton Vale',              'Centre', 'Hôtel de ville',                  'Rue Cartier, Acton Vale, QC',            45.6520::double precision, -72.5660::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Marieville',              'Centre', 'Hôtel de ville',                  'Rue Sainte-Marie, Marieville, QC',       45.4330::double precision, -73.1620::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Césaire',           'Centre', 'Église Saint-Césaire',           'Rue Notre-Dame, Saint-Césaire, QC',      45.4180::double precision, -73.0050::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Rémi',              'Centre', 'Hôtel de ville',                  'Rue Saint-Paul, Saint-Rémi, QC',         45.2610::double precision, -73.6090::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Napierville',             'Centre', 'Église Napierville',             'Rue de l''Église, Napierville, QC',      45.1880::double precision, -73.4030::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Lacolle',                 'Centre', 'Dépanneur centre Lacolle',        'Rue de l''Église, Lacolle, QC',          45.0830::double precision, -73.3670::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Contrecœur',              'Centre', 'Hôtel de ville',                  'Rue Legendre, Contrecœur, QC',           45.8520::double precision, -73.2400::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Amable',            'Centre', 'Église Saint-Amable',            'Rue Principale, Saint-Amable, QC',       45.6500::double precision, -73.3000::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Ormstown',                'Centre', 'Hôtel de ville',                  'Rue Lambton, Ormstown, QC',              45.1230::double precision, -74.0000::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Huntingdon',              'Centre', 'Hôtel de ville',                  'Rue Châteauguay, Huntingdon, QC',        45.0870::double precision, -74.1670::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Rigaud',                  'Centre', 'Hôtel de ville',                  'Rue Saint-Jean-Baptiste, Rigaud, QC',    45.4790::double precision, -74.3010::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Hudson',                  'Centre', 'Hôtel de ville',                  'Rue Main, Hudson, QC',                   45.4520::double precision, -74.1430::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ LAURENTIDES ═════
    ('Saint-Sauveur',           'Centre', 'Église / centre-ville',           'Rue Principale, Saint-Sauveur, QC',      45.8930::double precision, -74.1690::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Val-David',               'Centre', 'Église / centre-ville',           'Rue de l''Église, Val-David, QC',        46.0330::double precision, -74.2180::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Hippolyte',         'Centre', 'Hôtel de ville',                  'Ch des Hauteurs, Saint-Hippolyte, QC',   45.9320::double precision, -74.0140::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Labelle',                 'Centre', 'Église Labelle',                  'Rue du Pont, Labelle, QC',               46.2820::double precision, -74.7350::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Rivière-Rouge',           'Centre', 'Hôtel de ville',                  'Rue L''Annonciation, Rivière-Rouge, QC', 46.4060::double precision, -74.6920::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Ferme-Neuve',             'Centre', 'Dépanneur centre Ferme-Neuve',    'Rue Principale, Ferme-Neuve, QC',        46.7030::double precision, -75.4490::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Oka',                     'Centre', 'Abbaye / Église Oka',             'Rue Notre-Dame, Oka, QC',                45.4660::double precision, -74.0850::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ LANAUDIÈRE ═════
    ('Saint-Lin-Laurentides',   'Centre', 'Hôtel de ville',                  'Rue Saint-Isidore, St-Lin-Laurentides, QC',45.8500::double precision, -73.7610::double precision, 'autre',  'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Sainte-Julienne',         'Centre', 'Église Sainte-Julienne',         'Route 125, Sainte-Julienne, QC',         45.9670::double precision, -73.7170::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Donat',             'Centre', 'Hôtel de ville',                  'Rue Principale, Saint-Donat, QC',        46.3180::double precision, -74.2210::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Jean-de-Matha',     'Centre', 'Dépanneur centre',               'Route Louis-Cyr, St-Jean-de-Matha, QC',  46.2330::double precision, -73.5340::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Côme',              'Centre', 'Église Saint-Côme',              'Rue Principale, Saint-Côme, QC',         46.2330::double precision, -73.7900::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Michel-des-Saints', 'Centre', 'Hôtel de ville',                  'Rue Brassard, St-Michel-des-Saints, QC', 46.6770::double precision, -73.9170::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Lavaltrie',               'Centre', 'Église Lavaltrie',               'Rue Notre-Dame, Lavaltrie, QC',          45.8830::double precision, -73.2830::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ OUTAOUAIS ═════
    ('Thurso',                  'Centre', 'Hôtel de ville',                  'Rue Galipeau, Thurso, QC',               45.6010::double precision, -75.2480::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Papineauville',           'Centre', 'Église Papineauville',           'Rue Papineau, Papineauville, QC',        45.6170::double precision, -75.0120::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Montebello',              'Centre', 'Manoir / Église',                 'Rue Notre-Dame, Montebello, QC',         45.6500::double precision, -74.9430::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-André-Avellin',     'Centre', 'Dépanneur centre',               'Rue Principale, St-André-Avellin, QC',   45.7180::double precision, -75.0640::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Chelsea',                 'Centre', 'Hôtel de ville',                  'Ch Old Chelsea, Chelsea, QC',            45.5050::double precision, -75.7780::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Wakefield',               'Centre', 'Pont couvert / Église',           'Ch Riverside, Wakefield, QC',            45.6420::double precision, -75.9300::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Gracefield',              'Centre', 'Hôtel de ville',                  'Rue Principale, Gracefield, QC',         46.1010::double precision, -76.0510::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Fort-Coulonge',           'Centre', 'Hôtel de ville',                  'Rue Principale, Fort-Coulonge, QC',      45.8480::double precision, -76.7320::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Shawville',               'Centre', 'Hôtel de ville',                  'Rue Main, Shawville, QC',                45.6060::double precision, -76.4900::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ ABITIBI-TÉMISCAMINGUE ═════
    ('Senneterre',              'Centre', 'Hôtel de ville',                  '5e Avenue, Senneterre, QC',              48.3920::double precision, -77.2380::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Malartic',                'Centre', 'Hôtel de ville',                  'Rue Royale, Malartic, QC',               48.1350::double precision, -78.1330::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Témiscaming',             'Centre', 'Hôtel de ville',                  'Rue Humphrey, Témiscaming, QC',          46.7240::double precision, -79.0990::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Barraute',                'Centre', 'Dépanneur centre Barraute',       '5e Avenue, Barraute, QC',                48.4360::double precision, -77.6320::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ BEAUCE / NOUVELLE-BEAUCE (compléments) ═════
    ('Saint-Côme-Linière',      'Centre', 'Église Saint-Côme',              'Rue Principale, St-Côme-Linière, QC',    46.0420::double precision, -70.5170::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('La Guadeloupe',           'Centre', 'Hôtel de ville',                  '1re Avenue, La Guadeloupe, QC',          45.9450::double precision, -70.9420::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Martin',            'Centre', 'Église Saint-Martin',            '1re Avenue, Saint-Martin, QC',           45.9970::double precision, -70.7610::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Éphrem-de-Beauce',  'Centre', 'Dépanneur centre',               '11e Avenue, St-Éphrem-de-Beauce, QC',    46.0560::double precision, -70.9320::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Victor',            'Centre', 'Église Saint-Victor',            'Rue Commerciale, Saint-Victor, QC',      46.1370::double precision, -70.8990::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Isidore',           'Centre', 'Hôtel de ville',                  'Route Coulombe, Saint-Isidore, QC',      46.5840::double precision, -71.0840::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Lambert-de-Lauzon', 'Centre', 'Église Saint-Lambert',          'Rue du Pont, St-Lambert-de-Lauzon, QC',  46.5840::double precision, -71.2080::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Scott',                   'Centre', 'Dépanneur centre Scott',          'Route Kennedy, Scott, QC',               46.5010::double precision, -71.0750::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ BELLECHASSE (compléments) ═════
    ('Beaumont',                'Centre', 'Église Beaumont',                'Ch du Domaine, Beaumont, QC',            46.8350::double precision, -71.0050::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Vallier',           'Centre', 'Église Saint-Vallier',          'Rue Principale, Saint-Vallier, QC',      46.9050::double precision, -70.8170::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Raphaël',           'Centre', 'Hôtel de ville',                  'Rue Principale, Saint-Raphaël, QC',      46.7950::double precision, -70.7560::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Armagh',                  'Centre', 'Dépanneur centre Armagh',         'Rue Principale, Armagh, QC',             46.7500::double precision, -70.5920::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Gervais',           'Centre', 'Église Saint-Gervais',          'Rue Principale, Saint-Gervais, QC',      46.7140::double precision, -70.8830::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),

    -- ═════ LOTBINIÈRE (compléments) ═════
    ('Saint-Agapit',            'Centre', 'Hôtel de ville',                  'Rue Principale, Saint-Agapit, QC',       46.5680::double precision, -71.4290::double precision, 'autre',    'Heures de bureau', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Flavien',           'Centre', 'Église Saint-Flavien',          'Rue Principale, Saint-Flavien, QC',      46.5230::double precision, -71.6010::double precision, 'autre',    'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Dosquet',                 'Centre', 'Dépanneur centre Dosquet',        'Av Bergeron, Dosquet, QC',               46.4720::double precision, -71.5410::double precision, 'commerce', 'Lun-Dim', false, true, true, 'Coordonnées approximatives (centre du village).'),
    ('Saint-Antoine-de-Tilly',  'Centre', 'Église / quai',                  'Rue de l''Église, St-Antoine-de-Tilly, QC',46.6610::double precision, -71.5790::double precision, 'autre',   'Stationnement accessible', false, true, true, 'Coordonnées approximatives (centre du village).')

  ) as v(city, sector, name, address, lat, lng, type, hours, has_cameras, well_lit, parking_free, notes)
  where not exists (
    select 1 from public.safe_meeting_points sp
    where sp.city = v.city and sp.name = v.name
  );
end $$;

select city, count(*) as nb_points
from public.safe_meeting_points
where active = true
group by city
order by nb_points desc;
