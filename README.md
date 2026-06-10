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
| POST | `/auth/oauth/google` | Mock Google OAuth (як у shop) |

`JWT_SECRET` має збігатися з `AUTH_SESSION_SECRET` у shop (мін. 32 символи), щоб токени були взаємозамінні.

## Фронтенд

У `green-angels-shop` можна додати:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

і проксувати або викликати API з `credentials: 'include'` для cookie між доменами (локально — той самий origin через rewrite або прямий URL з CORS).
