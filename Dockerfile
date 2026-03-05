# ===== Etapa 1: Build do Frontend React =====
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Argumentos de build injetados pelo Easypanel (via aba Ambiente)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_BASE

# Passando para o ENV para o Vite capturar e injetar no build final
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

# ===== Etapa 2: Nginx servindo o estático =====
FROM nginx:alpine

# Copia do build
COPY --from=build /app/dist /usr/share/nginx/html

# Configuração que resolve rota SPA (refresh sem quebrar)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
