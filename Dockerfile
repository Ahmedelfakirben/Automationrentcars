# ========================================================
# PRODUCTION DOCKERFILE - 2S1M AUTO-PUBLISHER FOR COOLIFY
# ========================================================
FROM node:22-slim AS base

WORKDIR /app

# Copiar descriptores de dependencias
COPY package*.json ./

# Instalar dependencias de producción (omitir dev)
RUN npm ci --omit=dev

# Copiar todo el código de la aplicación al contenedor
COPY . .

# Crear la carpeta de publicados local si no existe para evitar fallos de montaje
RUN mkdir -p public/published

# Exponer el puerto por el que escucha Express
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS=--experimental-websocket

# Comando para arrancar el servidor
CMD ["npm", "start"]
