-- ==========================================
-- SUPABASE INITIALIZATION SCRIPT - 2S1M RENT CAR
-- ==========================================

-- ==========================================
-- PASO 1: Crear la tabla 'settings' si no existe
-- ==========================================
create table if not exists public.settings (
  id bigint primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS en la tabla settings si se desea, o mantenerla accesible mediante service_role
alter table public.settings enable row level security;

-- Política para que service_role tenga control total de settings
create policy "Acceso total para settings para service_role" on public.settings
  for all using (true) with check (true);

-- ==========================================
-- PASO 2: Crear el Bucket de Almacenamiento 'flota'
-- ==========================================

-- 1. Insertar el bucket 'flota' en la tabla de storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'flota', 
  'flota', 
  true, -- Público para lectura directa de las imágenes
  52428800, -- Límite de 50 MB en bytes (50 * 1024 * 1024)
  '{image/jpeg,image/png,image/webp,image/svg+xml}'::text[] -- Formatos de imágenes permitidos
)
on conflict (id) do nothing;

-- 2. Crear política para permitir la lectura pública de las imágenes en 'flota'
create policy "Permitir lectura pública de imágenes" on storage.objects
  for select
  using (bucket_id = 'flota');

-- 3. Crear política para permitir la gestión completa (inserción, actualización y borrado) 
-- a través de la clave service_role (usada por el backend)
create policy "Permitir gestión completa en flota al service_role" on storage.objects
  for all
  using (bucket_id = 'flota')
  with check (bucket_id = 'flota');
