# EVRY Backend

API REST para EVRY: app de fitness inclusiva con integración de ciclo hormonal y recomendaciones adaptativas.

## Stack

- **NestJS 10** + TypeScript
- **PostgreSQL** + **Prisma** ORM
- **JWT** (access + refresh con rotación, refresh en cookie httpOnly)
- **class-validator** para DTOs
- **Swagger** en `/docs`

## Módulos

| Módulo      | Responsabilidad                                                          |
|-------------|--------------------------------------------------------------------------|
| `auth`      | Registro, login, refresh, logout, JWT strategy                           |
| `users`     | Perfil, metas, sexo biológico, preferencias de ciclo                     |
| `exercises` | Librería global + ejercicios personalizados, tags inclusivos             |
| `workouts`  | Sesiones, sets, finalización, agregación de stats por ejercicio          |
| `cycle`     | Tracking menstrual, predicción de fase, hints de entrenamiento           |
| `adaptive`  | Recomendación de peso/reps con reglas + modulación por fase + readiness  |
| `progress`  | Resumen 30 días, historial por ejercicio, 1RM estimado                   |
| `readiness` | Check-in pre-entreno (sueño, estrés, soreness, motivación) → score 0-100 |

## Setup

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev
```

API en `http://localhost:4000/api`. Swagger en `http://localhost:4000/docs`.

## Catálogo de ejercicios y medios locales

El catálogo incluye 1.324 ejercicios importados desde el dataset vendorizado en
`prisma/seed-data/exercises.json`. Sus miniaturas y animaciones de 180×180 se
sirven desde este backend en `/media/exercises/images/*` y
`/media/exercises/videos/*`; no se requiere un CDN externo.

```bash
npm run exercises:verify
npm run exercises:import
npm run exercises:check-import
```

Configura `MEDIA_BASE_URL` con el origen público del backend cuando la API y el
frontend no compartan host. Los datos e instrucciones mantienen el aviso MIT
del dataset. Las imágenes y GIFs son material de Gym visual: conserva
`© Gym visual — https://gymvisual.com/`, la resolución 180×180 y revisa
`NOTICE-MEDIA.md` antes de redistribuirlos.

## Endpoints clave

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/users/me
PATCH  /api/users/me

GET    /api/exercises?muscleGroup=&q=&tag=&equipment=&category=
POST   /api/exercises
DELETE /api/exercises/:id

POST   /api/workouts
GET    /api/workouts
GET    /api/workouts/:id
POST   /api/workouts/:id/finish
POST   /api/workouts/:id/sets
PATCH  /api/workouts/sets/:setId
DELETE /api/workouts/sets/:setId

POST   /api/cycle/entries
GET    /api/cycle/entries?from=&to=
GET    /api/cycle/today

GET    /api/adaptive/recommend/:exerciseId

GET    /api/progress/overview
GET    /api/progress/exercise/:id

POST   /api/readiness/checkin
GET    /api/readiness/latest
```

## Lógica de fase del ciclo

Predicción basada en mediana de los últimos 6 inicios de período. Fallback al promedio del usuario (`avgCycleLen`, default 28 días).

| Fase        | Días (cycle 28) | Hint                                       | intensityCap | volumeCap |
|-------------|-----------------|--------------------------------------------|--------------|-----------|
| MENSTRUAL   | 1–5             | Movilidad, técnica, RPE ≤ 7                | 0.85         | 0.85      |
| FOLLICULAR  | 6–13            | Fuerza alta, PRs viables                   | 1.05         | 1.0       |
| OVULATION   | 14 (±1)         | Pico neuromuscular, compounds pesados      | 1.05         | 1.0       |
| LUTEAL      | 15–28           | Volumen moderado, evita fallar reps        | 0.95         | 0.9       |

Modular: usuarios masculinos no ven nada de esto. Usuarias deben opt-in con `trackCycle=true`.

## Motor adaptativo

Reglas (no ML en MVP):
1. **PROGRESS** si última sesión RPE ≤ 8 con reps cumplidas → +2.5 kg compound / +1 kg isolation.
2. **DELOAD** si dos sesiones estancadas con RPE ≥ 9 → −10%.
3. **HOLD** por defecto.
4. Modulación por fase: multiplica peso objetivo por `intensityCap`.
5. Override por readiness: si score < 50 cancela PROGRESS.

## Próximos pasos

- Tests e2e con Jest + Supertest.
- Rate limit (`@nestjs/throttler`).
- OAuth Google + Apple.
- Webhooks Apple Health / Garmin para HRV → readiness.
- Workouts plantilla y programas multi-semana.
