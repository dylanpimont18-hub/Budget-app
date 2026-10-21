-- Réglage du profil : le salaire du mois M arrive à la fin du mois M-1.
-- À l'ouverture, la réponse « salaire déjà arrivé ? » est alors préremplie sur Oui (modifiable).

alter table public.membres add column paie_mois_precedent boolean not null default false;

-- Chacun ne modifie que sa propre ligne (politique membres_maj_soi) et seulement ces colonnes
grant update (prenom, salaire_defaut, paie_mois_precedent) on public.membres to authenticated;
