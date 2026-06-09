-- Migration: raison de refus de verification.
-- A executer dans Supabase SQL Editor. Idempotent.
-- Permet d'enregistrer pourquoi un utilisateur (conducteur/livreur) a ete refuse,
-- pour pouvoir le lui expliquer. Le code fonctionne meme sans cette colonne (repli),
-- mais l'ajouter permet de garder une trace cote admin.

alter table public.profiles
  add column if not exists rejection_reason text;
