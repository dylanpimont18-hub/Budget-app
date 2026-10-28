-- Calculs justes autour du solde.
-- · mois_membres.solde_a : moment exact de la saisie du solde. Une dépense du même jour enregistrée avant ce moment
--   y est déjà comprise (avant, elle était retirée une 2e fois).
-- · versements.dans_solde : versement d'épargne déjà parti quand le solde a été saisi (pas retiré une 2e fois).
-- · ouvrir_mois date le solde à l'heure de Paris (et non UTC : entre minuit et 2 h, c'était la veille).
-- · ouvrir_mois sur un mois déjà ouvert garde aussi les autres revenus et versements saisis (sans doublon),
--   et la part de l'autre si elle n'était pas encore remplie.
-- · Les membres retirés du foyer (009) ne reçoivent plus de part dans les nouveaux mois.

alter table public.mois_membres add column solde_a timestamptz;
alter table public.versements add column dans_solde boolean not null default false;

create or replace function public.ouvrir_mois(p_cle text, p_membres jsonb, p_revenus jsonb, p_versements jsonb,
                                              p_prelevees jsonb default '[]')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foyer uuid;
  v_mois uuid;
  v_precedent uuid;
  v_cree boolean;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  select foyer_id into v_foyer from public.membres where user_id = auth.uid();
  if v_foyer is null then raise exception 'pas_de_foyer'; end if;
  if p_cle !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'mois_invalide'; end if;

  -- Si l'autre membre ouvre le même mois en même temps, l'un attend l'autre
  insert into public.mois (foyer_id, cle) values (v_foyer, p_cle)
  on conflict (foyer_id, cle) do nothing
  returning id into v_mois;
  v_cree := v_mois is not null;

  if v_cree then
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

    -- Une ligne par membre actif : ceux qui ne sont pas fournis rempliront leur part plus tard
    -- (salaire proposé : celui du dernier mois ouvert, sinon le salaire par défaut)
    select id into v_precedent from public.mois
    where foyer_id = v_foyer and cle < p_cle order by cle desc limit 1;

    insert into public.mois_membres (foyer_id, mois_id, membre_id, salaire, solde, solde_le, solde_a,
                                     salaire_dans_solde, salaire_recu, renseigne)
    select v_foyer, v_mois, m.id,
           coalesce((x->>'salaire')::numeric, prec.salaire, m.salaire_defaut),
           (x->>'solde')::numeric,
           case when x->>'solde' is not null then v_jour end,
           case when x->>'solde' is not null then now() end,
           coalesce((x->>'salaire_dans_solde')::boolean, false),
           coalesce((x->>'salaire_dans_solde')::boolean, false),
           x is not null
    from public.membres m
    left join jsonb_array_elements(coalesce(p_membres, '[]'::jsonb)) x on (x->>'membre_id')::uuid = m.id
    left join public.mois_membres prec on prec.mois_id = v_precedent and prec.membre_id = m.id
    where m.foyer_id = v_foyer and m.user_id is not null;
  else
    -- Mois déjà ouvert : on ajoute les parts fournies qui n'étaient pas encore remplies (jamais d'écrasement)
    select id into v_mois from public.mois where foyer_id = v_foyer and cle = p_cle;
    insert into public.mois_membres (foyer_id, mois_id, membre_id, salaire, solde, solde_le, solde_a,
                                     salaire_dans_solde, salaire_recu, renseigne)
    select v_foyer, v_mois, m.id, coalesce((x->>'salaire')::numeric, m.salaire_defaut), (x->>'solde')::numeric,
           case when x->>'solde' is not null then v_jour end,
           case when x->>'solde' is not null then now() end,
           coalesce((x->>'salaire_dans_solde')::boolean, false), coalesce((x->>'salaire_dans_solde')::boolean, false), true
    from jsonb_array_elements(coalesce(p_membres, '[]'::jsonb)) x
    join public.membres m on m.id = (x->>'membre_id')::uuid and m.foyer_id = v_foyer and m.user_id is not null
    on conflict (mois_id, membre_id) do update
    set salaire = coalesce(excluded.salaire, public.mois_membres.salaire),
        solde = excluded.solde,
        solde_le = excluded.solde_le,
        solde_a = excluded.solde_a,
        salaire_dans_solde = excluded.salaire_dans_solde,
        salaire_recu = excluded.salaire_recu,
        renseigne = true
    where not public.mois_membres.renseigne;
  end if;

  -- Autres revenus : un libellé déjà présent dans le mois n'est pas ajouté une 2e fois
  insert into public.revenus_mois (foyer_id, mois_id, libelle, montant, dans_solde)
  select v_foyer, v_mois, trim(x->>'libelle'), (x->>'montant')::numeric, coalesce((x->>'dans_solde')::boolean, false)
  from jsonb_array_elements(coalesce(p_revenus, '[]'::jsonb)) x
  where coalesce(trim(x->>'libelle'), '') <> '' and coalesce((x->>'montant')::numeric, 0) > 0
    and not exists (select 1 from public.revenus_mois r
                    where r.mois_id = v_mois and lower(r.libelle) = lower(trim(x->>'libelle')));

  -- Versements : un objectif qui a déjà un versement ce mois-ci n'en reçoit pas un 2e
  insert into public.versements (foyer_id, objectif_id, mois_cle, montant, membre_id, dans_solde)
  select v_foyer, o.id, p_cle, (x->>'montant')::numeric, m.id, coalesce((x->>'dans_solde')::boolean, false)
  from jsonb_array_elements(coalesce(p_versements, '[]'::jsonb)) x
  join public.objectifs o on o.id = (x->>'objectif_id')::uuid and o.foyer_id = v_foyer
  left join public.membres m on m.id = nullif(x->>'membre_id', '')::uuid and m.foyer_id = v_foyer
  where coalesce((x->>'montant')::numeric, 0) <> 0
    and not exists (select 1 from public.versements v where v.objectif_id = o.id and v.mois_cle = p_cle);

  return jsonb_build_object('mois_id', v_mois, 'cree', v_cree);
end;
$$;
