/**
 * 2S1M Rent Car - Premium Auto-Publisher Client App
 */

// ============================================================
// AUTH LAYER — Session check + helper
// ============================================================

// Returns stored access token or null
function getAccessToken() {
  return localStorage.getItem('2s1m_access_token') || null;
}

// Authenticated fetch — automatically adds Bearer token header
async function authFetch(url, options = {}) {
  const token = getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  // If 401, session expired — redirect to login
  if (response.status === 401) {
    localStorage.removeItem('2s1m_access_token');
    localStorage.removeItem('2s1m_refresh_token');
    localStorage.removeItem('2s1m_user');
    window.location.replace('/login.html');
    throw new Error('Sesión expirada. Redirigiendo al login...');
  }
  return response;
}

// Check session on page load
(async function checkSession() {
  const token = getAccessToken();
  if (!token) {
    window.location.replace('/login.html');
    return;
  }
  // Verify token is still valid
  try {
    const res = await fetch('/api/auth-config');
    const cfg = await res.json();
    if (cfg.url) {
      const sb = supabase.createClient(cfg.url, cfg.anonKey);
      const { data: { user }, error } = await sb.auth.getUser(token);
      if (error || !user) throw new Error('Invalid');
      // Show username in header
      const storedUser = JSON.parse(localStorage.getItem('2s1m_user') || '{}');
      const nameEl = document.getElementById('logged-user-name');
      if (nameEl) nameEl.textContent = storedUser.username || user.user_metadata?.username || 'sysadmin';
    }
  } catch (e) {
    // Token invalid or Supabase not configured—allow access in local mode
    console.warn('[Auth] Session check:', e.message);
  }

  // Wire logout button
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        const token = getAccessToken();
        const cfg = await (await fetch('/api/auth-config')).json();
        if (cfg.url) {
          const sb = supabase.createClient(cfg.url, cfg.anonKey);
          await sb.auth.signOut();
        }
      } catch(e) { console.warn('Logout error:', e); }
      localStorage.removeItem('2s1m_access_token');
      localStorage.removeItem('2s1m_refresh_token');
      localStorage.removeItem('2s1m_user');
      window.location.replace('/login.html');
    });
  }
})();

const TRANSLATIONS = {
  es: {
    nav_dashboard: 'Dashboard',
    nav_catalog: 'Catálogo de Fotos',
    nav_studio: 'Content Studio',
    nav_history: 'Historial de Posts',
    nav_telemetry: 'Monitoreo y Alertas',
    nav_settings: 'Configuración',
    
    title_dashboard: 'Dashboard General',
    title_catalog: 'Flota y Catálogo de Fotos',
    title_studio: 'Content Studio AI',
    title_history: 'Historial de Publicaciones',
    title_telemetry: 'Monitoreo y Sistema de Alertas',
    title_settings: 'Ajustes y Automatización',
    
    header_welcome: 'Panel del Community Manager',
    
    stat_posts_today: 'Publicaciones Hoy',
    stat_stories_today: 'Stories Generadas',
    stat_total_posts: 'Publicaciones Totales',
    
    dash_title_slots: 'Programación de Publicaciones de Hoy',
    dash_title_quick: 'Acciones Rápidas del Sistema',
    dash_title_status: 'Estado del Motor de Automatización',
    
    quick_btn_studio: 'Abrir Content Studio AI',
    quick_btn_catalog: 'Escanear Catálogo de Fotos',
    quick_btn_history: 'Ver Historial de Publicación',
    quick_btn_settings: 'Ajustar Canales y Horarios',
    
    catalog_instructions_html: '<strong>💡 Catálogo de la Flota Cloud:</strong> A continuación se muestran las imágenes subidas en tu Supabase Storage. El sistema seleccionará aleatoriamente fotos de estas carpetas para tus posts diarios programados. También puedes seleccionar cualquiera de ellas para enviarla al Content Studio AI.',
    
    tel_alerts_title: 'Sistema de Alertas de Consumo',
    tel_limits_title: 'Ajustes de Alertas y Límites',
    set_auto_title: 'Ajustes de Publicación Automática',
    set_cal_title: 'Calendario de Promociones y Eventos'
  },
  fr: {
    nav_dashboard: 'Tableau de Bord',
    nav_catalog: 'Catalogue Photos',
    nav_studio: 'Studio de Contenu',
    nav_history: 'Historique',
    nav_telemetry: 'Surveillance & Alertes',
    nav_settings: 'Ajustes',
    
    title_dashboard: 'Tableau de Bord Général',
    title_catalog: 'Flotte et Catalogue Photos',
    title_studio: 'Content Studio IA',
    title_history: 'Historique des Publications',
    title_telemetry: 'Système de Surveillance & Alertes',
    title_settings: 'Ajustements & Automatisation',
    
    header_welcome: 'Panneau du Community Manager',
    
    stat_posts_today: 'Publications Aujourd\'hui',
    stat_stories_today: 'Stories Générées',
    stat_total_posts: 'Publications Totales',
    
    dash_title_slots: 'Planification des Publications d\'Aujourd\'hui',
    dash_title_quick: 'Actions Rapides du Système',
    dash_title_status: 'État du Moteur d\'Automatisation',
    
    quick_btn_studio: 'Ouvrir Content Studio IA',
    quick_btn_catalog: 'Parcourir le Catalogue Photos',
    quick_btn_history: 'Voir l\'Historique de Post',
    quick_btn_settings: 'Ajuster Canaux et Horaires',
    
    catalog_instructions_html: '<strong>💡 Catalogue de Flotte Cloud:</strong> Voici les images téléchargées dans votre Supabase Storage. Le système sélectionnera au hasard des photos de ces dossiers pour vos posts quotidiens programmés. Vous pouvez également en sélectionner une pour l\'envoyer au Content Studio IA.',
    
    tel_alerts_title: 'Système d\'Alertes de Consommation',
    tel_limits_title: 'Limites et Alertes de Consommation',
    set_auto_title: 'Ajustements de Publication Automatique',
    set_cal_title: 'Calendrier des Promotions et Événements'
  },
  en: {
    nav_dashboard: 'Dashboard',
    nav_catalog: 'Photo Catalog',
    nav_studio: 'Content Studio',
    nav_history: 'Post History',
    nav_telemetry: 'Telemetry & Alerts',
    nav_settings: 'Settings',
    
    title_dashboard: 'General Dashboard',
    title_catalog: 'Fleet & Photo Catalog',
    title_studio: 'AI Content Studio',
    title_history: 'Post Publishing Log',
    title_telemetry: 'Monitoring & Alert Center',
    title_settings: 'Settings & Automation',
    
    header_welcome: 'Community Manager Panel',
    
    stat_posts_today: 'Published Today',
    stat_stories_today: 'Stories Generated',
    stat_total_posts: 'Total Publications',
    
    dash_title_slots: 'Today\'s Automated Posting Slots',
    dash_title_quick: 'Quick Dashboard Actions',
    dash_title_status: 'Automation Engine Status',
    
    quick_btn_studio: 'Open AI Content Studio',
    quick_btn_catalog: 'Scan Photo Catalog',
    quick_btn_history: 'View Post History Log',
    quick_btn_settings: 'Configure Channels & Slots',
    
    catalog_instructions_html: '<strong>💡 Cloud Fleet Catalog:</strong> Below are the car photos uploaded in your Supabase Storage. The system will randomly pick images from these folders for your daily scheduled automatic posts. You can also select any image here to send it directly to the AI Content Studio.',
    
    tel_alerts_title: 'Consumption Alert System',
    tel_limits_title: 'Thresholds & Limits Configuration',
    set_auto_title: 'Automatic Publishing Settings',
    set_cal_title: 'Promotions & Local Events Calendar'
  }
};

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

class AutoPublisherApp {
  constructor() {
    this.cars = [];
    this.config = {};
    
    // UI State variables
    this.selectedCarId = null;
    this.selectedImageName = null;
    this.activeThemeId = 1;
    this.watermarkSettings = {
      position: 'bottom-right',
      scale: 0.15,
      opacity: 0.95,
      margin: 40
    };

    // AI Generated Image cache
    this.aiGeneratedImage = null; // { imageUrl, imageName }
    this.useAiImage = false;

    // Generated drafts
    this.generatedPostText = "";
    this.generatedHashtags = "";
    this.storiesPackage = [];
    
    // Multi-Language translation variables
    this.TRANSLATIONS = TRANSLATIONS;
    this.currentLang = localStorage.getItem('2s1m_lang') || 'es';

    // Bind event listeners on startup
    window.addEventListener('DOMContentLoaded', () => this.init());
  }

  async init() {
    console.log("2S1M Auto-Publisher Initializing...");
    
    this.initDateTime();
    this.setupTabNavigation();
    this.setupWatermarkListeners();
    this.setupPreviewToggleListeners();
    this.setupGenerationListeners();
    this.setupSettingsListeners();
    this.setupTelemetryListeners();
    this.setupLanguageListener();
    this.setupErrorListeners();
    this.applyTranslations();

    // Fetch initial workspace data
    await this.fetchConfig();
    await this.fetchCars();

    // Refresh UI elements
    this.updateStats();
    this.renderDashboardRecentPosts();
    this.renderDashboardSlots();
  }

  // Display human-readable local time
  initDateTime() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateText = new Date().toLocaleDateString('es-ES', options);
    document.getElementById('current-date-span').innerText = dateText.charAt(0).toUpperCase() + dateText.slice(1);
  }

  // Handle SPA Tab switches
  setupTabNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });
  }

  switchTab(tabId) {
    // Update nav button active states
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    // Update visible containers
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.add('hide');
      c.classList.remove('active');
    });
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) {
      targetTab.classList.remove('hide');
      targetTab.classList.add('active');
    }

    // Update header page title
    const titles = {
      'dashboard': 'Dashboard General',
      'catalog': 'Flota y Catálogo de Fotos',
      'studio': 'Content Studio AI',
      'history': 'Historial de Publicaciones',
      'telemetry': 'Monitoreo y Sistema de Alertas',
      'settings': 'Ajustes y Automatización',
      'errors': 'Registro de Errores y Fallos'
    };
    document.getElementById('page-title').innerText = titles[tabId] || 'Panel Administrativo';
    
    // Specific actions on tab loads
    if (tabId === 'dashboard') {
      this.renderDashboardRecentPosts();
      this.renderDashboardSlots();
      this.updateStats();
    } else if (tabId === 'history') {
      this.renderHistoryTable();
    } else if (tabId === 'telemetry') {
      this.renderTelemetry();
    } else if (tabId === 'errors') {
      this.renderErrorLogs();
    }
  }

  // Fetch cars catalog from workspace backend
  async fetchCars() {
    try {
      const response = await authFetch('/api/cars');
      if (!response.ok) throw new Error("No se pudo escanear el directorio");
      this.cars = await response.ok ? await response.json() : [];
      this.renderCatalog();
      this.populateStudioDropdowns();
    } catch (err) {
      console.error(err);
      this.showToast("Error", "No se pudo leer el catálogo de imágenes locales.", "error");
    }
  }

  // Fetch configs (Schedules, Promos, Watermarks)
  async fetchConfig() {
    try {
      const response = await authFetch('/api/config');
      if (!response.ok) throw new Error("No se pudo cargar la configuración");
      this.config = await response.json();

      // Check if Groq key exists in environment
      if (!this.config.hasGroqKey) {
        // We will receive a helper flag in config from server (or check it)
        // Let's verify key
      }

      this.watermarkSettings = this.config.watermark || this.watermarkSettings;
      this.populateSettingsForm();
      this.updateSchedulerBadge();
    } catch (err) {
      console.error(err);
      this.showToast("Error", "No se pudieron cargar los ajustes locales.", "error");
    }
  }

  // Update Scheduler Badge state
  updateSchedulerBadge() {
    const badge = document.getElementById('scheduler-badge');
    const text = document.getElementById('scheduler-badge-text');
    if (this.config.scheduler && this.config.scheduler.enabled) {
      badge.className = "scheduler-status-badge active";
      text.innerText = "Autopost Activado";
    } else {
      badge.className = "scheduler-status-badge inactive";
      text.innerText = "Autopost Desactivado";
    }
  }

  // Populate settings elements in DOM
  populateSettingsForm() {
    if (!this.config) return;

    // Scheduler state
    const schedulerEnabled = document.getElementById('settings-scheduler-enabled');
    if (schedulerEnabled && this.config.scheduler) {
      schedulerEnabled.checked = this.config.scheduler.enabled;
    }

    // Photoroom Background Replacement state
    const bgEnabled = document.getElementById('settings-bg-replacement-enabled');
    if (bgEnabled) {
      bgEnabled.checked = this.config.bgReplacementEnabled || false;
    }

    // Stories Scheduler times
    const storiesConfig = this.config.storiesScheduler || { enabled: true, morningTime: "11:00", afternoonTime: "19:00" };
    const morningInput = document.getElementById('settings-stories-morning');
    const afternoonInput = document.getElementById('settings-stories-afternoon');
    if (morningInput) morningInput.value = storiesConfig.morningTime || "11:00";
    if (afternoonInput) afternoonInput.value = storiesConfig.afternoonTime || "19:00";

    // Toggle editor bg prompt field visibility based on this setting
    const promptGroup = document.getElementById('editor-bg-prompt-group');
    if (promptGroup) {
      if (this.config.bgReplacementEnabled) {
        promptGroup.classList.remove('hide');
      } else {
        promptGroup.classList.add('hide');
      }
    }

    // Slots times and themes
    if (this.config.scheduler && this.config.scheduler.slots) {
      const slots = this.config.scheduler.slots;
      slots.forEach((s, idx) => {
        const slotId = idx + 1;
        const timeInput = document.getElementById(`slot-${slotId}-time`);
        const themeSelect = document.getElementById(`slot-${slotId}-theme`);
        const enabledInput = document.getElementById(`slot-${slotId}-enabled`);

        if (timeInput) timeInput.value = s.time;
        if (themeSelect) themeSelect.value = s.theme;
        if (enabledInput) enabledInput.checked = s.enabled;
      });
    }

    // Promotions and Calendar Events textareas
    if (this.config.calendar) {
      const promosList = document.getElementById('settings-promotions-list');
      const eventsList = document.getElementById('settings-events-list');

      if (promosList) promosList.value = (this.config.calendar.promotions || []).join('\n');
      if (eventsList) eventsList.value = (this.config.calendar.events || []).join('\n');
    }

    // Set Publisher Channel & Webhook
    const channelSelect = document.getElementById('settings-publisher-channel');
    const n8nWebhookInput = document.getElementById('settings-n8n-webhook');
    const n8nUrlGroup = document.getElementById('n8n-url-group');

    if (channelSelect) {
      channelSelect.value = this.config.publisherChannel || 'facebook';
      if (channelSelect.value === 'n8n') {
        n8nUrlGroup.classList.remove('hide');
      } else {
        n8nUrlGroup.classList.add('hide');
      }
    }
    if (n8nWebhookInput) {
      n8nWebhookInput.value = this.config.n8nWebhookUrl || '';
    }

    // Update publish button copy dynamically
    const btnPublish = document.getElementById('btn-publish-post');
    if (btnPublish) {
      if (this.config.publisherChannel === 'n8n') {
        btnPublish.innerHTML = `<i data-lucide="send"></i> Enviar Post a N8N Webhook`;
      } else {
        btnPublish.innerHTML = `<i data-lucide="send"></i> Publicar Ahora en Facebook`;
      }
    }

    // Show/hide simulation notice based on current channel credentials
    const notice = document.getElementById('fb-simulation-notice');
    if (notice) {
      if (this.config.publisherChannel === 'n8n') {
        if (!this.config.n8nWebhookUrl || this.config.n8nWebhookUrl.trim() === "") {
          notice.innerHTML = `<i data-lucide="info"></i> Modo Simulación Activo (Sin URL de webhook N8N)`;
          notice.classList.remove('hide');
        } else {
          notice.classList.add('hide');
        }
      } else {
        if (!this.config.hasFbKey) {
          notice.innerHTML = `<i data-lucide="info"></i> Modo Simulación Activo (Sin Access Token de Facebook)`;
          notice.classList.remove('hide');
        } else {
          notice.classList.add('hide');
        }
      }
      lucide.createIcons();
    }

    // Set API Keys
    if (this.config.apiKeys) {
      const groqKeyInput = document.getElementById('settings-groq-key');
      const fbTokenInput = document.getElementById('settings-fb-token');
      const fbPageIdInput = document.getElementById('settings-fb-page-id');
      const photoroomKeyInput = document.getElementById('settings-photoroom-key');
      const supabaseKeyInput = document.getElementById('settings-supabase-key');

      if (groqKeyInput) groqKeyInput.value = this.config.apiKeys.groqKey || '';
      if (fbTokenInput) fbTokenInput.value = this.config.apiKeys.fbToken || '';
      if (fbPageIdInput) fbPageIdInput.value = this.config.apiKeys.fbPageId || '61589242743757';
      if (photoroomKeyInput) photoroomKeyInput.value = this.config.apiKeys.photoroomKey || '';
      if (supabaseKeyInput) supabaseKeyInput.value = this.config.apiKeys.supabaseKey || '';
    }

    // Set Watermark sliders
    if (this.config.watermark) {
      const scaleSlider = document.getElementById('watermark-scale');
      const opacitySlider = document.getElementById('watermark-opacity');

      if (scaleSlider) {
        scaleSlider.value = this.config.watermark.scale;
        document.getElementById('scale-val').innerText = `${Math.round(this.config.watermark.scale * 100)}%`;
      }
      if (opacitySlider) {
        opacitySlider.value = this.config.watermark.opacity;
        document.getElementById('opacity-val').innerText = `${Math.round(this.config.watermark.opacity * 100)}%`;
      }

      // Position buttons active state
      document.querySelectorAll('.btn-pos').forEach(btn => {
        if (btn.getAttribute('data-pos') === this.config.watermark.position) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  // Populate dropdowns in Studio
  populateStudioDropdowns() {
    const carSelect = document.getElementById('studio-car-select');
    if (!carSelect) return;

    carSelect.innerHTML = '<option value="">-- Selecciona un coche --</option>';
    this.cars.forEach(c => {
      carSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });

    carSelect.addEventListener('change', () => {
      const carId = carSelect.value;
      this.populateStudioImages(carId);
    });
  }

  populateStudioImages(carId, preselectImage = null) {
    const imgSelect = document.getElementById('studio-image-select');
    if (!imgSelect) return;

    imgSelect.innerHTML = '<option value="">-- Selecciona una imagen --</option>';
    
    const car = this.cars.find(c => c.id === carId);
    if (car && car.images) {
      car.images.forEach(img => {
        imgSelect.innerHTML += `<option value="${img}">${img}</option>`;
      });

      if (preselectImage) {
        imgSelect.value = preselectImage;
        this.selectedImageName = preselectImage;
      }
    }

    imgSelect.addEventListener('change', () => {
      this.selectedImageName = imgSelect.value;
      
      // Reset AI image preview cache
      this.useAiImage = false;
      this.aiGeneratedImage = null;
      const btnOriginal = document.getElementById('btn-use-original-photo');
      const btnAi = document.getElementById('btn-preview-ai-bg');
      if (btnOriginal) btnOriginal.classList.add('active');
      if (btnAi) btnAi.classList.remove('active');

      this.updatePreview();
    });
  }

  // Render Visual Catalog in Catalog Tab
  renderCatalog() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;

    if (this.cars.length === 0) {
      grid.innerHTML = `<div class="empty-state"><i data-lucide="image-off"></i><p>No se encontraron carpetas de coches en el workspace.</p></div>`;
      lucide.createIcons();
      return;
    }

    grid.innerHTML = '';
    
    this.cars.forEach(car => {
      const carWrapper = document.createElement('div');
      carWrapper.className = 'car-section-wrapper';

      const sectionTitle = document.createElement('h3');
      sectionTitle.className = 'car-section-title';
      sectionTitle.innerHTML = `<i data-lucide="car"></i> ${car.name} <span class="car-badge-count">(${car.images.length} fotos)</span>`;
      carWrapper.appendChild(sectionTitle);

      const gallery = document.createElement('div');
      gallery.className = 'car-gallery';

      if (car.images.length === 0) {
        gallery.innerHTML = `<div class="empty-state" style="padding: 20px;"><p>No hay imágenes JPG/PNG en este directorio.</p></div>`;
      } else {
        car.images.forEach(imgName => {
          const card = document.createElement('div');
          card.className = 'gallery-image-card';
          // Call the server preview endpoint with parameters
          const previewSrc = `/api/preview?carId=${car.id}&imageName=${imgName}&scale=0.15&position=bottom-right&opacity=0.95`;
          
          card.innerHTML = `
            <img src="${previewSrc}" alt="${car.name} - ${imgName}" loading="lazy">
            <div class="gallery-image-overlay">
              <span class="image-name-tag"><i data-lucide="image"></i> ${imgName.split('.')[0]}</span>
            </div>
          `;

          // Handle click on card to open in Content Studio!
          card.addEventListener('click', () => {
            this.openStudioWithCarImage(car.id, imgName);
          });

          gallery.appendChild(card);
        });
      }

      carWrapper.appendChild(gallery);
      grid.appendChild(carWrapper);
    });

    lucide.createIcons();
  }

  // Open Studio directly with selected vehicle image
  openStudioWithCarImage(carId, imageName) {
    this.selectedCarId = carId;
    this.selectedImageName = imageName;

    // Reset AI preview cache
    this.useAiImage = false;
    this.aiGeneratedImage = null;
    const btnOriginal = document.getElementById('btn-use-original-photo');
    const btnAi = document.getElementById('btn-preview-ai-bg');
    if (btnOriginal) btnOriginal.classList.add('active');
    if (btnAi) btnAi.classList.remove('active');

    // Open tab
    this.switchTab('studio');

    // Pre-populate selectors
    const carSelect = document.getElementById('studio-car-select');
    if (carSelect) carSelect.value = carId;
    
    this.populateStudioImages(carId, imageName);
    this.updatePreview();
  }

  // Trigger studio with a specific theme directly from dashboard
  openStudioWithTheme(themeId) {
    this.activeThemeId = parseInt(themeId);
    
    // Update Active theme button styles
    document.querySelectorAll('.btn-theme').forEach(btn => {
      if (parseInt(btn.getAttribute('data-theme')) === themeId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Switch tab
    this.switchTab('studio');

    // If no car is selected yet, select the first one with images
    if (!this.selectedCarId) {
      const firstCar = this.cars.find(c => c.images && c.images.length > 0);
      if (firstCar) {
        this.openStudioWithCarImage(firstCar.id, firstCar.images[0]);
      }
    }
  }

  // Render on-the-fly watermarked preview image using sharp
  updatePreview() {
    const previewWrapper = document.getElementById('preview-image-wrapper');
    if (!previewWrapper) return;

    if (!this.selectedCarId || !this.selectedImageName) {
      return;
    }

    // If active image mode is AI, show the cached AI generated photo
    if (this.useAiImage && this.aiGeneratedImage) {
      previewWrapper.innerHTML = `<img src="${this.aiGeneratedImage.imageUrl}" class="preview-img">`;
      return;
    }

    // Loading overlay
    previewWrapper.innerHTML = `
      <div class="spinner-container">
        <div class="spinner"></div>
        <p>Procesando marca de agua en alta resolución...</p>
      </div>
    `;

    const pos = this.watermarkSettings.position;
    const scale = this.watermarkSettings.scale;
    const opacity = this.watermarkSettings.opacity;
    const margin = this.watermarkSettings.margin;

    const previewUrl = `/api/preview?carId=${this.selectedCarId}&imageName=${encodeURIComponent(this.selectedImageName)}&position=${pos}&scale=${scale}&opacity=${opacity}&margin=${margin}&t=${Date.now()}`;

    const img = new Image();
    img.src = previewUrl;
    img.className = 'preview-img';
    img.onload = () => {
      previewWrapper.innerHTML = '';
      previewWrapper.appendChild(img);
    };
    img.onerror = () => {
      previewWrapper.innerHTML = `
        <div class="empty-state">
          <i data-lucide="alert-circle" style="color: var(--color-danger)"></i>
          <p>No se pudo generar la vista previa watermarked.</p>
        </div>
      `;
      lucide.createIcons();
    };
  }

  // Watermark Settings Sliders & Positions Bindings
  setupWatermarkListeners() {
    const scaleSlider = document.getElementById('watermark-scale');
    const opacitySlider = document.getElementById('watermark-opacity');

    if (scaleSlider) {
      scaleSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.watermarkSettings.scale = val;
        document.getElementById('scale-val').innerText = `${Math.round(val * 100)}%`;
      });
      scaleSlider.addEventListener('change', () => this.updatePreview());
    }

    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.watermarkSettings.opacity = val;
        document.getElementById('opacity-val').innerText = `${Math.round(val * 100)}%`;
      });
      opacitySlider.addEventListener('change', () => this.updatePreview());
    }

    // Position buttons NW, NE, SW, SE
    document.querySelectorAll('.btn-pos').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-pos').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const pos = btn.getAttribute('data-pos');
        this.watermarkSettings.position = pos;
        this.updatePreview();
      });
    });
  }

  setupPreviewToggleListeners() {
    const btnUseOriginal = document.getElementById('btn-use-original-photo');
    const btnPreviewAiBg = document.getElementById('btn-preview-ai-bg');

    if (btnUseOriginal) {
      btnUseOriginal.addEventListener('click', () => {
        this.useAiImage = false;
        btnUseOriginal.classList.add('active');
        if (btnPreviewAiBg) btnPreviewAiBg.classList.remove('active');
        this.updatePreview();
      });
    }

    if (btnPreviewAiBg) {
      btnPreviewAiBg.addEventListener('click', async () => {
        if (!this.selectedCarId || !this.selectedImageName) {
          this.showToast("Atención", "Por favor, selecciona primero un coche e imagen en el panel derecho.", "info");
          return;
        }

        const bgPromptTextarea = document.getElementById('editor-bg-prompt');
        const prompt = bgPromptTextarea ? bgPromptTextarea.value.trim() : '';

        if (!prompt) {
          this.showToast("Atención", "Por favor, genera primero el texto con Groq o escribe un prompt de fondo manualmente.", "info");
          return;
        }

        btnPreviewAiBg.disabled = true;
        const originalText = btnPreviewAiBg.innerHTML;
        btnPreviewAiBg.innerHTML = `<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color:#fff"></div> Procesando...`;

        try {
          const response = await authFetch('/api/preview-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              carId: this.selectedCarId,
              imageName: this.selectedImageName,
              prompt: prompt,
              watermarkSettings: this.watermarkSettings
            })
          });

          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error || "Fallo en la llamada de Photoroom");

          this.aiGeneratedImage = {
            imageUrl: data.imageUrl,
            imageName: data.imageName
          };
          this.useAiImage = true;

          btnPreviewAiBg.classList.add('active');
          if (btnUseOriginal) btnUseOriginal.classList.remove('active');

          // Render direct Image in wrapper
          const previewWrapper = document.getElementById('preview-image-wrapper');
          if (previewWrapper) {
            previewWrapper.innerHTML = `<img src="${data.imageUrl}" class="preview-img">`;
          }

          this.showToast("¡Fondo Generado!", "Tu foto con IA ha sido creada y añadida directamente a tu catálogo.", "success");
          
          // Instantly refresh photos catalog to include this newly saved file!
          await this.fetchCars();

        } catch (err) {
          console.error(err);
          this.showToast("Error de Generación", err.message || "Fallo al conectar con Photoroom AI.", "error");
        } finally {
          btnPreviewAiBg.disabled = false;
          btnPreviewAiBg.innerHTML = originalText;
        }
      });
    }
  }

  // Generation Listeners (Groq call)
  setupGenerationListeners() {
    const btnGenerate = document.getElementById('btn-generate-post');
    if (!btnGenerate) return;

    // Theme selector click inside Studio
    document.querySelectorAll('.btn-theme').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-theme').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeThemeId = parseInt(btn.getAttribute('data-theme'));
      });
    });

    btnGenerate.addEventListener('click', async () => {
      if (!this.selectedCarId) {
        this.showToast("Atención", "Por favor, selecciona un coche en el Content Studio.", "info");
        return;
      }

      btnGenerate.disabled = true;
      btnGenerate.innerHTML = `<div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div> Redactando copy...`;

      try {
        const response = await authFetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            themeId: this.activeThemeId,
            carId: this.selectedCarId
          })
        });

        const data = await response.json();
        
        if (!response.ok || data.error) {
          throw new Error(data.error || "Error al generar el post");
        }

        // Show editor workspace
        document.getElementById('editor-workspace').classList.remove('hide');
        
        // Populate inputs
        document.getElementById('editor-post-text').value = data.post_text;
        document.getElementById('editor-hashtags').value = data.hashtags;

        const bgPromptTextarea = document.getElementById('editor-bg-prompt');
        if (bgPromptTextarea) {
          bgPromptTextarea.value = data.background_prompt || '';
        }

        this.generatedPostText = data.post_text;
        this.generatedHashtags = data.hashtags;

        // Auto-generate stories alongside
        this.fetchStoriesKit();

        this.showToast("Completado", "Post bilingüe redactado con éxito en base al Tema seleccionado.", "success");
      } catch (err) {
        console.error(err);
        this.showToast("Error de Generación", "Asegúrate de haber configurado tu GROQ_API_KEY en el panel de configuración.", "error");
      } finally {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = `<i data-lucide="refresh-cw"></i> Generar Contenido con Groq`;
        lucide.createIcons();
      }
    });

    // Publish post button action
    const btnPublish = document.getElementById('btn-publish-post');
    if (btnPublish) {
      btnPublish.addEventListener('click', async () => {
        const postText = document.getElementById('editor-post-text').value;
        const hashtags = document.getElementById('editor-hashtags').value;
        const backgroundPrompt = document.getElementById('editor-bg-prompt') ? document.getElementById('editor-bg-prompt').value : '';

        if (!postText.trim()) {
          this.showToast("Error", "La publicación no puede estar vacía.", "info");
          return;
        }

        btnPublish.disabled = true;
        btnPublish.innerHTML = `<div class="spinner" style="width: 18px; height: 18px; border-width: 2px; border-top-color:#fff"></div> Publicando...`;

        try {
          const response = await authFetch('/api/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              carId: this.selectedCarId,
              imageName: this.selectedImageName,
              postText: postText,
              hashtags: hashtags,
              backgroundPrompt: backgroundPrompt,
              watermarkSettings: this.watermarkSettings,
              alreadyGeneratedImageUrl: this.useAiImage && this.aiGeneratedImage ? this.aiGeneratedImage.imageUrl : null,
              alreadyGeneratedImageName: this.useAiImage && this.aiGeneratedImage ? this.aiGeneratedImage.imageName : null
            })
          });

          const result = await response.json();
          if (!response.ok || result.error) throw new Error(result.error || "Error al subir la publicación");

          if (result.warning) {
            this.showToast("Procesado con Advertencia", result.warning, "error");
          } else {
            this.showToast("¡Felicidades!", result.post.simulated 
              ? "Publicación simulada con éxito. Se ha guardado en el historial." 
              : "Publicación enviada a Facebook exitosamente.", "success");
          }

          // Reset drafts and studio fields
          document.getElementById('editor-workspace').classList.add('hide');
          document.getElementById('stories-kit-workspace').classList.add('hide');

          // Fetch new config (for published log)
          await this.fetchConfig();
          this.switchTab('dashboard');
        } catch (err) {
          console.error(err);
          this.showToast("Error al Publicar", err.message, "error");
        } finally {
          btnPublish.disabled = false;
          btnPublish.innerHTML = `<i data-lucide="send"></i> Publicar Ahora en Facebook`;
          lucide.createIcons();
        }
      });
    }

    // Regeneration button for stories
    const btnRegenStories = document.getElementById('btn-generate-stories');
    if (btnRegenStories) {
      btnRegenStories.addEventListener('click', () => this.fetchStoriesKit());
    }
  }

  // Stories Kit Fetcher
  async fetchStoriesKit() {
    const storiesSection = document.getElementById('stories-kit-workspace');
    const container = document.getElementById('stories-grid-container');
    if (!storiesSection || !container) return;

    storiesSection.classList.remove('hide');
    container.innerHTML = `
      <div class="loading-placeholder">
        <div class="spinner" style="width: 24px; height: 24px; border-width: 2px;"></div>
        <span style="margin-left: 10px;">Redactando Stories Pack...</span>
      </div>
    `;

    try {
      const response = await authFetch('/api/generate-stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carId: this.selectedCarId })
      });

      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Failed to generate stories");

      this.storiesPackage = data.stories || [];
      this.renderStoriesKit();
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="empty-state" style="padding: 10px;"><p>No se pudo generar el Kit de Stories.</p></div>`;
    }
  }

  // Render visual Kit of 5 stories in Studio tab
  renderStoriesKit() {
    const container = document.getElementById('stories-grid-container');
    if (!container) return;

    container.innerHTML = '';

    if (this.storiesPackage.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding: 10px;"><p>No hay stories en el paquete</p></div>`;
      return;
    }

    this.storiesPackage.forEach(story => {
      const card = document.createElement('div');
      card.className = 'story-item-box';

      // Unique ID for text area so we can copy it easily
      const textareaId = `story-text-copy-${story.id}`;

      // Music tag
      const musicSuggestion = story.music_suggestion || 'Música recomendada';

      // Render the card including image preview, music suggest, copy button, and publish story button!
      card.innerHTML = `
        <div class="story-preview-image-container" style="position: relative; border-radius: 8px; overflow: hidden; margin-bottom: 12px; height: 160px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center;">
          <img src="${story.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="Story Preview Image">
          <span style="position: absolute; top: 8px; left: 8px; padding: 4px 8px; font-size: 10px; font-weight: 700; background: rgba(222,111,0,0.85); border-radius: 4px; color: #fff; letter-spacing: 0.05em; text-transform: uppercase;">
            ${story.imageType === 'ai_generated' ? 'Fondo IA ✨' : 'Catálogo 📁'}
          </span>
        </div>
        <div class="story-box-header">
          <span class="story-badge">Story #${story.id}</span>
          <button class="btn btn-xs btn-link" onclick="app.copyTextDirectly('${textareaId}')">
            <i data-lucide="copy" style="width:14px;height:14px"></i> Copiar
          </button>
        </div>
        <p class="story-text-content" id="${textareaId}" style="min-height: 80px; font-size: 0.9em; line-height: 1.4; color: var(--text-main); margin-bottom: 10px;">${story.text}</p>
        <div class="story-sticker-tag" style="margin-bottom: 8px;">
          <i data-lucide="link"></i> Enlace Sticker: <strong>${story.sticker_cta}</strong>
        </div>
        <div class="story-music-tag" style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #a855f7; font-weight: 600; margin-bottom: 15px; background: rgba(168,85,247,0.1); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(168,85,247,0.25);">
          <i data-lucide="music" style="width:13px;height:13px;"></i> <span>${musicSuggestion}</span>
        </div>
        <button class="btn btn-primary btn-sm btn-block btn-publish-story-action" id="btn-pub-story-${story.id}" onclick="app.publishStory(${story.id})" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide-custom">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
          </svg>
          Publicar Story
        </button>
      `;

      container.appendChild(card);
    });

    lucide.createIcons();
  }

  // Publish manual Story directly to Instagram
  async publishStory(storyId) {
    const story = this.storiesPackage.find(s => s.id === storyId);
    if (!story) {
      this.showToast("Error", "No se encontró la Story en el paquete.", "error");
      return;
    }

    const btn = document.getElementById(`btn-pub-story-${storyId}`);
    if (!btn) return;

    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color:#fff"></div> Enviando...`;

    try {
      const response = await authFetch('/api/publish-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyText: story.text,
          stickerCta: story.sticker_cta,
          imageUrl: story.imageUrl,
          imageName: story.imageName,
          musicSuggestion: story.music_suggestion
        })
      });

      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || data.warning || "Fallo en el servidor al publicar");

      this.showToast("¡Historia Publicada!", data.post.simulated 
        ? "Simulación de Story guardada en tu historial con éxito."
        : "Story enviada a Instagram Stories con éxito.", "success");
      
      // Update history
      await this.fetchConfig();
    } catch (err) {
      console.error(err);
      this.showToast("Fallo al Publicar Storie", err.message || "Asegúrate de que tus credenciales de Instagram estén activas.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      lucide.createIcons();
    }
  }

  // Save configurations in Settings Tab
  setupSettingsListeners() {
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnSaveCalendar = document.getElementById('btn-save-calendar');
    const channelSelect = document.getElementById('settings-publisher-channel');

    if (channelSelect) {
      channelSelect.addEventListener('change', () => {
        const group = document.getElementById('n8n-url-group');
        if (channelSelect.value === 'n8n') {
          group.classList.remove('hide');
        } else {
          group.classList.add('hide');
        }
      });
    }

    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', async () => {
        btnSaveSettings.disabled = true;
        btnSaveSettings.innerText = 'Guardando...';

        try {
          const schedulerEnabled = document.getElementById('settings-scheduler-enabled').checked;
          const bgReplacementEnabled = document.getElementById('settings-bg-replacement-enabled').checked;
          const publisherChannel = document.getElementById('settings-publisher-channel').value;
          const n8nWebhookUrl = document.getElementById('settings-n8n-webhook').value.trim();

          const storiesMorning = document.getElementById('settings-stories-morning').value.trim();
          const storiesAfternoon = document.getElementById('settings-stories-afternoon').value.trim();

          const groqKey = document.getElementById('settings-groq-key').value.trim();
          const fbToken = document.getElementById('settings-fb-token').value.trim();
          const fbPageId = document.getElementById('settings-fb-page-id').value.trim();
          const photoroomKey = document.getElementById('settings-photoroom-key').value.trim();
          const supabaseKey = document.getElementById('settings-supabase-key').value.trim();

          const slots = [];
          for (let i = 1; i <= 3; i++) {
            const time = document.getElementById(`slot-${i}-time`).value.trim();
            const theme = parseInt(document.getElementById(`slot-${i}-theme`).value);
            const enabled = document.getElementById(`slot-${i}-enabled`).checked;
            slots.push({ id: `slot${i}`, time, theme, enabled });
          }

          const response = await authFetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scheduler: {
                enabled: schedulerEnabled,
                slots: slots
              },
              storiesScheduler: {
                enabled: true,
                morningTime: storiesMorning,
                afternoonTime: storiesAfternoon
              },
              publisherChannel: publisherChannel,
              n8nWebhookUrl: n8nWebhookUrl,
              bgReplacementEnabled: bgReplacementEnabled,
              apiKeys: {
                groqKey,
                fbToken,
                fbPageId,
                photoroomKey,
                supabaseKey
              }
            })
          });

          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error);

          this.config = data.config;
          this.updateSchedulerBadge();
          this.renderDashboardSlots();
          this.showToast("Ajustes Guardados", "El planificador y las API Keys locales se han guardado con éxito.", "success");
        } catch (err) {
          console.error(err);
          this.showToast("Error", "No se pudieron guardar los ajustes del programador.", "error");
        } finally {
          btnSaveSettings.disabled = false;
          btnSaveSettings.innerText = 'Guardar Horarios y Ajustes';
        }
      });
    }

    if (btnSaveCalendar) {
      btnSaveCalendar.addEventListener('click', async () => {
        btnSaveCalendar.disabled = true;
        btnSaveCalendar.innerText = 'Actualizando...';

        try {
          const promosText = document.getElementById('settings-promotions-list').value;
          const eventsText = document.getElementById('settings-events-list').value;

          const promotions = promosText.split('\n').map(line => line.trim()).filter(line => line !== "");
          const events = eventsText.split('\n').map(line => line.trim()).filter(line => line !== "");

          const response = await authFetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              calendar: { promotions, events }
            })
          });

          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error);

          this.config = data.config;
          this.showToast("Calendario Actualizado", "Los eventos y promociones han sido guardados para el redactor de IA.", "success");
        } catch (err) {
          console.error(err);
          this.showToast("Error", "No se pudo guardar el calendario de promociones.", "error");
        } finally {
          btnSaveCalendar.disabled = false;
          btnSaveCalendar.innerText = 'Actualizar Calendario de Eventos';
        }
      });
    }

    // AI Calendar Generator Button Listener
    const btnGenerateCalendar = document.getElementById('btn-generate-calendar');
    if (btnGenerateCalendar) {
      btnGenerateCalendar.addEventListener('click', async () => {
        btnGenerateCalendar.disabled = true;
        const originalHtml = btnGenerateCalendar.innerHTML;
        btnGenerateCalendar.innerHTML = '<i data-lucide="sparkles" class="anim-spin"></i> Generando...';
        if (window.lucide) window.lucide.createIcons();

        try {
          const response = await authFetch('/api/generate-calendar', {
            method: 'POST'
          });

          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error || "Failed to generate");

          // Populate textareas
          const promosTextarea = document.getElementById('settings-promotions-list');
          const eventsTextarea = document.getElementById('settings-events-list');

          if (promosTextarea) promosTextarea.value = (data.promotions || []).join('\n');
          if (eventsTextarea) eventsTextarea.value = (data.events || []).join('\n');

          // Save automatically to DB
          const saveResponse = await authFetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              calendar: {
                promotions: data.promotions || [],
                events: data.events || []
              }
            })
          });

          const saveData = await saveResponse.json();
          if (!saveResponse.ok || saveData.error) throw new Error(saveData.error);

          this.config = saveData.config;
          this.showToast("Calendario Autogenerado", "Las promociones y festivos locales se han autogenerado con IA y guardado exitosamente.", "success");
        } catch (err) {
          console.error(err);
          this.showToast("Error de Generación", err.message || "No se pudo autogenerar el calendario.", "error");
        } finally {
          btnGenerateCalendar.disabled = false;
          btnGenerateCalendar.innerHTML = originalHtml;
          if (window.lucide) window.lucide.createIcons();
        }
      });
    }
  }

  // Update the 3 stat cards on the Dashboard
  updateStats() {
    const posts = this.config.publishedPosts || [];

    // Posts today: count entries where timestamp is within today (local time)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const postsToday = posts.filter(p => {
      try { return new Date(p.timestamp) >= todayStart && !p.isStory; }
      catch(e) { return false; }
    }).length;

    // Max daily posts from scheduler slots
    const scheduledSlots = (this.config.scheduler && this.config.scheduler.slots)
      ? this.config.scheduler.slots.filter(s => s.enabled).length
      : 3;
    const maxPosts = Math.max(scheduledSlots, 3);

    // Stories today: from storiesPackage (generated in memory) or today's story posts
    const storiesToday = this.storiesPackage.length || posts.filter(p => {
      try { return p.isStory && new Date(p.timestamp) >= todayStart; }
      catch(e) { return false; }
    }).length;

    // Total historic posts (excluding stories)
    const totalPosts = posts.filter(p => !p.isStory).length;

    // Update DOM
    const elToday = document.getElementById('stats-published-today');
    const elStories = document.getElementById('stats-stories-today');
    const elTotal = document.getElementById('stats-total-posts');

    if (elToday) elToday.innerText = `${postsToday} / ${maxPosts}`;
    if (elStories) elStories.innerText = `${storiesToday} / 8`;
    if (elTotal) elTotal.innerText = totalPosts;
  }

  // Dashboard status & slots renderer
  renderDashboardSlots() {
    const container = document.getElementById('dashboard-slots-list');
    if (!container) return;

    if (!this.config.scheduler || !this.config.scheduler.slots || this.config.scheduler.slots.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding: 20px;"><p>No hay slots de automatización configurados.</p></div>`;
      return;
    }

    container.innerHTML = '';
    const themesTitles = {
      1: "Tema 1 - Aeropuertos y Entregas",
      2: "Tema 2 - Promociones y Festivos",
      3: "Tema 3 - Consejos y Narrativa (Storytelling)"
    };

    this.config.scheduler.slots.forEach(slot => {
      const item = document.createElement('div');
      item.className = `slot-item ${slot.enabled && this.config.scheduler.enabled ? 'active' : 'inactive'}`;

      item.innerHTML = `
        <div class="slot-info-block">
          <span class="slot-time-badge">${slot.time}</span>
          <div class="slot-theme-info">
            <strong>${themesTitles[slot.theme] || "Tema de publicación"}</strong>
            <span>${slot.enabled ? 'Publicación automática activa' : 'Slot pausado'}</span>
          </div>
        </div>
        <div class="status-indicator-dot"></div>
      `;

      container.appendChild(item);
    });
  }

  // Dashboard recent published posts
  renderDashboardRecentPosts() {
    const container = document.getElementById('dashboard-recent-posts');
    if (!container) return;

    const posts = this.config.publishedPosts || [];

    if (posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 30px;">
          <i data-lucide="image-off"></i>
          <p>No se registran publicaciones recientes.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    container.innerHTML = '';
    
    // Show only the last 3 published posts on dashboard home
    const latestPosts = posts.slice(0, 3);

    latestPosts.forEach(post => {
      const card = document.createElement('div');
      card.className = 'post-history-card';

      const formattedDate = new Date(post.timestamp).toLocaleDateString('es-ES', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === post.carId);
      const carName = carDef ? carDef.name : "2S1M Premium";

      card.innerHTML = `
        <div class="history-card-img-wrapper">
          <img src="${post.imageUrl}" alt="${carName}" loading="lazy">
          <span class="history-card-badge ${post.simulated ? 'simulated' : 'real'}">
            ${post.simulated ? 'Simulación' : 'Facebook Page'}
          </span>
        </div>
        <div class="history-card-body">
          <span class="history-card-date"><i data-lucide="calendar"></i> ${formattedDate} - ${carName}</span>
          <p class="history-card-text">${post.caption}</p>
        </div>
        <div class="history-card-footer">
          <a href="${post.facebookUrl}" target="_blank" class="btn-link-action">
            <i data-lucide="external-link" style="width:14px;height:14px"></i> Ver Publicación
          </a>
        </div>
      `;

      container.appendChild(card);
    });

    lucide.createIcons();
  }

  // Render History Tab full table list
  renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    const posts = this.config.publishedPosts || [];

    if (posts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty">No hay registros de publicaciones.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';
    
    posts.forEach(post => {
      const tr = document.createElement('tr');

      const dateStr = new Date(post.timestamp).toLocaleString('es-ES', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const carDef = CAR_CATALOG_SCHEMES.find(c => c.id === post.carId);
      const carName = carDef ? carDef.name : "Nuestra Flota";

      tr.innerHTML = `
        <td><strong>${dateStr}</strong></td>
        <td>
          <div class="table-img-cell">
            <img src="${post.imageUrl}" class="table-img-thumb" alt="${carName}" onclick="window.open(this.src)">
            <div class="table-car-details">
              <strong>${carName}</strong>
              <span>${post.imageName}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="type-pill">${post.triggeredBy ? 'Automatic' : 'Manual'}</span>
        </td>
        <td>
          <div class="table-caption-cell" title="${post.caption}">${post.caption}</div>
        </td>
        <td>
          <a href="${post.facebookUrl}" target="_blank" class="btn-link-action">
            <i data-lucide="external-link" style="width: 14px; height: 14px"></i> Visitar
          </a>
        </td>
        <td>
          <span class="status-pill ${post.simulated ? 'simulated' : 'real'}">
            ${post.simulated ? 'Simulado' : 'Publicado'}
          </span>
        </td>
      `;

      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  // Render Telemetry Statistics & Alert Center
  renderTelemetry() {
    const stats = this.config.usageStats || {
      groq: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      photoroom: { requests: 0, success: 0, failed: 0 },
      supabase: { reads: 0, writes: 0, storageDownloads: 0, storageUploads: 0 },
      facebook: { attempts: 0, success: 0, failed: 0 },
      n8n: { attempts: 0, success: 0, failed: 0 }
    };
    const thresholds = this.config.usageAlertThresholds || {
      groqTokenLimit: 500000,
      photoroomRequestLimit: 100,
      supabaseStorageLimit: 200,
      emailAlertsEnabled: false,
      alertEmail: ''
    };

    // Update Groq DOM
    document.getElementById('stat-groq-requests').innerText = stats.groq.requests;
    document.getElementById('stat-groq-prompt-tokens').innerText = stats.groq.promptTokens.toLocaleString();
    document.getElementById('stat-groq-completion-tokens').innerText = stats.groq.completionTokens.toLocaleString();
    document.getElementById('stat-groq-total-tokens').innerText = stats.groq.totalTokens.toLocaleString();
    
    // Update Photoroom DOM
    document.getElementById('stat-photoroom-requests').innerText = stats.photoroom.requests;
    document.getElementById('stat-photoroom-success').innerText = stats.photoroom.success;
    document.getElementById('stat-photoroom-failed').innerText = stats.photoroom.failed;
    document.getElementById('stat-photoroom-cost').innerText = `${stats.photoroom.success} créditos`;
    
    // Update Supabase DOM
    document.getElementById('stat-supabase-reads').innerText = stats.supabase.reads;
    document.getElementById('stat-supabase-writes').innerText = stats.supabase.writes;
    document.getElementById('stat-supabase-downloads').innerText = stats.supabase.storageDownloads;
    document.getElementById('stat-supabase-uploads').innerText = stats.supabase.storageUploads;
    
    // Update FB / N8N DOM
    document.getElementById('stat-pub-fb-attempts').innerText = stats.facebook.attempts;
    document.getElementById('stat-pub-fb-success').innerText = stats.facebook.success;
    document.getElementById('stat-pub-n8n-attempts').innerText = stats.n8n.attempts;
    document.getElementById('stat-pub-n8n-success').innerText = stats.n8n.success;

    // Threshold values inputs
    document.getElementById('threshold-groq-tokens').value = thresholds.groqTokenLimit;
    document.getElementById('threshold-photoroom-requests').value = thresholds.photoroomRequestLimit;
    document.getElementById('threshold-supabase-storage').value = thresholds.supabaseStorageLimit;

    // Calculate Percentages
    const groqPct = Math.min(100, Math.round((stats.groq.totalTokens / (thresholds.groqTokenLimit || 500000)) * 100));
    const photoroomPct = Math.min(100, Math.round((stats.photoroom.requests / (thresholds.photoroomRequestLimit || 100)) * 100));
    const supabasePct = Math.min(100, Math.round((stats.supabase.storageUploads / (thresholds.supabaseStorageLimit || 200)) * 100));

    // Update Progress Bars
    document.getElementById('stat-groq-progress-bar').style.width = `${groqPct}%`;
    document.getElementById('stat-groq-percentage-text').innerText = `${groqPct}% del límite sugerido`;
    
    document.getElementById('stat-photoroom-progress-bar').style.width = `${photoroomPct}%`;
    document.getElementById('stat-photoroom-percentage-text').innerText = `${photoroomPct}% del límite`;

    document.getElementById('stat-supabase-progress-bar').style.width = `${supabasePct}%`;
    document.getElementById('stat-supabase-percentage-text').innerText = `${supabasePct}% del límite de almacenamiento`;

    // Render Alert Badges
    const statusBox = document.getElementById('alerts-status-box');
    if (statusBox) {
      statusBox.innerHTML = '';

      // Groq Alert
      let groqClass = 'green';
      let groqIcon = 'check-circle';
      let groqText = 'Groq Tokens: Consumo óptimo y seguro.';
      if (groqPct >= 90) {
        groqClass = 'red';
        groqIcon = 'alert-triangle';
        groqText = 'Groq Tokens: ¡Crítico! Superado el 90% del límite.';
      } else if (groqPct >= 70) {
        groqClass = 'yellow';
        groqIcon = 'info';
        groqText = 'Groq Tokens: Advertencia. Más del 70% consumido.';
      }

      // Photoroom Alert
      let photoClass = 'green';
      let photoIcon = 'check-circle';
      let photoText = 'Photoroom: Solicitudes de fondos estables.';
      if (photoroomPct >= 90) {
        photoClass = 'red';
        photoIcon = 'alert-triangle';
        photoText = 'Photoroom: ¡Crítico! Cupo diario casi agotado.';
      } else if (photoroomPct >= 70) {
        photoClass = 'yellow';
        photoIcon = 'info';
        photoText = 'Photoroom: Advertencia. Más del 70% de créditos diarios usados.';
      }

      // Supabase Alert
      let subClass = 'green';
      let subIcon = 'check-circle';
      let subText = 'Supabase Storage: Almacenamiento libre.';
      if (supabasePct >= 90) {
        subClass = 'red';
        subIcon = 'alert-triangle';
        subText = 'Supabase Storage: ¡Crítico! Límite de subidas de fotos superado.';
      } else if (supabasePct >= 70) {
        subClass = 'yellow';
        subIcon = 'info';
        subText = 'Supabase Storage: Advertencia. Más del 70% del límite subido.';
      }

      statusBox.innerHTML = `
        <div class="telemetry-alert-badge ${groqClass}">
          <i data-lucide="${groqIcon}"></i>
          <span>${groqText}</span>
        </div>
        <div class="telemetry-alert-badge ${photoClass}">
          <i data-lucide="${photoIcon}"></i>
          <span>${photoText}</span>
        </div>
        <div class="telemetry-alert-badge ${subClass}">
          <i data-lucide="${subIcon}"></i>
          <span>${subText}</span>
        </div>
      `;

      lucide.createIcons();
    }
  }

  // Setup Telemetry Tab Listeners
  setupTelemetryListeners() {
    const btnSaveThresholds = document.getElementById('btn-save-thresholds');
    const btnResetTelemetry = document.getElementById('btn-reset-telemetry');

    if (btnSaveThresholds) {
      btnSaveThresholds.addEventListener('click', async () => {
        btnSaveThresholds.disabled = true;
        btnSaveThresholds.innerText = 'Guardando...';

        try {
          const groqTokenLimit = parseInt(document.getElementById('threshold-groq-tokens').value) || 500000;
          const photoroomRequestLimit = parseInt(document.getElementById('threshold-photoroom-requests').value) || 100;
          const supabaseStorageLimit = parseInt(document.getElementById('threshold-supabase-storage').value) || 200;

          const response = await authFetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              usageAlertThresholds: {
                groqTokenLimit,
                photoroomRequestLimit,
                supabaseStorageLimit
              }
            })
          });

          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error || "No se pudo guardar");

          this.config = data.config;
          this.renderTelemetry();
          this.showToast("Límites Actualizados", "Los nuevos umbrales de alertas se han guardado con éxito.", "success");
        } catch (err) {
          console.error(err);
          this.showToast("Error", "No se pudieron guardar los límites de consumo.", "error");
        } finally {
          btnSaveThresholds.disabled = false;
          btnSaveThresholds.innerText = 'Guardar Límites de Alertas';
        }
      });
    }

    if (btnResetTelemetry) {
      btnResetTelemetry.addEventListener('click', async () => {
        if (!confirm("¿Estás seguro de que deseas reiniciar todas las estadísticas de consumo de tokens y solicitudes? Esto pondrá los contadores a cero.")) {
          return;
        }

        btnResetTelemetry.disabled = true;
        btnResetTelemetry.innerText = 'Reiniciando...';

        try {
          const response = await authFetch('/api/usage/reset', {
            method: 'POST'
          });

          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error || "No se pudo reiniciar");

          this.config = data.config;
          this.renderTelemetry();
          this.showToast("Estadísticas Reiniciadas", "Los contadores de consumo se han restablecido a cero con éxito.", "success");
        } catch (err) {
          console.error(err);
          this.showToast("Error", "No se pudieron reiniciar las estadísticas.", "error");
        } finally {
          btnResetTelemetry.disabled = false;
          btnResetTelemetry.innerHTML = '<i data-lucide="trash-2"></i> Reiniciar Estadísticas';
          lucide.createIcons();
        }
      });
    }
  }

  // Translation Helpers
  t(key) {
    return this.TRANSLATIONS[this.currentLang]?.[key] || key;
  }

  setupLanguageListener() {
    const selector = document.getElementById('lang-selector');
    if (selector) {
      selector.value = this.currentLang;
      selector.addEventListener('change', (e) => {
        this.currentLang = e.target.value;
        localStorage.setItem('2s1m_lang', this.currentLang);
        this.applyTranslations();
      });
    }
  }

  applyTranslations() {
    const lang = this.currentLang;
    
    // Set selector value
    const selector = document.getElementById('lang-selector');
    if (selector) selector.value = lang;
    
    // 1. Translate Sidebar Navigation Buttons
    const navDashboard = document.querySelector('.nav-btn[data-tab="dashboard"]');
    const navCatalog = document.querySelector('.nav-btn[data-tab="catalog"]');
    const navStudio = document.querySelector('.nav-btn[data-tab="studio"]');
    const navHistory = document.querySelector('.nav-btn[data-tab="history"]');
    const navTelemetry = document.querySelector('.nav-btn[data-tab="telemetry"]');
    const navSettings = document.querySelector('.nav-btn[data-tab="settings"]');

    if (navDashboard) navDashboard.innerHTML = `<i data-lucide="layout-dashboard"></i> ${this.t('nav_dashboard')}`;
    if (navCatalog) navCatalog.innerHTML = `<i data-lucide="image"></i> ${this.t('nav_catalog')}`;
    if (navStudio) navStudio.innerHTML = `<i data-lucide="sparkles"></i> ${this.t('nav_studio')}`;
    if (navHistory) navHistory.innerHTML = `<i data-lucide="history"></i> ${this.t('nav_history')}`;
    if (navTelemetry) navTelemetry.innerHTML = `<i data-lucide="activity"></i> ${this.t('nav_telemetry')}`;
    if (navSettings) navSettings.innerHTML = `<i data-lucide="settings"></i> ${this.t('nav_settings')}`;

    // 2. Translate Page Title if applicable
    const activeTab = document.querySelector('.nav-btn.active');
    if (activeTab) {
      const tabId = activeTab.getAttribute('data-tab');
      const pageTitleEl = document.getElementById('page-title');
      if (pageTitleEl) pageTitleEl.innerText = this.t(`title_${tabId}`);
    }

    // 3. Translate Welcome Header
    const welcome = document.querySelector('.welcome-text');
    if (welcome) welcome.innerText = this.t('header_welcome');

    // 4. Translate Stats Cards (Dashboard)
    const statTitle1 = document.querySelector('.stat-card:nth-child(1) .stat-title');
    if (statTitle1) statTitle1.innerText = this.t('stat_posts_today');
    const statTitle2 = document.querySelector('.stat-card:nth-child(2) .stat-title');
    if (statTitle2) statTitle2.innerText = this.t('stat_stories_today');
    const statTitle3 = document.querySelector('.stat-card:nth-child(3) .stat-title');
    if (statTitle3) statTitle3.innerText = this.t('stat_total_posts');
    
    // 5. Translate Dashboard Section Titles
    const titleSlots = document.querySelector('#tab-dashboard .content-layout-left .card-title');
    if (titleSlots) titleSlots.innerHTML = `<i data-lucide="calendar"></i> ${this.t('dash_title_slots')}`;
    
    const titleQuickCard = document.querySelector('#tab-dashboard .content-layout-right .content-card:nth-child(1)');
    const titleQuick = titleQuickCard ? titleQuickCard.querySelector('.card-title') : null;
    if (titleQuick) titleQuick.innerHTML = `<i data-lucide="zap"></i> ${this.t('dash_title_quick')}`;
    
    const titleStatusCard = document.querySelector('#tab-dashboard .content-layout-right .content-card:nth-child(2)');
    const titleStatus = titleStatusCard ? titleStatusCard.querySelector('.card-title') : null;
    if (titleStatus) titleStatus.innerHTML = `<i data-lucide="activity"></i> ${this.t('dash_title_status')}`;
    
    // Quick action buttons text
    const actBtn1 = document.querySelector('.action-btn[onclick*="studio"] span');
    if (actBtn1) actBtn1.innerText = this.t('quick_btn_studio');
    const actBtn2 = document.querySelector('.action-btn[onclick*="catalog"] span');
    if (actBtn2) actBtn2.innerText = this.t('quick_btn_catalog');
    const actBtn3 = document.querySelector('.action-btn[onclick*="history"] span');
    if (actBtn3) actBtn3.innerText = this.t('quick_btn_history');
    const actBtn4 = document.querySelector('.action-btn[onclick*="settings"] span');
    if (actBtn4) actBtn4.innerText = this.t('quick_btn_settings');

    // 6. Translate Catalog Instructions & Headers
    const catDesc = document.querySelector('.catalog-instructions');
    if (catDesc) catDesc.innerHTML = this.t('catalog_instructions_html');

    // 7. Translate Telemetry & Settings headers
    const telemetryAlertTitle = document.querySelector('.alert-system-card .card-title');
    if (telemetryAlertTitle) telemetryAlertTitle.innerHTML = `<i data-lucide="bell"></i> ${this.t('tel_alerts_title')}`;
    
    const telemetryThreshCard = document.querySelector('#tab-telemetry .content-card:nth-child(3)');
    const telemetryThreshTitle = telemetryThreshCard ? telemetryThreshCard.querySelector('.card-title') : null;
    if (telemetryThreshTitle) telemetryThreshTitle.innerHTML = `<i data-lucide="sliders"></i> ${this.t('tel_limits_title')}`;
    
    const settingsAutoCard = document.querySelector('#tab-settings .content-card:nth-child(1)');
    const settingsAutoTitle = settingsAutoCard ? settingsAutoCard.querySelector('.card-title') : null;
    if (settingsAutoTitle) settingsAutoTitle.innerHTML = `<i data-lucide="sliders"></i> ${this.t('set_auto_title')}`;
    
    const settingsCalCard = document.querySelector('#tab-settings .content-card:nth-child(2)');
    const settingsCalTitle = settingsCalCard ? settingsCalCard.querySelector('.card-title') : null;
    if (settingsCalTitle) settingsCalTitle.innerHTML = `<i data-lucide="calendar-days"></i> ${this.t('set_cal_title')}`;

    // Re-render components to apply translation on dynamic items
    if (window.lucide) window.lucide.createIcons();
    this.renderDashboardRecentPosts();
    this.renderDashboardSlots();
    
    const telemetryTab = document.getElementById('tab-telemetry');
    if (telemetryTab && !telemetryTab.classList.contains('hide')) {
      this.renderTelemetry();
    }
  }

  // -------------------------------------------------------------
  // CLIENT HELPER UTILITIES
  // -------------------------------------------------------------

  // Copy to clipboard from visual textarea
  copyToClipboard(elementId) {
    const input = document.getElementById(elementId);
    if (!input) return;

    input.select();
    input.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(input.value)
      .then(() => {
        this.showToast("Copiado", "Texto copiado al portapapeles con éxito.", "success");
      })
      .catch(err => {
        this.showToast("Error", "No se pudo copiar el texto.", "error");
      });
  }

  // Copy plain text directly from element text content
  copyTextDirectly(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    navigator.clipboard.writeText(el.innerText)
      .then(() => {
        this.showToast("Copiado", "¡Texto de Story copiado al portapapeles!", "success");
        // Count copy as visual story today stat
      })
      .catch(err => {
        this.showToast("Error", "No se pudo copiar el texto.", "error");
      });
  }

  // Floating Toast Notifications System
  showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';

    toast.innerHTML = `
      <div class="toast-icon">
        <i data-lucide="${icon}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close"><i data-lucide="x"></i></button>
    `;

    // Handle close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);
    lucide.createIcons();

    // Auto-remove after 4.5 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }

  // Listeners for error logs tab
  setupErrorListeners() {
    const btnClearErrors = document.getElementById('btn-clear-errors');
    if (btnClearErrors) {
      btnClearErrors.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro de que deseas limpiar el registro completo de fallos técnicos?')) return;
        
        btnClearErrors.disabled = true;
        btnClearErrors.innerText = 'Limpiando...';
        
        try {
          const response = await authFetch('/api/errors/clear', { method: 'POST' });
          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error || 'Fallo al limpiar');
          
          this.showToast('Registro Limpiado', 'Los fallos técnicos se han restablecido.', 'success');
          this.renderErrorLogs();
        } catch (err) {
          console.error(err);
          this.showToast('Error', 'No se pudo limpiar el registro de errores.', 'error');
        } finally {
          btnClearErrors.disabled = false;
          btnClearErrors.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Limpiar Registro';
          lucide.createIcons();
        }
      });
    }
  }

  // Render technical error logs in DOM
  async renderErrorLogs() {
    const container = document.getElementById('error-logs-container');
    if (!container) return;

    try {
      const response = await authFetch('/api/errors');
      if (!response.ok) throw new Error('Could not fetch error logs');
      const data = await response.json();
      const errors = data.errors || [];

      if (errors.length === 0) {
        container.innerHTML = `
          <div class="no-data-placeholder" style="text-align: center; padding: 48px 24px; color: var(--text-muted);">
            <i data-lucide="check-circle" style="color: #22c55e; width: 44px; height: 44px; margin-bottom: 12px;"></i>
            <h3 style="color: var(--text-primary); font-size: 16px; margin-bottom: 4px;">¡Todo marcha de maravilla!</h3>
            <p style="font-size: 13px;">No se han registrado fallos técnicos ni alertas de error en el sistema.</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      let html = '';
      errors.forEach(err => {
        const dateStr = new Date(err.timestamp).toLocaleString('es-ES', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        const detailsBtnHtml = err.details 
          ? `<button class="error-btn-expand" onclick="this.nextElementSibling.classList.toggle('show'); this.querySelector('span').innerText = this.nextElementSibling.classList.contains('show') ? 'Ocultar Detalles' : 'Ver Detalles Técnicos'">
               <i data-lucide="terminal" style="width: 12px; height: 12px;"></i> <span>Ver Detalles Técnicos</span>
             </button>
             <div class="error-raw-box">${err.details}</div>`
          : '';

        html += `
          <div class="error-card">
            <div class="error-header-row">
              <span class="error-type-tag">${err.type}</span>
              <span class="error-time-str">${dateStr}</span>
            </div>
            <div class="error-msg-text">${err.message}</div>
            ${detailsBtnHtml}
          </div>
        `;
      });

      container.innerHTML = html;
      lucide.createIcons();
    } catch (err) {
      console.error(err);
      container.innerHTML = `
        <div class="alert error" style="display: flex; gap: 10px; padding: 12px; border-radius: 8px;">
          <i data-lucide="alert-octagon"></i> Error al cargar el registro de fallos técnicos.
        </div>
      `;
      lucide.createIcons();
    }
  }
}

// Instantiate App locally
const app = new AutoPublisherApp();
// Expose global scope for onclick calls
window.app = app;
