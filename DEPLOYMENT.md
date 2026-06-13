# Despliegue de Credenza

## Servicios públicos

- Backend Node: `https://credenza.onrender.com`
- Python AI: `https://credenza-1.onrender.com`
- Frontend Angular: `https://credenza-tau.vercel.app`
- Supabase: configurado mediante `DATABASE_URL`

## Render: backend Node

Configura estas variables en el servicio `credenza`:

```env
DATABASE_URL=postgresql://...
AI_SERVICE_URL=https://credenza-1.onrender.com
JWT_SECRET=una-clave-larga-y-aleatoria
FRONTEND_URL=https://credenza-tau.vercel.app
```

Usa:

```text
Build Command: npm install
Start Command: npm run start:backend
Health Check Path: /health
```

## Render: Python AI

Usa:

```text
Root Directory: ai-service
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

## Vercel: Angular

El repositorio incluye `vercel.json`. La URL predeterminada del backend es
`https://credenza.onrender.com`.

Opcionalmente, agrega esta variable para sobrescribirla durante el build:

```env
API_URL=https://credenza.onrender.com
```

La URL final de Vercel es `https://credenza-tau.vercel.app` y debe estar
configurada como `FRONTEND_URL` en el backend de Render.

Mientras `FRONTEND_URL` no esté configurada, el backend solo acepta solicitudes
del desarrollo local. Esta variable debe contener únicamente el origen, sin
rutas adicionales ni `/` al final.
