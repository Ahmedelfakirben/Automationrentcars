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

// Helper to log a technical error event dynamically and save it persistently
async function logErrorEvent(type, message, details = null) {
  try {
    const config = await getConfig();
    if (!config.errorLogs) config.errorLogs = [];

    const newError = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      type, // 'Meta API', 'Cloudinary AI', 'Supabase', 'Scheduler', 'Groq AI', etc.
      message: message || "Unknown error occurred",
      details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : null
    };

    config.errorLogs.unshift(newError);

    // Keep only the last 50 errors to prevent database bloat
    if (config.errorLogs.length > 50) {
      config.errorLogs = config.errorLogs.slice(0, 50);
    }

    await saveConfig(config);
    console.log(`[Error Logger] Registered error: [${type}] - ${message}`);
  } catch (err) {
    console.error("Failed to write to persistent error logs:", err);
  }
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
            bgReplacementEnabled: false,
            publishedPosts: [],
            usageStats: {
              groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              photoroom: { requests: 0, success: 0, failed: 0 },
              supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
              facebook: { attempts: 0, success: 0, failed: 0 }
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
      if (config.bgReplacementEnabled === undefined) config.bgReplacementEnabled = false;

      if (!config.usageStats) {
        config.usageStats = {
          groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          photoroom: { requests: 0, success: 0, failed: 0 },
          supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
          facebook: { attempts: 0, success: 0, failed: 0 }
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
    if (parsed.bgReplacementEnabled === undefined) parsed.bgReplacementEnabled = false;
    
    if (!parsed.usageStats) {
      parsed.usageStats = {
        groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        photoroom: { requests: 0, success: 0, failed: 0 },
        supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
        facebook: { attempts: 0, success: 0, failed: 0 }
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
      bgReplacementEnabled: false,
      publishedPosts: [],
      usageStats: {
        groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        photoroom: { requests: 0, success: 0, failed: 0 },
        supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
        facebook: { attempts: 0, success: 0, failed: 0 }
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
      console.error(`[Supabase] Client download failed, trying direct public URL fetch:`, err.message);
      try {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/flota/${carId}/${imageName}`;
        console.log(`[Supabase] Direct fetch from URL: ${publicUrl}...`);
        const fetchRes = await fetch(publicUrl);
        if (fetchRes.ok) {
          const arrayBuf = await fetchRes.arrayBuffer();
          rawImageBuffer = Buffer.from(arrayBuf);
          console.log(`[Supabase] Direct URL fetch successful!`);
        } else {
          throw new Error(`Status ${fetchRes.status}: ${fetchRes.statusText}`);
        }
      } catch (directErr) {
        console.error(`[Supabase] Both client and direct URL download failed:`, directErr.message);
      }
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

// Format image into premium vertical 9:16 portrait layout for Instagram Stories
async function formatImageForStory(imageBuffer) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const targetWidth = 1080;
  const targetHeight = 1920;

  // Resize original image to fit width of 1080
  const resized = await sharp(imageBuffer)
    .resize({
      width: targetWidth,
      height: Math.round(targetWidth / (metadata.width / metadata.height)),
      fit: 'contain'
    })
    .toBuffer();

  const resizedMetadata = await sharp(resized).metadata();

  // Pad to vertical 9:16 canvas with elegant dark mode background (#121212)
  return await sharp(resized)
    .extend({
      top: Math.max(0, Math.floor((targetHeight - resizedMetadata.height) / 2)),
      bottom: Math.max(0, Math.ceil((targetHeight - resizedMetadata.height) / 2)),
      left: 0,
      right: 0,
      background: { r: 18, g: 18, b: 18, alpha: 1 }
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Background Replacement Integration (Cloudinary with Photoroom fallback)
async function replaceBackground(imageBuffer, imageName, prompt) {
  const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

  // 1. CLOUDINARY ACTIVE (Free Generative AI background replacement)
  if (cloudinaryCloudName && cloudinaryCloudName.trim() !== "" && cloudinaryApiKey && cloudinaryApiSecret) {
    console.log(`[Cloudinary] Starting generative background replacement for: "${prompt}"...`);
    try {
      const timestamp = Math.round(new Date().getTime() / 1000);
      const signatureString = `timestamp=${timestamp}${cloudinaryApiSecret}`;
      
      const crypto = await import('crypto');
      const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

      // Convert image buffer to base64 Data URI for upload
      const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

      console.log(`[Cloudinary] Uploading temporary original image to cloud...`);
      const formData = new URLSearchParams();
      formData.append('file', base64Image);
      formData.append('api_key', cloudinaryApiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`, {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || uploadData.error) {
        throw new Error(uploadData.error ? uploadData.error.message : "Fallo al subir imagen original a Cloudinary");
      }

      const publicId = uploadData.public_id;
      const version = uploadData.version;
      const format = uploadData.format;

      // Generate the URL with generative background replacement transformation
      // e_gen_background_replace:prompt_your_prompt
      const cleanPrompt = prompt.replace(/,/g, ' ').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
      const encodedPrompt = encodeURIComponent(cleanPrompt);
      const transformedUrl = `https://res.cloudinary.com/${cloudinaryCloudName}/image/upload/e_gen_background_replace:prompt_${encodedPrompt}/v${version}/${publicId}.${format}`;
      
      console.log(`[Cloudinary] Transformed AI URL: ${transformedUrl}`);
      console.log(`[Cloudinary] Fetching background replaced image...`);

      let response;
      const maxRetries = 60; // 3 minutes total
      const retryIntervalMs = 3000;
      for (let i = 0; i < maxRetries; i++) {
        console.log(`[Cloudinary] Fetching transformed image (attempt ${i + 1}/${maxRetries})...`);
        response = await fetch(transformedUrl);
        if (response.ok) {
          break;
        }
        if (response.status === 423) {
          console.log(`[Cloudinary] Image is processing (423 Locked). Retrying in ${retryIntervalMs / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
        } else {
          const text = await response.text().catch(() => '');
          console.error(`[Cloudinary] HTTP Error ${response.status}: ${response.statusText}. Details: ${text}`);
          throw new Error(`Fallo al descargar la imagen transformada de Cloudinary: ${response.status} ${response.statusText}`);
        }
      }
      if (!response || !response.ok) {
        throw new Error(`Cloudinary download failed after retries: ${response ? response.statusText : 'No response'}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[Cloudinary] Success! Generative background generated. size: ${arrayBuffer.byteLength} bytes.`);
      await trackUsage('photoroom', null, 'success'); // count towards usage stats
      return Buffer.from(arrayBuffer);
    } catch (err) {
      console.error("[Cloudinary] Generative background failed, falling back to Photoroom if key active...", err.message);
    }
  }

  // 2. PHOTOROOM FALLBACK
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Generative background API error: No active Cloudinary or Photoroom credentials configured in .env.");
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

// Generate Copy using Groq (Upgraded to return background_prompt, support 4 languages and dynamic hashtags!)
async function generatePostCopy(themeId, carName, config) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in the environment. Please set it in the Settings panel.");
  }

  const promotionsText = config.calendar.promotions.join(', ') || 'Sin promociones activas';
  const eventsText = config.calendar.events.join(', ') || 'Sin eventos festivos especiales';

  // Get current day of the week for custom dynamic hashtags
  const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const currentDayName = daysOfWeek[new Date().getDay()];

  let systemPrompt = `Eres el Community Manager experto de "2S1M Rent Car", una empresa premium de alquiler de vehículos en Tetuán y Tánger, Marruecos.
Tu objetivo es crear contenido altamente atractivo para redes sociales que genere reservas.

CONTEXTO DEL NEGOCIO:
- Ubicaciones principales: Aeropuertos de Tánger (Ibn Battouta) y Tetuán (Sania Ramel), Marruecos.
- Público objetivo: Turistas europeos y Marroquíes Residentes en el Extranjero (MRE) que buscan un servicio sin sorpresas, coches nuevos y un trato VIP.
- Flota actual: Modelos nuevos del año 2026 (Seat Ibiza FR, Peugeot 208, Renault Clio 5, Opel Corsa).
- Tono: Profesional, confiable, directo, lujoso y dinámico.

REGLAS DE CONTENIDO:
1. IDIOMA: Todo el contenido debe ser estrictamente redactado en 4 idiomas en este orden exacto:
   - Francés (Français) primero
   - Árabe (العربية) segundo
   - Español (Español) tercero
   - Inglés (English) cuarto
   Cada idioma debe estar separado claramente por un salto de línea para facilitar la lectura.
2. CALL TO ACTION (CTA): Siempre debes invitar a reservar vía WhatsApp o visitando rentcartetouan.ma.
3. EMOJIS: Usa emojis adecuados pero sin saturar (máximo 4-5 por texto total). Emojis seguros: ⭐, 🚗, 📍, 📞, ✅, 🌐.
4. HASHTAGS: Incluye hashtags dinámicos apropiados para hoy, que es **${currentDayName}** (ej: si es Jueves, incluye hashtags como #TangierThursday o #JuevesDeRuta; si es Sábado o Domingo, #FindeSemana, #EscapadaFinde, etc., adaptado al día de la semana).
5. FORMATO DE SALIDA: Debes responder ÚNICAMENTE con un objeto JSON válido. No incluyas explicaciones ni etiquetas markdown de código en la respuesta. Solo devuelve el JSON crudo.
   IMPORTANTE: Asegúrate de que todos los saltos de línea (\n) y comillas dobles internas dentro de los textos estén estrictamente escapados para no romper la sintaxis JSON. Evita cadenas de texto con saltos de línea literales; usa el carácter de escape \n de forma explícita.

ESTRUCTURA DEL JSON REQUERIDA:
{
  "post_text": "Texto largo bilingüe en 4 idiomas (FR, AR, ES, EN) para el feed. Incluye el CTA al final con número de contacto y web en cada sección correspondiente o al final general.",
  "hashtags": "Lista de 8 a 10 hashtags estratégicos adaptados al día de la semana (${currentDayName}) separados por espacio",
  "story_text": "Texto muy corto e impactante (máx 10 palabras por idioma: FR, AR, ES, EN) para superponer en la historia.",
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

  const modelsToTry = [
    "llama-3.3-70b-versatile",
    "llama-3.3-70b-specdec",
    "llama-3.1-8b-instant"
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Groq] Attempting content generation with model: ${modelName}...`);
      const requestBody = {
        model: modelName,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Genera el post perfecto en JSON para promocionar el coche: ${carName}. Recuerda respetar estrictamente los 4 idiomas en orden (FR, AR, ES, EN) y la firma de contacto inamovible:
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
      console.warn(`[Groq] Model ${modelName} failed:`, err.message);
      lastError = err;
    }
  }

  console.error("Groq Copy Generation Error after trying all models:", lastError);
  throw lastError;
}

// Generate Stories Package (8 stories, 4 languages, music suggestion)
async function generateStoriesPackage(carName, config) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in the environment.");
  }

  const systemPrompt = `Eres el Director de Marketing Creativo de "2S1M Rent Car". Tu objetivo es crear un paquete de 8 stories cortas e impactantes de alta conversión para Instagram/Facebook.
Cada story debe motivar a reservar de inmediato a través de WhatsApp o la web.

NORMAS DE LAS STORIES:
- Idiomas: Cada una debe redactarse en 4 idiomas en este orden exacto: Francés (Français) primero, Árabe (العربية) segundo, Español (Español) tercero, e Inglés (English) cuarto.
- Muy Cortas: Máximo 8-10 palabras en total por idioma, pensadas para leerse rápidamente en una pantalla de móvil.
- Atractivas, enérgicas y Premium.
- Emojis: 1 o 2 emojis por story.
- Música Recomendada: Para cada story, sugiere una canción comercial tendencia y popular (de artistas populares, música veraniega, chill, latina, house o árabe moderna) adecuada para acompañar la historia en Instagram/Facebook.
- Formato de Salida: Devuelve ÚNICAMENTE un objeto JSON válido con un array de 8 objetos de stories. No añadas introducciones, ni comentarios, ni bloques de código.
  IMPORTANTE: Asegúrate de que todos los saltos de línea (\n) y comillas dobles internas dentro de los textos estén estrictamente escapados para no romper la sintaxis JSON. Evita cadenas de texto con saltos de línea literales; usa el carácter de escape \n de forma explícita.

ESTRUCTURA DEL JSON REQUERIDA:
{
  "stories": [
    {
      "id": 1,
      "text": "[Texto Francés] \\n [Texto Árabe] \\n [Texto Español] \\n [Texto Inglés]",
      "sticker_cta": "Reserva / WhatsApp (máx 3 palabras)",
      "music_suggestion": "Nombre de la Canción - Artista (ej: 'Feel It Still - Portugal. The Man')"
    },
    ...
  ]
}

VEHÍCULO A DESTACAR: ${carName}
`;

  const modelsToTry = [
    "llama-3.3-70b-versatile",
    "llama-3.3-70b-specdec",
    "llama-3.1-8b-instant"
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Groq Stories] Attempting stories generation with model: ${modelName}...`);
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "system", content: systemPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.85
        })
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
      return JSON.parse(result.choices[0].message.content.trim());
    } catch (err) {
      console.warn(`[Groq Stories] Model ${modelName} failed:`, err.message);
      lastError = err;
    }
  }

  console.error("Groq Stories Generation Error after trying all models:", lastError);
  throw lastError;
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
    await logErrorEvent('Meta Facebook Feed API', err.message);
    throw err;
  }
}

// Publish to Facebook Story Graph API
async function publishToFacebookStory(imageBuffer) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken || accessToken.trim() === "") {
    console.warn("Facebook Story credentials missing. Operating in SIMULATION Mode.");
    return {
      simulated: true,
      postId: "sim_fb_story_" + Math.random().toString(36).substr(2, 9),
      url: "https://www.facebook.com/2s1mrentcar/stories/simulation"
    };
  }

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2, 16);
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${accessToken}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="published"\r\n\r\nfalse\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="story_image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  ];
  const headerBuffer = Buffer.from(parts.join(''));
  const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([headerBuffer, imageBuffer, footerBuffer]);

  try {
    console.log(`[Facebook Story] Uploading unpublished photo to page ${pageId}...`);
    const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: payload
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.id) {
      await trackUsage('facebook', null, 'failed');
      throw new Error(uploadData.error ? uploadData.error.message : "Facebook photo upload for story failed");
    }
    const photoId = uploadData.id;
    console.log(`[Facebook Story] Photo uploaded successfully. Photo ID: ${photoId}. Publishing photo story...`);

    const publishParams = new URLSearchParams();
    publishParams.append('access_token', accessToken);
    publishParams.append('photo_id', photoId);

    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photo_stories`, {
      method: "POST",
      body: publishParams
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok || (!publishData.id && !publishData.post_id)) {
      await trackUsage('facebook', null, 'failed');
      throw new Error(publishData.error ? publishData.error.message : "Facebook story creation failed");
    }
    const storyId = publishData.id || publishData.post_id;
    console.log(`[Facebook Story] Page Story published successfully! Story ID: ${storyId}`);
    await trackUsage('facebook', null, 'success');
    return {
      simulated: false,
      postId: storyId,
      url: `https://www.facebook.com/${pageId}/stories`
    };
  } catch (err) {
    await trackUsage('facebook', null, 'failed');
    console.error("Facebook Story Publishing Error:", err);
    await logErrorEvent('Meta Facebook Story API', err.message);
    throw err;
  }
}

// Helper to publish a single story to both Instagram and Facebook Stories in parallel automatically
async function publishSingleStory(storyText, stickerCta, imageUrl, imageName, musicSuggestion) {
  const config = await getConfig();
  let deliveryError = null;
  let pubResult = { simulated: true, postId: `sim_story_${Date.now()}`, url: "https://www.instagram.com/2s1mrentcar/simulation" };

  const caption = `[Story] ${storyText}\n🔗 CTA: ${stickerCta || 'Reserva'}\n🎵 Musica: ${musicSuggestion || ''}`;

  // Detect if imageUrl is already a public Supabase CDN URL
  const isAlreadyPublicUrl = imageUrl.startsWith('https://');

  // Reconstruct public URL if local relative path
  let igPublicUrl = imageUrl;
  let localFetchUrl = imageUrl;
  if (!isAlreadyPublicUrl && !igPublicUrl.startsWith('http')) {
    localFetchUrl = `http://127.0.0.1:${process.env.PORT || PORT}${imageUrl}`;
  }

  let processedStoryBuffer = null;

  try {
    let imgBuffer = null;

    if (isAlreadyPublicUrl) {
      console.log(`[Auto Story] Fetching catalog image from Supabase CDN: ${imageUrl}...`);
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
      if (!imgRes.ok) throw new Error(`CDN fetch failed: ${imgRes.status} ${imgRes.statusText}`);
      const arrayBuf = await imgRes.arrayBuffer();
      imgBuffer = Buffer.from(arrayBuf);
    } else if (localFetchUrl.startsWith('http')) {
      console.log(`[Auto Story] Fetching local image: ${localFetchUrl}...`);
      const imgRes = await fetch(localFetchUrl);
      if (!imgRes.ok) throw new Error(`Could not fetch image: ${imgRes.statusText}`);
      const arrayBuf = await imgRes.arrayBuffer();
      imgBuffer = Buffer.from(arrayBuf);
    } else {
      const localPath = path.join(WORKSPACE_DIR, 'public', imageUrl.replace(/^\/published\//, 'published/'));
      imgBuffer = await fs.readFile(localPath);
    }

    console.log("[Auto Story] Resizing and padding to vertical 9:16 aspect ratio...");
    processedStoryBuffer = await formatImageForStory(imgBuffer);
    const storyFilename = `story_916_${Date.now()}.jpg`;

    if (isSupabaseActive) {
      console.log(`[Auto Story - Supabase] Uploading 9:16 story: publicados/${storyFilename}...`);
      const { error } = await supabase.storage
        .from('flota')
        .upload(`publicados/${storyFilename}`, processedStoryBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });
      if (error) throw new Error(`Supabase upload failed: ${error.message}`);
      const { data } = supabase.storage.from('flota').getPublicUrl(`publicados/${storyFilename}`);
      igPublicUrl = data.publicUrl;
    } else {
      const localStoryPath = path.join(PUBLISHED_DIR, storyFilename);
      await fs.writeFile(localStoryPath, processedStoryBuffer);
      igPublicUrl = `http://localhost:${process.env.PORT || 3000}/published/${storyFilename}`;
    }
    console.log(`[Auto Story] 9:16 Image ready. URL: ${igPublicUrl}`);
  } catch (err) {
    console.error("[Auto Story] 9:16 formatting failed, falling back to original image:", err.message);
    if (isAlreadyPublicUrl) {
      igPublicUrl = imageUrl;
      console.log(`[Auto Story] Using original CDN URL as fallback for Meta: ${igPublicUrl}`);
    }
  }

  // Fallback buffer for Facebook Story
  if (!processedStoryBuffer) {
    try {
      if (igPublicUrl.startsWith('http')) {
        const imgRes = await fetch(igPublicUrl);
        if (imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          processedStoryBuffer = Buffer.from(arrayBuf);
        }
      } else {
        const localPath = path.join(WORKSPACE_DIR, 'public', imageUrl.replace(/^\/published\//, 'published/'));
        processedStoryBuffer = await fs.readFile(localPath);
      }
    } catch (err) {
      console.error("[Auto Story] Failed to retrieve fallback image buffer for Facebook Story:", err.message);
    }
  }

  try {
    console.log("[Auto Story] Publishing Story to Instagram and Facebook Stories...");

    let igResult = { simulated: true, url: "https://www.instagram.com/2s1mrentcar/simulation" };
    let fbResult = { simulated: true, url: "https://www.facebook.com/2s1mrentcar/stories/simulation" };
    let igError = null;
    let fbError = null;

    // 1. Publish to Instagram Story
    try {
      igResult = await publishToInstagram(igPublicUrl, storyText, true);
    } catch (err) {
      console.error("[Auto Story] Instagram Story failed:", err.message);
      igError = err.message;
    }

    // 2. Publish to Facebook Story
    if (processedStoryBuffer) {
      try {
        fbResult = await publishToFacebookStory(processedStoryBuffer);
      } catch (err) {
        console.error("[Auto Story] Facebook Story failed:", err.message);
        fbError = err.message;
      }
    } else {
      fbError = "Image buffer unavailable";
    }

    if (igError && fbError) {
      throw new Error(`Ambas publicaciones de historia fallaron. IG: ${igError}. FB: ${fbError}`);
    } else if (igError) {
      deliveryError = `Instagram fallo: ${igError}`;
    } else if (fbError) {
      deliveryError = `Facebook Story fallo: ${fbError}`;
    }

    pubResult = {
      simulated: igResult.simulated && fbResult.simulated,
      postId: igResult.postId || fbResult.postId || `story_${Date.now()}`,
      url: igResult.url
    };
  } catch (pe) {
    console.error("[Auto Story] Delivery failed:", pe.message);
    deliveryError = pe.message;
  }

  // Log to history
  const logEntry = {
    id: pubResult.postId,
    timestamp: new Date().toISOString(),
    carId: 'story_kit_auto',
    imageName: imageName || 'story_photo.jpg',
    caption: caption,
    imageUrl: igPublicUrl,
    facebookUrl: pubResult.url,
    simulated: pubResult.simulated,
    channel: config.publisherChannel,
    bgReplaced: false,
    deliveryFailed: !!deliveryError,
    deliveryError: deliveryError || null,
    isStory: true
  };

  config.publishedPosts.unshift(logEntry);
  await saveConfig(config);
}

// Publish to Instagram Graph API (Directly Feed / Stories)
async function publishToInstagram(imageUrl, caption, isStory = false) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken || accessToken.trim() === "") {
    console.warn("Instagram credentials missing. Operating in SIMULATION Mode.");
    return {
      simulated: true,
      postId: "sim_ig_" + Math.random().toString(36).substr(2, 9),
      url: "https://www.instagram.com/2s1mrentcar/simulation"
    };
  }

  try {
    // 1. Get the linked Instagram Business Account ID
    console.log(`[Instagram] Finding linked Instagram account for page ${pageId}...`);
    const accountRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${accessToken}`);
    const accountData = await accountRes.json();

    if (!accountRes.ok || !accountData.instagram_business_account) {
      throw new Error(accountData.error ? accountData.error.message : "No se encontro una cuenta de Instagram Business vinculada a esta pagina de Facebook.");
    }
    const igAccountId = accountData.instagram_business_account.id;
    console.log(`[Instagram] Linked Account ID found: ${igAccountId}`);

    // 2. Create the media container (Requires fully public URL - Supabase Storage bucket public URL is used)
    console.log(`[Instagram] Creating media container for ${isStory ? 'Story' : 'Feed Post'} (URL: ${imageUrl})...`);
    const containerParams = new URLSearchParams();
    containerParams.append('access_token', accessToken);
    containerParams.append('image_url', imageUrl);
    if (isStory) {
      containerParams.append('media_type', 'STORIES');
    } else {
      containerParams.append('caption', caption);
    }

    const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
      method: 'POST',
      body: containerParams
    });
    const containerData = await containerRes.json();

    if (!containerRes.ok || !containerData.id) {
      throw new Error(containerData.error ? containerData.error.message : "Fallo al crear contenedor de media en Instagram");
    }
    const containerId = containerData.id;
    console.log(`[Instagram] Media container created successfully. ID: ${containerId}`);

    // 3. Poll/wait for the container to be ready
    console.log(`[Instagram] Media container ${containerId} created. Polling status before publishing...`);
    let isReady = false;
    const maxPolls = 15;
    const pollIntervalMs = 3000; // 3 seconds
    let statusData = null;

    for (let i = 0; i < maxPolls; i++) {
      console.log(`[Instagram] Polling container ${containerId} status (Attempt ${i + 1}/${maxPolls})...`);
      const statusRes = await fetch(`https://graph.facebook.com/v19.0/${containerId}?fields=status_code,error&access_token=${accessToken}`);
      statusData = await statusRes.json();
      
      if (!statusRes.ok) {
        throw new Error(statusData.error ? statusData.error.message : "Error al obtener estado del contenedor de Instagram");
      }

      console.log(`[Instagram] Container ${containerId} status_code is: ${statusData.status_code}`);

      if (statusData.status_code === 'FINISHED') {
        isReady = true;
        break;
      } else if (statusData.status_code === 'ERROR') {
        let detail = "Error de procesamiento de Meta";
        if (statusData.error) {
          detail = `${statusData.error.message} (code: ${statusData.error.code}, subcode: ${statusData.error.error_subcode})`;
        }
        throw new Error(`El contenedor de Instagram fallo en procesarse: ${detail}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    if (!isReady) {
      throw new Error(`El contenedor de Instagram no se proceso a tiempo (status: ${statusData ? statusData.status_code : 'desconocido'})`);
    }

    console.log(`[Instagram] Publishing media container ${containerId}...`);
    const publishParams = new URLSearchParams();
    publishParams.append('access_token', accessToken);
    publishParams.append('creation_id', containerId);

    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
      method: 'POST',
      body: publishParams
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok || !publishData.id) {
      throw new Error(publishData.error ? publishData.error.message : "Fallo al publicar el contenedor en Instagram");
    }

    console.log(`[Instagram] Published successfully! Post ID: ${publishData.id}`);
    
    // Fetch the actual permalink from Instagram Graph API so it correctly directs to /stories/ or the exact post
    let permalink = `https://www.instagram.com/p/${publishData.id}`; // Fallback
    try {
      console.log(`[Instagram] Fetching permalink for published media ${publishData.id}...`);
      const permalinkRes = await fetch(`https://graph.facebook.com/v19.0/${publishData.id}?fields=permalink&access_token=${accessToken}`);
      if (permalinkRes.ok) {
        const permalinkData = await permalinkRes.json();
        if (permalinkData.permalink) {
          permalink = permalinkData.permalink;
          console.log(`[Instagram] Fetched actual permalink: ${permalink}`);
        }
      }
    } catch (pe) {
      console.warn(`[Instagram] Failed to fetch permalink: ${pe.message}`);
    }

    return {
      simulated: false,
      postId: publishData.id,
      url: permalink
    };
  } catch (err) {
    console.error("Instagram Publishing Error:", err);
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

// Get all technical error logs
app.get('/api/errors', async (req, res) => {
  try {
    const config = await getConfig();
    res.json({ errors: config.errorLogs || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all technical error logs
app.post('/api/errors/clear', async (req, res) => {
  try {
    const config = await getConfig();
    config.errorLogs = [];
    await saveConfig(config);
    res.json({ success: true, message: 'Registro de errores limpiado con éxito.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Generate 8 Stories Package (Combines 4 AI/generated and 4 catalog images + music suggestions)
app.post('/api/generate-stories', async (req, res) => {
  const { carId } = req.body;
  if (!carId) {
    return res.status(400).json({ error: "carId is required" });
  }

  try {
    const config = await getConfig();
    const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === carId);
    const carName = carDef ? carDef.name : "Nuestra Flota Premium";

    // 1. Scan catalog photos for this car
    // In production (Supabase active), list directly from the cloud bucket to avoid missing local folders
    let catalogImages = [];
    if (isSupabaseActive) {
      try {
        console.log(`[Stories] Listing catalog from Supabase bucket: flota/${carId}/...`);
        const { data: sbFiles, error: sbError } = await supabase.storage.from('flota').list(carId, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
        if (!sbError && sbFiles) {
          catalogImages = sbFiles
            .map(f => f.name)
            .filter(name => {
              const ext = path.extname(name).toLowerCase();
              return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
            });
          console.log(`[Stories] Found ${catalogImages.length} catalog images from Supabase for car: ${carId}`);
        } else {
          console.warn(`[Stories] Supabase list error for ${carId}:`, sbError?.message);
        }
      } catch (sbErr) {
        console.error(`[Stories] Supabase catalog list failed:`, sbErr.message);
      }
    }
    // Also try local folder (local dev or fallback)
    if (catalogImages.length === 0) {
      const carFolder = path.join(WORKSPACE_DIR, carDef ? carDef.folder : carId);
      if (existsSync(carFolder)) {
        const files = await fs.readdir(carFolder);
        catalogImages = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
        });
        console.log(`[Stories] Found ${catalogImages.length} catalog images locally for car: ${carId}`);
      }
    }

    // 2. Scan published (AI generated) photos in local cache and filter by currently selected car
    let publishedImages = [];
    if (existsSync(PUBLISHED_DIR)) {
      const files = await fs.readdir(PUBLISHED_DIR);
      publishedImages = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        if ((ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') ||
            (!f.startsWith('ai_') && !f.startsWith('published_') && !f.startsWith('auto_'))) {
          return false;
        }
        const parts = f.split('_');
        if (parts.length < 3) return false;
        const originalName = parts.slice(2).join('_');
        return catalogImages.includes(originalName);
      });
    }
    // In production, also check Supabase 'publicados/' for AI-generated images for this car
    if (isSupabaseActive && publishedImages.length === 0) {
      try {
        const { data: pubFiles } = await supabase.storage.from('flota').list('publicados', { limit: 200 });
        if (pubFiles) {
          publishedImages = pubFiles
            .map(f => f.name)
            .filter(name => {
              const ext = path.extname(name).toLowerCase();
              if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') return false;
              if (!name.startsWith('ai_') && !name.startsWith('published_') && !name.startsWith('auto_')) return false;
              const parts = name.split('_');
              if (parts.length < 3) return false;
              const originalName = parts.slice(2).join('_');
              return catalogImages.includes(originalName);
            });
          console.log(`[Stories] Found ${publishedImages.length} AI-published images in Supabase for car: ${carId}`);
        }
      } catch (e) {
        console.warn('[Stories] Supabase publicados listing failed:', e.message);
      }
    }

    // 3. Select 8 images (up to 4 AI generated, rest from catalog) ensuring maximum diversity
    const selectedPhotos = [];
    const usedOriginalNames = new Set();
    const shuffle = arr => arr.sort(() => 0.5 - Math.random());

    // Take AI/published images first (max 4)
    const shuffledPublished = shuffle([...publishedImages]);
    const publishedCountToTake = Math.min(4, shuffledPublished.length);
    for (let i = 0; i < publishedCountToTake; i++) {
      const filename = shuffledPublished[i];
      let imageUrl = `/published/${filename}`;
      if (isSupabaseActive) {
        const { data } = supabase.storage.from('flota').getPublicUrl(`publicados/${filename}`);
        if (data && data.publicUrl) {
          imageUrl = data.publicUrl;
        }
      }

      // Remember that this base photo was already selected as AI version
      const parts = filename.split('_');
      if (parts.length >= 3) {
        const originalName = parts.slice(2).join('_');
        usedOriginalNames.add(originalName);
      }

      selectedPhotos.push({
        type: 'ai_generated',
        imageName: filename,
        imageUrl: imageUrl
      });
    }

    // Take catalog photos, prioritizing those whose AI version has NOT been selected yet
    const shuffledCatalog = shuffle([...catalogImages]);
    const unusedCatalog = shuffledCatalog.filter(img => !usedOriginalNames.has(img));
    const usedCatalog = shuffledCatalog.filter(img => usedOriginalNames.has(img));
    const prioritizedCatalog = [...unusedCatalog, ...usedCatalog];

    const catalogCountToTake = 8 - selectedPhotos.length;
    for (let i = 0; i < Math.min(catalogCountToTake, prioritizedCatalog.length); i++) {
      // Direct public Supabase URL bypass if cloud mode is active, completely resolving Docker/VPS network issues in browser
      let imageUrl = `/api/preview?carId=${carId}&imageName=${encodeURIComponent(prioritizedCatalog[i])}&scale=0.15&position=bottom-right&opacity=0.95`;
      if (isSupabaseActive) {
        imageUrl = `${supabaseUrl}/storage/v1/object/public/flota/${carId}/${prioritizedCatalog[i]}`;
      }
      selectedPhotos.push({
        type: 'library',
        imageName: prioritizedCatalog[i],
        imageUrl: imageUrl
      });
    }

    // Fix modulo duplication bug by cycling through the unique selected photos
    const originalLength = selectedPhotos.length;
    while (selectedPhotos.length < 8 && originalLength > 0) {
      const indexToCopy = selectedPhotos.length % originalLength;
      selectedPhotos.push({ ...selectedPhotos[indexToCopy] });
    }

    // Fallback if no images found at all
    if (selectedPhotos.length === 0) {
      const fallbackUrl = isSupabaseActive
        ? `${supabaseUrl}/storage/v1/object/public/flota/favicon.svg`
        : '/favicon.svg';
      for (let i = 0; i < 8; i++) {
        selectedPhotos.push({
          type: 'library',
          imageName: 'favicon.svg',
          imageUrl: fallbackUrl
        });
      }
    }

    // 4. Generate the 8 stories texts
    const storiesData = await generateStoriesPackage(carName, config);
    const stories = storiesData.stories || [];

    // 5. Associate one selected photo to each story
    const enrichedStories = stories.map((story, index) => {
      const photo = selectedPhotos[index % selectedPhotos.length];
      return {
        ...story,
        imageUrl: photo.imageUrl,
        imageName: photo.imageName,
        imageType: photo.type
      };
    });

    res.json({ stories: enrichedStories });
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
      facebook: { attempts: 0, success: 0, failed: 0 }
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
        console.error(`[Preview AI - Supabase] SDK download failed, trying direct public URL fetch:`, err.message);
        try {
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/flota/${carId}/${imageName}`;
          console.log(`[Preview AI - Supabase] Direct fetch from URL: ${publicUrl}...`);
          const fetchRes = await fetch(publicUrl);
          if (fetchRes.ok) {
            const arrayBuf = await fetchRes.arrayBuffer();
            activeImageBuffer = Buffer.from(arrayBuf);
            console.log(`[Preview AI - Supabase] Direct URL fetch successful!`);
          } else {
            throw new Error(`Status ${fetchRes.status}: ${fetchRes.statusText}`);
          }
        } catch (directErr) {
          console.error(`[Preview AI - Supabase] Both client and direct URL download failed:`, directErr.message);
        }
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


// Publish manual post (Sends to Facebook and Instagram directly, supports Photoroom AI Background Replacement!)
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

      // 2. Apply Background Replacement if active (supports Cloudinary and Photoroom)
      const hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
      const hasPhotoroom = !!process.env.PHOTOROOM_API_KEY;
      if (config.bgReplacementEnabled && backgroundPrompt && backgroundPrompt.trim() !== "" && (hasCloudinary || hasPhotoroom)) {
        try {
          activeImageBuffer = await replaceBackground(activeImageBuffer, imageName, backgroundPrompt);
        } catch (pe) {
          console.error("[Publish] Background replacement failed. Falling back to original car photo.", pe);
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
      console.log("[Publish] Directing post to Facebook...");
      pubResult = await publishToFacebook(watermarkedImageBuffer, caption);

      // CO-PUBLISH TO INSTAGRAM FEED
      try {
        console.log("[Publish] Co-publishing to Instagram Feed...");
        let igPublicUrl = publicImageUrl;
        if (!igPublicUrl.startsWith('http') && req.headers.host) {
          const protocol = req.headers.referer ? new URL(req.headers.referer).protocol : 'http:';
          igPublicUrl = `${protocol}//${req.headers.host}${publicImageUrl}`;
        }
        await publishToInstagram(igPublicUrl, caption, false);
        console.log("[Publish] Instagram Feed co-publish successful!");
      } catch (ige) {
        console.error("[Publish] Instagram feed co-publish failed (Facebook succeeded):", ige.message);
        deliveryError = `Facebook OK. Instagram Fallo: ${ige.message}`;
      }
    } catch (pe) {
      console.error("[Publish] Facebook delivery failed:", pe.message);
      deliveryError = pe.message;
      pubResult = {
        simulated: true,
        postId: `fail_${Date.now()}`,
        url: "https://www.facebook.com/2s1mrentcar/posts/simulation"
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
      warning: deliveryError ? `Fallo en el envio: ${deliveryError}` : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish manual Story to Instagram and Facebook!
app.post('/api/publish-story', async (req, res) => {
  const { storyText, stickerCta, imageUrl, imageName, musicSuggestion } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "imageUrl is required" });
  }

  try {
    const config = await getConfig();
    let deliveryError = null;
    let pubResult = { simulated: true, postId: `sim_story_${Date.now()}`, url: "https://www.instagram.com/2s1mrentcar/simulation" };

    // Format full caption for logs or if N8N/FB is used
    const caption = `[Story] ${storyText}\n🔗 CTA: ${stickerCta || 'Reserva'}\n🎵 Musica: ${musicSuggestion || ''}`;

    // Reconstruct public URL if local path (relative URL like /published/...)
    let igPublicUrl = imageUrl;
    let localFetchUrl = imageUrl;

    if (!igPublicUrl.startsWith('http')) {
      if (req.headers.host) {
        const protocol = req.headers.referer ? new URL(req.headers.referer).protocol : 'http:';
        igPublicUrl = `${protocol}//${req.headers.host}${imageUrl}`;
      }
      localFetchUrl = `http://127.0.0.1:${PORT}${imageUrl}`;
    }

    let processedStoryBuffer = null;

    // If imageUrl is already a public Supabase CDN URL, skip local fetch entirely —
    // just pass the URL directly to Meta API and do a lightweight re-upload for 9:16 formatting.
    const isAlreadyPublicUrl = imageUrl.startsWith('https://');

    // Auto-Format to 9:16 Portrait Layout using Sharp for Instagram Story Direct Publish
    try {
      let imgBuffer = null;

      if (isAlreadyPublicUrl) {
        // Catalog image from Supabase CDN — fetch directly without local proxy
        console.log(`[Publish Story] Fetching catalog image from public CDN: ${imageUrl}...`);
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
        if (!imgRes.ok) throw new Error(`CDN fetch failed: ${imgRes.status} ${imgRes.statusText}`);
        const arrayBuf = await imgRes.arrayBuffer();
        imgBuffer = Buffer.from(arrayBuf);
      } else if (localFetchUrl.startsWith('http')) {
        console.log(`[Publish Story] Downloading image for 9:16 processing: ${localFetchUrl}...`);
        const imgRes = await fetch(localFetchUrl);
        if (!imgRes.ok) throw new Error(`Could not fetch image: ${imgRes.statusText}`);
        const arrayBuf = await imgRes.arrayBuffer();
        imgBuffer = Buffer.from(arrayBuf);
      } else {
        const localPath = path.join(WORKSPACE_DIR, 'public', imageUrl.replace(/^\/published\//, 'published/'));
        imgBuffer = await fs.readFile(localPath);
      }

      console.log("[Publish Story] Resizing and padding to vertical 9:16 aspect ratio...");
      processedStoryBuffer = await formatImageForStory(imgBuffer);
      const storyFilename = `story_916_${Date.now()}.jpg`;

      if (isSupabaseActive) {
        console.log(`[Publish Story - Supabase] Uploading 9:16 story: publicados/${storyFilename}...`);
        const { error } = await supabase.storage
          .from('flota')
          .upload(`publicados/${storyFilename}`, processedStoryBuffer, {
            contentType: 'image/jpeg',
            upsert: true
          });
        if (error) throw new Error(`Supabase upload failed: ${error.message}`);
        const { data } = supabase.storage.from('flota').getPublicUrl(`publicados/${storyFilename}`);
        igPublicUrl = data.publicUrl;
      } else {
        const localStoryPath = path.join(PUBLISHED_DIR, storyFilename);
        await fs.writeFile(localStoryPath, processedStoryBuffer);
        if (req.headers.host) {
          const protocol = req.headers.referer ? new URL(req.headers.referer).protocol : 'http:';
          igPublicUrl = `${protocol}//${req.headers.host}/published/${storyFilename}`;
        } else {
          igPublicUrl = `/published/${storyFilename}`;
        }
      }
      console.log(`[Publish Story] 9:16 Image ready. URL: ${igPublicUrl}`);
    } catch (err) {
      console.error("[Publish Story] 9:16 formatting failed, falling back to original image:", err.message);
      // If imageUrl is already a CDN URL, use it directly as fallback — Meta can download it directly
      if (isAlreadyPublicUrl) {
        igPublicUrl = imageUrl;
        console.log(`[Publish Story] Using original CDN URL as fallback: ${igPublicUrl}`);
      }
    }

    // Retrieve original buffer if formatting or upload failed to guarantee Facebook Story has a buffer
    if (!processedStoryBuffer) {
      try {
        if (localFetchUrl.startsWith('http')) {
          const imgRes = await fetch(localFetchUrl);
          if (imgRes.ok) {
            const arrayBuf = await imgRes.arrayBuffer();
            processedStoryBuffer = Buffer.from(arrayBuf);
          }
        } else {
          const localPath = path.join(WORKSPACE_DIR, 'public', imageUrl.replace(/^\/published\//, 'published/'));
          processedStoryBuffer = await fs.readFile(localPath);
        }
      } catch (err) {
        console.error("[Publish Story] Failed to retrieve fallback image buffer for Facebook Story:", err.message);
      }
    }

    try {
      console.log("[Publish Story] Publishing Story directly to Instagram and Facebook Stories...");
      
      let igResult = { simulated: true, url: "https://www.instagram.com/2s1mrentcar/simulation" };
      let fbResult = { simulated: true, url: "https://www.facebook.com/2s1mrentcar/stories/simulation" };
      let igError = null;
      let fbError = null;

      // 1. Publish to Instagram Story
      try {
        igResult = await publishToInstagram(igPublicUrl, storyText, true);
      } catch (err) {
        console.error("[Publish Story] Instagram Story publishing failed:", err.message);
        igError = err.message;
      }

      // 2. Publish to Facebook Story
      if (processedStoryBuffer) {
        try {
          fbResult = await publishToFacebookStory(processedStoryBuffer);
        } catch (err) {
          console.error("[Publish Story] Facebook Story publishing failed:", err.message);
          fbError = err.message;
        }
      } else {
        fbError = "Image buffer unavailable";
      }

      if (igError && fbError) {
        throw new Error(`Ambas publicaciones fallaron. IG: ${igError}. FB: ${fbError}`);
      } else if (igError) {
        deliveryError = `Instagram fallo: ${igError}`;
      } else if (fbError) {
        deliveryError = `Facebook Story fallo: ${fbError}`;
      }

      pubResult = {
        simulated: igResult.simulated && fbResult.simulated,
        postId: igResult.postId || fbResult.postId || `story_${Date.now()}`,
        url: igResult.url // Return Instagram URL as primary
      };
    } catch (pe) {
      console.error("[Publish Story] Story delivery failed:", pe.message);
      deliveryError = pe.message;
    }

    // Log to history
    const logEntry = {
      id: pubResult.postId,
      timestamp: new Date().toISOString(),
      carId: 'story_kit',
      imageName: imageName || 'story_photo.jpg',
      caption: caption,
      imageUrl: igPublicUrl,
      facebookUrl: pubResult.url,
      simulated: pubResult.simulated,
      channel: config.publisherChannel,
      bgReplaced: false,
      deliveryFailed: !!deliveryError,
      deliveryError: deliveryError || null,
      isStory: true
    };

    config.publishedPosts.unshift(logEntry);
    await saveConfig(config);

    res.json({
      success: true,
      post: logEntry,
      warning: deliveryError ? `Fallo en el envio de Story: ${deliveryError}` : null
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
      publisherChannel: 'facebook',
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
  try {
    const config = await getConfig();
    if (!config.scheduler || !config.scheduler.enabled) return;

    const now = new Date();
    
    // Con TZ="Europe/Madrid" en Docker, la hora local ya es correcta.
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const currentHourMin = `${hour}:${minute}`;


  const storiesConfig = config.storiesScheduler || { enabled: true, morningTime: "11:00", afternoonTime: "19:00" };

  // -------------------------------------------------------------
  // STORY AUTO-PUBLISHER FOR DYNAMIC MORNING TIME
  // -------------------------------------------------------------
  if (storiesConfig.enabled && currentHourMin === storiesConfig.morningTime) {
    console.log("[Scheduler] 11:00 AM hit. Generating 8 stories and publishing the first 4...");
    try {
      // 1. Pick a random car
      const cars = await scanWorkspaceForCars();
      const validCars = cars.filter(c => c.images && c.images.length > 0);
      if (validCars.length > 0) {
        const randomCar = validCars[Math.floor(Math.random() * validCars.length)];
        const carName = randomCar.name;

        // 2. Select 8 images (4 AI/generated, 4 catalog library)
        // In production, list images directly from Supabase Storage
        let catalogImages = [];
        if (isSupabaseActive) {
          try {
            const { data: sbFiles, error: sbError } = await supabase.storage.from('flota').list(randomCar.id, { limit: 100 });
            if (!sbError && sbFiles) {
              catalogImages = sbFiles.map(f => f.name).filter(name => {
                const ext = path.extname(name).toLowerCase();
                return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
              });
              console.log(`[Scheduler Morning] Found ${catalogImages.length} images in Supabase for car: ${randomCar.id}`);
            }
          } catch (sbErr) {
            console.error('[Scheduler Morning] Supabase catalog list failed:', sbErr.message);
          }
        }
        if (catalogImages.length === 0) {
          const carFolder = path.join(WORKSPACE_DIR, randomCar.folder);
          if (existsSync(carFolder)) {
            const files = await fs.readdir(carFolder);
            catalogImages = files.filter(f => {
              const ext = path.extname(f).toLowerCase();
              return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
            });
          }
        }

        let publishedImages = [];
        if (existsSync(PUBLISHED_DIR)) {
          const files = await fs.readdir(PUBLISHED_DIR);
          publishedImages = files.filter(f => {
            const ext = path.extname(f).toLowerCase();
            return (ext === '.jpg' || ext === '.jpeg' || ext === '.png') && 
                   (f.startsWith('ai_') || f.startsWith('published_') || f.startsWith('auto_'));
          });
        }

        const shuffle = arr => arr.sort(() => 0.5 - Math.random());
        const shuffledPublished = shuffle([...publishedImages]);
        const shuffledCatalog = shuffle([...catalogImages]);

        const selectedPhotos = [];
        const publishedCountToTake = Math.min(4, shuffledPublished.length);
        for (let i = 0; i < publishedCountToTake; i++) {
          let imageUrl = `/published/${shuffledPublished[i]}`;
          if (isSupabaseActive) {
            const { data } = supabase.storage.from('flota').getPublicUrl(`publicados/${shuffledPublished[i]}`);
            if (data && data.publicUrl) {
              imageUrl = data.publicUrl;
            }
          }
          selectedPhotos.push({ type: 'ai_generated', imageName: shuffledPublished[i], imageUrl });
        }

        const catalogCountToTake = 8 - selectedPhotos.length;
        for (let i = 0; i < Math.min(catalogCountToTake, shuffledCatalog.length); i++) {
          let imageUrl = `/api/preview?carId=${randomCar.id}&imageName=${encodeURIComponent(shuffledCatalog[i])}&scale=0.15&position=bottom-right&opacity=0.95`;
          if (isSupabaseActive) {
            imageUrl = `${supabaseUrl}/storage/v1/object/public/flota/${randomCar.id}/${shuffledCatalog[i]}`;
          }
          selectedPhotos.push({
            type: 'library',
            imageName: shuffledCatalog[i],
            imageUrl: imageUrl
          });
        }

        // Fix modulo duplication bug by cycling through the unique selected photos
        const originalLength = selectedPhotos.length;
        while (selectedPhotos.length < 8 && originalLength > 0) {
          const indexToCopy = selectedPhotos.length % originalLength;
          selectedPhotos.push({ ...selectedPhotos[indexToCopy] });
        }

        if (selectedPhotos.length === 0) {
          const fallbackUrl = isSupabaseActive
            ? `${supabaseUrl}/storage/v1/object/public/flota/favicon.svg`
            : '/favicon.svg';
          for (let i = 0; i < 8; i++) {
            selectedPhotos.push({ type: 'library', imageName: 'favicon.svg', imageUrl: fallbackUrl });
          }
        }

        // Generate the 8 stories texts
        const storiesData = await generateStoriesPackage(carName, config);
        const stories = storiesData.stories || [];

        const enrichedStories = stories.map((story, index) => {
          const photo = selectedPhotos[index % selectedPhotos.length];
          return {
            ...story,
            imageUrl: photo.imageUrl,
            imageName: photo.imageName,
            imageType: photo.type
          };
        });

        // Publish stories 1, 2, 3, 4
        console.log("[Scheduler] Publishing morning stories 1 to 4...");
        for (let i = 0; i < Math.min(4, enrichedStories.length); i++) {
          const st = enrichedStories[i];
          try {
            await publishSingleStory(st.text, st.sticker_cta, st.imageUrl, st.imageName, st.music_suggestion);
            console.log(`[Scheduler] Morning Story #${i+1} published successfully!`);
          } catch (stErr) {
            console.error(`[Scheduler] Morning Story #${i+1} failed:`, stErr.message);
            await logErrorEvent('Scheduler Story Publish', `Morning Story #${i+1} failed: ${stErr.message}`);
          }
        }

        // Save stories 5, 6, 7, 8 in config pendingStories
        config.pendingStories = enrichedStories.slice(4);
        await saveConfig(config);
        console.log(`[Scheduler] Morning Stories published. ${config.pendingStories.length} pending stories saved for the afternoon.`);
      }
    } catch (storyGenErr) {
      console.error("[Scheduler] Morning story automatic process failed:", storyGenErr);
      await logErrorEvent('Scheduler Morning Stories', storyGenErr.message, storyGenErr.stack);
    }
  }

  // -------------------------------------------------------------
  // STORY AUTO-PUBLISHER FOR DYNAMIC AFTERNOON TIME
  // -------------------------------------------------------------
  if (storiesConfig.enabled && currentHourMin === storiesConfig.afternoonTime) {
    console.log(`[Scheduler] ${storiesConfig.afternoonTime} hit. Checking for pending stories from morning...`);
    if (config.pendingStories && config.pendingStories.length > 0) {
      console.log(`[Scheduler] Found ${config.pendingStories.length} pending stories. Publishing...`);
      const storiesToPublish = [...config.pendingStories];
      
      // Clear pendingStories first to be safe
      config.pendingStories = [];
      await saveConfig(config);

      for (let i = 0; i < storiesToPublish.length; i++) {
        const st = storiesToPublish[i];
        try {
          await publishSingleStory(st.text, st.sticker_cta, st.imageUrl, st.imageName, st.music_suggestion);
          console.log(`[Scheduler] Afternoon Story #${i+5} published successfully!`);
        } catch (stErr) {
          console.error(`[Scheduler] Afternoon Story #${i+5} failed:`, stErr.message);
          await logErrorEvent('Scheduler Story Publish', `Afternoon Story #${i+5} failed: ${stErr.message}`);
        }
      }
      console.log("[Scheduler] Afternoon stories publication finished.");
    } else {
      console.log("[Scheduler] No pending stories found. Generating 4 new stories for the afternoon...");
      try {
        const cars = await scanWorkspaceForCars();
        const validCars = cars.filter(c => c.images && c.images.length > 0);
        if (validCars.length > 0) {
          const randomCar = validCars[Math.floor(Math.random() * validCars.length)];
          const carName = randomCar.name;

          // Replicate stories generation but just for 4 stories
          const storiesData = await generateStoriesPackage(carName, config);
          const stories = storiesData.stories || [];

          // Scan catalog photos from Supabase in production
          let catalogImages = [];
          if (isSupabaseActive) {
            try {
              const { data: sbFiles, error: sbError } = await supabase.storage.from('flota').list(randomCar.id, { limit: 100 });
              if (!sbError && sbFiles) {
                catalogImages = sbFiles.map(f => f.name).filter(name => {
                  const ext = path.extname(name).toLowerCase();
                  return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
                });
                console.log(`[Scheduler Afternoon] Found ${catalogImages.length} images in Supabase for car: ${randomCar.id}`);
              }
            } catch (sbErr) {
              console.error('[Scheduler Afternoon] Supabase catalog list failed:', sbErr.message);
            }
          }
          if (catalogImages.length === 0) {
            const carFolder = path.join(WORKSPACE_DIR, randomCar.folder);
            if (existsSync(carFolder)) {
              const files = await fs.readdir(carFolder);
              catalogImages = files.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
              });
            }
          }

          const shuffle = arr => arr.sort(() => 0.5 - Math.random());
          const shuffledCatalog = shuffle([...catalogImages]);

          // Publish up to 4 stories
          const storiesToPublish = stories.slice(0, 4);
          for (let i = 0; i < storiesToPublish.length; i++) {
            const st = storiesToPublish[i];
            const img = shuffledCatalog[i % (shuffledCatalog.length || 1)];
            let imageUrl = img
              ? (isSupabaseActive
                ? `${supabaseUrl}/storage/v1/object/public/flota/${randomCar.id}/${img}`
                : `/api/preview?carId=${randomCar.id}&imageName=${encodeURIComponent(img)}&scale=0.15&position=bottom-right&opacity=0.95`)
              : '/favicon.svg';

            try {
              await publishSingleStory(st.text, st.sticker_cta, imageUrl, img || 'favicon.svg', st.music_suggestion);
              console.log(`[Scheduler] Afternoon Story #${i+1} (freshly generated) published successfully!`);
            } catch (stErr) {
              console.error(`[Scheduler] Afternoon Story #${i+1} failed:`, stErr.message);
              await logErrorEvent('Scheduler Story Publish', `Afternoon fresh story #${i+1} failed: ${stErr.message}`);
            }
          }
        }
      } catch (freshErr) {
        console.error("[Scheduler] Fresh afternoon stories generation failed:", freshErr);
        await logErrorEvent('Scheduler Afternoon Stories', freshErr.message, freshErr.stack);
      }
    }
  }

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

      // Pick a random car and image, ensuring we don't repeat recently posted images (last 4 posts)
      const lastPublished = config.publishedPosts || [];
      const recentlyUsed = lastPublished.slice(0, 4).map(p => `${p.carId}/${p.imageName}`);

      let availableOptions = [];
      for (const car of validCars) {
        for (const img of car.images) {
          const identifier = `${car.id}/${img}`;
          if (!recentlyUsed.includes(identifier)) {
            availableOptions.push({ car, img });
          }
        }
      }

      if (availableOptions.length === 0) {
        // Fallback to all options if everything was recently used
        validCars.forEach(car => {
          car.images.forEach(img => {
            availableOptions.push({ car, img });
          });
        });
      }

      const selected = availableOptions[Math.floor(Math.random() * availableOptions.length)];
      const randomCar = selected.car;
      const randomImageName = selected.img;

      console.log(`[Scheduler] Selected car: ${randomCar.name}, Image: ${randomImageName} (avoided repeats!)`);

      // 2. Generate Copy
      const copyData = await generatePostCopy(matchingSlot.theme, randomCar.name, config);
      
      // Robust unpacking for Groq text structure (string or object fallback)
      let postText = copyData.post_text;
      if (typeof postText === 'object' && postText !== null) {
        postText = Object.values(postText).join('\n\n');
      }
      const caption = `${postText}\n\n${copyData.hashtags}`;

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

      // 4. Apply Background Replacement if active (supports Cloudinary and Photoroom)
      const hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
      const hasPhotoroom = !!process.env.PHOTOROOM_API_KEY;
      if (config.bgReplacementEnabled && copyData.background_prompt && (hasCloudinary || hasPhotoroom)) {
        try {
          activeImageBuffer = await replaceBackground(activeImageBuffer, randomImageName, copyData.background_prompt);
        } catch (pe) {
          console.error("[Scheduler] Background replacement failed. Falling back to original car photo.", pe);
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

      // 7. Publish to Facebook and co-publish to Instagram Feed
      let pubResult;
      let deliveryError = null;

      try {
        console.log(`[Scheduler] Directing automated post to Facebook Page...`);
        pubResult = await publishToFacebook(watermarkedImageBuffer, caption);

        // Co-publish to Instagram Feed
        console.log(`[Scheduler] Co-publishing to Instagram Feed...`);
        try {
          await publishToInstagram(publicImageUrl, caption, false);
          console.log(`[Scheduler] Automated post successfully co-published to Instagram Feed!`);
        } catch (igErr) {
          console.error(`[Scheduler] Instagram Feed co-publish failed (Facebook succeeded):`, igErr.message);
          deliveryError = `Instagram fallo: ${igErr.message}`;
        }
      } catch (err) {
        console.error(`[Scheduler] Facebook delivery failed:`, err.message);
        deliveryError = err.message;
        pubResult = {
          simulated: true,
          postId: `auto_fail_${Date.now()}`,
          url: "https://www.facebook.com/2s1mrentcar/posts/simulation"
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
      await logErrorEvent('Scheduler Feed Publish', err.message, err.stack);
    }
  }
  } catch (criticalErr) {
    console.error("[Scheduler] CRITICAL ERROR in top-level cron job:", criticalErr);
    await logErrorEvent('Scheduler Critical Error', criticalErr.message || "Unknown error", criticalErr.stack);
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
