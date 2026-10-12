const redis = require("../lib/redis");
const crypto = require("crypto");

const same = (a, b) => {
  a = Buffer.from(String(a));
  b = Buffer.from(String(b));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = async (req, res) => {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !same(req.headers["x-admin-key"] || "", pw))
    return res.status(401).json({ error: "Wrong password" });
  try {
    if (req.method === "GET") {
      const flat = (await redis(["HGETALL", "applications"])) || [];
      const list = [];
      for (let i = 1; i < flat.length; i += 2) {
        try { list.push(JSON.parse(flat[i])); } catch (e) {}
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return res.status(200).json({ list });
    }
    if (req.method === "POST") {
      const { id, action } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });
      if (action === "delete") {
        await redis(["HDEL", "applications", id]);
        return res.status(200).json({ ok: true });
      }
      if (["approved", "rejected", "pending"].includes(action)) {
        const cur = await redis(["HGET", "applications", id]);
        if (!cur) return res.status(404).json({ error: "Not found" });
        const rec = JSON.parse(cur);
        rec.status = action;
        await redis(["HSET", "applications", id, JSON.stringify(rec)]);
        return res.status(200).json({ ok: true });
      }
    }
    res.status(400).json({ error: "Bad request" });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};
