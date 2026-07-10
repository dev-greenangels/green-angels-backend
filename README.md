# Green Angels API (NestJS)

Бекенд для [green-angels-shop](../green-angels-shop): PostgreSQL, Redis (BullMQ), Prisma, JWT у cookie `ga-session` (сумісно з фронтендом).

## Стек

- NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/config`)
- Prisma + PostgreSQL
- Auth: JWT, Passport, `cookie-parser`
- Validation: `class-validator`, `class-transformer`
- Черги: `@nestjs/bullmq`, `bullmq` + Redis

## Запуск (Docker Desktop)

1. У папці `green-angels-backend` підніміть інфраструктуру:

```bash
docker compose up -d
```

2. Скопіюйте змінні оточення і встановіть залежності:

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
```

3. Запустіть API:

```bash
npm run start:dev
```

API: `http://localhost:3001`  
Health: `GET /health`

## Auth (для інтеграції з shop)

| Метод | Шлях | Опис |
|-------|------|------|
| POST | `/auth/login` | Вхід (email; пароль опційно) |
| POST | `/auth/register` | Реєстрація |
| GET | `/auth/session` | Поточна сесія (cookie або Bearer) |
| POST | `/auth/logout` | Вихід |
| GET | `/auth/oauth/google/config` | Чи налаштовано Google OAuth |
| POST | `/auth/oauth/google/callback` | Обмін code → сесія (викликає shop після redirect Google) |

`JWT_SECRET` має збігатися з `JWT_SECRET` у shop (мін. 32 символи).

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth client ID (Web).
2. **Authorized redirect URIs:** `http://localhost:3000/api/auth/oauth/google/callback` (прод — ваша публічна URL магазину).
3. У `green-angels-backend/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. У `green-angels-shop/.env.local`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (той самий Client ID), `NEXT_PUBLIC_SITE_URL`.

## Фронтенд

У `green-angels-shop` можна додати:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

і проксувати або викликати API з `credentials: 'include'` для cookie між доменами (локально — той самий origin через rewrite або прямий URL з CORS).
