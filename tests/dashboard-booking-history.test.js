const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dashboard classifies cancelled and past bookings as history', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard-covoiturage.html'), 'utf8');
  assert.match(html, /'annule_passager','annule_chauffeur'/);
  assert.match(html, /ride_departure_time.*Date\.now\(\)/);
  assert.match(html, /fmtDate\(b\.ride_departure_time \|\| b\.created_at\)/);
});

test('dashboard API exposes the ride departure time without the nested ride object', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', '_rides.js'), 'utf8');
  assert.match(source, /ride_departure_time: b\.ride\?\.departure_time \|\| null/);
});
