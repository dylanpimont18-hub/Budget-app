-- Schéma du budget familial : toutes les données sont rattachées à un foyer.

create table public.foyers (
  id uuid primary key default gen_random_uuid(),
  nom text,
  code_invitation text unique not null,
  cree_le timestamptz not null default now()
);

create table public.membres (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  user_id uuid unique not null references auth.users on delete cascade,
  prenom text not null,
  salaire_defaut numeric(10,2) not null default 0
);
create index membres_foyer_idx on public.membres (foyer_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  nom text not null,
  icone text,
  budget_defaut numeric(10,2) not null default 0 check (budget_defaut >= 0),
  ordre int not null default 0,
  active boolean not null default true
);
create index categories_foyer_idx on public.categories (foyer_id);

-- Modèle des charges fixes, recopié à l'ouverture de chaque mois
create table public.recurrentes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  libelle text not null,
  icone text,
  montant numeric(10,2) not null check (montant >= 0),
  ordre int not null default 0,
  active boolean not null default true
);
create index recurrentes_foyer_idx on public.recurrentes (foyer_id);

create table public.mois (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  cle text not null check (cle ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  cree_le timestamptz not null default now(),
  unique (foyer_id, cle)
);

create table public.mois_membres (
  foyer_id uuid not null references public.foyers on delete cascade,
  mois_id uuid not null references public.mois on delete cascade,
  membre_id uuid not null references public.membres on delete cascade,
  salaire numeric(10,2) not null default 0 check (salaire >= 0),
  solde numeric(10,2),
  primary key (mois_id, membre_id)
);
create index mois_membres_foyer_idx on public.mois_membres (foyer_id);
create index mois_membres_membre_idx on public.mois_membres (membre_id);

create table public.revenus_mois (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  mois_id uuid not null references public.mois on delete cascade,
  libelle text not null,
  montant numeric(10,2) not null default 0 check (montant >= 0)
);
create index revenus_mois_mois_idx on public.revenus_mois (mois_id);
create index revenus_mois_foyer_idx on public.revenus_mois (foyer_id);

create table public.recurrentes_mois (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  mois_id uuid not null references public.mois on delete cascade,
  recurrente_id uuid references public.recurrentes on delete set null,
  libelle text not null,
  icone text,
  montant numeric(10,2) not null check (montant >= 0),
  ordre int not null default 0
);
create index recurrentes_mois_mois_idx on public.recurrentes_mois (mois_id);
create index recurrentes_mois_foyer_idx on public.recurrentes_mois (foyer_id);
create index recurrentes_mois_recurrente_idx on public.recurrentes_mois (recurrente_id);

create table public.budgets_mois (
  foyer_id uuid not null references public.foyers on delete cascade,
  mois_id uuid not null references public.mois on delete cascade,
  categorie_id uuid not null references public.categories on delete cascade,
  montant numeric(10,2) not null default 0 check (montant >= 0),
  primary key (mois_id, categorie_id)
);
create index budgets_mois_foyer_idx on public.budgets_mois (foyer_id);
create index budgets_mois_categorie_idx on public.budgets_mois (categorie_id);

create table public.depenses (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  date date not null,
  montant numeric(10,2) not null check (montant > 0),
  categorie_id uuid not null references public.categories,
  membre_id uuid not null references public.membres,
  libelle text,
  cree_par uuid default auth.uid(),
  cree_le timestamptz not null default now()
);
create index depenses_foyer_date_idx on public.depenses (foyer_id, date);
create index depenses_categorie_idx on public.depenses (categorie_id);
create index depenses_membre_idx on public.depenses (membre_id);

create table public.objectifs (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  nom text not null,
  icone text,
  cible numeric(10,2) not null check (cible > 0),
  debut text not null check (debut ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fin text not null check (fin ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  archive boolean not null default false,
  cree_le timestamptz not null default now(),
  check (fin >= debut)
);
create index objectifs_foyer_idx on public.objectifs (foyer_id);

create table public.versements (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references public.foyers on delete cascade,
  objectif_id uuid not null references public.objectifs on delete cascade,
  mois_cle text not null check (mois_cle ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  montant numeric(10,2) not null check (montant <> 0),
  membre_id uuid references public.membres on delete set null,
  cree_le timestamptz not null default now()
);
create index versements_foyer_idx on public.versements (foyer_id);
create index versements_objectif_idx on public.versements (objectif_id);
create index versements_membre_idx on public.versements (membre_id);

alter publication supabase_realtime add table
  public.depenses, public.versements, public.mois, public.budgets_mois, public.recurrentes_mois;
