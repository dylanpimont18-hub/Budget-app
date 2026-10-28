-- Sécurité du foyer.
-- · Deux membres au plus ; un code d'invitation erroné est compté : 10 essais ratés par heure et par compte, pas plus.
-- · Le code peut être régénéré ; retirer un membre lui coupe l'accès (user_id = null : ses dépenses passées restent
--   lisibles sous son prénom) et régénère le code, qu'il connaissait.
-- · Plus aucune donnée personnelle dans le code : un nouveau foyer part de catégories sans budget et sans charges.

alter table public.membres alter column user_id drop not null;

-- Essais de code ratés (lus et écrits seulement par rejoindre_foyer : RLS sans politique)
create table public.essais_invitation (
  user_id uuid not null references auth.users on delete cascade,
  le timestamptz not null default now()
);
create index essais_invitation_user_idx on public.essais_invitation (user_id, le);
alter table public.essais_invitation enable row level security;
revoke all on public.essais_invitation from anon, authenticated;

create or replace function public.salaire_initial(p_prenom text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 0::numeric;
$$;

create or replace function public.nouveau_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(b, i) % 32, 1), '' order by i)
  from (select extensions.gen_random_bytes(6) as b) r, generate_series(0, 5) i;
$$;
revoke execute on function public.nouveau_code() from public, anon, authenticated;

create or replace function public.creer_foyer(p_prenom text)
returns public.foyers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_foyer public.foyers;
begin
  if v_uid is null then raise exception 'non_connecte'; end if;
  if coalesce(trim(p_prenom), '') = '' then raise exception 'prenom_requis'; end if;
  if exists (select 1 from public.membres where user_id = v_uid) then raise exception 'deja_membre'; end if;

  loop
    begin
      insert into public.foyers (nom, code_invitation)
      values ('Foyer de ' || trim(p_prenom), public.nouveau_code())
      returning * into v_foyer;
      exit;
    exception when unique_violation then
      -- code déjà pris : on en tire un autre
    end;
  end loop;

  insert into public.membres (foyer_id, user_id, prenom, salaire_defaut)
  values (v_foyer.id, v_uid, trim(p_prenom), 0);

  insert into public.categories (foyer_id, nom, icone, budget_defaut, ordre) values
    (v_foyer.id, 'Courses',                '🛒', 0, 1),
    (v_foyer.id, 'Transport & carburant',  '⛽', 0, 2),
    (v_foyer.id, 'Loisirs & sorties',      '🎉', 0, 3),
    (v_foyer.id, 'Vêtements des enfants',  '👕', 0, 4),
    (v_foyer.id, 'Activités des enfants',  '⚽', 0, 5),
    (v_foyer.id, 'Santé',                  '💊', 0, 6),
    (v_foyer.id, 'Maison & entretien',     '🔧', 0, 7),
    (v_foyer.id, 'Vacances',               '🏖️', 0, 8),
    (v_foyer.id, 'Cadeaux & fêtes',        '🎁', 0, 9),
    (v_foyer.id, 'Divers & imprévus',      '📦', 0, 10);

  return v_foyer;
end;
$$;

-- Renvoie l'id du foyer, ou null si le code est inconnu (l'essai raté est alors compté : une exception l'annulerait)
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
  if (select count(*) from public.essais_invitation where user_id = v_uid and le > now() - interval '1 hour') >= 10 then
    raise exception 'trop_d_essais';
  end if;

  select id into v_foyer from public.foyers where code_invitation = upper(trim(p_code)) for update;
  if v_foyer is null then
    insert into public.essais_invitation (user_id) values (v_uid);
    return null;
  end if;
  if (select count(*) from public.membres where foyer_id = v_foyer and user_id is not null) >= 2 then
    raise exception 'foyer_complet';
  end if;

  insert into public.membres (foyer_id, user_id, prenom, salaire_defaut)
  values (v_foyer, v_uid, trim(p_prenom), 0);
  return v_foyer;
end;
$$;

create or replace function public.regenerer_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foyer uuid;
  v_code text;
begin
  select foyer_id into v_foyer from public.membres where user_id = auth.uid();
  if v_foyer is null then raise exception 'pas_de_foyer'; end if;
  loop
    begin
      update public.foyers set code_invitation = public.nouveau_code() where id = v_foyer returning code_invitation into v_code;
      return v_code;
    exception when unique_violation then
      -- code déjà pris : on en tire un autre
    end;
  end loop;
end;
$$;

-- Coupe l'accès d'un autre membre du foyer et régénère le code ; renvoie le nouveau code
create or replace function public.retirer_membre(p_membre uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foyer uuid;
  v_moi uuid;
  n int;
begin
  select foyer_id, id into v_foyer, v_moi from public.membres where user_id = auth.uid();
  if v_foyer is null then raise exception 'pas_de_foyer'; end if;
  if p_membre = v_moi then raise exception 'pas_soi_meme'; end if;
  update public.membres set user_id = null where id = p_membre and foyer_id = v_foyer and user_id is not null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'membre_inconnu'; end if;
  return public.regenerer_code();
end;
$$;

revoke execute on function public.regenerer_code() from public, anon;
revoke execute on function public.retirer_membre(uuid) from public, anon;
grant execute on function public.regenerer_code() to authenticated;
grant execute on function public.retirer_membre(uuid) to authenticated;
