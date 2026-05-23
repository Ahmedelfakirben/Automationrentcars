import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = __dirname;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(WORKSPACE_DIR, 'public')));

// Ensure directories exist
const PUBLISHED_DIR = path.join(WORKSPACE_DIR, 'public', 'published');
try {
  await fs.mkdir(PUBLISHED_DIR, { recursive: true });
} catch (e) {
  console.error("Could not create published folder", e);
}

// Logo aspect ratio from viewBox "0 0 629.69 240.53"
const LOGO_ASPECT_RATIO = 629.69 / 240.53;

// Mapping folders to friendly car IDs
const CAR_CATALOG_SCHEMES = [
  {
    id: "seat_ibiza",
    name: "Seat Ibiza FR 2026",
    folder: "SEAT Ibiza FR automatic-20260522T210220Z-3-001/SEAT Ibiza FR automatic"
  },
  {
    id: "peugeot_208",
    name: "Peugeot 208 2026",
    folder: "Peugeot 208-20260522T210221Z-3-001/Peugeot 208"
  },
  {
    id: "renault_clio",
    name: "Renault Clio 5 2026",
    folder: "Renault Clio 5-20260522T210221Z-3-001/Renault Clio 5"
  },
  {
    id: "opel_corsa",
    name: "Opel Corsa 2026",
    folder: "Opel Corsa-20260522T210220Z-3-001/Opel Corsa"
  },
  {
    id: "commercial",
    name: "Campañas Comerciales",
    folder: "Commercial-20260516T122351Z-3-001/Commercial"
  },
  {
    id: "publicados",
    name: "Fotos Generadas e Historial",
    folder: "public/published"
  }
];

// Initialize Supabase Hybrid adapter
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const isSupabaseActive = !!supabaseUrl && !!supabaseKey && supabaseKey.trim() !== "";
let supabase = null;

if (isSupabaseActive) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log("=======================================================");
  console.log(" ☁️  Supabase CLOUD Mode is Active!");
  console.log("=======================================================");
} else {
  console.log("=======================================================");
  console.log(" 💾 Local Storage Mode is Active!");
  console.log("=======================================================");
}

// Memory Cache for favicon.svg logo to speed up operations and minimize API hits
let cachedLogoBuffer = null;
async function getLogoBuffer() {
  if (cachedLogoBuffer) return cachedLogoBuffer;

  if (isSupabaseActive) {
    try {
      console.log("[Supabase] Fetching favicon.svg logo into memory cache...");
      const { data, error } = await supabase.storage.from('flota').download('favicon.svg');
      if (error || !data) throw new Error(error?.message || "Storage error");
      const arrayBuffer = await data.arrayBuffer();
      cachedLogoBuffer = Buffer.from(arrayBuffer);
    } catch (err) {
      console.error("[Supabase] Failed to fetch favicon.svg from Storage. Falling back to local file.", err);
      // Fallback to local file if available
      const localLogoPath = path.join(WORKSPACE_DIR, 'favicon.svg');
      if (existsSync(localLogoPath)) {
        cachedLogoBuffer = await fs.readFile(localLogoPath);
      } else {
        throw new Error("favicon.svg is missing both on Supabase Storage ('flota' bucket) and local disk.");
      }
    }
  } else {
    const localLogoPath = path.join(WORKSPACE_DIR, 'favicon.svg');
    if (existsSync(localLogoPath)) {
      cachedLogoBuffer = await fs.readFile(localLogoPath);
    } else {
      throw new Error("favicon.svg logo file does not exist on local disk.");
    }
  }

  return cachedLogoBuffer;
}

// Helper to load config (Supports Supabase Table 'settings' JSONB)
async function getConfig() {
  if (isSupabaseActive) {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 1)
        .single();
        
      if (error || !data) {
        if (error?.code === 'PGRST116') {
          // Row does not exist yet, create default
          console.log("[Supabase] Creating default settings row (ID = 1)...");
          const defaultConfig = {
            watermark: { scale: 0.15, position: "bottom-right", opacity: 0.95, margin: 40 },
            scheduler: { enabled: true, slots: [] },
            calendar: { promotions: [], events: [] },
            publisherChannel: 'facebook',
            n8nWebhookUrl: '',
            bgReplacementEnabled: false,
            publishedPosts: [],
            usageStats: {
              groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              photoroom: { requests: 0, success: 0, failed: 0 },
              supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
              facebook: { attempts: 0, success: 0, failed: 0 },
              n8n: { attempts: 0, success: 0, failed: 0 }
            },
            usageAlertThresholds: {
              groqTokenLimit: 500000,
              photoroomRequestLimit: 100,
              supabaseStorageLimit: 200,
              emailAlertsEnabled: false,
              alertEmail: ''
            }
          };
          await supabase.from('settings').upsert({ id: 1, data: defaultConfig });
          return { ...defaultConfig, hasGroqKey: !!process.env.GROQ_API_KEY, hasFbKey: !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN, hasPhotoroomKey: !!process.env.PHOTOROOM_API_KEY };
        }
        throw new Error(error?.message || "Database select error");
      }
      
      const config = data.data;
      config.hasGroqKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== "";
      config.hasFbKey = !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ACCESS_TOKEN.trim() !== "";
      config.hasPhotoroomKey = !!process.env.PHOTOROOM_API_KEY && process.env.PHOTOROOM_API_KEY.trim() !== "";
      
      if (!config.publisherChannel) config.publisherChannel = 'facebook';
      if (!config.n8nWebhookUrl) config.n8nWebhookUrl = '';
      if (config.bgReplacementEnabled === undefined) config.bgReplacementEnabled = false;

      if (!config.usageStats) {
        config.usageStats = {
          groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          photoroom: { requests: 0, success: 0, failed: 0 },
          supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
          facebook: { attempts: 0, success: 0, failed: 0 },
          n8n: { attempts: 0, success: 0, failed: 0 }
        };
      }
      if (!config.usageAlertThresholds) {
        config.usageAlertThresholds = {
          groqTokenLimit: 500000,
          photoroomRequestLimit: 100,
          supabaseStorageLimit: 200,
          emailAlertsEnabled: false,
          alertEmail: ''
        };
      }

      await trackUsage('supabase', 'reads', 1);
      return config;
    } catch (err) {
      console.error("[Supabase] Config load error. Falling back to local configuration.", err);
    }
  }

  // Local Disk Fallback
  const configPath = path.join(WORKSPACE_DIR, 'config.json');
  try {
    const data = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(data);
    parsed.hasGroqKey = !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== "";
    parsed.hasFbKey = !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ACCESS_TOKEN.trim() !== "";
    parsed.hasPhotoroomKey = !!process.env.PHOTOROOM_API_KEY && process.env.PHOTOROOM_API_KEY.trim() !== "";
    if (!parsed.publisherChannel) parsed.publisherChannel = 'facebook';
    if (!parsed.n8nWebhookUrl) parsed.n8nWebhookUrl = '';
    if (parsed.bgReplacementEnabled === undefined) parsed.bgReplacementEnabled = false;
    
    if (!parsed.usageStats) {
      parsed.usageStats = {
        groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        photoroom: { requests: 0, success: 0, failed: 0 },
        supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
        facebook: { attempts: 0, success: 0, failed: 0 },
        n8n: { attempts: 0, success: 0, failed: 0 }
      };
    }
    if (!parsed.usageAlertThresholds) {
      parsed.usageAlertThresholds = {
        groqTokenLimit: 500000,
        photoroomRequestLimit: 100,
        supabaseStorageLimit: 200,
        emailAlertsEnabled: false,
        alertEmail: ''
      };
    }
    
    return parsed;
  } catch (err) {
    return {
      watermark: { scale: 0.15, position: "bottom-right", opacity: 0.95, margin: 40 },
      scheduler: { enabled: true, slots: [] },
      calendar: { promotions: [], events: [] },
      publisherChannel: 'facebook',
      n8nWebhookUrl: '',
      bgReplacementEnabled: false,
      publishedPosts: [],
      usageStats: {
        groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        photoroom: { requests: 0, success: 0, failed: 0 },
        supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
        facebook: { attempts: 0, success: 0, failed: 0 },
        n8n: { attempts: 0, success: 0, failed: 0 }
      },
      usageAlertThresholds: {
        groqTokenLimit: 500000,
        photoroomRequestLimit: 100,
        supabaseStorageLimit: 200,
        emailAlertsEnabled: false,
        alertEmail: ''
      }
    };
  }
}

// Helper to save config (Supports Supabase Database upsert)
async function saveConfig(config) {
  // Strip runtime properties before saving
  const cleanConfig = { ...config };
  delete cleanConfig.hasGroqKey;
  delete cleanConfig.hasFbKey;
  delete cleanConfig.hasPhotoroomKey;

  if (isSupabaseActive) {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ id: 1, data: cleanConfig });
      if (error) throw new Error(error.message);
      await trackUsage('supabase', 'writes', 1);
      return;
    } catch (err) {
      console.error("[Supabase] Failed to save config to cloud Postgres:", err);
    }
  }

  // Local save fallback
  const configPath = path.join(WORKSPACE_DIR, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(cleanConfig, null, 2), 'utf8');
}

// Re-entrancy guard to prevent infinite loops when logging DB/Storage usage
let isTracking = false;
async function trackUsage(category, metric, value = 1) {
  if (isTracking) return;
  isTracking = true;
  try {
    const config = await getConfig();
    if (!config.usageStats) {
      config.usageStats = {
        groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        photoroom: { requests: 0, success: 0, failed: 0 },
        supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
        facebook: { attempts: 0, success: 0, failed: 0 },
        n8n: { attempts: 0, success: 0, failed: 0 }
      };
    }

    if (category === 'groq') {
      config.usageStats.groq.requests += 1;
      config.usageStats.groq.promptTokens += (value.promptTokens || 0);
      config.usageStats.groq.completionTokens += (value.completionTokens || 0);
      config.usageStats.groq.totalTokens += (value.totalTokens || 0);
    } else if (category === 'photoroom') {
      config.usageStats.photoroom.requests += 1;
      if (value === 'success') config.usageStats.photoroom.success += 1;
      if (value === 'failed') config.usageStats.photoroom.failed += 1;
    } else if (category === 'supabase') {
      if (metric === 'reads') config.usageStats.supabase.reads += value;
      if (metric === 'writes') config.usageStats.supabase.writes += value;
      if (metric === 'storageDownloads') config.usageStats.supabase.storageDownloads += value;
      if (metric === 'storageUploads') config.usageStats.supabase.storageUploads += value;
    } else if (category === 'facebook') {
      config.usageStats.facebook.attempts += 1;
      if (value === 'success') config.usageStats.facebook.success += 1;
      if (value === 'failed') config.usageStats.facebook.failed += 1;
    } else if (category === 'n8n') {
      config.usageStats.n8n.attempts += 1;
      if (value === 'success') config.usageStats.n8n.success += 1;
      if (value === 'failed') config.usageStats.n8n.failed += 1;
    }

    await saveConfig(config);
  } catch (err) {
    console.error("Failed to update usage logs:", err);
  } finally {
    isTracking = false;
  }
}

// Helper to save environment variables dynamically
async function saveEnv(keys) {
  const envPath = path.join(WORKSPACE_DIR, '.env');
  let content = `PORT=${PORT}\n`;
  content += `GROQ_API_KEY=${keys.groqKey || ''}\n`;
  content += `FACEBOOK_PAGE_ACCESS_TOKEN=${keys.fbToken || ''}\n`;
  content += `FACEBOOK_PAGE_ID=${keys.fbPageId || '61589242743757'}\n`;
  content += `PHOTOROOM_API_KEY=${keys.photoroomKey || ''}\n`;
  content += `SUPABASE_URL=${supabaseUrl || ''}\n`;
  content += `SUPABASE_KEY=${keys.supabaseKey || supabaseKey || ''}\n`;
  
  await fs.writeFile(envPath, content, 'utf8');

  // Reload dynamically into node environment variables in-memory
  process.env.GROQ_API_KEY = keys.groqKey;
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = keys.fbToken;
  process.env.FACEBOOK_PAGE_ID = keys.fbPageId;
  process.env.PHOTOROOM_API_KEY = keys.photoroomKey;
  if (keys.supabaseKey) {
    process.env.SUPABASE_KEY = keys.supabaseKey;
  }
}

// Scan workspace directory OR Supabase Storage Bucket for car images
async function scanWorkspaceForCars() {
  if (isSupabaseActive) {
    try {
      console.log("[Supabase] Scanning bucket 'flota' for car assets...");
      const cars = [];
      for (const carDef of CAR_CATALOG_SCHEMES) {
        // List files in the folder named carDef.id
        const { data: files, error } = await supabase.storage
          .from('flota')
          .list(carDef.id, { limit: 100 });

        if (error) {
          console.error(`[Supabase] Error listing bucket for ${carDef.name}:`, error.message);
          continue;
        }

        const images = (files || [])
          .map(f => f.name)
          .filter(name => {
            const ext = path.extname(name).toLowerCase();
            return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
          });

        cars.push({
          id: carDef.id,
          name: carDef.name,
          folder: carDef.id, // folder is relative path inside the bucket
          images: images
        });
      }
      return cars;
    } catch (err) {
      console.error("[Supabase] Storage scan failed. Falling back to local directories.", err);
    }
  }

  // Local scan fallback
  const cars = [];
  for (const carDef of CAR_CATALOG_SCHEMES) {
    const fullFolderPath = path.join(WORKSPACE_DIR, carDef.folder);
    if (existsSync(fullFolderPath)) {
      try {
        const files = await fs.readdir(fullFolderPath);
        const images = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
        });
        cars.push({
          id: carDef.id,
          name: carDef.name,
          folder: carDef.folder,
          images: images
        });
      } catch (err) {
        console.error(`Error reading directory for ${carDef.name}:`, err);
      }
    }
  }
  return cars;
}

// Refactored Watermarker to receive directly an image buffer (using cached logo SVG)
async function applyWatermarkToBuffer(imageBuffer, settings) {
  const logoBuffer = await getLogoBuffer();

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const imgWidth = metadata.width;
  const imgHeight = metadata.height;

  // Calculate watermark size
  const scale = settings.scale || 0.15;
  const margin = settings.margin || 40;
  const opacity = settings.opacity || 0.95;
  const position = settings.position || 'bottom-right';

  const wmWidth = Math.round(imgWidth * scale);
  const wmHeight = Math.round(wmWidth / LOGO_ASPECT_RATIO);

  // Wrap SVG logo with custom opacity and xlink namespace
  const wrappedSvg = `<svg width="${wmWidth}" height="${wmHeight}" viewBox="0 0 629.69 240.53" opacity="${opacity}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    ${logoBuffer.toString('utf8').replace(/<\?xml.*?\?>/i, '').replace(/<svg.*?>/i, '').replace(/<\/svg>/i, '')}
  </svg>`;

  const watermarkBuffer = Buffer.from(wrappedSvg);

  // Calculate coordinates
  let left = 0;
  let top = 0;

  switch (position) {
    case 'top-left':
      left = margin;
      top = margin;
      break;
    case 'top-right':
      left = imgWidth - wmWidth - margin;
      top = margin;
      break;
    case 'bottom-left':
      left = margin;
      top = imgHeight - wmHeight - margin;
      break;
    case 'bottom-right':
    default:
      left = imgWidth - wmWidth - margin;
      top = imgHeight - wmHeight - margin;
      break;
  }

  // Ensure watermark fits within image dimensions
  left = Math.max(0, Math.min(left, imgWidth - wmWidth));
  top = Math.max(0, Math.min(top, imgHeight - wmHeight));

  // Perform compositing and return buffer
  return await image
    .composite([{ input: watermarkBuffer, left, top }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Retrieve watermarked image buffer (Supports Supabase Storage bucket download)
async function getWatermarkedImageBuffer(carId, imageName, settings) {
  let rawImageBuffer;

  if (isSupabaseActive) {
    try {
      console.log(`[Supabase] Downloading image: ${carId}/${imageName}...`);
      const { data, error } = await supabase.storage
        .from('flota')
        .download(`${carId}/${imageName}`);
      if (error || !data) throw new Error(error?.message || "Download error");
      const arrayBuffer = await data.arrayBuffer();
      rawImageBuffer = Buffer.from(arrayBuffer);
    } catch (err) {
      console.error(`[Supabase] Failed to download image from storage bucket. Falling back to local disk.`, err);
    }
  }

  // Local fallback if supabase failed or not active
  if (!rawImageBuffer) {
    const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === carId);
    if (!carDef) throw new Error("Car not found in catalog definition");
    const imagePath = path.join(WORKSPACE_DIR, carDef.folder, imageName);
    if (!existsSync(imagePath)) throw new Error("Image file does not exist locally");
    rawImageBuffer = await fs.readFile(imagePath);
  }

  return await applyWatermarkToBuffer(rawImageBuffer, settings);
}

// Photoroom API Background Replacement Integration
async function replaceBackground(imageBuffer, imageName, prompt) {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("PHOTOROOM_API_KEY is not defined in .env. Please configure it in the Settings panel.");
  }

  console.log(`[Photoroom] Calling background replacement with prompt: "${prompt}"...`);

  // Create multipart/form-data payload natively
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2, 16);
  const parts = [];

  // Prompt parameter
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="background.prompt"\r\n\r\n${prompt}\r\n`
  );

  // File parameter
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="imageFile"; filename="${imageName}"\r\nContent-Type: image/jpeg\r\n\r\n`
  );

  const headerBuffer = Buffer.from(parts.join(''));
  const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payloadBuffer = Buffer.concat([headerBuffer, imageBuffer, footerBuffer]);

  try {
    const response = await fetch("https://image-api.photoroom.com/v2/edit", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: payloadBuffer
    });

    if (!response.ok) {
      const errText = await response.text();
      await trackUsage('photoroom', null, 'failed');
      throw new Error(`Photoroom API Error: ${response.status} - ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[Photoroom] Background replaced successfully! Size: ${arrayBuffer.byteLength} bytes.`);
    await trackUsage('photoroom', null, 'success');
    return Buffer.from(arrayBuffer);
  } catch (err) {
    await trackUsage('photoroom', null, 'failed');
    console.error("Photoroom Background Replacement failed:", err);
    throw err;
  }
}

// Generate Copy using Groq (Upgraded to return background_prompt!)
async function generatePostCopy(themeId, carName, config) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in the environment. Please set it in the Settings panel.");
  }

  const promotionsText = config.calendar.promotions.join(', ') || 'Sin promociones activas';
  const eventsText = config.calendar.events.join(', ') || 'Sin eventos festivos especiales';

  let systemPrompt = `Eres el Community Manager experto de "2S1M Rent Car", una empresa premium de alquiler de vehículos en Tetuán y Tánger, Marruecos.
Tu objetivo es crear contenido altamente atractivo para redes sociales que genere reservas.

CONTEXTO DEL NEGOCIO:
- Ubicaciones principales: Aeropuertos de Tánger (Ibn Battouta) y Tetuán (Sania Ramel), Marruecos.
- Público objetivo: Turistas europeos y Marroquíes Residentes en el Extranjero (MRE) que buscan un servicio sin sorpresas, coches nuevos y un trato VIP.
- Flota actual: Modelos nuevos del año 2026 (Seat Ibiza FR, Peugeot 208, Renault Clio 5, Opel Corsa).
- Tono: Profesional, confiable, directo, lujoso y dinámico.

REGLAS DE CONTENIDO:
1. IDIOMA: Todo el contenido debe ser estrictamente bilingüe (Francés primero, Español después).
2. CALL TO ACTION (CTA): Siempre debes invitar a reservar vía WhatsApp o visitando rentcartetouan.ma.
3. EMOJIS: Usa emojis adecuados pero sin saturar (máximo 4-5 por texto total). Emojis seguros: ⭐, 🚗, 📍, 📞, ✅, 🌐.
4. FORMATO DE SALIDA: Debes responder ÚNICAMENTE con un objeto JSON válido. No incluyas explicaciones ni etiquetas markdown de código en la respuesta. Solo devuelve el JSON crudo.

ESTRUCTURA DEL JSON REQUERIDA:
{
  "post_text": "Texto largo bilingüe para el feed de Facebook/Instagram. Incluye el CTA al final con número de contacto y web.",
  "hashtags": "Lista de 8 a 10 hashtags estratégicos separados por espacio",
  "story_text": "Texto muy corto e impactante (máx 10 palabras por idioma) para superponer en un video o imagen vertical.",
  "story_sticker_cta": "Texto ultracorto (máx 4 palabras) para el botón del enlace de la historia.",
  "background_prompt": "Un prompt fotográfico detallado en INGLÉS para generar el fondo de recambio del coche en Photoroom. Debe situar el coche en un entorno espectacular de Marruecos (ej: 'Parked at Marina Bay Tangier during sunset, cinematic warm lighting, high-end professional automotive photography, 8k'). Evita mencionar logos y personas."
}

INFORMACIÓN DEL COCHE A PUBLICAR:
Vehículo seleccionado: ${carName}
`;

  // Specific Theme instructions
  if (themeId === 1) {
    systemPrompt += `
TEMA DE HOY: SERVICIO EN AEROPUERTOS Y ENTREGA EN TODO MARRUECOS
Instrucciones específicas:
- Enfócate en la comodidad absoluta de bajarse del avión en el Aeropuerto de Tánger o Tetuán y tener el coche listo esperándote.
- Menciona que no hay colas, ni esperas, ni oficinas escondidas. Entrega directa en mano.
- También resalta la entrega personalizada en cualquier lugar de Marruecos (Hoteles, Villas, Tangier, Tetouan, M'diq, etc.).
- Hazlo sonar como un servicio VIP extremadamente profesional.
- El "background_prompt" debe describir el coche aparcado frente a la terminal del Aeropuerto de Tánger o el Aeropuerto de Tetuán con iluminación limpia y profesional.
`;
  } else if (themeId === 2) {
    systemPrompt += `
TEMA DE HOY: FLOTA, PROMOCIONES Y EVENTOS CALENDARIO
Instrucciones específicas:
- Destaca el coche seleccionado (${carName}) como la opción perfecta para el verano o eventos especiales en la zona.
- Incorpora o menciona de manera atractiva las siguientes Promociones Activas: [${promotionsText}].
- Incorpora y cita la relevancia con respecto a los siguientes Eventos/Fechas Clave del calendario: [${eventsText}] (especialmente el verano, el regreso de los MRE, vacaciones).
- Crea una urgencia para reservar antes de que se agote la flota de este año 2026.
- El "background_prompt" debe situar el coche en una pintoresca carretera costera de M'diq o Cabo Negro con palmeras, sol y cielo azul veraniego.
`;
  } else if (themeId === 3) {
    systemPrompt += `
TEMA DE HOY: HISTORIA NARRATIVA, CONSEJOS Y SOLUCIONES DE CONFIANZA
Instrucciones específicas:
- Empieza con una pequeña historia o situación empática común que un viajero vive en Marruecos (ejemplo: 'Imagina llegar cansado de tu vuelo a Tánger y descubrir que la rentacar barata tiene cargos ocultos de 500€ o que el coche no es el que reservaste...').
- Ofrece 2-3 consejos rápidos e indispensables sobre el alquiler de coches en Marruecos.
- Explica cómo 2S1M soluciona todos estos problemas (transparencia total, sin depósitos abusivos ocultos, coches nuevos 2026 100% garantizados, asistencia en carretera 24/7).
- Genera confianza absoluta y cercanía.
- El "background_prompt" debe situar el coche en una preciosa calle limpia de Tetuán o un mirador con vistas a la cordillera del Rif, transmitiendo paz, seguridad y aventura.
`;
  }

  const requestBody = {
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Genera el post perfecto en JSON para promocionar el coche: ${carName}. Recuerda respetar estrictamente los idiomas (Francés arriba, Español abajo) y la firma de contacto inamovible:
📍 RUE 14 AV MOHAMED BENOUNA, QUARTIER BOUJARAH, TÉTOUAN
📞 06 60 29 28 21 / 05 31 33 32 93
✅ WhatsApp: +212 6 60 29 28 21
🌐 rentcartetouan.ma | 2s1mrentcar.com
`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.85
  };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    if (result.usage) {
      await trackUsage('groq', null, {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens
      });
    }
    const rawContent = result.choices[0].message.content.trim();
    return JSON.parse(rawContent);
  } catch (err) {
    console.error("Groq Copy Generation Error:", err);
    throw err;
  }
}

// Generate Stories Package (5 stories)
async function generateStoriesPackage(carName, config) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in the environment.");
  }

  const systemPrompt = `Eres el Director de Marketing Creativo de "2S1M Rent Car". Tu objetivo es crear un paquete de 5 stories cortas e impactantes de alta conversión para Instagram/Facebook.
Cada story debe motivar a reservar de inmediato a través de WhatsApp o la web.

NORMAS DE LAS STORIES:
- Idiomas: Bilingües (Francés primero, Español después).
- Cortas: Máximo 8-10 palabras en total por idioma, pensadas para leerse en 3 segundos en una pantalla de móvil.
- Atractivas, enérgicas y Premium.
- Emojis: 1 o 2 emojis por story.
- Formato de Salida: Devuelve ÚNICAMENTE un objeto JSON válido con un array de 5 objetos de stories. No añadas introducciones, ni comentarios, ni bloques de código.

ESTRUCTURA DEL JSON REQUERIDA:
{
  "stories": [
    {
      "id": 1,
      "text": "[Texto Francés] \\n [Texto Español]",
      "sticker_cta": "Reserva / WhatsApp (máx 3 palabras)"
    },
    ...
  ]
}

VEHÍCULO A DESTACAR: ${carName}
`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.85
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API Error: ${response.status}`);
    }

    const result = await response.json();
    if (result.usage) {
      await trackUsage('groq', null, {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens
      });
    }
    return JSON.parse(result.choices[0].message.content.trim());
  } catch (err) {
    console.error("Groq Stories Generation Error:", err);
    throw err;
  }
}

// Publish to Facebook Graph API
async function publishToFacebook(imageBuffer, caption) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken || accessToken.trim() === "") {
    console.warn("Facebook credentials missing. Operating in SIMULATION Mode.");
    return {
      simulated: true,
      postId: "sim_" + Math.random().toString(36).substr(2, 9),
      url: "https://www.facebook.com/2s1mrentcar/posts/simulation"
    };
  }

  // Create multipart/form-data payload natively
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2, 16);
  const parts = [];

  // Append access token
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${accessToken}\r\n`
  );

  // Append caption
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
  );

  // Append binary image file
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="post_image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  );

  const headerBuffer = Buffer.from(parts.join(''));
  const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payloadBuffer = Buffer.concat([headerBuffer, imageBuffer, footerBuffer]);

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: payloadBuffer
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      await trackUsage('facebook', null, 'failed');
      throw new Error(result.error ? result.error.message : "Failed to upload photo to Facebook");
    }

    await trackUsage('facebook', null, 'success');
    return {
      simulated: false,
      postId: result.id || result.post_id,
      url: `https://www.facebook.com/${pageId}/posts/${result.id || result.post_id}`
    };
  } catch (err) {
    await trackUsage('facebook', null, 'failed');
    console.error("Facebook Publishing Error:", err);
    throw err;
  }
}

// Publish to N8N Webhook (Dynamic Multipart Payload)
async function publishToN8N(imageBuffer, imageName, caption, config) {
  const webhookUrl = config.n8nWebhookUrl;

  if (!webhookUrl || webhookUrl.trim() === "") {
    console.warn("N8N Webhook URL missing. Operating in SIMULATION Mode.");
    return {
      simulated: true,
      postId: "sim_n8n_" + Math.random().toString(36).substr(2, 9),
      url: "https://n8n.io/webhook/simulation"
    };
  }

  // Create multipart/form-data payload natively
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2, 16);
  const parts = [];

  // Append caption text
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
  );

  // Append binary image file
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${imageName}"\r\nContent-Type: image/jpeg\r\n\r\n`
  );

  const headerBuffer = Buffer.from(parts.join(''));
  const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payloadBuffer = Buffer.concat([headerBuffer, imageBuffer, footerBuffer]);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: payloadBuffer
    });

    if (!response.ok) {
      await trackUsage('n8n', null, 'failed');
      throw new Error(`N8N Webhook returned status ${response.status}`);
    }

    const resultText = await response.text();
    console.log("[N8N Webhook Response]:", resultText);

    await trackUsage('n8n', null, 'success');
    return {
      simulated: false,
      postId: "n8n_post_" + Date.now(),
      url: webhookUrl
    };
  } catch (err) {
    console.error("N8N Webhook Publishing Error:", err);
    throw err;
  }
}

// -------------------------------------------------------------
// AUTH MIDDLEWARE
// -------------------------------------------------------------

// Public route: provides Supabase public (anon) config to the frontend login page
// The anon key is safe to expose — it has no admin privileges
app.get('/api/auth-config', (req, res) => {
  res.json({
    url: process.env.SUPABASE_URL || '',
    // Supabase ANON key: derived from the service key project but scoped to public access
    // For production security, set SUPABASE_ANON_KEY separately in your environment
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || ''
  });
});

// Auth verification middleware — validates Supabase JWT tokens
const verifyAuth = async (req, res, next) => {
  // If Supabase is not configured, skip auth (local dev mode)
  if (!isSupabaseActive) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado. Por favor, inicia sesión.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth] Token verification error:', err.message);
    return res.status(401).json({ error: 'Error de autenticación.' });
  }
};

// Apply auth middleware to all protected API routes
app.use('/api/', (req, res, next) => {
  // Public routes — no auth required:
  // - /auth-config  : login page needs Supabase config
  // - /preview (GET): <img> tags can't send Bearer headers
  // - /cars (GET)   : catalog listing used by img src
  const publicPaths = ['/auth-config', '/cars', '/preview'];
  if (publicPaths.includes(req.path)) return next();
  if (req.path.startsWith('/preview')) return next(); // with query strings
  return verifyAuth(req, res, next);
});

// Logout endpoint (server-side session cleanup if needed)
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Sesión cerrada correctamente.' });
});

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// Get all cars and images
app.get('/api/cars', async (req, res) => {
  try {
    const cars = await scanWorkspaceForCars();
    res.json(cars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Render watermarked image preview
app.get('/api/preview', async (req, res) => {
  const { carId, imageName, position, scale, opacity, margin } = req.query;

  if (!carId || !imageName) {
    return res.status(400).send("carId and imageName parameters are required");
  }

  try {
    const settings = {
      scale: scale ? parseFloat(scale) : 0.15,
      position: position || 'bottom-right',
      opacity: opacity ? parseFloat(opacity) : 0.95,
      margin: margin ? parseInt(margin) : 40
    };

    const imageBuffer = await getWatermarkedImageBuffer(carId, imageName, settings);
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(imageBuffer);
  } catch (err) {
    res.status(500).send(`Error generating preview: ${err.message}`);
  }
});

// Generate copy for a specific theme and car
app.post('/api/generate', async (req, res) => {
  const { themeId, carId } = req.body;
  if (!themeId || !carId) {
    return res.status(400).json({ error: "themeId and carId are required" });
  }

  try {
    const config = await getConfig();
    const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === carId);
    const carName = carDef ? carDef.name : "Nuestra Flota Premium";

    const generatedData = await generatePostCopy(parseInt(themeId), carName, config);
    res.json(generatedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate 5 Stories Package
app.post('/api/generate-stories', async (req, res) => {
  const { carId } = req.body;
  if (!carId) {
    return res.status(400).json({ error: "carId is required" });
  }

  try {
    const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === carId);
    const carName = carDef ? carDef.name : "Nuestra Flota Premium";

    const storiesData = await generateStoriesPackage(carName);
    res.json(storiesData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate Calendar Promotions and Local Events using Groq AI
app.post('/api/generate-calendar', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "GROQ_API_KEY is not defined in the environment." });
  }

  const systemPrompt = `Eres el Director de Marketing Creativo de "2S1M Rent Car", una empresa premium de alquiler de coches en Tánger y Tetuán, Marruecos.
Tu objetivo es generar ideas de promociones comerciales sumamente atractivas y detectar eventos festivos, locales o temporadas de turismo relevantes para Marruecos (especialmente la zona del norte: Tánger, Tetuán, aeropuertos y el turismo de verano o de residentes MRE - Marroquíes Residentes en el Extranjero).

Genera exactamente:
- De 3 a 5 promociones activas de alta conversión escritas de forma atractiva en español.
- De 3 a 5 eventos locales, días festivos o temporadas turísticas de alta afluencia en español.

Formato de Salida: Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "promotions": [
    "10% de descuento en reservas de más de 7 días",
    "Kilometraje ilimitado gratis en alquileres de verano",
    "Entrega gratuita en el Aeropuerto de Tánger-Ibn Battouta para reservas premium"
  ],
  "events": [
    "Temporada Alta de Verano 2026",
    "Vacaciones de Marroquíes Residentes en el Extranjero (MRE)",
    "Turismo de Fin de Semana en Tánger y Tetuán"
  ]
}

No añadas explicaciones, ni introducciones, ni bloques de código adicionales. Devuelve el JSON puro.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.85
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API Error: ${response.status}`);
    }

    const result = await response.json();
    if (result.usage) {
      await trackUsage('groq', null, {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens
      });
    }
    const rawContent = result.choices[0].message.content.trim();
    res.json(JSON.parse(rawContent));
  } catch (err) {
    console.error("Groq Calendar Generation Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Reset Usage Statistics
app.post('/api/usage/reset', async (req, res) => {
  try {
    const config = await getConfig();
    config.usageStats = {
      groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      photoroom: { requests: 0, success: 0, failed: 0 },
      supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
      facebook: { attempts: 0, success: 0, failed: 0 },
      n8n: { attempts: 0, success: 0, failed: 0 }
    };
    await saveConfig(config);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Generate and preview AI background replaced image
app.post('/api/preview-ai', async (req, res) => {
  const { carId, imageName, prompt, watermarkSettings } = req.body;

  if (!carId || !imageName || !prompt) {
    return res.status(400).json({ error: "carId, imageName, and prompt are required" });
  }

  try {
    const config = await getConfig();
    const settings = watermarkSettings || config.watermark;

    // 1. Get original image buffer
    let activeImageBuffer = null;
    if (isSupabaseActive) {
      try {
        console.log(`[Preview AI - Supabase] Downloading image: ${carId}/${imageName}...`);
        const { data, error } = await supabase.storage
          .from('flota')
          .download(`${carId}/${imageName}`);
        if (error || !data) throw new Error(error?.message || "Download error");
        const arrayBuffer = await data.arrayBuffer();
        activeImageBuffer = Buffer.from(arrayBuffer);
      } catch (err) {
        console.error(`[Preview AI - Supabase] Download failed. Falling back to local.`, err);
      }
    }

    if (!activeImageBuffer) {
      const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === carId);
      if (!carDef) throw new Error("Car not found in catalog");
      const originalImagePath = path.join(WORKSPACE_DIR, carDef.folder, imageName);
      if (!existsSync(originalImagePath)) throw new Error("Original image file not found");
      activeImageBuffer = await fs.readFile(originalImagePath);
    }

    // 2. Call Photoroom v2/edit API
    console.log(`[Preview AI] Running Photoroom bg replacement for preview...`);
    const aiImageBuffer = await replaceBackground(activeImageBuffer, imageName, prompt);

    // 3. Composite watermark
    const watermarkedImageBuffer = await applyWatermarkToBuffer(aiImageBuffer, settings);

    // 4. Save to public/published as a temp or preview file
    const outputFilename = `ai_${Date.now()}_${imageName}`;
    const outputPath = path.join(PUBLISHED_DIR, outputFilename);
    await fs.writeFile(outputPath, watermarkedImageBuffer);

    // 5. Upload to Supabase Storage in 'publicados/' bucket so it appears in catalog!
    let publicImageUrl = `/published/${outputFilename}`;
    if (isSupabaseActive) {
      try {
        console.log(`[Supabase] Uploading AI preview image: publicados/${outputFilename}...`);
        const { error } = await supabase.storage
          .from('flota')
          .upload(`publicados/${outputFilename}`, watermarkedImageBuffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (!error) {
          const { data } = supabase.storage.from('flota').getPublicUrl(`publicados/${outputFilename}`);
          publicImageUrl = data.publicUrl;
          await trackUsage('supabase', 'storageUploads', 1);
        }
      } catch (err) {
        console.error("[Supabase] Failed to upload AI preview to storage:", err);
      }
    }

    res.json({
      success: true,
      imageUrl: publicImageUrl,
      imageName: outputFilename
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Publish manual post (Sends to Facebook OR N8N depending on config, supports Photoroom AI Background Replacement!)
app.post('/api/publish', async (req, res) => {
  const { carId, imageName, postText, hashtags, backgroundPrompt, watermarkSettings, alreadyGeneratedImageUrl, alreadyGeneratedImageName } = req.body;

  if (!carId || !imageName || !postText) {
    return res.status(400).json({ error: "carId, imageName, and postText are required" });
  }

  try {
    const config = await getConfig();
    const settings = watermarkSettings || config.watermark;

    let watermarkedImageBuffer = null;
    let publicImageUrl = null;
    let outputFilename = null;

    if (alreadyGeneratedImageUrl && alreadyGeneratedImageName) {
      console.log(`[Publish] Reusing already generated AI image: ${alreadyGeneratedImageName}`);
      outputFilename = alreadyGeneratedImageName;
      publicImageUrl = alreadyGeneratedImageUrl;

      const localPath = path.join(PUBLISHED_DIR, alreadyGeneratedImageName);
      if (existsSync(localPath)) {
        watermarkedImageBuffer = await fs.readFile(localPath);
      } else {
        if (isSupabaseActive) {
          try {
            const { data, error } = await supabase.storage
              .from('flota')
              .download(`publicados/${alreadyGeneratedImageName}`);
            if (!error && data) {
              const arrayBuffer = await data.arrayBuffer();
              watermarkedImageBuffer = Buffer.from(arrayBuffer);
            }
          } catch (se) {
            console.error("[Publish] Failed to download reused image from Supabase storage:", se);
          }
        }
      }
    }

    if (!watermarkedImageBuffer) {
      // 1. Get original image from disk OR Supabase
      let activeImageBuffer = null;

      if (isSupabaseActive) {
        try {
          console.log(`[Publish - Supabase] Downloading image: ${carId}/${imageName}...`);
          const { data, error } = await supabase.storage
            .from('flota')
            .download(`${carId}/${imageName}`);
          if (error || !data) throw new Error(error?.message || "Download error");
          const arrayBuffer = await data.arrayBuffer();
          activeImageBuffer = Buffer.from(arrayBuffer);
        } catch (err) {
          console.error(`[Publish - Supabase] Download failed. Falling back to local disk.`, err);
        }
      }

      // Local fallback if cloud failed or not active
      if (!activeImageBuffer) {
        const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === carId);
        if (!carDef) throw new Error("Car not found in catalog");
        const originalImagePath = path.join(WORKSPACE_DIR, carDef.folder, imageName);
        if (!existsSync(originalImagePath)) throw new Error("Original image file not found");
        activeImageBuffer = await fs.readFile(originalImagePath);
      }

      // 2. Apply Photoroom Background Replacement if active
      if (config.bgReplacementEnabled && backgroundPrompt && backgroundPrompt.trim() !== "" && process.env.PHOTOROOM_API_KEY) {
        try {
          activeImageBuffer = await replaceBackground(activeImageBuffer, imageName, backgroundPrompt);
        } catch (pe) {
          console.error("[Publish] Photoroom background replacement failed. Falling back to original car photo.", pe);
        }
      }

      // 3. Apply Watermark overlay on the active buffer
      watermarkedImageBuffer = await applyWatermarkToBuffer(activeImageBuffer, settings);

      // 4. Save watermarked image to public/published (local cache) FIRST
      outputFilename = `published_${Date.now()}_${imageName}`;
      const outputPath = path.join(PUBLISHED_DIR, outputFilename);
      await fs.writeFile(outputPath, watermarkedImageBuffer);

      // 5. Upload to Supabase Storage under 'publicados/' if active
      publicImageUrl = `/published/${outputFilename}`;
      if (isSupabaseActive) {
        try {
          console.log(`[Supabase] Uploading watermarked image to registrados: publicados/${outputFilename}...`);
          const { error } = await supabase.storage
            .from('flota')
            .upload(`publicados/${outputFilename}`, watermarkedImageBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (!error) {
            const { data } = supabase.storage.from('flota').getPublicUrl(`publicados/${outputFilename}`);
            publicImageUrl = data.publicUrl;
            await trackUsage('supabase', 'storageUploads', 1);
          }
        } catch (err) {
          console.error("[Supabase] Failed to upload published image to storage cloud:", err);
        }
      }
    }

    // 6. Publish based on Channel inside a try/catch
    const caption = `${postText}\n\n${hashtags || ""}`;
    let pubResult;
    let deliveryError = null;

    try {
      if (config.publisherChannel === 'n8n') {
        console.log("[Publish] Directing post to N8N Webhook...");
        pubResult = await publishToN8N(watermarkedImageBuffer, imageName, caption, config);
      } else {
        console.log("[Publish] Directing post to Facebook...");
        pubResult = await publishToFacebook(watermarkedImageBuffer, caption);
      }
    } catch (pe) {
      console.error("[Publish] Webhook/Facebook delivery failed:", pe.message);
      deliveryError = pe.message;
      // Fallback pubResult in case of delivery failure so history entry remains
      pubResult = {
        simulated: true,
        postId: `fail_${Date.now()}`,
        url: config.publisherChannel === 'n8n' ? (config.n8nWebhookUrl || "https://n8n.io/simulation") : "https://www.facebook.com/2s1mrentcar/posts/simulation"
      };
    }

    // 7. Log to history
    const logEntry = {
      id: pubResult.postId,
      timestamp: new Date().toISOString(),
      carId,
      imageName,
      caption,
      imageUrl: publicImageUrl,
      facebookUrl: pubResult.url,
      simulated: pubResult.simulated,
      channel: config.publisherChannel,
      bgReplaced: config.bgReplacementEnabled && !!process.env.PHOTOROOM_API_KEY,
      deliveryFailed: !!deliveryError,
      deliveryError: deliveryError || null
    };

    config.publishedPosts.unshift(logEntry);
    await saveConfig(config);

    res.json({ 
      success: true, 
      post: logEntry,
      warning: deliveryError ? `La foto se ha generado y guardado correctamente en Supabase, pero el envío a N8N falló: ${deliveryError}` : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Config Settings
app.get('/api/config', async (req, res) => {
  try {
    const config = await getConfig();
    config.apiKeys = {
      groqKey: process.env.GROQ_API_KEY || '',
      fbToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
      fbPageId: process.env.FACEBOOK_PAGE_ID || '61589242743757',
      photoroomKey: process.env.PHOTOROOM_API_KEY || '',
      supabaseKey: process.env.SUPABASE_KEY || ''
    };
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Config Settings (Saves config and dynamically updates .env keys!)
app.post('/api/config', async (req, res) => {
  try {
    const newSettings = req.body;
    const currentConfig = await getConfig();

    // 1. If keys are provided, write to .env
    if (newSettings.apiKeys) {
      await saveEnv(newSettings.apiKeys);
    }

    // 2. Merge config settings
    const updatedConfig = {
      ...currentConfig,
      watermark: newSettings.watermark || currentConfig.watermark,
      scheduler: newSettings.scheduler || currentConfig.scheduler,
      calendar: newSettings.calendar || currentConfig.calendar,
      publisherChannel: newSettings.publisherChannel || currentConfig.publisherChannel,
      n8nWebhookUrl: newSettings.n8nWebhookUrl !== undefined ? newSettings.n8nWebhookUrl : currentConfig.n8nWebhookUrl,
      bgReplacementEnabled: newSettings.bgReplacementEnabled !== undefined ? newSettings.bgReplacementEnabled : currentConfig.bgReplacementEnabled,
      usageAlertThresholds: newSettings.usageAlertThresholds || currentConfig.usageAlertThresholds
    };

    await saveConfig(updatedConfig);
    res.json({ success: true, config: updatedConfig });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// BACKGROUND SCHEDULER (Multi-slot cron)
// -------------------------------------------------------------
cron.schedule('* * * * *', async () => {
  const config = await getConfig();
  if (!config.scheduler || !config.scheduler.enabled) return;

  const now = new Date();
  const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Check if any active slot matches the current time
  const matchingSlot = config.scheduler.slots.find(slot => slot.enabled && slot.time === currentHourMin);

  if (matchingSlot) {
    console.log(`[Scheduler] Match found for slot ${matchingSlot.id} at ${currentHourMin}. Theme: ${matchingSlot.theme}`);
    try {
      // 1. Scan and pick a random car and random image
      const cars = await scanWorkspaceForCars();
      const validCars = cars.filter(c => c.images && c.images.length > 0);
      if (validCars.length === 0) {
        console.warn("[Scheduler] No cars or images found in workspace to publish!");
        return;
      }

      const randomCar = validCars[Math.floor(Math.random() * validCars.length)];
      const randomImageName = randomCar.images[Math.floor(Math.random() * randomCar.images.length)];

      console.log(`[Scheduler] Selected car: ${randomCar.name}, Image: ${randomImageName}`);

      // 2. Generate Copy
      const copyData = await generatePostCopy(matchingSlot.theme, randomCar.name, config);
      const caption = `${copyData.post_text}\n\n${copyData.hashtags}`;

      // 3. Load original car photo buffer (Supports Supabase Storage bucket download)
      let activeImageBuffer = null;

      if (isSupabaseActive) {
        try {
          console.log(`[Scheduler - Supabase] Downloading image: ${randomCar.id}/${randomImageName}...`);
          const { data, error } = await supabase.storage
            .from('flota')
            .download(`${randomCar.id}/${randomImageName}`);
          if (error || !data) throw new Error(error?.message || "Download error");
          const arrayBuffer = await data.arrayBuffer();
          activeImageBuffer = Buffer.from(arrayBuffer);
        } catch (err) {
          console.error(`[Scheduler - Supabase] Download failed. Falling back to local disk.`, err);
        }
      }

      // Local fallback if cloud failed or not active
      if (!activeImageBuffer) {
        const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === randomCar.id);
        const originalImagePath = path.join(WORKSPACE_DIR, carDef.folder, randomImageName);
        activeImageBuffer = await fs.readFile(originalImagePath);
      }

      // 4. Apply Photoroom Background Replacement if active
      if (config.bgReplacementEnabled && copyData.background_prompt && process.env.PHOTOROOM_API_KEY) {
        try {
          activeImageBuffer = await replaceBackground(activeImageBuffer, randomImageName, copyData.background_prompt);
        } catch (pe) {
          console.error("[Scheduler] Photoroom background replacement failed. Falling back to original car photo.", pe);
        }
      }

      // 5. Apply Watermark Buffer
      const watermarkedImageBuffer = await applyWatermarkToBuffer(activeImageBuffer, config.watermark);

      // 6. Save the watermarked image locally (local cache) FIRST
      const outputFilename = `auto_${Date.now()}_${randomImageName}`;
      const outputPath = path.join(PUBLISHED_DIR, outputFilename);
      await fs.writeFile(outputPath, watermarkedImageBuffer);

      // 6b. Upload to Supabase Storage under 'publicados/' if active
      let publicImageUrl = `/published/${outputFilename}`;
      if (isSupabaseActive) {
        try {
          console.log(`[Scheduler - Supabase] Uploading automated published image to publicados/${outputFilename}...`);
          const { error } = await supabase.storage
            .from('flota')
            .upload(`publicados/${outputFilename}`, watermarkedImageBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (!error) {
            const { data } = supabase.storage.from('flota').getPublicUrl(`publicados/${outputFilename}`);
            publicImageUrl = data.publicUrl;
            await trackUsage('supabase', 'storageUploads', 1);
          }
        } catch (err) {
          console.error("[Scheduler - Supabase] Failed to upload published image to storage cloud:", err);
        }
      }

      // 7. Publish based on Channel configured inside a try/catch
      let pubResult;
      let deliveryError = null;

      try {
        if (config.publisherChannel === 'n8n') {
          console.log(`[Scheduler] Pushing automated post to N8N...`);
          pubResult = await publishToN8N(watermarkedImageBuffer, randomImageName, caption, config);
        } else {
          console.log(`[Scheduler] Directing automated post to Facebook...`);
          pubResult = await publishToFacebook(watermarkedImageBuffer, caption);
        }
      } catch (err) {
        console.error(`[Scheduler] Delivery failed, registering with error fallback...`, err.message);
        deliveryError = err.message;
        pubResult = {
          simulated: true,
          postId: `auto_fail_${Date.now()}`,
          url: config.publisherChannel === 'n8n' ? (config.n8nWebhookUrl || "https://n8n.io/simulation") : "https://www.facebook.com/2s1mrentcar/posts/simulation"
        };
      }

      // 8. Log to publishedPosts
      const logEntry = {
        id: pubResult.postId,
        timestamp: new Date().toISOString(),
        carId: randomCar.id,
        imageName: randomImageName,
        caption,
        imageUrl: publicImageUrl,
        facebookUrl: pubResult.url,
        simulated: pubResult.simulated,
        triggeredBy: `Scheduler Slot ${matchingSlot.id} (Theme ${matchingSlot.theme})`,
        channel: config.publisherChannel,
        bgReplaced: config.bgReplacementEnabled && !!process.env.PHOTOROOM_API_KEY,
        deliveryFailed: !!deliveryError,
        deliveryError: deliveryError || null
      };

      config.publishedPosts.unshift(logEntry);
      await saveConfig(config);

      console.log(`[Scheduler] Post successfully registered! ID: ${pubResult.postId} (Delivery status: ${deliveryError ? 'FAILED' : 'SUCCESS'})`);
    } catch (err) {
      console.error(`[Scheduler] Error during auto-publishing:`, err);
    }
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 🚗 2S1M Rent Car Auto-Publisher is running!`);
  console.log(` 🌐 Dashboard URL: http://localhost:${PORT}`);
  console.log(` ⚙️  Status: Active and listening for connections`);
  console.log(`=======================================================`);
});
