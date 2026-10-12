const redis = require("../lib/redis");
const clean = (v, n = 200) => String(v == null ? "" : v).trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = req.body || {};
    const role = b.role === "creator" ? "creator" : b.role === "client" ? "client" : null;
    const d = b.data || {};
    if (!role || !d.name || !d.email) return res.status(400).json({ error: "Missing details" });
    const data = {};
    Object.keys(d).slice(0, 20).forEach((k) => (data[clean(k, 30)] = clean(d[k])));
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { id, role, status: "pending", createdAt: new Date().toISOString(), data };
    await redis(["HSET", "applications", id, JSON.stringify(rec)]);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Could not save" });
  }
};
