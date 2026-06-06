/* ════════════════════════════════════════════════════════════════════════
   PorteàPorte — Liste centrale des villes, villages et paroisses du Québec
   Source UNIQUE pour les suggestions de trajets.
   👉 Pour ajouter un endroit : ajoute-le dans le tableau QC_CITIES ci-dessous.
      Il apparaîtra automatiquement partout (publication, recherche, accueil).
   Les datalists ciblées : #qc-cities et #qc-cities-publier.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var QC_CITIES = [
    // ── Grands centres ───────────────────────────────────────────────
    'Québec', 'Lévis', 'Montréal', 'Laval', 'Longueuil', 'Gatineau',
    'Trois-Rivières', 'Sherbrooke', 'Saguenay', 'Chicoutimi', 'Jonquière',

    // ── Québec : secteurs & couronne ─────────────────────────────────
    'Sainte-Foy', 'Charlesbourg', 'Beauport', 'Limoilou', 'Vanier', 'Sillery',
    'Loretteville', 'Val-Bélair', 'Cap-Rouge', 'Lebourgneuf',
    'Saint-Augustin-de-Desmaures', 'L\'Ancienne-Lorette',
    'Stoneham', 'Lac-Beauport', 'Sainte-Brigitte-de-Laval', 'Shannon',
    'Fossambault-sur-le-Lac', 'Sainte-Catherine-de-la-Jacques-Cartier',
    'Boischatel', 'L\'Ange-Gardien', 'Château-Richer', 'Sainte-Anne-de-Beaupré',
    'Beaupré', 'Saint-Ferréol-les-Neiges',

    // ── Portneuf ─────────────────────────────────────────────────────
    'Saint-Raymond', 'Pont-Rouge', 'Donnacona', 'Neuville', 'Cap-Santé',
    'Portneuf', 'Deschambault-Grondines', 'Saint-Marc-des-Carrières',
    'Saint-Basile', 'Saint-Casimir',

    // ── Île d\'Orléans & Charlevoix ───────────────────────────────────
    'Saint-Pierre-de-l\'Île-d\'Orléans', 'Sainte-Famille',
    'Saint-Laurent-de-l\'Île-d\'Orléans', 'Saint-Jean-de-l\'Île-d\'Orléans',
    'Baie-Saint-Paul', 'La Malbaie', 'Clermont', 'Saint-Siméon', 'Les Éboulements',

    // ── Lévis : secteurs ─────────────────────────────────────────────
    'Saint-Romuald', 'Saint-Jean-Chrysostome', 'Pintendre', 'Saint-Nicolas',
    'Saint-Rédempteur', 'Charny', 'Saint-Étienne-de-Lauzon',

    // ── Chaudière-Appalaches : Lotbinière ─────────────────────────────
    'Saint-Apollinaire', 'Saint-Agapit', 'Laurier-Station', 'Dosquet',
    'Saint-Flavien', 'Lotbinière', 'Sainte-Croix', 'Saint-Antoine-de-Tilly',
    'Val-Alain', 'Saint-Gilles', 'Saint-Patrice-de-Beaurivage',
    'Saint-Narcisse-de-Beaurivage',

    // ── Chaudière-Appalaches : Beauce ────────────────────────────────
    'Saint-Georges (Beauce)', 'Sainte-Marie (Beauce)', 'Beauceville',
    'Saint-Joseph-de-Beauce', 'Saint-Prosper', 'Saint-Côme-Linière',
    'Saint-Honoré-de-Shenley', 'Saint-Martin', 'La Guadeloupe',
    'Saint-Éphrem-de-Beauce', 'Vallée-Jonction', 'Scott', 'Sainte-Hénédine',
    'Saint-Isidore', 'Saint-Lambert-de-Lauzon', 'Saint-Elzéar',
    'Saint-Frédéric', 'Saint-Victor', 'Notre-Dame-des-Pins',

    // ── Chaudière-Appalaches : Bellechasse ───────────────────────────
    'Saint-Henri', 'Saint-Anselme', 'Sainte-Claire',
    'Saint-Charles-de-Bellechasse', 'Saint-Michel-de-Bellechasse', 'Beaumont',
    'Saint-Vallier', 'Saint-Raphaël', 'Armagh', 'Saint-Damien-de-Buckland',
    'Honfleur', 'La Durantaye', 'Saint-Gervais', 'Saint-Lazare-de-Bellechasse',
    'Buckland',

    // ── Chaudière-Appalaches : Etchemins ─────────────────────────────
    'Lac-Etchemin', 'Sainte-Justine', 'Sainte-Aurélie', 'Saint-Prosper',
    'Saint-Camille-de-Lellis', 'Sainte-Sabine',

    // ── Chaudière-Appalaches : Montmagny / L\'Islet ───────────────────
    'Montmagny', 'Cap-Saint-Ignace', 'Saint-Pierre-de-la-Rivière-du-Sud',
    'L\'Islet', 'Saint-Jean-Port-Joli', 'Saint-Pamphile', 'Sainte-Perpétue',
    'Saint-Aubert', 'Saint-Roch-des-Aulnaies',

    // ── Chaudière-Appalaches : Amiante / Appalaches ──────────────────
    'Thetford Mines', 'East Broughton', 'Disraeli', 'Black Lake',
    'Saint-Joseph-de-Coleraine', 'Adstock', 'Sainte-Clotilde-de-Beauce',

    // ── Estrie / Cantons-de-l\'Est ────────────────────────────────────
    'Magog', 'Coaticook', 'Windsor', 'Valcourt', 'Cowansville', 'Bromont',
    'Granby', 'East Angus', 'Lac-Mégantic', 'Val-des-Sources', 'Danville',
    'Richmond', 'Stanstead', 'Ayer\'s Cliff', 'North Hatley', 'Compton',
    'Waterville', 'Weedon', 'La Patrie', 'Cookshire-Eaton', 'Stoke',
    'Sutton', 'Lac-Brome (Knowlton)', 'Farnham', 'Bedford', 'Dunham',
    'Frelighsburg', 'Waterloo', 'Roxton Pond', 'Racine', 'Bonsecours',
    'Asbestos', 'Ascot Corner', 'Eastman', 'Orford',

    // ── Centre-du-Québec ─────────────────────────────────────────────
    'Drummondville', 'Victoriaville', 'Nicolet', 'Bécancour', 'Plessisville',
    'Princeville', 'Warwick', 'Kingsey Falls', 'Daveluyville',
    'Saint-Léonard-d\'Aston', 'Wickham', 'Saint-Cyrille-de-Wendover',
    'Sainte-Clotilde-de-Horton', 'Notre-Dame-du-Bon-Conseil',
    'Saint-Germain-de-Grantham', 'Saint-Ferdinand', 'Inverness', 'Laurierville',

    // ── Mauricie ─────────────────────────────────────────────────────
    'Shawinigan', 'Grand-Mère', 'Louiseville', 'Cap-de-la-Madeleine',
    'Saint-Tite', 'Sainte-Anne-de-la-Pérade', 'Batiscan', 'Champlain',
    'Saint-Boniface', 'Saint-Étienne-des-Grès', 'La Tuque',
    'Notre-Dame-du-Mont-Carmel', 'Yamachiche', 'Maskinongé', 'Saint-Paulin',
    'Sainte-Geneviève-de-Batiscan', 'Trois-Rives',

    // ── Montérégie ───────────────────────────────────────────────────
    'Saint-Jean-sur-Richelieu', 'Chambly', 'Beloeil', 'Mont-Saint-Hilaire',
    'Saint-Hyacinthe', 'Sorel-Tracy', 'Saint-Bruno-de-Montarville',
    'Boucherville', 'Brossard', 'Saint-Lambert', 'Châteauguay',
    'Salaberry-de-Valleyfield', 'Vaudreuil-Dorion', 'Saint-Constant',
    'La Prairie', 'Candiac', 'Marieville', 'Saint-Rémi', 'Napierville',
    'Lacolle', 'Saint-Césaire', 'Acton Vale', 'Contrecœur', 'Varennes',
    'Verchères', 'Saint-Amable', 'Sainte-Julie', 'Carignan', 'Richelieu',
    'Otterburn Park', 'McMasterville', 'Saint-Basile-le-Grand',
    'Coteau-du-Lac', 'Les Cèdres', 'Rigaud', 'Hudson', 'Ormstown',
    'Huntingdon', 'Beauharnois', 'Saint-Hubert', 'Delson', 'Sainte-Catherine',
    'Mercier', 'Saint-Philippe',

    // ── Laurentides ──────────────────────────────────────────────────
    'Saint-Jérôme', 'Mirabel', 'Sainte-Adèle', 'Sainte-Agathe-des-Monts',
    'Mont-Tremblant', 'Saint-Sauveur', 'Blainville', 'Boisbriand',
    'Sainte-Thérèse', 'Rosemère', 'Lachute', 'Saint-Eustache',
    'Deux-Montagnes', 'Mont-Laurier', 'Prévost', 'Saint-Colomban',
    'Sainte-Sophie', 'Piedmont',

    // ── Lanaudière ───────────────────────────────────────────────────
    'Repentigny', 'Terrebonne', 'Mascouche', 'Joliette', 'L\'Assomption',
    'Berthierville', 'Rawdon', 'Saint-Charles-Borromée',
    'Notre-Dame-des-Prairies', 'Lavaltrie', 'Saint-Lin-Laurentides',
    'Sainte-Julienne', 'Saint-Donat', 'Crabtree', 'Saint-Roch-de-l\'Achigan',

    // ── Outaouais ────────────────────────────────────────────────────
    'Buckingham', 'Aylmer', 'Hull', 'Maniwaki', 'Thurso', 'Papineauville',
    'Chelsea', 'Wakefield', 'Gracefield', 'Fort-Coulonge',

    // ── Bas-Saint-Laurent ────────────────────────────────────────────
    'Rimouski', 'Rivière-du-Loup', 'Mont-Joli', 'Trois-Pistoles',
    'Témiscouata-sur-le-Lac', 'Amqui', 'Causapscal', 'Sayabec', 'Saint-Pascal',
    'La Pocatière', 'Kamouraska', 'Saint-Alexandre-de-Kamouraska',
    'Pohénégamook', 'Dégelis', 'Saint-Fabien', 'Le Bic', 'Pointe-au-Père',

    // ── Gaspésie / Îles ──────────────────────────────────────────────
    'Gaspé', 'Matane', 'Sainte-Anne-des-Monts', 'Chandler', 'Carleton-sur-Mer',
    'New Richmond', 'Bonaventure', 'Paspébiac', 'Percé', 'Grande-Rivière',
    'Murdochville', 'Cap-Chat', 'Maria', 'Nouvelle',

    // ── Côte-Nord ────────────────────────────────────────────────────
    'Sept-Îles', 'Baie-Comeau', 'Port-Cartier', 'Forestville', 'Les Escoumins',
    'Tadoussac', 'Sacré-Cœur', 'Havre-Saint-Pierre', 'Les Bergeronnes',

    // ── Saguenay–Lac-Saint-Jean ──────────────────────────────────────
    'La Baie', 'Alma', 'Dolbeau-Mistassini', 'Roberval', 'Saint-Félicien',
    'Normandin', 'Métabetchouan-Lac-à-la-Croix', 'Saint-Bruno',
    'Hébertville', 'Saint-Honoré', 'Saint-Ambroise', 'Chambord', 'Saint-Prime',
    'Saint-Gédéon', 'Saint-Nazaire', 'Larouche',

    // ── Abitibi-Témiscamingue / Nord ─────────────────────────────────
    'Rouyn-Noranda', 'Val-d\'Or', 'Amos', 'La Sarre', 'Senneterre',
    'Malartic', 'Ville-Marie', 'Témiscaming', 'Macamic', 'Lebel-sur-Quévillon',
    'Barraute', 'Saint-Bruno-de-Guigues', 'Béarn', 'Notre-Dame-du-Nord',
    'Palmarolle', 'La Reine', 'Taschereau', 'Duparquet',

    // ══════════════════════════════════════════════════════════════════
    //   COUVERTURE MAXIMALE — villages & paroisses additionnels
    //   (doublons gérés automatiquement par populate())
    // ══════════════════════════════════════════════════════════════════

    // ── Capitale-Nationale (suite) ───────────────────────────────────
    'Wendake', 'Notre-Dame-des-Anges', 'Saint-Gabriel-de-Valcartier',
    'Saint-Tite-des-Caps', 'Saint-Joachim', 'Saint-Louis-de-Gonzague-du-Cap-Tourmente',
    'Petite-Rivière-Saint-François', 'Saint-Hilarion', 'Saint-Aimé-des-Lacs',
    'Notre-Dame-des-Monts', 'Saint-Irénée', 'L\'Isle-aux-Coudres',
    'Saint-Urbain', 'Baie-Sainte-Catherine', 'Sainte-Christine-d\'Auvergne',
    'Lac-Sergent', 'Rivière-à-Pierre', 'Saint-Léonard-de-Portneuf',
    'Saint-Thuribe', 'Saint-Ubalde', 'Saint-Alban', 'Saint-Gilbert',

    // ── Lotbinière / Lévis (suite) ───────────────────────────────────
    'Leclercville', 'Issoudun', 'Saint-Édouard-de-Lotbinière',
    'Saint-Janvier-de-Joly', 'Sainte-Agathe-de-Lotbinière',
    'Notre-Dame-du-Sacré-Cœur-d\'Issoudun', 'Saint-Sylvestre',

    // ── Beauce / Etchemins / Nouvelle-Beauce (suite) ─────────────────
    'Lac-Drolet', 'Saint-Robert-Bellarmin', 'Saint-Ludger', 'Saint-Gédéon-de-Beauce',
    'Saint-Théophile', 'Saint-Benoît-Labre', 'Saint-Évariste-de-Forsyth',
    'Saint-Hilaire-de-Dorset', 'Saint-Zacharie', 'Saint-Cyprien (Beauce)',
    'Sainte-Rose-de-Watford', 'Saint-Louis-de-Gonzague (Beauce)', 'Saint-Magloire',
    'Sainte-Marguerite', 'Frampton', 'Saints-Anges', 'Saint-Bernard',
    'Saint-Séverin', 'Saint-Jules', 'Saint-Alfred', 'Tring-Jonction',
    'Saint-Jacques-de-Leeds', 'Saint-Pierre-de-Broughton',

    // ── Montmagny / L\'Islet / Côte-du-Sud (suite) ───────────────────
    'Berthier-sur-Mer', 'Saint-François-de-la-Rivière-du-Sud',
    'Montmagny (Cap-Saint-Ignace)', 'Saint-Just-de-Bretenières',
    'Sainte-Lucie-de-Beauregard', 'Saint-Fabien-de-Panet', 'Lac-Frontière',
    'Notre-Dame-du-Rosaire', 'Sainte-Apolline-de-Patton',
    'Saint-Paul-de-Montminy', 'Saint-Adalbert', 'Sainte-Félicité (Montmagny)',
    'Tourville', 'Saint-Marcel', 'Saint-Omer (L\'Islet)', 'Saint-Cyrille-de-Lessard',
    'Saint-Damase-de-L\'Islet', 'Saint-Eugène',

    // ── Kamouraska / Témiscouata / Rivière-du-Loup (suite) ───────────
    'Saint-André-de-Kamouraska', 'Mont-Carmel', 'Saint-Denis-De La Bouteillerie',
    'Rivière-Ouelle', 'Saint-Philippe-de-Néri', 'Saint-Bruno-de-Kamouraska',
    'Saint-Germain', 'Saint-Joseph-de-Kamouraska', 'Sainte-Hélène-de-Kamouraska',
    'Saint-Onésime-d\'Ixworth', 'Saint-Gabriel-Lalemant', 'Saint-Pacôme',
    'Cacouna', 'L\'Isle-Verte', 'Saint-Antonin', 'Saint-Modeste',
    'Saint-Arsène', 'Notre-Dame-du-Portage', 'Saint-Cyprien (Témiscouata)',
    'Saint-Honoré-de-Témiscouata', 'Auclair', 'Lejeune', 'Squatec',
    'Saint-Juste-du-Lac', 'Rivière-Bleue', 'Saint-Eusèbe', 'Saint-Michel-du-Squatec',
    'Saint-Hubert-de-Rivière-du-Loup', 'Saint-Épiphane', 'Saint-Paul-de-la-Croix',

    // ── Rimouski / La Mitis / Matanie (suite) ────────────────────────
    'Saint-Anaclet-de-Lessard', 'Saint-Narcisse-de-Rimouski', 'Saint-Fabien',
    'Saint-Eugène-de-Ladrière', 'Sainte-Luce', 'Luceville', 'Mont-Joli',
    'Price', 'Sainte-Flavie', 'Sainte-Angèle-de-Mérici', 'Saint-Octave-de-Métis',
    'Grand-Métis', 'Padoue', 'Sainte-Jeanne-d\'Arc (Mitis)', 'Les Hauteurs',
    'La Rédemption', 'Saint-Charles-Garnier', 'Saint-Gabriel-de-Rimouski',
    'Saint-Donat (Mitis)', 'Baie-des-Sables', 'Saint-Ulric', 'Saint-Léandre',
    'Sainte-Félicité (Matanie)', 'Grosses-Roches', 'Les Méchins', 'Saint-Adelme',
    'Saint-René-de-Matane', 'Sainte-Paule',

    // ── Matapédia / Vallée (suite) ───────────────────────────────────
    'Val-Brillant', 'Sainte-Irène', 'Lac-au-Saumon', 'Saint-Léon-le-Grand',
    'Albertville', 'Saint-Tharcisius', 'Saint-Vianney', 'Saint-Cléophas',
    'Saint-Moïse', 'Saint-Noël', 'Saint-Damase (Matapédia)', 'Sainte-Marguerite-Marie',
    'Saint-Alexandre-des-Lacs', 'Sainte-Florence', 'Causapscal',

    // ── Gaspésie (suite) ─────────────────────────────────────────────
    'Grande-Vallée', 'Cloridorme', 'Petite-Vallée', 'L\'Anse-à-Valleau',
    'Rivière-au-Renard', 'Sainte-Thérèse-de-Gaspé', 'Pabos', 'Newport',
    'Port-Daniel-Gascons', 'Shigawake', 'Hope Town', 'Saint-Godefroi',
    'Caplan', 'Saint-Siméon (Gaspésie)', 'Saint-Alphonse', 'Saint-Elzéar (Gaspésie)',
    'New Carlisle', 'Hope', 'Escuminac', 'Pointe-à-la-Croix', 'Restigouche',
    'Saint-Omer (Gaspésie)', 'Saint-Maxime-du-Mont-Louis', 'Mont-Louis',
    'Marsoui', 'La Martre', 'Sainte-Madeleine-de-la-Rivière-Madeleine',
    'Gros-Morne', 'Manche-d\'Épée', 'Grande-Rivière', 'Chandler (Pabos Mills)',
    'Îles-de-la-Madeleine', 'Cap-aux-Meules', 'Havre-aux-Maisons', 'Grande-Entrée',

    // ── Côte-Nord (suite) ────────────────────────────────────────────
    'Longue-Rive', 'Portneuf-sur-Mer', 'Colombier', 'Ragueneau',
    'Chute-aux-Outardes', 'Pointe-aux-Outardes', 'Pointe-Lebel', 'Franquelin',
    'Godbout', 'Baie-Trinité', 'Rivière-Pentecôte', 'Gallix', 'Sept-Îles (Moisie)',
    'Uashat', 'Maliotenam', 'Rivière-au-Tonnerre', 'Longue-Pointe-de-Mingan',
    'Mingan', 'Natashquan', 'Aguanish', 'Baie-Johan-Beetz', 'Fermont',
    'Schefferville', 'Sacré-Cœur', 'Les Escoumins', 'Essipit',

    // ── Saguenay–Lac-Saint-Jean (suite) ──────────────────────────────
    'Saint-Fulgence', 'Sainte-Rose-du-Nord', 'Saint-David-de-Falardeau',
    'Bégin', 'Saint-Charles-de-Bourget', 'Lac-Kénogami', 'Shipshaw',
    'Laterrière', 'Saint-Henri-de-Taillon', 'Sainte-Monique (Lac-St-Jean)',
    'L\'Ascension-de-Notre-Seigneur', 'Labrecque', 'Lamarche', 'Saint-Ludger-de-Milot',
    'Péribonka', 'Sainte-Jeanne-d\'Arc (Lac-St-Jean)', 'Saint-Augustin (Lac-St-Jean)',
    'Sainte-Élisabeth-de-Proulx', 'Girardville', 'Notre-Dame-de-Lorette',
    'Saint-Edmond-les-Plaines', 'Albanel', 'Saint-Thomas-Didyme', 'Saint-Stanislas',
    'Saint-Eugène-d\'Argentenay', 'Mistassini', 'Desbiens', 'Métabetchouan',
    'Saint-Henri-de-Taillon', 'Saint-André-du-Lac-Saint-Jean', 'Lac-Bouchette',
    'Saint-François-de-Sales', 'La Doré', 'Saint-Méthode',

    // ── Mauricie (suite) ─────────────────────────────────────────────
    'Saint-Mathieu-du-Parc', 'Saint-Élie-de-Caxton', 'Charette', 'Saint-Barnabé',
    'Saint-Sévère', 'Saint-Léon-le-Grand (Maskinongé)', 'Sainte-Ursule',
    'Saint-Justin', 'Saint-Édouard-de-Maskinongé', 'Saint-Alexis-des-Monts',
    'Saint-Roch-de-Mékinac', 'Grandes-Piles', 'Saint-Jean-des-Piles',
    'Hérouxville', 'Saint-Adelphe', 'Saint-Séverin (Mékinac)', 'Lac-aux-Sables',
    'Notre-Dame-de-Montauban', 'Sainte-Thècle', 'Saint-Roch-de-Mékinac',
    'Saint-Prosper-de-Champlain', 'Saint-Luc-de-Vincennes', 'Saint-Maurice',
    'Saint-Narcisse', 'Sainte-Geneviève-de-Batiscan',

    // ── Centre-du-Québec (suite) ─────────────────────────────────────
    'Saint-Albert', 'Sainte-Élizabeth-de-Warwick', 'Tingwick', 'Chesterville',
    'Sainte-Séraphine', 'Saint-Rosaire', 'Sainte-Anne-du-Sault', 'Saint-Valère',
    'Saint-Christophe-d\'Arthabaska', 'Saint-Norbert-d\'Arthabaska', 'Maddington Falls',
    'Sainte-Marie-de-Blandford', 'Manseau', 'Lemieux', 'Sainte-Cécile-de-Lévrard',
    'Sainte-Sophie-de-Lévrard', 'Fortierville', 'Parisville', 'Saint-Pierre-les-Becquets',
    'Deschaillons-sur-Saint-Laurent', 'Sainte-Françoise', 'Saint-Wenceslas',
    'Aston-Jonction', 'Sainte-Eulalie', 'Saint-Léonard-d\'Aston', 'Grand-Saint-Esprit',
    'La Visitation-de-Yamaska', 'Saint-Zéphirin-de-Courval', 'Saint-Bonaventure',
    'Saint-Pie-de-Guire', 'Baie-du-Febvre', 'Pierreville', 'Saint-François-du-Lac',
    'Odanak', 'Notre-Dame-de-Pierreville',

    // ── Estrie (suite) ───────────────────────────────────────────────
    'Lac-Drolet', 'Audet', 'Frontenac', 'Nantes', 'Marston', 'Piopolis',
    'Saint-Augustin-de-Woburn', 'Notre-Dame-des-Bois', 'Val-Racine',
    'Scotstown', 'Hampden', 'Lingwick', 'Newport (Estrie)', 'Bury', 'Westbury',
    'Saint-Isidore-de-Clifton', 'Chartierville', 'East Hereford', 'Saint-Venant-de-Paquette',
    'Saint-Malo', 'Dixville', 'Sainte-Edwidge-de-Clifton', 'Barnston-Ouest',
    'Stanstead-Est', 'Ogden', 'Hatley', 'Sainte-Catherine-de-Hatley',
    'Magog (Omerville)', 'Saint-Benoît-du-Lac', 'Austin', 'Bolton-Est', 'Bolton-Ouest',
    'Potton', 'Mansonville', 'Lac-Mégantic', 'Stratford', 'Beaulac-Garthby',
    'Wotton', 'Saint-Camille', 'Ham-Sud', 'Saint-Adrien', 'Saint-Georges-de-Windsor',
    'Saint-Claude', 'Saint-François-Xavier-de-Brompton', 'Val-Joli', 'Cleveland',
    'Ulverton', 'Melbourne', 'Saint-Denis-de-Brompton',

    // ── Montérégie (suite) ───────────────────────────────────────────
    'Henryville', 'Saint-Sébastien', 'Saint-Alexandre', 'Sainte-Anne-de-Sabrevois',
    'Mont-Saint-Grégoire', 'Sainte-Brigide-d\'Iberville', 'Saint-Blaise-sur-Richelieu',
    'Noyan', 'Saint-Georges-de-Clarenceville', 'Venise-en-Québec', 'Saint-Paul-de-l\'Île-aux-Noix',
    'Sabrevois', 'Saint-Valentin', 'Pike River', 'Notre-Dame-de-Stanbridge',
    'Stanbridge Station', 'Stanbridge East', 'Saint-Armand', 'Bedford',
    'Saint-Ignace-de-Stanbridge', 'Sainte-Sabine (Montérégie)', 'Brigham',
    'Saint-Alphonse-de-Granby', 'Sainte-Cécile-de-Milton', 'Roxton Falls',
    'Roxton', 'Béthanie', 'Saint-Théodore-d\'Acton', 'Upton', 'Saint-Nazaire-d\'Acton',
    'Saint-Damase', 'Saint-Pie', 'Saint-Dominique', 'Sainte-Madeleine',
    'Saint-Jean-Baptiste', 'Sainte-Marie-Madeleine', 'Saint-Charles-sur-Richelieu',
    'Saint-Marc-sur-Richelieu', 'Saint-Antoine-sur-Richelieu', 'Saint-Denis-sur-Richelieu',
    'Saint-Ours', 'Massueville', 'Saint-Aimé', 'Saint-Robert', 'Sainte-Victoire-de-Sorel',
    'Saint-Joseph-de-Sorel', 'Yamaska', 'Saint-Gérard-Majella', 'Saint-David',
    'Saint-Roch-de-Richelieu', 'Saint-Louis', 'Saint-Hugues', 'Saint-Marcel-de-Richelieu',
    'Saint-Liboire', 'Saint-Valérien-de-Milton', 'Sainte-Hélène-de-Bagot',
    'Saint-Simon', 'Saint-Hyacinthe (Douville)', 'La Présentation', 'Saint-Bernard-de-Michaudville',
    'Saint-Jude', 'Saint-Barnabé-Sud', 'Saint-Bruno (Montérégie)', 'Calixa-Lavallée',
    'Saint-Mathieu-de-Beloeil', 'Saint-Antoine-sur-Richelieu', 'Saint-Mathias-sur-Richelieu',
    'Rougemont', 'Ange-Gardien', 'Saint-Paul-d\'Abbotsford', 'Saint-Mathieu',
    'Saint-Isidore (Montérégie)', 'Saint-Michel', 'Saint-Édouard', 'Saint-Patrice-de-Sherrington',
    'Hemmingford', 'Saint-Bernard-de-Lacolle', 'Saint-Cyprien-de-Napierville',
    'Saint-Jacques-le-Mineur', 'Saint-Chrysostome', 'Howick', 'Très-Saint-Sacrement',
    'Sainte-Martine', 'Saint-Urbain-Premier', 'Saint-Étienne-de-Beauharnois',
    'Saint-Louis-de-Gonzague', 'Sainte-Barbe', 'Saint-Anicet', 'Godmanchester',
    'Hinchinbrooke', 'Elgin', 'Franklin', 'Havelock', 'Saint-Stanislas-de-Kostka',
    'Saint-Télesphore', 'Saint-Polycarpe', 'Saint-Zotique', 'Les Coteaux',
    'Sainte-Marthe', 'Sainte-Justine-de-Newton', 'Très-Saint-Rédempteur',
    'Saint-Lazare', 'Pincourt', 'L\'Île-Perrot', 'Notre-Dame-de-l\'Île-Perrot',
    'Terrasse-Vaudreuil', 'Pointe-des-Cascades', 'Saint-Clet', 'Pointe-Fortune',
    'Sainte-Madeleine (Montérégie)', 'Saint-Mathieu-de-Laprairie',

    // ── Laurentides (suite) ──────────────────────────────────────────
    'Oka', 'Saint-Joseph-du-Lac', 'Pointe-Calumet', 'Sainte-Marthe-sur-le-Lac',
    'Saint-Placide', 'Saint-Benoît', 'Saint-Hermas', 'Sainte-Scholastique',
    'Saint-Canut', 'Saint-Augustin (Mirabel)', 'Saint-Janvier', 'Saint-Antoine',
    'Bellefeuille', 'Lafontaine', 'Saint-Hippolyte', 'Sainte-Anne-des-Plaines',
    'Gore', 'Mille-Isles', 'Wentworth', 'Lac-des-Seize-Îles', 'Morin-Heights',
    'Sainte-Marguerite-du-Lac-Masson', 'Estérel', 'Sainte-Anne-des-Lacs',
    'Val-Morin', 'Val-David', 'Sainte-Lucie-des-Laurentides', 'Lantier',
    'Saint-Faustin-Lac-Carré', 'Lac-Supérieur', 'Brébeuf', 'Montcalm',
    'Arundel', 'Huberdeau', 'Amherst', 'La Conception', 'Labelle', 'La Minerve',
    'Lac-Tremblant-Nord', 'Saint-Donat', 'Nominingue', 'Rivière-Rouge',
    'L\'Annonciation', 'Sainte-Véronique', 'L\'Ascension', 'Lac-Saguay',
    'Lac-des-Écorces', 'Chute-Saint-Philippe', 'Lac-du-Cerf', 'Kiamika',
    'Notre-Dame-du-Laus', 'Notre-Dame-de-Pontmain', 'Ferme-Neuve', 'Mont-Saint-Michel',
    'Sainte-Anne-du-Lac', 'Lac-Saint-Paul', 'Saint-Aimé-du-Lac-des-Îles',
    'Brownsburg-Chatham', 'Grenville', 'Grenville-sur-la-Rouge', 'Harrington',
    'Saint-André-d\'Argenteuil', 'Wentworth-Nord', 'Saint-Adolphe-d\'Howard',
    'Saint-Calixte', 'Chertsey', 'Entrelacs',

    // ── Lanaudière (suite) ───────────────────────────────────────────
    'Charlemagne', 'Le Gardeur', 'Saint-Sulpice', 'L\'Épiphanie',
    'Saint-Paul', 'Sainte-Marie-Salomé', 'Saint-Jacques', 'Saint-Alexis',
    'Saint-Esprit', 'Saint-Liguori', 'Saint-Thomas', 'Sainte-Élisabeth',
    'Saint-Cuthbert', 'Saint-Barthélemy', 'La Visitation-de-l\'Île-Dupas',
    'Île-Dupas', 'Saint-Ignace-de-Loyola', 'Sainte-Geneviève-de-Berthier',
    'Lanoraie', 'Saint-Norbert', 'Sainte-Mélanie', 'Saint-Ambroise-de-Kildare',
    'Saint-Félix-de-Valois', 'Saint-Jean-de-Matha', 'Sainte-Béatrix',
    'Saint-Côme', 'Sainte-Émélie-de-l\'Énergie', 'Saint-Damien',
    'Saint-Zénon', 'Notre-Dame-de-la-Merci', 'Saint-Michel-des-Saints',
    'Saint-Alphonse-Rodriguez', 'Saint-Calixte', 'Saint-Esprit',
    'Sainte-Marcelline-de-Kildare', 'Saint-Gabriel-de-Brandon', 'Saint-Gabriel',
    'Saint-Didace', 'Mandeville', 'Saint-Cléophas-de-Brandon',

    // ── Outaouais (suite) ────────────────────────────────────────────
    'Cantley', 'L\'Ange-Gardien (Outaouais)', 'Val-des-Monts', 'Notre-Dame-de-la-Salette',
    'Denholm', 'Low', 'Kazabazua', 'Lac-Sainte-Marie', 'Déléage', 'Bois-Franc',
    'Grand-Remous', 'Montcerf-Lytton', 'Blue Sea', 'Messines', 'Bouchette',
    'Sainte-Thérèse-de-la-Gatineau', 'Cayamant', 'Egan-Sud', 'Aumond',
    'Masham', 'La Pêche', 'Pontiac', 'Quyon', 'Shawville', 'Campbell\'s Bay',
    'Bryson', 'Mansfield-et-Pontefract', 'Waltham', 'L\'Île-du-Grand-Calumet',
    'Litchfield', 'Thorne', 'Alleyn-et-Cawood', 'Otter Lake', 'Bristol',
    'Clarendon', 'Portage-du-Fort', 'Chichester', 'Sheenboro', 'Rapides-des-Joachims',
    'Plaisance', 'Montebello', 'Notre-Dame-de-la-Paix', 'Saint-André-Avellin',
    'Ripon', 'Mayo', 'Lochaber', 'Thurso', 'Lochaber-Partie-Ouest',
    'Saint-Sixte', 'Mulgrave-et-Derry', 'Bowman', 'Val-des-Bois',

    // ── Bas-Saint-Laurent (suite) ────────────────────────────────────
    'Saint-Clément', 'Saint-Cyprien', 'Saint-Jean-de-Dieu', 'Saint-Médard',
    'Saint-Guy', 'Lac-des-Aigles', 'Saint-Narcisse-de-Rimouski',
    'Esprit-Saint', 'La Trinité-des-Monts', 'Saint-Marcellin',
    'Trois-Pistoles', 'Notre-Dame-des-Neiges', 'Saint-Mathieu-de-Rioux',
    'Saint-Simon (BSL)', 'Saint-Éloi', 'Saint-Jean-de-Dieu', 'Saint-Médard'
  ];

  // Expose la liste pour réutilisation éventuelle.
  window.QC_CITIES = QC_CITIES;

  function populate(list) {
    if (!list) return;
    var have = {};
    var existing = list.options;
    for (var i = 0; i < existing.length; i++) { have[existing[i].value] = true; }
    var frag = document.createDocumentFragment();
    for (var j = 0; j < QC_CITIES.length; j++) {
      var name = QC_CITIES[j];
      if (!name || have[name]) continue;
      have[name] = true;
      var opt = document.createElement('option');
      opt.value = name;
      frag.appendChild(opt);
    }
    list.appendChild(frag);
  }

  function init() {
    populate(document.getElementById('qc-cities'));
    populate(document.getElementById('qc-cities-publier'));
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
