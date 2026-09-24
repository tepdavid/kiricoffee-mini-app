// POST /api/shop?action=...   Everything is stored as small JSON files in your R2 bucket under shop/.
// Env: BOT_TOKEN, ADMIN_IDS (comma-separated Telegram ids of shop staff), R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//      R2_SECRET_ACCESS_KEY, R2_BUCKET, BANK_NAME, BANK_ACCOUNT, BANK_HOLDER, DELIVERY_FEE (optional, default 1.5)
const crypto = require("crypto");
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const E = process.env, R = (k) => (E[k] || "").trim().replace(/^["']+|["']+$/g, "");
const BOT = R("BOT_TOKEN"), Bucket = R("R2_BUCKET");
const ACCT = (R("R2_ACCOUNT_ID").match(/[0-9a-f]{32}/i) || [R("R2_ACCOUNT_ID")])[0];
const s3 = new S3Client({ region: "auto", endpoint: `https://${ACCT}.r2.cloudflarestorage.com`, forcePathStyle: true,
  credentials: { accessKeyId: R("R2_ACCESS_KEY_ID"), secretAccessKey: R("R2_SECRET_ACCESS_KEY") }, requestChecksumCalculation: "WHEN_REQUIRED" });
const ADMINS = R("ADMIN_IDS").split(",").map((s) => s.trim()).filter(Boolean);
const FEE = Number(R("DELIVERY_FEE")) >= 0 && R("DELIVERY_FEE") !== "" ? Number(R("DELIVERY_FEE")) : 1.5;

// The menu lives here, so prices can never be changed from the phone. Edit it to match your shop.
const CATS = ["Coffee", "Matcha", "Tea & More", "Food"];
const d = (id, name, cat, price, e, drink, desc) => ({ id, name, cat, price, img: id, e, drink, d: desc });
const MENU = [
  d("americano", "Kiri Americano", "Coffee", 1, "☕", 1, "A bold, concentrated single shot with a rich crema."),
  d("cappuccino", "Cappuccino", "Coffee", 4.5, "☕", 1, "Espresso with steamed milk and a thick layer of foam."),
  d("latte", "Caffè Latte", "Coffee", 4.75, "☕", 1, "Smooth espresso with velvety steamed milk."),
  d("flat-white", "Flat White", "Coffee", 4.5, "☕", 1, "Double ristretto topped with silky microfoam."),
  d("cold-brew", "Cold Brew", "Coffee", 5, "🧊", 1, "Slow-steeped for 18 hours, smooth and naturally sweet."),
  d("mocha", "Mocha", "Coffee", 5.25, "☕", 1, "Espresso, dark chocolate and steamed milk."),
  d("matcha-latte", "Matcha Latte", "Matcha", 5.5, "🍵", 1, "Ceremonial-grade matcha whisked with creamy milk."),
  d("iced-matcha-latte", "Iced Matcha Latte", "Matcha", 5.75, "🍵", 1, "Vibrant matcha over cold milk and ice."),
  d("strawberry-matcha", "Strawberry Matcha", "Matcha", 6.25, "🍓", 1, "Fresh strawberry puree, milk and whisked matcha."),
  d("matcha-espresso", "Matcha Espresso Fusion", "Matcha", 6, "🍵", 1, "Bold espresso poured over creamy matcha."),
  d("chai-latte", "Chai Latte", "Tea & More", 5, "🫖", 1, "Spiced black tea with frothed milk and cinnamon."),
  d("avocado-toast", "Avocado Toast", "Food", 8.5, "🥑", 0, "Sourdough, smashed avocado, chili flakes, microgreens."),
  d("breakfast-sandwich", "Breakfast Sandwich", "Food", 7.5, "🥪", 0, "Egg, cheddar and bacon on a toasted brioche bun."),
];
const SIZES = [["Small", 0], ["Medium", 0.5], ["Large", 1]];
const SUGARS = ["0%", "25%", "50%", "75%", "100%"];
const STATUS = { confirmed: "Your order is confirmed. Thank you!", preparing: "We're preparing your order now.", ready: "Your order is ready for pickup.",
  on_the_way: "Your order is on the way.", done: "Order completed. Enjoy, and thank you!", cancelled: "Your order was cancelled. Message us in the app if you have questions." };

// ---- storage ----
const read = async (Key) => {
  try { const r = await s3.send(new GetObjectCommand({ Bucket, Key })); return JSON.parse(await r.Body.transformToString()); }
  catch (e) { if (e.name === "NoSuchKey" || (e.$metadata && e.$metadata.httpStatusCode === 404)) return null; throw e; }
};
const write = (Key, v) => s3.send(new PutObjectCommand({ Bucket, Key, Body: JSON.stringify(v), ContentType: "application/json" }));
const list = async (Prefix) => { const out = []; let tok; do { const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: tok })); out.push(...(r.Contents || []).map((o) => o.Key)); tok = r.NextContinuationToken; } while (tok); return out; };
const tell = (chat, text) => fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => {});
const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const code = (o) => o.id.split("-")[0].toUpperCase();

function verify(initData) { // Telegram's signed login data
  const p = new URLSearchParams(initData), hash = p.get("hash"); p.delete("hash");
  if (!BOT || !hash) return null;
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const calc = crypto.createHmac("sha256", crypto.createHmac("sha256", "WebAppData").update(BOT).digest()).update(check).digest("hex");
  const a = Buffer.from(calc), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || Date.now() / 1000 - Number(p.get("auth_date")) > 86400 * 7) return null;
  try { return JSON.parse(p.get("user")); } catch { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const h = req.headers.authorization || "", u = h.startsWith("tma ") ? verify(h.slice(4)) : null;
  if (!u) return res.status(401).json({ error: "unauthorized" });
  const uid = String(u.id), admin = ADMINS.includes(uid), b = req.body || {}, a = req.query.action;
  const myName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Customer";
  const bad = (m) => res.status(400).json({ error: m || "bad request" });
  try {
    if (a === "menu") return res.json({ cats: CATS, items: MENU, sizes: SIZES, sugars: SUGARS, fee: FEE, admin,
      bank: { name: R("BANK_NAME"), account: R("BANK_ACCOUNT"), holder: R("BANK_HOLDER") } });

    if (a === "profile") return res.json({ profile: (await read(`shop/users/${uid}.json`)) || { name: myName } });
    if (a === "profile_set") { await write(`shop/users/${uid}.json`, { name: myName, phone: clean(b.phone, 30), address: clean(b.address, 200) }); return res.json({ ok: 1 }); }

    if (a === "order_create") {
      const items = []; let sub = 0;
      for (const i of Array.isArray(b.items) ? b.items.slice(0, 30) : []) {
        const m = MENU.find((x) => x.id === i.id), qty = Number.isInteger(i.qty) ? i.qty : 0;
        if (!m || qty < 1 || qty > 20) return bad("bad item");
        let price = m.price, size = null, sugar = null;
        if (m.drink) { const s = SIZES[i.size]; sugar = SUGARS[i.sugar]; if (!s || !sugar) return bad("bad option"); size = s[0]; price += s[1]; }
        sub += price * qty; items.push({ id: m.id, name: m.name, size, sugar, qty, price });
      }
      const mode = b.mode === "delivery" ? "delivery" : "pickup", phone = clean(b.phone, 30), address = clean(b.address, 200);
      if (!items.length || !phone || (mode === "delivery" && !address)) return bad("missing details");
      const fee = mode === "delivery" ? FEE : 0, id = `${Date.now().toString(36)}-${uid}`;
      const order = { id, uid, name: myName, username: u.username || "", items, sub: +sub.toFixed(2), fee, total: +(sub + fee).toFixed(2), mode, phone, address, note: clean(b.note, 200), status: "awaiting_payment", at: Date.now() };
      await write(`shop/orders/${id}.json`, order);
      await write(`shop/users/${uid}.json`, { name: myName, phone, address: address || (await read(`shop/users/${uid}.json`) || {}).address || "" });
      await Promise.all(ADMINS.map((x) => tell(x, `New order #${code(order)} from ${myName}\n${items.map((i) => `${i.qty}x ${i.name}${i.size ? ` (${i.size}, sugar ${i.sugar})` : ""}`).join("\n")}\n${mode === "delivery" ? "Delivery: " + address : "Pick up"}\nPhone: ${phone}\nTotal: $${order.total.toFixed(2)} (waiting for bank payment)`)));
      return res.json({ order });
    }

    if (a === "orders" || a === "admin_orders") {
      if (a === "admin_orders" && !admin) return res.status(403).json({ error: "admin only" });
      let ks = (await list("shop/orders/")).sort().reverse();
      if (a === "orders") ks = ks.filter((k) => k.endsWith(`-${uid}.json`));
      const orders = (await Promise.all(ks.slice(0, 40).map(read))).filter(Boolean);
      return res.json({ orders });
    }

    if (a === "order_pay") {
      const o = await read(`shop/orders/${clean(b.id, 60).replace(/[^\w-]/g, "")}.json`);
      if (!o || (o.uid !== uid && !admin)) return res.status(404).json({ error: "not found" });
      if (o.status === "awaiting_payment") {
        o.status = "paid_claimed"; await write(`shop/orders/${o.id}.json`, o);
        await Promise.all(ADMINS.map((x) => tell(x, `${o.name} says they paid $${o.total.toFixed(2)} for order #${code(o)}. Check your bank, then confirm it in the app (Admin tab).`)));
      }
      return res.json({ ok: 1 });
    }

    if (a === "order_status") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const o = await read(`shop/orders/${clean(b.id, 60).replace(/[^\w-]/g, "")}.json`);
      if (!o || !STATUS[b.status]) return bad();
      o.status = b.status; await write(`shop/orders/${o.id}.json`, o);
      await tell(o.uid, `Order #${code(o)}: ${STATUS[b.status]}`);
      return res.json({ ok: 1 });
    }

    if (a === "msg_send") {
      const text = clean(b.text, 500), to = admin ? clean(b.to, 20).replace(/\D/g, "") : uid;
      if (!text || !to) return bad();
      const at = Date.now(), from = admin ? "admin" : "customer";
      await write(`shop/msgs/${to}/${String(at).padStart(14, "0")}-${crypto.randomBytes(2).toString("hex")}.json`, { from, text, at, name: admin ? clean(b.name, 60) : myName });
      if (admin) await tell(to, `Message from Kiri Coffee:\n${text}\n\nOpen the app to reply.`);
      else await Promise.all(ADMINS.map((x) => tell(x, `Message from ${myName}:\n${text}\n\nReply in the app (Admin tab).`)));
      return res.json({ ok: 1 });
    }

    if (a === "msg_thread") {
      const who = admin && b.with ? clean(b.with, 20).replace(/\D/g, "") : uid;
      const ks = (await list(`shop/msgs/${who}/`)).sort().slice(-60);
      const ms = (await Promise.all(ks.map(read))).filter(Boolean);
      return res.json({ messages: ms.map((m) => ({ text: m.text, at: m.at, mine: admin && b.with ? m.from === "admin" : m.from === "customer" })) });
    }

    if (a === "msg_threads") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const last = {};
      for (const k of (await list("shop/msgs/")).sort()) last[k.split("/")[2]] = k; // newest key per customer
      const threads = (await Promise.all(Object.entries(last).slice(-30).map(async ([id, k]) => { const m = await read(k); return m && { uid: id, name: m.from === "customer" ? m.name : (await read(`shop/users/${id}.json`) || {}).name || id, text: m.text, at: m.at }; }))).filter(Boolean).sort((x, y) => y.at - x.at);
      return res.json({ threads });
    }
    res.status(400).json({ error: "bad action" });
  } catch (e) { console.error(e); res.status(500).json({ error: "server" }); }
};
