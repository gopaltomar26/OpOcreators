const redis = require("../lib/redis");
<<<<<<< HEAD
const auth = require("../lib/auth");
=======
>>>>>>> 0f17c46fc499895b571f3537260f22aa6a48ba98
const clean = (v, n = 200) => String(v == null ? "" : v).trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = req.body || {};
    const role = b.role === "creator" ? "creator" : b.role === "client" ? "client" : null;
    const d = b.data || {};
<<<<<<< HEAD
    const pw = String(d.password || "");
    const email = clean(d.email, 120).toLowerCase();
    if (!role || !d.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return res.status(400).json({ error: "Missing details" });
    if (pw.length < 8 || pw.length > 100)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    const data = {};
    Object.keys(d).filter((k) => k !== "password").slice(0, 20).forEach((k) => (data[clean(k, 30)] = clean(d[k])));
    data.email = email;

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { salt, hash } = auth.hash(pw);
    const fresh = await redis(["HSETNX", "users", email, JSON.stringify({ id, salt, hash })]);
    if (!fresh) return res.status(409).json({ error: "This email is already registered. Please log in." });

    const rec = { id, role, status: "pending", createdAt: new Date().toISOString(), data };
    await redis(["HSET", "applications", id, JSON.stringify(rec)]);
    res.status(200).json({ ok: true, token: auth.sign(id), profile: auth.profile(rec) });
=======
    if (!role || !d.name || !d.email) return res.status(400).json({ error: "Missing details" });
    const data = {};
    Object.keys(d).slice(0, 20).forEach((k) => (data[clean(k, 30)] = clean(d[k])));
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { id, role, status: "pending", createdAt: new Date().toISOString(), data };
    await redis(["HSET", "applications", id, JSON.stringify(rec)]);
    res.status(200).json({ ok: true });
>>>>>>> 0f17c46fc499895b571f3537260f22aa6a48ba98
  } catch (e) {
    res.status(500).json({ error: "Could not save" });
  }
};
