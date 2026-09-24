# Kiri Coffee and Food — Telegram Mini App v1.1

Included:
- Kiri logo
- ABA/KHQR payment image
- ABA KHR account: 003 268 411
- ABA USD account: 000 729 100
- Bakong account: 003268411
- Categories: Coffee, Matcha, Tea & Soda, Smoothies, Food
- Hot / Cold drink temperature selection
- Small / Large
- Sugar: 25%, 50%, 75%, 100%
- Extra espresso / Extra Matcha
- USD / KHR
- Pickup / Delivery
- Delivery fee field based on distance
- Payment method and payment reference
- Payment proof upload
- Customer order history
- Admin order dashboard
- Order status workflow

Important:
Current menu items supplied by the shop are included: Hot Latte, Iced Latte, Hot Matcha Latte, and Matcha Latte. More items can be added later.
The delivery fee is intentionally entered/calculated by the shop based on distance; a production version can add a distance-based rate table or map integration.

Run:
1. Install Node.js 20+.
2. Copy .env.example to .env.
3. Set a strong ADMIN_PASSWORD.
4. npm install
5. npm start
6. Open http://localhost:3000

Admin:
http://localhost:3000/admin

Telegram:
Create a bot with BotFather and set its Mini App/menu button to your deployed HTTPS URL.
