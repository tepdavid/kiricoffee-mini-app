# Kiri Coffee ordering Mini App: deploy

```
kiri-shop/
  api/shop.js
  public/index.html
  public/menu/*.png        <- your existing drink and food photos (same names as before)
  public/kiri-logo.png     <- optional
  public/bank-qr.png       <- optional: your bank QR code (ABA, Bakong, etc.)
  package.json  vercel.json
```

## Vercel settings (Project, Settings, Environment Variables, Production)
| Name | Value |
|---|---|
| BOT_TOKEN | token of the shop bot (get it from @BotFather /token, never share it) |
| ADMIN_IDS | Telegram numeric IDs of shop staff, comma separated (ask @userinfobot) |
| R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET | same as the memory album. Orders are saved under `shop/` |
| BANK_NAME, BANK_ACCOUNT, BANK_HOLDER | where customers send money |
| DELIVERY_FEE | optional, default 1.5 |

Redeploy after changing settings. No CORS rule is needed: the browser never talks to R2 directly.

## Bot
In @BotFather: `/myapps`, pick the shop app, and set its URL to your Vercel address.
Staff must press Start once in the bot, otherwise Telegram will not deliver order alerts to them.

## How an order flows
1. Customer picks drinks (cup size, sugar level), adds to cart, chooses pick up or delivery, and places the order.
2. The app shows your bank details and a reference code. The customer pays and taps "I've paid".
3. Staff get a Telegram alert, check the bank app, then open the app's Admin tab and tap Confirm, Preparing, Ready or On the way, Done.
4. The customer gets a Telegram message at every step. Both sides can chat in the app.

## Notes
- Edit the menu and prices in `api/shop.js` (the MENU list). Prices are always calculated on the server.
- Payment is confirmed by a person checking the bank. The app does not connect to the bank.
- Fine for a home shop (dozens of orders a day). For much more traffic, move orders to a real database.
