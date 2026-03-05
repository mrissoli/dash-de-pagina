# ===== Etapa 1: Build do Frontend React =====
FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY package*.json ./
RUN npm install

COPY . .

# Build sem variáveis VITE_ — usaremos runtime config
ENV VITE_API_BASE=/api
RUN npm run build

# ===== Etapa 2: Backend Node.js + Frontend Estático =====
FROM node:20-alpine

WORKDIR /app

# Copia e instala dependências do backend
COPY server/package*.json ./
RUN npm install --omit=dev

# Copia código do backend
COPY server/ .

# Copia o frontend buildado para a pasta public do backend
COPY --from=frontend-build /frontend/dist ./public

EXPOSE 3001

CMD ["node", "index.js"]
