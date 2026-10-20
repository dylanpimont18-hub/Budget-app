-- Charges fixes à montant variable (nourrice, électricité…) et charges personnelles (crédit perso…).
-- · variable : le montant change chaque mois ; il est « à confirmer » dans chaque nouveau mois
--   (le montant proposé est le dernier saisi) ;
-- · membre_id : charge payée par un membre ; null = charge commune.

alter table public.recurrentes
  add column variable boolean not null default false,
  add column membre_id uuid references public.membres on delete set null;
alter table public.recurrentes_mois
  add column variable boolean not null default false,
  add column a_confirmer boolean not null default false,
  add column membre_id uuid references public.membres on delete set null;
create index recurrentes_membre_idx on public.recurrentes (membre_id);
create index recurrentes_mois_membre_idx on public.recurrentes_mois (membre_id);

-- Même signature et même retour qu'en 006 : seule la copie des récurrentes change
create or replace function public.ouvrir_mois(p_cle text, p_membres jsonb, p_revenus jsonb, p_versements jsonb,
                                              p_prelevees jsonb default '[]')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foyer uuid;
  v_moi uuid;
  v_mois uuid;
  v_precedent uuid;
begin
  select foyer_id, id into v_foyer, v_moi from public.membres where user_id = auth.uid();
  if v_foyer is null then raise exception 'pas_de_foyer'; end if;
  if p_cle !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'mois_invalide'; end if;

  -- Si l'autre membre ouvre le même mois en même temps, l'un attend l'autre
  insert into public.mois (foyer_id, cle) values (v_foyer, p_cle)
  on conflict (foyer_id, cle) do nothing
  returning id into v_mois;

  if v_mois is null then
    -- Mois déjà ouvert : on n'ajoute que la part de l'appelant, si elle n'a pas encore été remplie
    select id into v_mois from public.mois where foyer_id = v_foyer and cle = p_cle;
    update public.mois_membres mm
    set salaire = coalesce((x->>'salaire')::numeric, mm.salaire),
        solde = (x->>'solde')::numeric,
        solde_le = case when x->>'solde' is not null then current_date end,
        salaire_dans_solde = coalesce((x->>'salaire_dans_solde')::boolean, false),
        salaire_recu = coalesce((x->>'salaire_dans_solde')::boolean, false),
        renseigne = true
    from jsonb_array_elements(coalesce(p_membres, '[]'::jsonb)) x
    where mm.mois_id = v_mois and mm.membre_id = v_moi and (x->>'membre_id')::uuid = v_moi and not mm.renseigne;
    return jsonb_build_object('mois_id', v_mois, 'cree', false);
  end if;

  insert into public.recurrentes_mois (foyer_id, mois_id, recurrente_id, libelle, icone, montant, ordre, dans_solde,
                                       variable, a_confirmer, membre_id)
  select v_foyer, v_mois, r.id, r.libelle, r.icone, r.montant, r.ordre,
         coalesce(p_prelevees, '[]'::jsonb) ? r.id::text,
         r.variable, r.variable, r.membre_id
  from public.recurrentes r
  where r.foyer_id = v_foyer and r.active;

  insert into public.budgets_mois (foyer_id, mois_id, categorie_id, montant)
  select v_foyer, v_mois, c.id, c.budget_defaut
  from public.categories c
  where c.foyer_id = v_foyer and c.active;

  -- Une ligne par membre du foyer : ceux qui ne sont pas fournis rempliront leur part plus tard
  -- (salaire proposé : celui du dernier mois ouvert, sinon le salaire par défaut)
  select id into v_precedent from public.mois
  where foyer_id = v_foyer and cle < p_cle order by cle desc limit 1;

  insert into public.mois_membres (foyer_id, mois_id, membre_id, salaire, solde, solde_le,
                                   salaire_dans_solde, salaire_recu, renseigne)
  select v_foyer, v_mois, m.id,
         coalesce((x->>'salaire')::numeric, prec.salaire, m.salaire_defaut),
         (x->>'solde')::numeric,
         case when x->>'solde' is not null then current_date end,
         coalesce((x->>'salaire_dans_solde')::boolean, false),
         coalesce((x->>'salaire_dans_solde')::boolean, false),
         x is not null
  from public.membres m
  left join jsonb_array_elements(coalesce(p_membres, '[]'::jsonb)) x on (x->>'membre_id')::uuid = m.id
  left join public.mois_membres prec on prec.mois_id = v_precedent and prec.membre_id = m.id
  where m.foyer_id = v_foyer;

  insert into public.revenus_mois (foyer_id, mois_id, libelle, montant, dans_solde)
  select v_foyer, v_mois, trim(x->>'libelle'), (x->>'montant')::numeric, coalesce((x->>'dans_solde')::boolean, false)
  from jsonb_array_elements(coalesce(p_revenus, '[]'::jsonb)) x
  where coalesce(trim(x->>'libelle'), '') <> '' and coalesce((x->>'montant')::numeric, 0) > 0;

  insert into public.versements (foyer_id, objectif_id, mois_cle, montant, membre_id)
  select v_foyer, o.id, p_cle, (x->>'montant')::numeric, m.id
  from jsonb_array_elements(coalesce(p_versements, '[]'::jsonb)) x
  join public.objectifs o on o.id = (x->>'objectif_id')::uuid and o.foyer_id = v_foyer
  left join public.membres m on m.id = nullif(x->>'membre_id', '')::uuid and m.foyer_id = v_foyer
  where coalesce((x->>'montant')::numeric, 0) <> 0;

  return jsonb_build_object('mois_id', v_mois, 'cree', true);
end;
$$;

-- La garde d'enfants varie chaque mois dans les foyers existants
update public.recurrentes set variable = true where libelle = 'Garde des enfants (Pajemploi)';
update public.recurrentes_mois rm set variable = true
from public.recurrentes r where r.id = rm.recurrente_id and r.variable;
