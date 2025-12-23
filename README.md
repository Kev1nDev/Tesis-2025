# Tesis-2025 — App móvil (Expo) + Backend (Node)

Base de trabajo para una aplicación móvil (React Native con Expo) que consume una API en la nube para **descripción del entorno**. Incluye un backend local “stub” para desarrollo y pruebas end-to-end.

## Requisitos

- Windows 10/11
- Node.js (recomendado: LTS)
- Git
- Teléfono en la **misma red Wi‑Fi** que el PC
  - iOS/Android con **Expo Go** instalado

## Estructura del repositorio

- `mobile/`: app móvil (Expo + TypeScript)
- `backend/`: API local (Node/Express) para desarrollo
- `run-dev.ps1` / `run-dev.cmd`: script para levantar **backend + Expo** automáticamente

## Instalación

Desde la raíz del repo:

```powershell
npm --prefix backend install
npm --prefix mobile install
```

> Nota: el repositorio ignora archivos sensibles (`.env`, etc.). Ver `.gitignore`.

## Configuración (URL del backend)

La app móvil usa la variable `EXPO_PUBLIC_API_BASE_URL`.

1) Crea/edita el archivo `mobile/.env` con la IP local de tu PC:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://TU_IP:3001
```

2) Obtén tu IP con `ipconfig` (IPv4 de Wi‑Fi). Ejemplo:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.108:3001
```

> Importante: en el teléfono **NO** uses `localhost`.

## Ejecutar (recomendado: un solo comando)

Opción más simple:

- Doble click en `run-dev.cmd`

Esto abre 2 ventanas:
- Backend (dev watcher)
- Expo (Metro)

### Puertos

- Backend: por defecto intenta `3001`. Si está ocupado, usa `3002`, `3003`, etc. y actualiza `mobile/.env` automáticamente.
- Expo: corre en `8083` para evitar prompts si `8081` está ocupado.

## Ejecutar (manual)

### 1) Backend

En una terminal:

```powershell
npm --prefix backend run dev
```

Verificación rápida:

- En el PC: `http://localhost:3000/health`
- En el PC: `http://localhost:3001/health`
- En el teléfono: `http://TU_IP:3001/health`

### 2) App móvil (Expo)

En otra terminal:

```powershell
npm --prefix mobile run start -- --clear
```

- Escanea el QR con Expo Go
- Si Expo pregunta por cambiar de puerto (porque `8081` está ocupado), responde **yes**.

## Qué hace la base actual

### App móvil

- Pantalla principal “Descripción del entorno (Cloud)”
- Solicitud de permisos: cámara, micrófono y ubicación
- Selección de modo: `balanced | accurate | fast`
- Envía un request a `POST /describe` y muestra:
  - descripción
  - latencia medida
  - confianza (si la API la devuelve)
- Navegación por gestos (swipe izquierda/derecha) entre módulos

#### Implementación: “Descripción del entorno” (cámara → IA)

En la pestaña **Historial** se implementó el flujo end-to-end:

1) Se solicita permiso de cámara (Expo).
2) Se abre la cámara, se captura una foto (tamaño reducido) y se guarda en base64.
3) Se envía a la API `POST /describe` con:
  - `imageBase64` + `imageMimeType`
  - `mode` (`balanced | fast | accurate`)
  - `prompt` (instrucción adicional para el modelo)
  - `sensors.capturedAtIso` (trazabilidad para investigación)
4) Se muestra:
  - descripción retornada por el backend
  - latencia total medida en el móvil
  - tiempo de backend (`debug.timing.durationMs`, cuando está disponible)
  - confianza y modelo (si la API lo devuelve)

### Backend (Gemini + fallback stub)

Endpoints:
- `GET /health`: prueba de vida
- `POST /describe`:
  - Si hay `GEMINI_API_KEY` y llega una imagen, usa **Gemini** server-side y devuelve una descripción estructurada.
  - Si falta la key, no llega imagen, o Gemini falla/expira, hace fallback a **stub** (simulación) para no romper el pipeline.
  - Incluye métricas de tiempo en `debug.timing` (útil para la tesis).

#### Configuración de Gemini (solo backend)

1) Crea `backend/.env` (NO se commitea) usando como referencia `backend/.env.example`.

Ejemplo:

```dotenv
GEMINI_API_KEY=TU_API_KEY
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=25000
PORT=3001
```

2) Inicia el backend y verifica en consola que la key esté “OK”.

## Troubleshooting

### “Port 8081 is being used…”

- Acepta usar otro puerto (yes) o ejecuta `run-dev.cmd` (Expo en 8083).

### “Error: listen EADDRINUSE 0.0.0.0:3000”

### “Error: listen EADDRINUSE 0.0.0.0:3001”

- Ya hay algo usando el puerto 3001.
- Solución rápida: usa `run-dev.cmd` (elige un puerto libre automáticamente y actualiza `mobile/.env`).

### “Network request failed” en iOS

Causas típicas:
- La app apunta a `localhost` en vez de `http://TU_IP:PUERTO`.
- El backend no está corriendo.
- Firewall bloquea el puerto.

Checklist:
1) En el iPhone abre Safari y entra a `http://TU_IP:PUERTO/health`.
2) Si Safari no abre, revisa Firewall / misma Wi‑Fi.
3) Si Safari abre pero la app falla, usa el script `run-dev.cmd` y reinicia Expo.

## Próximos pasos sugeridos

- Historial persistente de resultados (storage) con métricas para análisis
- Envío de audio (micrófono) para enriquecer contexto
- Optimización de latencia (tamaño imagen/prompt, warm-up, reintentos controlados)

---

> Este README es una guía de desarrollo local. Para producción, se recomienda API sobre HTTPS y builds firmados.
