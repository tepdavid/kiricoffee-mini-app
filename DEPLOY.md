# Kiri Coffee ordering Mini App: deploy

```
kiri-shop/
  api/shop.js
  public/index.html
  public/menu/*.png        <- your existing drink and food photos (same names as before)
  public/kiri-logo.png     <- your Kiri logo (already included)
  public/bank-qr.jpg       <- your ABA PAY / KHQR picture (already included)
  package.json  vercel.json
```

## Vercel settings (Project, Settings, Environment Variables, Production)
| Name | Value |
|---|---|
| BOT_TOKEN | token of the shop bot (get it from @BotFather /token, never share it) |
| ADMIN_IDS | Telegram numeric IDs of shop staff, comma separated (ask @userinfobot) |
| R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET | same as the memory album. Orders are saved under `shop/` |
| BANK_NAME, BANK_ACCOUNT, BANK_HOLDER, BANK_LINK | where customers send money. Optional: they default to ABA Bank, 000 729 100, Kiri Coffee by D.TEP and your ABA PayWay link |
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

## Banks
- Open the app, go to Admin, then Banks. ABA is already there. Tap "+ Add another bank" to add ACLEDA, Wing or any other: name, account number, account name, an optional payment link (https://...) and a QR picture.
- After placing an order, customers see one **Pay now** button per bank. Tapping it opens that bank's payment link (if you added one) and shows its QR and account number. There is no "I've paid" button: tapping Pay now tells you a payment has started.
- The order remembers which bank the customer picked, and your Telegram alert says which bank to check. Always check your bank app before you tap Confirm payment.
- The ABA QR picture is `public/bank-qr.jpg`. Uploading a picture in Admin replaces it without a redeploy.

## Two separate apps: customers and staff
- **Customer app** = `public/index.html`. Customers see only the menu, cart, orders, chat and profile. There are no staff screens in it at all.
- **Staff POS** = `public/admin.html`. Register it as a second Mini App for the same bot:
  1. In @BotFather send `/newapp`, pick your shop bot, give it the title "Kiri POS" and the short name `pos`.
  2. Set its web address to `https://YOUR-ADDRESS/admin.html`.
  3. Your staff open `t.me/YOUR_BOT/pos`. Keep that link private.
- Only Telegram IDs in `ADMIN_IDS` can use the POS. Anyone else sees "Staff only", and the server refuses their requests anyway. `public/index.html` doesn't just hide staff tools — it contains no admin code at all, so there's nothing for a customer to unlock even by tinkering with the browser console.
- The POS has Orders (with a badge and alert for orders needing payment checks), New sale (walk-in orders with cash change or bank payment), Menu (change prices, mark items sold out), Reports (sales today, 7 or 30 days, best sellers, how people paid) and More (customer messages, banks and QR).
- Changing a price or marking an item sold out applies to customers and the POS straight away, and the server uses the new price for every order.

## Orders, chat, contact and location
- **Cancel or remove:** customers can cancel an order until they start paying (Orders, Cancel order). If they already tapped Pay now, they are told to message the shop. Cancelled or finished orders can be removed from their own list, and you still keep them for reports. In the POS you can delete any order for good (it also leaves the reports).
- **Order history:** the customer's Orders screen is split into Pending, Succeeded and Cancelled tabs, each showing a count, so past orders don't bury the ones still in progress.
- **Chat:** while a chat is open, new messages appear within about 3 seconds on both sides, and a red number shows on the Profile tab (customer) or More tab (staff) for unread messages. Telegram alerts are still sent too. This is fast checking, not a permanent connection, because a Vercel site cannot keep one open.
- **Contact Kiri:** the phone number is set at the top of `public/index.html` (`SHOP_PHONE` and `SHOP_PHONE_TEXT`). Customers see Call now, Copy number and Message buttons in Profile, and a call button on Home. The call button works on phones. On a computer, use Copy number.
- **Customer location:** in Profile, My location, a customer taps Share my location and adds a short description. It is saved to their profile, and they can update or remove it at any time. On delivery orders they can send it with the order, so the address becomes optional. Staff see an Open map button in the POS and a map link in the Telegram alert. Telegram asks the customer for permission the first time. The location is one fresh reading each time they tap, not continuous tracking.

## Navigation
- Both apps now turn on Telegram's own back arrow (next to Telegram's "Close" control at the top) whenever there's somewhere to go back to — an open item, a chat, a sub-screen in the POS — instead of only relying on in-page "← Back" buttons. Tapping it steps back one level; on the app's home screen it stays hidden, same as Telegram's own apps.
