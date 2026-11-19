# Build stage: typecheck + Vite build (client and server bundle)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: Node server, no node_modules (the bundle only imports node: builtins)
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
ENV LINKBOARD_DATA_DIR=/data PORT=8080
EXPOSE 8080
CMD ["node", "dist-server/main.js"]
