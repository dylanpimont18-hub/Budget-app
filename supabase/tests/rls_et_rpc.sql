-- Test RLS et RPC du budget familial.
-- Exécution : coller dans l'éditeur SQL (ou execute_sql). Tout est annulé par le rollback final.
-- Un échec lève une exception « assert » avec un message explicite.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dylan@test.local', '', now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amel@test.local', '', now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'intrus@test.local', '', now(), now());

set local role authenticated;

-- ── Dylan crée le foyer ──────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare
  f public.foyers;
  n int;
  s numeric;
begin
  f := public.creer_foyer('Dylan');
  perform set_config('test.foyer', f.id::text, true);
  perform set_config('test.code', f.code_invitation, true);

  assert f.code_invitation ~ '^[A-HJ-NP-Z2-9]{6}$', 'code d''invitation mal formé : ' || f.code_invitation;
  select count(*) into n from public.categories where foyer_id = f.id;
  assert n = 10, 'attendu 10 catégories, obtenu ' || n;
  select count(*) into n from public.recurrentes where foyer_id = f.id;
  assert n = 9, 'attendu 9 récurrentes, obtenu ' || n;
  select sum(montant) into s from public.recurrentes where foyer_id = f.id;
  assert s = 900, 'total des récurrentes attendu 900, obtenu ' || s;
  select salaire_defaut into s from public.membres where user_id = auth.uid();
  assert s = 1800, 'salaire_defaut Dylan attendu 1800, obtenu ' || s;

  perform set_config('test.membre_dylan', (select id::text from public.membres where user_id = auth.uid()), true);
  perform set_config('test.cat_courses', (select id::text from public.categories where foyer_id = f.id and nom = 'Courses'), true);

  begin
    perform public.creer_foyer('Dylan');
    raise exception 'pas d''erreur';
  exception when others then
    assert sqlerrm = 'deja_membre', '2e creer_foyer : attendu deja_membre, obtenu ' || sqlerrm;
  end;
end $$;

-- ── Amel rejoint avec le code en minuscules ─────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare
  fid uuid;
  n int;
  s numeric;
begin
  fid := public.rejoindre_foyer(lower(current_setting('test.code')), 'Amel');
  assert fid = current_setting('test.foyer')::uuid, 'rejoindre_foyer renvoie un autre foyer';
  select count(*) into n from public.categories;
  assert n = 10, 'Amel devrait voir 10 catégories, obtenu ' || n;
  select count(*) into n from public.membres;
  assert n = 2, 'Amel devrait voir 2 membres, obtenu ' || n;
  select salaire_defaut into s from public.membres where user_id = auth.uid();
  assert s = 2100, 'salaire_defaut Amel attendu 2100, obtenu ' || s;

  -- Amel ne peut modifier que sa propre ligne membre
  update public.membres set prenom = 'Pirate' where id = current_setting('test.membre_dylan')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'Amel a pu modifier la ligne de Dylan';
end $$;

-- ── L'intrus ne voit rien et ne peut rien écrire ────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

do $$
declare
  n int;
begin
  begin
    perform public.rejoindre_foyer('ZZZZZZ', 'X');
    raise exception 'pas d''erreur';
  exception when others then
    assert sqlerrm = 'code_invalide', 'code inconnu : attendu code_invalide, obtenu ' || sqlerrm;
  end;

  select count(*) into n from public.categories; assert n = 0, 'intrus voit des catégories';
  select count(*) into n from public.depenses;   assert n = 0, 'intrus voit des dépenses';
  select count(*) into n from public.membres;    assert n = 0, 'intrus voit des membres';
  select count(*) into n from public.foyers;     assert n = 0, 'intrus voit des foyers';

  begin
    insert into public.depenses (foyer_id, date, montant, categorie_id, membre_id)
    values (current_setting('test.foyer')::uuid, '2026-10-05', 10,
            current_setting('test.cat_courses')::uuid, current_setting('test.membre_dylan')::uuid);
    raise exception 'pas d''erreur';
  exception when others then
    assert sqlstate = '42501', 'insert intrus : attendu refus RLS (42501), obtenu ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

-- ── Ouverture des mois, mois sauté, modèle à jour ───────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare
  fid uuid := current_setting('test.foyer')::uuid;
  m jsonb;
  oct1 uuid;
  oct2 uuid;
  dec uuid;
  n int;
  s numeric;
  cles text[];
begin
  select jsonb_agg(jsonb_build_object('membre_id', id, 'salaire', salaire_defaut, 'solde', -120.50)) into m
  from public.membres;

  oct1 := public.ouvrir_mois('2026-10', m, '[{"libelle":"Allocations familiales (CAF)","montant":100},{"libelle":"Primes","montant":0}]', '[]')->>'mois_id';
  oct2 := public.ouvrir_mois('2026-10', '[]', '[]', '[]')->>'mois_id';
  assert oct1 = oct2, 'ouvrir_mois non idempotent';
  select count(*) into n from public.mois where cle = '2026-10'; assert n = 1, 'plusieurs mois 2026-10';
  select count(*) into n from public.recurrentes_mois where mois_id = oct1; assert n = 9, 'octobre : attendu 9 récurrentes, obtenu ' || n;
  select count(*) into n from public.budgets_mois where mois_id = oct1; assert n = 10, 'octobre : attendu 10 budgets, obtenu ' || n;
  select montant into s from public.budgets_mois where mois_id = oct1 and categorie_id = current_setting('test.cat_courses')::uuid;
  assert s = 750, 'octobre : Courses attendu 750, obtenu ' || s;
  select count(*) into n from public.mois_membres where mois_id = oct1 and solde = -120.50; assert n = 2, 'mois_membres : soldes non enregistrés';
  select count(*) into n from public.revenus_mois where mois_id = oct1; assert n = 1, 'revenus : attendu 1 (ligne à 0 ignorée, 2e appel sans effet), obtenu ' || n;

  -- « Impôts » retiré d'octobre seulement, budget Courses passé à 800 dans le modèle
  delete from public.recurrentes_mois where mois_id = oct1 and libelle = 'Impôts';
  update public.categories set budget_defaut = 800 where id = current_setting('test.cat_courses')::uuid;

  dec := public.ouvrir_mois('2026-12', m, '[]', '[]')->>'mois_id';
  select count(*) into n from public.recurrentes_mois where mois_id = dec; assert n = 9, 'décembre : attendu 9 récurrentes, obtenu ' || n;
  select count(*) into n from public.recurrentes_mois where mois_id = dec and libelle = 'Impôts'; assert n = 1, 'décembre : Impôts manquant';
  select count(*) into n from public.recurrentes_mois where mois_id = oct1; assert n = 8, 'octobre : attendu 8 récurrentes, obtenu ' || n;
  select montant into s from public.budgets_mois where mois_id = dec and categorie_id = current_setting('test.cat_courses')::uuid;
  assert s = 800, 'décembre : Courses attendu 800, obtenu ' || s;
  select montant into s from public.budgets_mois where mois_id = oct1 and categorie_id = current_setting('test.cat_courses')::uuid;
  assert s = 750, 'octobre : Courses ne doit pas changer, obtenu ' || s;
  select array_agg(cle order by cle desc) into cles from public.mois where foyer_id = fid;
  assert cles = array['2026-12', '2026-10'], 'mois attendus {2026-12,2026-10}, obtenu ' || cles::text;
end $$;

-- ── Ouverture par Dylan seul, Amel ajoute sa part ensuite ───────────
do $$
declare
  r jsonb;
  janv uuid;
  mm public.mois_membres;
  n int;
  impots uuid;
begin
  select id into impots from public.recurrentes where libelle = 'Impôts';
  -- Nourrice : montant variable ; crédit perso de Dylan
  update public.recurrentes set variable = true where libelle = 'Garde des enfants (Pajemploi)';
  insert into public.recurrentes (foyer_id, libelle, montant, membre_id)
  values (current_setting('test.foyer')::uuid, 'Crédit perso', 120, current_setting('test.membre_dylan')::uuid);
  r := public.ouvrir_mois('2027-01',
    jsonb_build_array(jsonb_build_object('membre_id', current_setting('test.membre_dylan'), 'salaire', 1850,
                                         'solde', 500, 'salaire_dans_solde', true)),
    '[{"libelle":"CAF","montant":100,"dans_solde":true}]', '[]', jsonb_build_array(impots));
  assert (r->>'cree')::boolean, 'janvier : attendu cree = true';
  janv := r->>'mois_id';

  select * into mm from public.mois_membres where mois_id = janv and membre_id = current_setting('test.membre_dylan')::uuid;
  assert mm.salaire = 1850 and mm.solde = 500 and mm.solde_le = current_date, 'Dylan : salaire, solde ou date du solde faux';
  assert mm.salaire_dans_solde and mm.salaire_recu and mm.renseigne, 'Dylan payé : attendu dans_solde, reçu et renseigné';

  select mm2.* into mm from public.mois_membres mm2 join public.membres mb on mb.id = mm2.membre_id
  where mm2.mois_id = janv and mb.prenom = 'Amel';
  assert mm.membre_id is not null, 'Amel : ligne du mois non créée';
  assert not mm.renseigne and mm.solde is null and not mm.salaire_dans_solde, 'Amel : sa part doit rester à remplir';
  assert mm.salaire = 2100, 'Amel : salaire du mois précédent attendu (2100), obtenu ' || mm.salaire;

  select count(*) into n from public.recurrentes_mois where mois_id = janv and dans_solde;
  assert n = 1, 'janvier : seule Impôts doit être déjà prélevée, obtenu ' || n;
  select count(*) into n from public.revenus_mois where mois_id = janv and dans_solde;
  assert n = 1, 'janvier : CAF déjà reçue non enregistrée';
  select count(*) into n from public.recurrentes_mois
  where mois_id = janv and libelle = 'Garde des enfants (Pajemploi)' and variable and a_confirmer;
  assert n = 1, 'janvier : la nourrice doit être variable et à confirmer';
  select count(*) into n from public.recurrentes_mois
  where mois_id = janv and libelle = 'Crédit perso' and membre_id = current_setting('test.membre_dylan')::uuid and not a_confirmer;
  assert n = 1, 'janvier : crédit perso de Dylan non recopié';
  perform set_config('test.janv', janv::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare
  r jsonb;
  mm public.mois_membres;
begin
  r := public.ouvrir_mois('2027-01',
    (select jsonb_agg(jsonb_build_object('membre_id', id, 'salaire', 2200, 'solde', -80, 'salaire_dans_solde', false))
     from public.membres where user_id = auth.uid()), '[]', '[]');
  assert not (r->>'cree')::boolean and r->>'mois_id' = current_setting('test.janv'), 'Amel : mois déjà ouvert attendu';
  select * into mm from public.mois_membres where mois_id = current_setting('test.janv')::uuid
    and membre_id = (select id from public.membres where user_id = auth.uid());
  assert mm.renseigne and mm.salaire = 2200 and mm.solde = -80 and not mm.salaire_dans_solde and not mm.salaire_recu,
    'Amel : sa part n''a pas été ajoutée au mois existant';

  -- Une 2e fois : la part déjà remplie n'est pas écrasée
  perform public.ouvrir_mois('2027-01',
    (select jsonb_agg(jsonb_build_object('membre_id', id, 'salaire', 1, 'solde', 1)) from public.membres where user_id = auth.uid()),
    '[]', '[]');
  select * into mm from public.mois_membres where mois_id = current_setting('test.janv')::uuid
    and membre_id = (select id from public.membres where user_id = auth.uid());
  assert mm.salaire = 2200, 'Amel : part déjà remplie écrasée';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ── Catégorie désactivée : la dépense reste lisible ─────────────────
do $$
declare
  cat uuid;
  nom_lu text;
begin
  select id into cat from public.categories where nom = 'Santé';
  insert into public.depenses (foyer_id, date, montant, categorie_id, membre_id, libelle)
  values (current_setting('test.foyer')::uuid, '2026-10-12', 23.40, cat, current_setting('test.membre_dylan')::uuid, 'Pharmacie');
  update public.categories set active = false where id = cat;

  select c.nom into nom_lu from public.depenses d join public.categories c on c.id = d.categorie_id where d.libelle = 'Pharmacie';
  assert nom_lu = 'Santé', 'dépense d''une catégorie désactivée illisible';
end $$;

-- ── Objectifs mal saisis refusés ────────────────────────────────────
do $$
begin
  begin
    insert into public.objectifs (foyer_id, nom, cible, debut, fin)
    values (current_setting('test.foyer')::uuid, 'Fin avant début', 1000, '2026-10', '2026-09');
    raise exception 'pas d''erreur';
  exception when others then
    assert sqlstate = '23514', 'fin < début : attendu violation de contrainte, obtenu ' || sqlstate || ' ' || sqlerrm;
  end;
  begin
    insert into public.objectifs (foyer_id, nom, cible, debut, fin)
    values (current_setting('test.foyer')::uuid, 'Cible nulle', 0, '2026-10', '2027-09');
    raise exception 'pas d''erreur';
  exception when others then
    assert sqlstate = '23514', 'cible = 0 : attendu violation de contrainte, obtenu ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

select 'rls_et_rpc : OK' as resultat;
rollback;
