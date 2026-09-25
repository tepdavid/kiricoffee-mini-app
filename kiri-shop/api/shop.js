// POST /api/shop?action=...   Everything is stored as small JSON files in your R2 bucket under shop/.
// Env: BOT_TOKEN, ADMIN_IDS (comma-separated Telegram ids of shop staff), R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//      R2_SECRET_ACCESS_KEY, R2_BUCKET, BANK_NAME, BANK_ACCOUNT, BANK_HOLDER, DELIVERY_FEE (optional, default 1.5)
const crypto = require("crypto");
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

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

// ---- banks: the shop owner manages this list in the app (Admin, Banks). ABA is the starting one. ----
const DEFAULT_BANKS = () => [{ id: "aba", name: R("BANK_NAME") || "ABA Bank", account: R("BANK_ACCOUNT") || "000 729 100", holder: R("BANK_HOLDER") || "Kiri Coffee by D.TEP",
  link: R("BANK_LINK") || "https://link.payway.com.kh/ABAPAYhT530450X", on: true, qrUrl: "/bank-qr.jpg" }];
const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const pubBank = (x) => ({ id: x.id, name: x.name, account: x.account, holder: x.holder, link: x.link, qrUrl: x.qrUrl || "", hasQr: !!x.qr });

// ---- storage ----
const read = async (Key) => {
  try { const r = await s3.send(new GetObjectCommand({ Bucket, Key })); return JSON.parse(await r.Body.transformToString()); }
  catch (e) { if (e.name === "NoSuchKey" || (e.$metadata && e.$metadata.httpStatusCode === 404)) return null; throw e; }
};
const write = (Key, v) => s3.send(new PutObjectCommand({ Bucket, Key, Body: JSON.stringify(v), ContentType: "application/json" }));
const list = async (Prefix, StartAfter) => { const out = []; let tok; do { const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, StartAfter, ContinuationToken: tok })); out.push(...(r.Contents || []).map((o) => o.Key)); tok = r.NextContinuationToken; } while (tok); return out; };
const getBanks = async () => { const j = await read("shop/banks.json"); return Array.isArray(j) && j.length ? j : DEFAULT_BANKS(); };
const getOv = async () => (await read("shop/menu-ov.json")) || {}; // owner's price changes and sold-out switches
const priced = (ov) => MENU.map((m) => ({ ...m, price: ov[m.id] && ov[m.id].price != null ? ov[m.id].price : m.price, off: !!(ov[m.id] && ov[m.id].off) }));
async function buildItems(raw) { // prices always come from here, never from the phone
  const PM = priced(await getOv()), items = []; let sub = 0;
  for (const i of Array.isArray(raw) ? raw.slice(0, 40) : []) {
    const m = PM.find((x) => x.id === i.id), qty = Number.isInteger(i.qty) ? i.qty : 0;
    if (!m || qty < 1 || qty > 50) return { error: "bad item" };
    if (m.off) return { error: "sold out: " + m.name };
    let price = m.price, size = null, sugar = null;
    if (m.drink) { const s = SIZES[i.size]; sugar = SUGARS[i.sugar]; if (!s || !sugar) return { error: "bad option" }; size = s[0]; price += s[1]; }
    sub += price * qty; items.push({ id: m.id, name: m.name, size, sugar, qty, price });
  }
  return { items, sub };
}
const tell = (chat, text) => fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => {});
const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const cleanLoc = (l) => { // a shared GPS position; anything that is not a real coordinate is dropped
  if (!l || typeof l !== "object") return null;
  const lat = Number(l.lat), lng = Number(l.lng), acc = Number(l.acc) || 0;
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || (lat === 0 && lng === 0)) return null;
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.min(Math.round(acc), 100000), at: Number(l.at) > 0 ? Number(l.at) : Date.now() };
};
const orderKey = (id) => `shop/orders/${clean(id, 60).replace(/[^\w-]/g, "")}.json`;
const code = (o) => o.id.split("-")[0].toUpperCase();

// Plain-language description of a missing or wrong storage setting, or "" when they look right
const configProblem = () =>
  !/^[0-9a-f]{32}$/i.test(ACCT) ? "R2_ACCOUNT_ID is missing or isn't a 32-character Account ID."
  : !Bucket ? "R2_BUCKET is missing."
  : !R("R2_ACCESS_KEY_ID") ? "R2_ACCESS_KEY_ID is missing."
  : !R("R2_SECRET_ACCESS_KEY") ? "R2_SECRET_ACCESS_KEY is missing." : "";

function verify(initData) { // Telegram's signed login data. Returns { user }, or { reason } saying what is wrong.
  if (!BOT) return { reason: "no_token" };
  if (!initData) return { reason: "no_initdata" };
  const p = new URLSearchParams(initData), hash = p.get("hash"); p.delete("hash");
  if (!hash) return { reason: "no_initdata" };
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const calc = crypto.createHmac("sha256", crypto.createHmac("sha256", "WebAppData").update(BOT).digest()).update(check).digest("hex");
  const a = Buffer.from(calc), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { reason: "bad_signature" };
  if (Date.now() / 1000 - Number(p.get("auth_date")) > 86400 * 7) return { reason: "expired" };
  try { return { user: JSON.parse(p.get("user")) }; } catch { return { reason: "no_initdata" }; }
}

module.exports = async (req, res) => {
  if (req.query.action === "ping") { // open /api/shop?action=ping in a browser to see what this site is running with
    return res.json({ version: 2, hasToken: !!BOT, botId: BOT.split(":")[0] || null, tokenLength: BOT.length, admins: ADMINS.length,
      hasStorage: !configProblem(), storageProblem: configProblem() || "none", bankSet: !!R("BANK_ACCOUNT") });
  }
  if (req.method !== "POST") return res.status(405).end();
  const h = req.headers.authorization || "", v = h.startsWith("tma ") ? verify(h.slice(4)) : { reason: "no_initdata" };
  if (!v.user) return res.status(401).json({ error: "unauthorized", reason: v.reason });
  const u = v.user;
  const uid = String(u.id), admin = ADMINS.includes(uid), b = req.body || {}, a = req.query.action;
  const myName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Customer";
  const bad = (m) => res.status(400).json({ error: m || "bad request" });
  try {
    if (a === "menu") return res.json({ cats: CATS, items: priced(await getOv()), sizes: SIZES, sugars: SUGARS, fee: FEE, admin,
      bank: { name: R("BANK_NAME") || "ABA Bank", account: R("BANK_ACCOUNT") || "000 729 100", holder: R("BANK_HOLDER") || "Kiri Coffee by D.TEP",
        link: R("BANK_LINK") || "https://link.payway.com.kh/ABAPAYhT530450X" } });

    if (a === "profile") return res.json({ profile: (await read(`shop/users/${uid}.json`)) || { name: myName } });
    if (a === "profile_set") {
      const prev = (await read(`shop/users/${uid}.json`)) || {}, next = { ...prev, name: myName, phone: clean(b.phone, 30), address: clean(b.address, 200), locNote: clean(b.locNote, 200) };
      if (b.loc === null) delete next.loc; else if (b.loc) { const l = cleanLoc(b.loc); if (l) next.loc = l; }
      await write(`shop/users/${uid}.json`, next);
      return res.json({ ok: 1 });
    }

    if (a === "order_create") {
      const built = await buildItems(b.items);
      if (built.error) return bad(built.error);
      const { items, sub } = built;
      const mode = b.mode === "delivery" ? "delivery" : "pickup", phone = clean(b.phone, 30), address = clean(b.address, 200), loc = mode === "delivery" ? cleanLoc(b.loc) : null;
      if (!items.length || !phone || (mode === "delivery" && !address && !loc)) return bad("missing details");
      const fee = mode === "delivery" ? FEE : 0, id = `${Date.now().toString(36)}-${uid}`;
      const order = { id, uid, name: myName, username: u.username || "", items, sub: +sub.toFixed(2), fee, total: +(sub + fee).toFixed(2), mode, phone, address, note: clean(b.note, 200), status: "awaiting_payment", at: Date.now(), ...(loc ? { loc, locNote: clean(b.locNote, 200) } : {}) };
      await write(`shop/orders/${id}.json`, order);
      { const prev = (await read(`shop/users/${uid}.json`)) || {}; await write(`shop/users/${uid}.json`, { ...prev, name: myName, phone, address: address || prev.address || "" }); }
      await Promise.all(ADMINS.map((x) => tell(x, `New order #${code(order)} from ${myName}\n${items.map((i) => `${i.qty}x ${i.name}${i.size ? ` (${i.size}, sugar ${i.sugar})` : ""}`).join("\n")}\n${mode === "delivery" ? "Delivery: " + (address || "see shared location") + (loc ? `\nLocation: https://www.google.com/maps?q=${loc.lat},${loc.lng}` : "") : "Pick up"}\nPhone: ${phone}\nTotal: $${order.total.toFixed(2)} (waiting for bank payment)`)));
      return res.json({ order });
    }

    if (a === "orders" || a === "admin_orders") {
      if (a === "admin_orders" && !admin) return res.status(403).json({ error: "admin only" });
      let ks = (await list("shop/orders/")).sort().reverse();
      if (a === "orders") ks = ks.filter((k) => k.endsWith(`-${uid}.json`));
      const orders = (await Promise.all(ks.slice(0, a === "admin_orders" ? 80 : 40).map(read))).filter((o) => o && !(a === "orders" && o.hidden));
      return res.json({ orders });
    }

    if (a === "order_pay") { // the customer tapped "Pay now" on a bank: remember which bank and tell the shop to check it
      const o = await read(`shop/orders/${clean(b.id, 60).replace(/[^\w-]/g, "")}.json`);
      if (!o || (o.uid !== uid && !admin)) return res.status(404).json({ error: "not found" });
      if (o.status === "awaiting_payment" || o.status === "paid_claimed") {
        const bk = (await getBanks()).find((x) => x.id === clean(b.bank, 20)), first = o.status === "awaiting_payment", changed = bk && o.bank !== bk.name;
        o.status = "paid_claimed"; if (bk) o.bank = bk.name;
        if (first || changed) {
          await write(`shop/orders/${o.id}.json`, o);
          await Promise.all(ADMINS.map((x) => tell(x, `${o.name} started paying $${o.total.toFixed(2)}${bk ? ` with ${bk.name}` : ""} for order #${code(o)}. Check that bank, then confirm it in the app (Admin tab).`)));
        }
      }
      return res.json({ ok: 1 });
    }

    if (a === "order_cancel") { // a customer can cancel an order until they start paying
      const o = await read(orderKey(b.id));
      if (!o || (o.uid !== uid && !admin)) return res.status(404).json({ error: "not found" });
      if (o.status !== "awaiting_payment") return res.status(409).json({ error: o.status === "paid_claimed" ? "already_paid" : "not_pending" });
      o.status = "cancelled"; await write(orderKey(o.id), o);
      if (o.uid === uid) await Promise.all(ADMINS.map((x) => tell(x, `${o.name} cancelled order #${code(o)} ($${o.total.toFixed(2)}) before paying.`)));
      return res.json({ ok: 1 });
    }
    if (a === "order_remove") { // hide a finished or cancelled order from the customer's own list (the shop keeps it for reports)
      const o = await read(orderKey(b.id));
      if (!o || o.uid !== uid) return res.status(404).json({ error: "not found" });
      if (o.status !== "cancelled" && o.status !== "done") return res.status(409).json({ error: "still_active" });
      o.hidden = true; await write(orderKey(o.id), o);
      return res.json({ ok: 1 });
    }
    if (a === "order_delete") { // staff only: erase an order for good
      if (!admin) return res.status(403).json({ error: "admin only" });
      await s3.send(new DeleteObjectCommand({ Bucket, Key: orderKey(b.id) }));
      return res.json({ ok: 1 });
    }
    if (a === "order_status") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const o = await read(`shop/orders/${clean(b.id, 60).replace(/[^\w-]/g, "")}.json`);
      if (!o || !STATUS[b.status]) return bad();
      o.status = b.status; if (b.status !== "cancelled") o.paid = true; // confirming means the money was seen
      await write(`shop/orders/${o.id}.json`, o);
      if (/^\d+$/.test(o.uid)) await tell(o.uid, `Order #${code(o)}: ${STATUS[b.status]}`); // walk-in sales have no Telegram chat
      return res.json({ ok: 1 });
    }

    if (a === "msg_send") {
      const text = clean(b.text, 500), to = admin ? clean(b.to, 20).replace(/\D/g, "") : uid;
      if (!text || !to) return bad();
      const at = Date.now(), from = admin ? "admin" : "customer";
      await write(`shop/msgs/${to}/${String(at).padStart(14, "0")}-${crypto.randomBytes(2).toString("hex")}.json`, { from, text, at, cid: clean(b.cid, 20).replace(/[^\w]/g, ""), name: admin ? clean(b.name, 60) : myName });
      if (admin) await tell(to, `Message from Kiri Coffee:\n${text}\n\nOpen the app to reply.`);
      else await Promise.all(ADMINS.map((x) => tell(x, `Message from ${myName}:\n${text}\n\nReply in the app (Admin tab).`)));
      return res.json({ ok: 1 });
    }

    if (a === "msg_thread") {
      const who = admin && b.with ? clean(b.with, 20).replace(/\D/g, "") : uid;
      const after = Number(b.after) > 0 ? Number(b.after) : 0; // "~" sorts after "-", so this skips messages at exactly that time
      const ks = (await list(`shop/msgs/${who}/`, after ? `shop/msgs/${who}/${String(after).padStart(14, "0")}~` : undefined)).sort().slice(-60);
      const ms = (await Promise.all(ks.map(read))).filter(Boolean);
      return res.json({ messages: ms.map((m) => ({ text: m.text, at: m.at, cid: m.cid || "", mine: admin && b.with ? m.from === "admin" : m.from === "customer" })) });
    }

    if (a === "msg_threads") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const last = {};
      for (const k of (await list("shop/msgs/")).sort()) last[k.split("/")[2]] = k; // newest key per customer
      const threads = (await Promise.all(Object.entries(last).slice(-30).map(async ([id, k]) => { const m = await read(k); return m && { uid: id, name: m.from === "customer" ? m.name : (await read(`shop/users/${id}.json`) || {}).name || id, text: m.text, at: m.at, from: m.from }; }))).filter(Boolean).sort((x, y) => y.at - x.at);
      return res.json({ threads });
    }
    // ---- POS (staff only) ----
    if (a === "pos_sale") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const built = await buildItems(b.items);
      if (built.error) return bad(built.error);
      const mode = b.type === "dinein" ? "dinein" : "takeaway", pay = ["cash", "bank", "later"].includes(b.pay) ? b.pay : "cash";
      const total = +built.sub.toFixed(2), given = Number(b.cash) || 0;
      if (pay === "cash" && given < total) return bad("cash is less than the total");
      const id = `${Date.now().toString(36)}${crypto.randomBytes(1).toString("hex")}-pos`; // random tail: two sales in the same millisecond never collide
      const order = { id, uid: "", name: clean(b.name, 60) || "Walk-in", username: "", items: built.items, sub: total, fee: 0, total, mode, phone: clean(b.phone, 30), address: "", note: clean(b.note, 200),
        source: "pos", payMethod: pay, paid: pay !== "later", cash: pay === "cash" ? given : 0, change: pay === "cash" ? +(given - total).toFixed(2) : 0, status: pay === "later" ? "awaiting_payment" : "preparing", at: Date.now(), by: myName };
      await write(`shop/orders/${id}.json`, order);
      return res.json({ order });
    }
    if (a === "menu_set") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const id = clean(b.id, 40), ov = await getOv(), e = ov[id] || {};
      if (!MENU.find((x) => x.id === id)) return bad("unknown item");
      if (b.price === "") delete e.price; else if (b.price !== undefined) { const p = Number(b.price); if (!(p >= 0 && p <= 999)) return bad("bad price"); e.price = +p.toFixed(2); }
      if (b.off !== undefined) e.off = !!b.off;
      ov[id] = e; await write("shop/menu-ov.json", ov);
      return res.json({ ok: 1 });
    }
    if (a === "report") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const days = [1, 7, 30].includes(b.days) ? b.days : 1, off = Number(b.tz) || 0; // tz = minutes behind UTC, from the phone
      const start = Math.floor((Date.now() - off * 60000) / 864e5) * 864e5 - (days - 1) * 864e5 + off * 60000;
      const ks = (await list("shop/orders/")).sort().reverse().slice(0, 600);
      const os = (await Promise.all(ks.map(read))).filter((o) => o && o.at >= start);
      const sale = (o) => o.status !== "cancelled" && (o.paid || ["confirmed", "preparing", "ready", "on_the_way", "done"].includes(o.status));
      const sold = os.filter(sale), sum = (a2) => +a2.reduce((x, o) => x + o.total, 0).toFixed(2), top = {}, day = {};
      for (const o of sold) { for (const i of o.items) top[i.name] = (top[i.name] || 0) + i.qty; const d = new Date(o.at - off * 60000).toISOString().slice(0, 10); day[d] = +((day[d] || 0) + o.total).toFixed(2); }
      return res.json({ days, sales: sum(sold), orders: sold.length, avg: sold.length ? +(sum(sold) / sold.length).toFixed(2) : 0, cancelled: os.filter((o) => o.status === "cancelled").length,
        waiting: os.filter((o) => ["awaiting_payment", "paid_claimed"].includes(o.status)).length,
        byPay: { cash: sum(sold.filter((o) => o.payMethod === "cash")), bank: sum(sold.filter((o) => o.payMethod === "bank")), online: sum(sold.filter((o) => o.source !== "pos")) },
        top: Object.entries(top).sort((x, y) => y[1] - x[1]).slice(0, 8), byDay: Object.entries(day).sort() });
    }
    if (a === "banks") return res.json({ banks: (await getBanks()).filter((x) => x.on !== false).map(pubBank) }); // what customers can choose from
    if (a === "bank_qr") { const x = (await getBanks()).find((y) => y.id === clean(b.id, 20)); return res.json({ qr: (x && x.qr) || "" }); }
    if (a === "banks_admin") { if (!admin) return res.status(403).json({ error: "admin only" }); return res.json({ banks: (await getBanks()).map((x) => ({ ...pubBank(x), on: x.on !== false })) }); }
    if (a === "bank_save") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const inp = b.bank || {}, list = await getBanks(), i = list.findIndex((x) => x.id === inp.id), old = i >= 0 ? list[i] : {};
      if (i < 0 && list.length >= 8) return bad("too many banks");
      const next = { id: old.id || crypto.randomBytes(4).toString("hex"), name: clean(inp.name, 40), account: clean(inp.account, 60), holder: clean(inp.holder, 60),
        link: /^https:\/\/[^\s]{3,290}$/.test(String(inp.link || "")) ? String(inp.link) : "", on: inp.on !== false, qrUrl: old.qrUrl || "", qr: old.qr || "" };
      if (!next.name) return bad("bank name needed");
      if (inp.qr) { if (!IMG.test(String(inp.qr)) || String(inp.qr).length > 700000) return bad("bad image"); next.qr = inp.qr; next.qrUrl = ""; }
      if (i >= 0) list[i] = next; else list.push(next);
      await write("shop/banks.json", list);
      return res.json({ ok: 1 });
    }
    if (a === "bank_delete") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      await write("shop/banks.json", (await getBanks()).filter((x) => x.id !== clean(b.id, 20)));
      return res.json({ ok: 1 });
    }
    if (a === "qr") { const j = await read("shop/bank-qr.json"); return res.json({ qr: (j && j.qr) || "" }); } // the bank QR picture
    if (a === "qr_set") {
      if (!admin) return res.status(403).json({ error: "admin only" });
      const img = String(b.qr || "");
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > 700000) return bad("bad image");
      await write("shop/bank-qr.json", { qr: img });
      return res.json({ ok: 1 });
    }
    res.status(400).json({ error: "bad action" });
  } catch (e) { console.error(e); res.status(500).json({ error: "server", detail: admin ? `${e.name}: ${e.message}` : undefined }); } // staff see the reason
};
