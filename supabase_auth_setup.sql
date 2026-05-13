-- ═══════════════════════════════════════════════════════════════
--  FitoFichas – Configuración de autenticación en Supabase
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Eliminar políticas anteriores (acceso anónimo)
DROP POLICY IF EXISTS "anon_all"      ON fichas;
DROP POLICY IF EXISTS "anon_all"      ON search_sets;
DROP POLICY IF EXISTS "allow_all"     ON fichas;
DROP POLICY IF EXISTS "allow_all"     ON search_sets;
DROP POLICY IF EXISTS "public_read"   ON fichas;
DROP POLICY IF EXISTS "public_write"  ON fichas;
DROP POLICY IF EXISTS "public_read"   ON search_sets;
DROP POLICY IF EXISTS "public_write"  ON search_sets;

-- 2. Nueva política: solo usuarios autenticados pueden operar fichas
CREATE POLICY "auth_fichas"
  ON fichas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Nueva política: solo usuarios autenticados pueden operar search_sets
CREATE POLICY "auth_sets"
  ON search_sets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Crear usuario admin
--    (en Supabase el username se mapea a email: admin → admin@fitofichas.local)
--    Ejecutá esto SOLO si el usuario aún no existe:
SELECT auth.create_user(
  '{"email": "admin@fitofichas.local", "password": "admin", "email_confirm": true}'::jsonb
);

-- ═══════════════════════════════════════════════════════════════
--  ALTERNATIVA para crear el usuario (si la función de arriba
--  no está disponible en tu plan):
--
--  Ir a: Supabase Dashboard → Authentication → Users
--  → "Add user" → "Create new user"
--  Email:    admin@fitofichas.local
--  Password: admin
--  ✅ marcar "Auto Confirm User"
-- ═══════════════════════════════════════════════════════════════
