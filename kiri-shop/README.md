# Kiri Coffee and Food
Next.js + PostgreSQL + Prisma starter for the Telegram Mini App.

## Setup
npm install
copy `.env.example` to `.env.local`
set DATABASE_URL
npx prisma migrate dev --name init
npm run db:seed
npm run dev

## Vercel
Import this GitHub repository into Vercel, then add DATABASE_URL under Project Settings → Environment Variables.
Never commit .env.local or secrets.
