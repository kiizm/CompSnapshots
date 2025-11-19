# Use Playwright base image (includes Node + browsers)
FROM mcr.microsoft.com/playwright:latest

# Create app directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install

# Copy backend source
COPY backend ./

# Build TypeScript
RUN npm run build

# Environment
ENV NODE_ENV=production

# Render will set PORT, but default to 4000
ENV PORT=4000

# Expose port (for local runs)
EXPOSE 4000

# Start server
CMD ["node", "dist/index.js"]
