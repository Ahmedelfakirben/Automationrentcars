/**
 * ============================================================
 * Script para crear el usuario administrador en Supabase Auth
 * ============================================================
 * Ejecutar UNA SOLA VEZ:  node create_admin_user.js
 * ============================================================
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Service Role Key (admin)

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ============================================================
// Datos del usuario administrador
// ============================================================
const ADMIN_EMAIL    = 'sysadmin@2s1mrentcar.local';
const ADMIN_PASSWORD = 'Satec2016C@U';
const ADMIN_USERNAME = 'sysadmin';

console.log('');
console.log('🔐 2S1M Auto-Publisher — Creación de Usuario Admin');
console.log('====================================================');
console.log(`📧 Email interno : ${ADMIN_EMAIL}`);
console.log(`👤 Username      : ${ADMIN_USERNAME}`);
console.log(`🔑 Password      : ${'*'.repeat(ADMIN_PASSWORD.length)}`);
console.log('');

// Check if user already exists
const { data: existing, error: listError } = await supabase.auth.admin.listUsers();

if (listError) {
  console.error('❌ Error al conectar con Supabase Auth:', listError.message);
  console.error('   Asegúrate de que SUPABASE_KEY sea la Service Role Key (no la anon key).');
  process.exit(1);
}

const alreadyExists = existing?.users?.find(u => u.email === ADMIN_EMAIL);

if (alreadyExists) {
  console.log('⚠️  El usuario sysadmin ya existe en Supabase Auth.');
  console.log(`   ID: ${alreadyExists.id}`);
  console.log('');
  console.log('¿Quieres actualizar la contraseña? Ejecuta:');
  console.log('  node update_admin_password.js');
  process.exit(0);
}

// Create the user
const { data, error } = await supabase.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  email_confirm: true,           // Skip email verification
  user_metadata: {
    username: ADMIN_USERNAME,
    role: 'admin',
    display_name: 'System Administrator',
    created_by: 'create_admin_user.js'
  }
});

if (error) {
  console.error('❌ Error al crear el usuario:', error.message);
  process.exit(1);
}

console.log('✅ ¡Usuario administrador creado exitosamente!');
console.log('');
console.log('┌─────────────────────────────────────────────┐');
console.log('│  CREDENCIALES DE ACCESO                     │');
console.log('│                                             │');
console.log(`│  Usuario  : sysadmin                        │`);
console.log(`│  Password : Satec2016C@U                    │`);
console.log('│                                             │');
console.log('│  ⚠️  Guarda estas credenciales en un lugar  │');
console.log('│     seguro. No las compartas.               │');
console.log('└─────────────────────────────────────────────┘');
console.log('');
console.log(`📋 User ID en Supabase: ${data.user.id}`);
console.log('');
console.log('🚀 Ahora puedes acceder al panel en:');
console.log('   http://localhost:3000/login.html');
console.log('');
