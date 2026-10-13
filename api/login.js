const redis = require("../lib/redis");
const auth = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
    const pw = String(b.password || "").slice(0, 100);
    if (!email || !pw) return res.status(400).json({ error: "Enter your email and password" });

    const k = "rl:" + email;
    const n = await redis(["INCR", k]);
    if (n === 1) await redis(["EXPIRE", k, 900]);
    if (n > 8) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

    const u = await redis(["HGET", "users", email]);
    const rec = u && JSON.parse(u);
    if (!rec || !auth.verify(pw, rec.salt, rec.hash))
      return res.status(401).json({ error: "Wrong email or password" });

    const a = await redis(["HGET", "applications", rec.id]);
    if (!a) return res.status(401).json({ error: "This account no longer exists" });

    await redis(["DEL", k]);
    res.status(200).json({ token: auth.sign(rec.id), profile: auth.profile(JSON.parse(a)) });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};
