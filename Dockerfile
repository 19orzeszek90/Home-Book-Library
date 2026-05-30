
# Stage 1: Build the React frontend
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Create the production image
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.js scraper-service.js ./

# Create storage and upload directories and set permissions
RUN mkdir -p /app/storage/covers /app/uploads && \
    chown -R node:node /app/storage /app/uploads

USER node

EXPOSE 3000

CMD ["node", "server.js"]
