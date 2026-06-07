-- Migration : partage de frais covoiturage (places totales pour diviser le coût)
-- À exécuter dans Supabase → SQL Editor. Sans danger : ajoute une colonne si absente.

-- 1) Ajoute la colonne du nombre de places d'origine (sert de diviseur stable)
alter table public.rides
  add column if not exists total_seats integer;

-- 2) Remplit total_seats pour les trajets existants.
--    On prend le maximum entre les places encore dispo et les places déjà réservées,
--    pour reconstituer le total d'origine (available_seats diminue à chaque réservation).
update public.rides r
set total_seats = greatest(
      coalesce(r.available_seats, 1),
      coalesce((
        select sum(coalesce(b.seats_reserved, 1))
        from public.ride_bookings b
        where b.ride_id = r.id
          and b.status not in ('annule_passager','annule_chauffeur')
      ), 0) + coalesce(r.available_seats, 0)
    )
where total_seats is null;

-- 3) Filet de sécurité : aucune valeur nulle ou < 1
update public.rides
set total_seats = greatest(coalesce(total_seats, 1), 1)
where total_seats is null or total_seats < 1;
