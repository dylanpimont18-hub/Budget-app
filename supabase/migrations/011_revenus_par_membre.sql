-- Revenus du mois par membre : null = revenu commun (CAF…), partagé à parts égales dans les colonnes de chacun ;
-- sinon revenu perso (prime…), ajouté à la seule colonne de ce membre.
alter table public.revenus_mois
  add column membre_id uuid references public.membres on delete set null;
create index revenus_mois_membre_idx on public.revenus_mois (membre_id);
