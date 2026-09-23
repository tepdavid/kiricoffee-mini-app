# Deploy Kiri to Vercel

## Folder layout
```
kiri/
  api/orders.js
  public/index.html
  public/kiri-logo.png      <- copy from your current v0 project's public/ folder
  public/menu/*.png         <- copy the whole menu/ folder from the v0 project
  vercel.json
```

## Steps
1. Put this folder in a GitHub repo (or replace the files in your current kiri-beryl repo, deleting the old Next.js files).
2. In Vercel, open the project, then Settings, then General. Set Framework Preset to **Other**, leave Build Command empty, and set Output Directory to `public`.
3. Settings, then Environment Variables. Add `BOT_TOKEN` (the NEW token from BotFather) and `ADMIN_CHAT_ID` (message @userinfobot to get your numeric id).
4. Redeploy. Open https://kiri-beryl.vercel.app/ and check the menu loads.
5. In @BotFather, send `/myapps`, pick your app, and confirm the URL is https://kiri-beryl.vercel.app/.
6. Open t.me/kiricoffee_food_bot/menu in Telegram, add an item and place an order. You and the admin chat should each get a message.

## Notes
- Customers only receive the confirmation if they've pressed Start in the bot once. The admin message always arrives.
- Kiri Americano is $1.00, copied from your current site. Change it in both `public/index.html` and `api/orders.js`.
- Prices are checked on the server, and orders are rejected without valid Telegram login data.
- For more protection against abuse, turn on Vercel Firewall rate limiting for `/api/orders`.
