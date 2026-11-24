/* PorteàPorte — Suggestions d'adresses (Google en principal, Geoapify en secours).
   La clé reste sur le serveur : ce fichier parle seulement à /api/platform.
   Pensé pour cellulaire et aînés : gros caractères, grandes zones à toucher, liste sous le champ (pas par-dessus).
   Le texte libre est toujours accepté : rien n'oblige à choisir une suggestion.

   Usage : Adresses.brancher(input, { onChoix(adresse), lieuPublic: false, horsService() {} })
   adresse = { principal, nom, ligne1, ville, secteur, code_postal, province, adresse_complete, etablissement } */
(function () {
  'use strict';
  if (window.Adresses) return;

  var MIN = 3;
  var ATTENTE_MS = 350;
  var compteur = 0;

  function nouveauJeton() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function style() {
    if (document.getElementById('adr-style')) return;
    var s = document.createElement('style');
    s.id = 'adr-style';
    s.textContent = [
      '.adr-champ{font-size:18px!important;min-height:52px}',
      '.adr-boite{margin-top:6px}',
      '.adr-boite[hidden]{display:none!important}',
      '.adr-liste{list-style:none;margin:0;padding:0;border:2px solid #2b3a4f;border-radius:12px;background:#0f1620;overflow:hidden}',
      '.adr-opt{display:flex;flex-direction:column;justify-content:center;gap:3px;min-height:60px;padding:12px 16px;font-size:18px;line-height:1.3;color:#f4f7fb;border-bottom:1px solid #1f2d40;cursor:pointer;-webkit-tap-highlight-color:transparent;overflow-wrap:break-word}',
      '.adr-opt:last-child{border-bottom:0}',
      '.adr-opt .adr-p{font-weight:800}',
      '.adr-opt .adr-s{font-size:16px;color:#b9c6d6;font-weight:500}',
      '.adr-opt.actif,.adr-opt:hover{background:#1b2a3d;box-shadow:inset 4px 0 0 #00d9ff}',
      '.adr-opt.adr-libre{color:#c4f135;font-weight:800;font-size:17px}',
      '.adr-attrib{font-size:14px;color:#9fb3c8;padding:6px 4px 0;text-align:right}',
      '.adr-note{font-size:16px;color:#b9c6d6;padding:10px 4px 0;line-height:1.4}',
      '.adr-choisi{margin-top:8px;font-size:16px;line-height:1.4;color:#c4f135;font-weight:700}',
      '.adr-choisi[hidden],.adr-avert[hidden]{display:none!important}',
      '.adr-avert{margin-top:6px;font-size:16px;line-height:1.4;color:#ffd166}',
      // Liste ouverte : les boutons flottants (menu, aide, niveau, GPS) ne cachent plus les suggestions.
      'body.adr-ouvert #pia-launch,body.adr-ouvert .pap-launcher-btn,body.adr-ouvert .pp-layer-pill,body.adr-ouvert #pap-gps-status{display:none!important}',
    ].join('\n');
    document.head.appendChild(s);
  }

  async function jetonConnexion() {
    try {
      var db = window.db;
      if (!db || !db.auth) return null;
      var r = await db.auth.getSession();
      return (r && r.data && r.data.session && r.data.session.access_token) || null;
    } catch (_) { return null; }
  }

  async function api(endpoint, corps) {
    var jeton = await jetonConnexion();
    if (!jeton) return { statut: 401, d: {} };
    var r = await fetch('/api/platform?endpoint=' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton },
      body: JSON.stringify(Object.assign({ endpoint: endpoint }, corps)),
    });
    var d = {};
    try { d = await r.json(); } catch (_) {}
    return { statut: r.status, d: d };
  }

  function el(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte != null) e.textContent = texte;
    return e;
  }

  function lieuLisible(a) {
    var morceaux = [a.secteur, a.ville].filter(Boolean);
    var vus = {};
    morceaux = morceaux.filter(function (x) { var k = x.toLowerCase(); if (vus[k]) return false; vus[k] = 1; return true; });
    return morceaux.join(', ') + (a.code_postal ? ' · ' + a.code_postal : '');
  }

  function brancher(input, opts) {
    if (!input || input.dataset.adresses === '1') return null;
    opts = opts || {};
    style();
    input.dataset.adresses = '1';
    input.classList.add('adr-champ');
    input.setAttribute('autocomplete', 'off');
    var listeNative = input.getAttribute('list');
    if (listeNative) input.removeAttribute('list'); // une seule liste à la fois

    var id = 'adr-' + (++compteur);
    var boite = el('div', 'adr-boite');
    boite.hidden = true;
    var liste = el('ul', 'adr-liste');
    liste.id = id + '-liste';
    liste.setAttribute('role', 'listbox');
    var note = el('div', 'adr-note');
    var attrib = el('div', 'adr-attrib');
    boite.appendChild(liste); boite.appendChild(note); boite.appendChild(attrib);
    var choisi = el('div', 'adr-choisi'); choisi.hidden = true; choisi.setAttribute('aria-live', 'polite');
    var avert = el('div', 'adr-avert'); avert.hidden = true;
    var apres = input.parentElement && input.parentElement.classList.contains('addr-wrap') ? input.parentElement : input;
    apres.insertAdjacentElement('afterend', avert);
    apres.insertAdjacentElement('afterend', choisi);
    apres.insertAdjacentElement('afterend', boite);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', liste.id);

    var session = null;     // jeton de la session d'autocomplétion en cours
    var suggestions = [];
    var actif = -1;
    var demande = 0;
    var minuterie = null;
    var arret = false;      // plus de suggestions (pas connecté, service fermé)

    function fermer() {
      boite.hidden = true;
      document.body.classList.remove('adr-ouvert');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      actif = -1;
    }
    function horsService() {
      arret = true;
      fermer();
      if (listeNative) input.setAttribute('list', listeNative); // la liste des villes revient
      if (typeof opts.horsService === 'function') opts.horsService();
    }
    function marquer(i) {
      var items = liste.querySelectorAll('.adr-opt');
      items.forEach(function (x, j) { x.classList.toggle('actif', j === i); x.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      actif = i;
      if (items[i]) input.setAttribute('aria-activedescendant', items[i].id);
    }

    function afficher(d) {
      liste.innerHTML = '';
      suggestions = d.suggestions || [];
      suggestions.forEach(function (s, i) {
        var li = el('li', 'adr-opt');
        li.id = id + '-o' + i;
        li.setAttribute('role', 'option');
        li.appendChild(el('span', 'adr-p', s.principal));
        if (s.secondaire) li.appendChild(el('span', 'adr-s', s.secondaire));
        li.addEventListener('pointerdown', function (e) { e.preventDefault(); });
        li.addEventListener('mousedown', function (e) { e.preventDefault(); });
        li.addEventListener('click', function () { choisir(i); });
        liste.appendChild(li);
      });
      var libre = el('li', 'adr-opt adr-libre', '✏️ Garder ce que j’ai écrit');
      libre.id = id + '-libre';
      libre.setAttribute('role', 'option');
      libre.addEventListener('pointerdown', function (e) { e.preventDefault(); });
      libre.addEventListener('mousedown', function (e) { e.preventDefault(); });
      libre.addEventListener('click', function () { fermer(); });
      liste.appendChild(libre);
      note.textContent = suggestions.length ? '' : 'Aucune suggestion : ce que tu as écrit sera gardé tel quel.';
      note.hidden = !!suggestions.length;
      // Mention obligatoire du fournisseur sous les suggestions
      attrib.textContent = suggestions.length && d.attribution ? 'Suggestions : ' + d.attribution : '';
      attrib.hidden = !attrib.textContent;
      var dejaOuverte = !boite.hidden;
      boite.hidden = false;
      document.body.classList.add('adr-ouvert');
      input.setAttribute('aria-expanded', 'true');
      // Cellulaire : si la liste dépasse l'écran, on remonte le champ en haut pour voir les choix et la mention.
      if (!dejaOuverte && boite.getBoundingClientRect().bottom > window.innerHeight) {
        window.scrollBy({ top: input.getBoundingClientRect().top - 12, behavior: 'auto' });
      }
      actif = -1;
    }

    async function chercher() {
      var q = input.value.trim();
      if (arret) return;
      if (q.length < MIN) { fermer(); return; }
      if (!session) session = nouveauJeton();
      var n = ++demande;
      var r;
      try { r = await api('adresse-suggestions', { q: q, session: session }); } catch (_) { r = { statut: 0, d: {} }; }
      if (n !== demande) return; // une frappe plus récente a déjà répondu
      if (r.statut === 401 || r.statut === 403) return horsService();
      if (r.statut === 429) { afficher({ suggestions: [] }); note.textContent = r.d.error || 'Trop de recherches : écris ton adresse au complet.'; return; }
      if (r.statut !== 200) { fermer(); return; }
      if (r.d.indisponible) { fermer(); return; }
      afficher(r.d);
    }

    async function choisir(i) {
      var s = suggestions[i];
      if (!s) return;
      fermer();
      var a = s.details || null;
      if (!a && s.id) {
        var r;
        try { r = await api('adresse-details', { id: s.id, session: session }); } catch (_) { r = { statut: 0, d: {} }; }
        a = r.statut === 200 && r.d && r.d.adresse ? r.d.adresse : null;
      }
      session = null; // la session d’autocomplétion se termine avec le choix
      if (!a) {
        // Pas de détails : on garde le texte choisi, comme du texte libre.
        input.value = s.principal + (s.secondaire ? ', ' + s.secondaire.replace(' · ', ', ') : '');
        choisi.hidden = true;
        return;
      }
      var adr = Object.assign({}, a, { principal: s.principal, nom: s.etablissement ? s.principal : '' });
      if (!adr.secteur && s.secteur) adr.secteur = s.secteur;
      if (typeof opts.onChoix === 'function') opts.onChoix(adr, input);
      choisi.textContent = '📍 ' + lieuLisible(adr);
      choisi.hidden = !lieuLisible(adr);
      if (opts.lieuPublic && !adr.etablissement) {
        avert.textContent = '⚠️ Ceci ressemble à une adresse de maison. Choisis plutôt un lieu public et éclairé (commerce, stationnement, gare).';
        avert.hidden = false;
      } else {
        avert.hidden = true;
      }
    }

    input.addEventListener('input', function (e) {
      if (e && e.adresses) return; // rempli par un choix
      choisi.hidden = true; avert.hidden = true;
      clearTimeout(minuterie);
      minuterie = setTimeout(chercher, ATTENTE_MS);
    });
    input.addEventListener('keydown', function (e) {
      if (boite.hidden) return;
      var n = liste.querySelectorAll('.adr-opt').length;
      if (e.key === 'ArrowDown') { e.preventDefault(); marquer((actif + 1) % n); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marquer((actif - 1 + n) % n); }
      else if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); if (actif < suggestions.length) choisir(actif); else fermer(); }
      else if (e.key === 'Escape') { fermer(); }
    });
    input.addEventListener('blur', function () { setTimeout(fermer, 200); });

    return { fermer: fermer, choisir: choisir };
  }

  // Remplit un champ sans relancer une recherche, mais en prévenant le reste de la page.
  function remplir(champ, valeur) {
    if (!champ) return;
    champ.value = valeur || '';
    var ev = new Event('input', { bubbles: true });
    ev.adresses = true;
    champ.dispatchEvent(ev);
    champ.dispatchEvent(new Event('change', { bubbles: true }));
  }

  window.Adresses = { brancher: brancher, remplir: remplir, lieuLisible: lieuLisible };
})();
