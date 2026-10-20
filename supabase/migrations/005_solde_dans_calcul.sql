-- Le solde de départ entre dans le calcul des ressources du mois.
-- salaire_dans_solde : le salaire était déjà arrivé quand le solde a été saisi (sert au calcul).
-- salaire_recu : le salaire est arrivé, à l'ouverture ou confirmé plus tard (affichage seulement).

alter table public.mois_membres
  add column salaire_dans_solde boolean not null default false,
  add column salaire_recu boolean not null default false;

-- Mois déjà ouverts : un solde saisi comprenait le salaire touché
update public.mois_membres
set salaire_dans_solde = true, salaire_recu = true
where solde is not null;

create or replace function public.ouvrir_mois(p_cle text, p_membres jsonb, p_revenus jsonb, p_versements jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foyer uuid;
  v_mois uuid;
begin
  select foyer_id into v_foyer from public.membres where user_id = auth.uid();
  if v_foyer is null then raise exception 'pas_de_foyer'; end if;
  if p_cle !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'mois_invalide'; end if;

  -- Si l'autre membre ouvre le même mois en même temps, l'un attend l'autre puis ne fait rien
  insert into public.mois (foyer_id, cle) values (v_foyer, p_cle)
  on conflict (foyer_id, cle) do nothing
  returning id into v_mois;

  if v_mois is null then
    select id into v_mois from public.mois where foyer_id = v_foyer and cle = p_cle;
    return v_mois;
  end if;

  insert into public.recurrentes_mois (foyer_id, mois_id, recurrente_id, libelle, icone, montant, ordre)
  select v_foyer, v_mois, r.id, r.libelle, r.icone, r.montant, r.ordre
  from public.recurrentes r
  where r.foyer_id = v_foyer and r.active;

  insert into public.budgets_mois (foyer_id, mois_id, categorie_id, montant)
  select v_foyer, v_mois, c.id, c.budget_defaut
  from public.categories c
  where c.foyer_id = v_foyer and c.active;

  insert into public.mois_membres (foyer_id, mois_id, membre_id, salaire, solde, salaire_dans_solde, salaire_recu)
  select v_foyer, v_mois, m.id, coalesce((x->>'salaire')::numeric, 0), (x->>'solde')::numeric,
         coalesce((x->>'salaire_dans_solde')::boolean, false), coalesce((x->>'salaire_dans_solde')::boolean, false)
  from jsonb_array_elements(coalesce(p_membres, '[]'::jsonb)) x
  join public.membres m on m.id = (x->>'membre_id')::uuid and m.foyer_id = v_foyer;

  insert into public.revenus_mois (foyer_id, mois_id, libelle, montant)
  select v_foyer, v_mois, trim(x->>'libelle'), coalesce((x->>'montant')::numeric, 0)
  from jsonb_array_elements(coalesce(p_revenus, '[]'::jsonb)) x
  where coalesce(trim(x->>'libelle'), '') <> '';

  insert into public.versements (foyer_id, objectif_id, mois_cle, montant, membre_id)
  select v_foyer, o.id, p_cle, (x->>'montant')::numeric, m.id
  from jsonb_array_elements(coalesce(p_versements, '[]'::jsonb)) x
  join public.objectifs o on o.id = (x->>'objectif_id')::uuid and o.foyer_id = v_foyer
  left join public.membres m on m.id = nullif(x->>'membre_id', '')::uuid and m.foyer_id = v_foyer
  where coalesce((x->>'montant')::numeric, 0) <> 0;

  return v_mois;
end;
$$;
