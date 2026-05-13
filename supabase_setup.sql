-- ═══════════════════════════════════════════════════════════════════════════
-- FitoFichas — Setup Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tabla de fichas fitosanitarias
create table if not exists fichas (
  id            text        primary key,
  nombre_cientifico text    default '',
  nombre_vulgar text        default '',
  datos         jsonb       not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 2. Tabla de sets de búsqueda de artículos
create table if not exists search_sets (
  id        text        primary key,
  params    jsonb       not null,
  articulos jsonb       default '[]'::jsonb,
  estado    text        default 'ok',
  error_msg text,
  creado_el timestamptz default now()
);

-- 3. Trigger: actualizar updated_at en fichas
create or replace function _update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists fichas_updated_at on fichas;
create trigger fichas_updated_at
  before update on fichas
  for each row execute function _update_updated_at();

-- 4. Habilitar Row Level Security
alter table fichas      enable row level security;
alter table search_sets enable row level security;

-- 5. Políticas de acceso para clave anónima (app de uso personal)
drop policy if exists "anon_all" on fichas;
drop policy if exists "anon_all" on search_sets;

create policy "anon_all" on fichas
  for all to anon using (true) with check (true);

create policy "anon_all" on search_sets
  for all to anon using (true) with check (true);
