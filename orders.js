// Vercel serverless function: POST /api/orders
// Env vars: BOT_TOKEN (required), ADMIN_CHAT_ID (your Telegram user or group id)
const crypto = require("crypto");

// Prices live here, never on the client. Keep in sync with the menu in index.html.
const MENU = {
  americano: 1, cappuccino: 4.5, latte: 4.75, "flat-white": 4.5, "cold-brew": 5, mocha: 5.25,
  "matcha-latte": 5.5, "iced-matcha-latte": 5.75, "strawberry-matcha": 6.25, "matcha-espresso": 6,
  "chai-latte": 5, "avocado-toast": 8.5, "breakfast-sandwich": 7.5,
};
const FOOD = new Set(["avocado-toast", "breakfast-sandwich"]);
const SIZES = [["Small", 0], ["Medium", 0.5], ["Large", 1]];
const ADDONS = [["Extra Shot", 0.75], ["Oat Milk", 0.5], ["Vanilla Syrup", 0.5]];
const MAX_AGE = 3600; // seconds

function verify(initData) {
  const token = process.env.BOT_TOKEN;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  p.delete("hash");
  if (!token || !hash) return null;
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calc = crypto.createHmac("sha256", secret).update(check).digest("hex");
  const a = Buffer.from(calc), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() / 1000 - Number(p.get("auth_date")) > MAX_AGE) return null;
  try { return JSON.parse(p.get("user")); } catch { return null; }
}

const send = (chat, text) =>
  fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const h = req.headers.authorization || "";
  const user = h.startsWith("tma ") ? verify(h.slice(4)) : null;
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const items = req.body && req.body.items;
  if (!Array.isArray(items) || !items.length || items.length > 20) return res.status(400).json({ error: "bad items" });

  let total = 0;
  const lines = [];
  for (const i of items) {
    const base = MENU[i.id];
    const qty = Number.isInteger(i.qty) ? i.qty : 0;
    if (base === undefined || qty < 1 || qty > 20) return res.status(400).json({ error: "bad item" });
    let price = base, label = i.id;
    if (!FOOD.has(i.id)) {
      const size = SIZES[i.size];
      const adds = (Array.isArray(i.addons) ? [...new Set(i.addons)] : []).map((a) => ADDONS[a]);
      if (!size || adds.some((a) => !a)) return res.status(400).json({ error: "bad option" });
      price += size[1] + adds.reduce((s, a) => s + a[1], 0);
      label += ` (${size[0]})` + adds.map((a) => ` +${a[0]}`).join("");
    }
    total += price * qty;
    lines.push(`${qty}x ${label} - $${(price * qty).toFixed(2)}`);
  }

  const id = Date.now().toString(36).toUpperCase();
  const who = user.username ? `@${user.username}` : user.first_name;
  const text = `Order #${id}\n${lines.join("\n")}\nTotal: $${total.toFixed(2)}`;
  // Serverless functions stop after responding, so wait for the messages to send.
  const jobs = [send(user.id, `Thanks! We received your order.\n\n${text}`)];
  if (process.env.ADMIN_CHAT_ID) jobs.push(send(process.env.ADMIN_CHAT_ID, `New order from ${who}\n\n${text}`));
  await Promise.allSettled(jobs);
  res.status(200).json({ id, total: +total.toFixed(2) });
};
