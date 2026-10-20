-- Temps réel sur toutes les données partagées du foyer (spec §2 : « partagée en temps réel »).
alter publication supabase_realtime add table
  public.objectifs, public.categories, public.recurrentes, public.revenus_mois, public.mois_membres, public.membres;
