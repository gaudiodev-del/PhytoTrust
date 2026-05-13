-- ═══════════════════════════════════════════════════════════════
--  FitoFichas – Equipos y favoritos compartidos
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Perfiles (registro automático de usuarios al hacer login)
CREATE TABLE IF NOT EXISTS perfiles (
  username   text PRIMARY KEY,
  creado_el  timestamptz DEFAULT now()
);
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_perfiles" ON perfiles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2. Equipos de trabajo
CREATE TABLE IF NOT EXISTS equipos (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  owner      text NOT NULL,
  miembros   text[] DEFAULT '{}',
  creado_el  timestamptz DEFAULT now()
);
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_equipos" ON equipos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. Artículos favoritos compartidos con equipos
CREATE TABLE IF NOT EXISTS favoritos_compartidos (
  id              text PRIMARY KEY,
  articulo_id     text NOT NULL,
  articulo        jsonb NOT NULL,
  compartido_por  text NOT NULL,
  equipo_id       text NOT NULL,
  compartido_el   timestamptz DEFAULT now()
);
ALTER TABLE favoritos_compartidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_fav_compartidos" ON favoritos_compartidos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Índice para evitar duplicados (mismo artículo al mismo equipo)
CREATE UNIQUE INDEX IF NOT EXISTS fav_comp_uq
  ON favoritos_compartidos (articulo_id, equipo_id);
