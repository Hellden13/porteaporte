// tests/courriels-uniques.test.js — Test complet du 22 nov. 2026, point 19 : un courriel par événement,
// heure du Québec, un seul nom d'expéditeur, téléphone affiché seulement s'il est valide.
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

before(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.INTERNAL_API_SECRET = 'secret-interne-de-test-assez-long';
  process.env.SITE_URL = 'https://porteaporte.site';
});

const { premiereFois } = require('../lib/_courriel-unique');
const { buildEmails } = require('../api/notifier');
const { NOM_EXPEDITEUR_COURRIEL } = require('../lib/_lib');

const rep = (d, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => d, text: async () => JSON.stringify(d), headers: { get: () => null } });

// Journal en mémoire avec la même logique que PostgREST (filtre sur evidence->>cle).
function journal({ postOk = true, getOk = true } = {}) {
  const rows = [];
  let n = 0;
  return {
    rows,
    fetch: async (url, o = {}) => {
      if ((o.method || 'GET') === 'POST') {
        if (!postOk) return rep({}, false);
        const b = JSON.parse(o.body);
        const r = { id: 'e' + (++n), created_at: new Date(Date.now() + n).toISOString(), ...b };
        rows.push(r);
        return rep([r]);
      }
      if (!getOk) return rep({}, false);
      const cle = decodeURIComponent((url.match(/evidence->>cle=eq\.([^&]+)/) || [])[1] || '');
      return rep(rows.filter((r) => r.evidence?.cle === cle).map(({ id, created_at }) => ({ id, created_at })));
    },
  };
}

describe('un seul courriel par événement', () => {
  const ctx = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
  test('1er appel : envoie ; 2e appel pour le même événement : n\'envoie pas ; autre événement : envoie', async () => {
    const j = journal();
    global.fetch = j.fetch;
    assert.equal(await premiereFois(ctx, 'ride_booking_to_driver:b1'), true);
    assert.equal(await premiereFois(ctx, 'ride_booking_to_driver:b1'), false);
    assert.equal(await premiereFois(ctx, 'ride_booking_confirmed:b1'), true);
    assert.equal(await premiereFois(ctx, 'ride_booking_to_driver:b2'), true);
  });
  test('journal illisible : on envoie quand même (pas de confirmation perdue)', async () => {
    global.fetch = journal({ postOk: false }).fetch;
    assert.equal(await premiereFois(ctx, 'x:1'), true);
    global.fetch = journal({ getOk: false }).fetch;
    assert.equal(await premiereFois(ctx, 'x:1'), true);
  });

  test('réservation puis paiement resynchronisé 2 fois : le conducteur reçoit UN courriel, le passager UN', async () => {
    const rides = require('../lib/_rides');
    const j = journal();
    const envois = [];
    global.fetch = async (url, o = {}) => {
      if (url.includes('/api/notifier')) { envois.push(JSON.parse(o.body).type); return rep({ success: true }); }
      if (url.includes('transaction_audit_events')) return j.fetch(url, o);
      if (url.includes('/rest/v1/rides')) return rep([{ id: 'r1', driver_id: 'd1', start_city: 'Lévis', end_city: 'Québec', departure_time: '2026-11-25T13:00:00Z' }]);
      if (url.includes('/rest/v1/profiles')) return rep([{ email: 'x@courriel-capture.ca', prenom: 'Julie', telephone: '418-555-1234' }]);
      return rep([]);
    };
    const ctx2 = { sbUrl: 'https://fake.supabase.co', sbKey: 'k' };
    const booking = { id: 'b9', ride_id: 'r1', passenger_id: 'p1', seats_reserved: 1, total_passenger: 10, driver_amount: 8 };
    await rides.sendRideBookingToDriverEmail(ctx2, booking);
    await rides.sendBookingConfirmationEmails(ctx2, booking);
    await rides.sendBookingConfirmationEmails(ctx2, booking);
    assert.deepEqual(envois.sort(), ['ride_booking_confirmed', 'ride_booking_to_driver']);
  });
});

describe('contenu des courriels', () => {
  test('un seul nom d\'expéditeur : « PorteàPorte »', () => {
    assert.equal(NOM_EXPEDITEUR_COURRIEL, 'PorteàPorte');
    for (const f of ['api/notifier.js', 'api/platform.js', 'lib/_rides.js']) {
      const src = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /FROM_NAME\s*=\s*'PorteàPorte 🍁'/, f);
      assert.doesNotMatch(src, /process\.env\.FROM_NAME/, f);
    }
  });

  test('téléphone du conducteur : affiché seulement s\'il a 10 chiffres', () => {
    const base = { passenger_email: 'p@courriel-capture.ca', ville_depart: 'Lévis', ville_arrivee: 'Québec', departure_time: '2026-11-25T13:00:00Z', total_price: '10.00' };
    const bon = buildEmails('ride_booking_confirmed', { ...base, driver_phone: '1 (418) 555-1234' }, 'a@b.c', 'n@b.c', 'PorteàPorte')[0].html;
    assert.match(bon, /418 555-1234/);
    assert.match(bon, /tel:\+14185551234/);
    for (const mauvais of ['418555', '12345', 'abc', '']) {
      const h = buildEmails('ride_booking_confirmed', { ...base, driver_phone: mauvais }, 'a@b.c', 'n@b.c', 'PorteàPorte')[0].html;
      assert.doesNotMatch(h, /📞/, mauvais);
    }
  });

  test('date ISO convertie à l\'heure du Québec (13 h UTC = 08 h au Québec en novembre)', () => {
    const h = buildEmails('ride_booking_confirmed', { passenger_email: 'p@courriel-capture.ca', departure_time: '2026-11-25T13:00:00Z' }, 'a@b.c', 'n@b.c', 'PorteàPorte')[0].html;
    assert.match(h, /08 h 00/);
    assert.doesNotMatch(h, /2026-11-25T13:00:00Z/);
  });

  test('aucun formatage de date sans fuseau du Québec dans le notifier', () => {
    const src = fs.readFileSync('api/notifier.js', 'utf8');
    for (const m of src.matchAll(/toLocale(?:Date|Time)?String\(([^)]*)\)/g)) assert.match(m[1], /America\/Toronto/, m[0]);
  });
});
