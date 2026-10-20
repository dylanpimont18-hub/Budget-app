-- RPC : créer / rejoindre un foyer, ouvrir un mois (transactionnel et idempotent).

create or replace function public.salaire_initial(p_prenom text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when trim(p_prenom) ilike 'dylan' then 2000
    when trim(p_prenom) ilike 'amel' then 2300
    else 0
  end;
$$;

create or replace function public.creer_foyer(p_prenom text)
returns public.foyers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sans 0 O 1 I
  v_code text;
  v_foyer public.foyers;
begin
  if v_uid is null then raise exception 'non_connecte'; end if;
  if coalesce(trim(p_prenom), '') = '' then raise exception 'prenom_requis'; end if;
  if exists (select 1 from public.membres where user_id = v_uid) then raise exception 'deja_membre'; end if;

  loop
    select string_agg(substr(v_alphabet, 1 + get_byte(b, i) % 32, 1), '' order by i)
      into v_code
      from (select extensions.gen_random_bytes(6) as b) r, generate_series(0, 5) i;
    begin
      insert into public.foyers (nom, code_invitation)
      values ('Foyer de ' || trim(p_prenom), v_code)
      returning * into v_foyer;
      exit;
    exception when unique_violation then
      -- code déjà pris : on en tire un autre
    end;
  end loop;

  insert into public.membres (foyer_id, user_id, prenom, salaire_defaut)
  values (v_foyer.id, v_uid, trim(p_prenom), public.salaire_initial(p_prenom));

  insert into public.categories (foyer_id, nom, icone, budget_defaut, ordre) values
    (v_foyer.id, 'Courses',                '🛒', 750, 1),
    (v_foyer.id, 'Transport & carburant',  '⛽', 350, 2),
    (v_foyer.id, 'Loisirs & sorties',      '🎉', 200, 3),
    (v_foyer.id, 'Vêtements des enfants',  '👕', 0,   4),
    (v_foyer.id, 'Activités des enfants',  '⚽', 0,   5),
    (v_foyer.id, 'Santé',                  '💊', 0,   6),
    (v_foyer.id, 'Maison & entretien',     '🔧', 0,   7),
    (v_foyer.id, 'Vacances',               '🏖️', 0,   8),
    (v_foyer.id, 'Cadeaux & fêtes',        '🎁', 0,   9),
    (v_foyer.id, 'Divers & imprévus',      '📦', 0,  10);

  insert into public.recurrentes (foyer_id, libelle, icone, montant, ordre) values
    (v_foyer.id, 'Prêt immobilier',                        '🏡', 765.79, 1),
    (v_foyer.id, 'Prêt à taux zéro',                       '🏦',  90.39, 2),
    (v_foyer.id, 'Charges & énergie',                      '⚡', 169.28, 3),
    (v_foyer.id, 'Eau / assainissement',                   '💧',  58.00, 4),
    (v_foyer.id, 'Assurances',                             '🛡️',  30.09, 5),
    (v_foyer.id, 'Abonnements (box, mobiles, streaming)',  '📱',  80.97, 6),
    (v_foyer.id, 'Garde des enfants (Pajemploi)',          '👶', 643.39, 7),
    (v_foyer.id, 'Cantine / périscolaire',                 '🍽️',  84.00, 8),
    (v_foyer.id, 'Impôts',                                 '🧾', 149.00, 9);

  return v_foyer;
end;
$$;

create or replace function public.rejoindre_foyer(p_code text, p_prenom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_foyer uuid;
begin
  if v_uid is null then raise exception 'non_connecte'; end if;
  if coalesce(trim(p_prenom), '') = '' then raise exception 'prenom_requis'; end if;
  if exists (select 1 from public.membres where user_id = v_uid) then raise exception 'deja_membre'; end if;

  select id into v_foyer from public.foyers where code_invitation = upper(trim(p_code));
  if v_foyer is null then raise exception 'code_invalide'; end if;

  insert into public.membres (foyer_id, user_id, prenom, salaire_defaut)
  values (v_foyer, v_uid, trim(p_prenom), public.salaire_initial(p_prenom));
  return v_foyer;
end;
$$;

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

  insert into public.mois_membres (foyer_id, mois_id, membre_id, salaire, solde)
  select v_foyer, v_mois, m.id, coalesce((x->>'salaire')::numeric, 0), (x->>'solde')::numeric
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

revoke execute on function public.creer_foyer(text) from public, anon;
revoke execute on function public.rejoindre_foyer(text, text) from public, anon;
revoke execute on function public.ouvrir_mois(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.creer_foyer(text) to authenticated;
grant execute on function public.rejoindre_foyer(text, text) to authenticated;
grant execute on function public.ouvrir_mois(text, jsonb, jsonb, jsonb) to authenticated;
