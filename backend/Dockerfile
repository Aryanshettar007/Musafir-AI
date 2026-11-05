# Cloud Run image for the API. Build context is backend/.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# ffmpeg-static ships the ffmpeg binary, so no system ffmpeg is needed.
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
# Cloud Run sets PORT (8080); the server reads it from the environment.
CMD ["node", "dist/index.js"]
