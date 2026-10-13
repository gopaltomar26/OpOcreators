const redis = require("../lib/redis");
const auth = require("../lib/auth");
const crypto = require("crypto");

// Prices in rupees: [monthly, yearly]
const PRICE = { basic: [49, 490], premium: [149, 1490], advanced: [300, 3000] };
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

module.exports = async (req, res) => {
  const fail = (c, m) => res.status(c).json({ error: m });
  if (req.method !== "POST") return fail(405, "POST only");
  try {
    const KID = process.env.RAZORPAY_KEY_ID, KS = process.env.RAZORPAY_KEY_SECRET;
    if (!KID || !KS) return fail(503, "Payments are not set up yet. Please try again soon.");
    const uid = auth.check((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!uid) return fail(401, "Please log in");
    const me = J(await redis(["HGET", "applications", uid]));
    if (!me) return fail(401, "Please log in");
    if (me.status !== "approved") return fail(403, "Your account is under review.");
    const b = req.body || {};

    if (b.action === "order") {
      const pr = PRICE[b.plan];
      if (!pr) return fail(400, "Unknown plan");
      const yearly = b.period === "year";
      const amount = pr[yearly ? 1 : 0] * 100; // paise
      const r = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(KID + ":" + KS).toString("base64"), "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: "INR", receipt: ("o_" + uid).slice(0, 40), notes: { uid, plan: b.plan } }),
      });
      const o = await r.json();
      if (!r.ok || !o.id) return fail(502, "Could not start the payment");
      await redis(["HSET", "orders", o.id, JSON.stringify({ uid, plan: b.plan, days: yearly ? 365 : 30, amount })]);
      return res.status(200).json({ key: KID, order: o.id, amount, name: me.data.name, email: me.data.email });
    }

    if (b.action === "verify") {
      const order = String(b.order || ""), payment = String(b.payment || ""), sig = String(b.signature || "");
      const exp = crypto.createHmac("sha256", KS).update(order + "|" + payment).digest("hex");
      const A = Buffer.from(exp), B = Buffer.from(sig);
      if (A.length !== B.length || !crypto.timingSafeEqual(A, B)) return fail(400, "Payment could not be verified");
      const ord = J(await redis(["HGET", "orders", order]));
      if (!ord || ord.uid !== uid) return fail(400, "Unknown order");
      if (!ord.done) {
        const keep = me.plan === ord.plan && me.planUntil ? Math.max(Date.now(), new Date(me.planUntil).getTime()) : Date.now();
        me.plan = ord.plan;
        me.planUntil = new Date(keep + ord.days * 864e5).toISOString();
        await redis(["HSET", "applications", uid, JSON.stringify(me)]);
        ord.done = 1;
        await redis(["HSET", "orders", order, JSON.stringify(ord)]);
      }
      return res.status(200).json({ profile: auth.profile(me) });
    }
    fail(400, "Bad request");
  } catch (e) {
    fail(500, "Server error");
  }
};
