-- Sécurité : chaque membre n'accède qu'aux données de son foyer.

create or replace function public.est_membre(f uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membres
    where foyer_id = f and user_id = (select auth.uid())
  );
$$;
revoke execute on function public.est_membre(uuid) from public, anon;
grant execute on function public.est_membre(uuid) to authenticated;

alter table public.foyers           enable row level security;
alter table public.membres          enable row level security;
alter table public.categories       enable row level security;
alter table public.recurrentes      enable row level security;
alter table public.mois             enable row level security;
alter table public.mois_membres     enable row level security;
alter table public.revenus_mois     enable row level security;
alter table public.recurrentes_mois enable row level security;
alter table public.budgets_mois     enable row level security;
alter table public.depenses         enable row level security;
alter table public.objectifs        enable row level security;
alter table public.versements       enable row level security;

-- Foyer : lecture seule ; création et adhésion passent par les RPC
create policy foyer_lecture on public.foyers
  for select to authenticated using (public.est_membre(id));

-- Membres : lecture des membres du foyer, modification de sa propre ligne (prénom, salaire)
create policy membres_lecture on public.membres
  for select to authenticated using (public.est_membre(foyer_id));
create policy membres_maj_soi on public.membres
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke insert, update, delete on public.membres from authenticated, anon;
grant update (prenom, salaire_defaut) on public.membres to authenticated;

-- Autres tables : accès complet pour les membres du foyer
do $$
declare t text;
begin
  foreach t in array array['categories', 'recurrentes', 'mois', 'mois_membres', 'revenus_mois',
                           'recurrentes_mois', 'budgets_mois', 'depenses', 'objectifs', 'versements']
  loop
    execute format(
      'create policy membres_du_foyer on public.%I for all to authenticated
         using (public.est_membre(foyer_id)) with check (public.est_membre(foyer_id))', t);
  end loop;
end $$;
