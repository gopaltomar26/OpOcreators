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
    if (req.method === "GET" && req.query && req.query.tickets) {
      const flat = (await redis(["HGETALL", "tickets"])) || [];
      const list = [];
      for (let i = 1; i < flat.length; i += 2) {
        try { list.push(JSON.parse(flat[i])); } catch (e) {}
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return res.status(200).json({ list });
    }
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
      const b2 = req.body || {};
      const { id, action } = b2;
      if (!id) return res.status(400).json({ error: "Missing id" });
      if (action === "ticket_delete") {
        await redis(["HDEL", "tickets", id]);
        return res.status(200).json({ ok: true });
      }
      if (action === "ticket_resolve") {
        const t = await redis(["HGET", "tickets", id]);
        if (!t) return res.status(404).json({ error: "Not found" });
        const rec = JSON.parse(t);
        rec.status = "resolved";
        await redis(["HSET", "tickets", id, JSON.stringify(rec)]);
        return res.status(200).json({ ok: true });
      }
      if (action === "delete") {
        const cur = await redis(["HGET", "applications", id]);
        if (cur) {
          try { await redis(["HDEL", "users", String(JSON.parse(cur).data.email).toLowerCase()]); } catch (e) {}
        }
        await redis(["HDEL", "applications", id]);
        return res.status(200).json({ ok: true });
      }
      if (action === "setplan") {
        const plan = b2.plan;
        if (!["free", "basic", "premium", "advanced"].includes(plan)) return res.status(400).json({ error: "Bad plan" });
        const cur = await redis(["HGET", "applications", id]);
        if (!cur) return res.status(404).json({ error: "Not found" });
        const rec = JSON.parse(cur);
        if (plan === "free") { delete rec.plan; delete rec.planUntil; }
        else {
          rec.plan = plan;
          rec.planUntil = new Date(Date.now() + Math.min(3650, Math.max(1, Number(b2.days) || 30)) * 864e5).toISOString();
        }
        await redis(["HSET", "applications", id, JSON.stringify(rec)]);
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
