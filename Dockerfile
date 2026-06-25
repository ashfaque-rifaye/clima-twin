# --- stage 1: build the frontend ---
FROM node:22-slim AS fe
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_BASE=""
RUN VITE_API_BASE="$VITE_API_BASE" npm run build

# --- stage 2: backend + static frontend, served by one Cloud Run service ---
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=fe /fe/dist ./static
ENV PORT=8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
