const redis = require("../lib/redis");
const auth = require("../lib/auth");
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const fail = (c, m) => res.status(c).json({ error: m });
  try {
    const uid = auth.check((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!uid) return fail(401, "Please log in");
    const me = J(await redis(["HGET", "applications", uid]));
    if (!me) return fail(401, "Please log in");
    if (me.status !== "approved")
      return fail(403, "Your account is under review. Messages unlock once it is approved.");

    const b = req.body || {};
    const act = b.action;
    const after = Math.max(0, parseInt(b.after) || 0);
    const rl = async (k, max, sec) => {
      const n = await redis(["INCR", k]);
      if (n === 1) await redis(["EXPIRE", k, sec]);
      return n <= max;
    };
    const meta = async (id) => {
      const c = J(await redis(["HGET", "convos", String(id)]));
      return c && (c.clientId === uid || c.creatorId === uid) ? c : null;
    };
    const view = (c) => ({
      id: c.id, status: c.status, mine: c.clientId === uid,
      other: c.clientId === uid ? c.creatorName : c.clientName, last: c.last, at: c.updatedAt,
    });
    const getMsgs = async (id, from) =>
      ((await redis(["LRANGE", "msgs:" + id, from, -1])) || []).map(J).filter(Boolean)
        .map((m) => ({ mine: m.f === uid, text: m.text, t: m.t }));
    const text = String(b.text || "").trim().slice(0, 1000);

    if (act === "inbox") {
      const ids = (await redis(["SMEMBERS", "uconv:" + uid])) || [];
      if (!ids.length) return res.status(200).json({ list: [] });
      const vals = (await redis(["HMGET", "convos", ...ids])) || [];
      const list = vals.map(J).filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(view);
      return res.status(200).json({ list });
    }

    if (act === "request") {
      if (me.role !== "client") return fail(403, "Only clients can send requests");
      if (text.length < 10) return fail(400, "Write a short message about your project");
      const cr = J(await redis(["HGET", "applications", String(b.creatorId || "")]));
      if (!cr || cr.role !== "creator" || cr.status !== "approved") return fail(404, "Creator not found");
      if (!(await rl("rl:req:" + uid, 10, 3600))) return fail(429, "Too many requests. Try again later.");
      const id = uid + "_" + cr.id;
      if (await redis(["HGET", "convos", id])) return res.status(200).json({ convo: id, existing: true });
      const now = new Date().toISOString();
      const c = { id, clientId: uid, creatorId: cr.id, clientName: me.data.name, creatorName: cr.data.name,
        status: "pending", createdAt: now, updatedAt: now, last: text.slice(0, 60) };
      await redis(["HSET", "convos", id, JSON.stringify(c)]);
      await redis(["RPUSH", "msgs:" + id, JSON.stringify({ f: uid, text, t: now })]);
      await redis(["SADD", "uconv:" + uid, id]);
      await redis(["SADD", "uconv:" + cr.id, id]);
      return res.status(200).json({ convo: id });
    }

    const c = await meta(b.convo);
    if (!c) return fail(404, "Conversation not found");

    if (act === "open") return res.status(200).json({ convo: view(c), msgs: await getMsgs(c.id, after) });

    if (act === "send") {
      if (c.status !== "accepted") return fail(403, "Chat opens once the creator accepts");
      if (!text) return fail(400, "Write a message");
      if (!(await rl("rl:msg:" + uid, 40, 60))) return fail(429, "You are sending messages too fast");
      const now = new Date().toISOString();
      await redis(["RPUSH", "msgs:" + c.id, JSON.stringify({ f: uid, text, t: now })]);
      c.last = text.slice(0, 60);
      c.updatedAt = now;
      await redis(["HSET", "convos", c.id, JSON.stringify(c)]);
      return res.status(200).json({ msgs: await getMsgs(c.id, after) });
    }

    if (act === "accept" || act === "decline") {
      if (c.creatorId !== uid || c.status !== "pending") return fail(403, "Not allowed");
      c.status = act === "accept" ? "accepted" : "declined";
      c.updatedAt = new Date().toISOString();
      await redis(["HSET", "convos", c.id, JSON.stringify(c)]);
      return res.status(200).json({ ok: true });
    }
    fail(400, "Bad request");
  } catch (e) {
    fail(500, "Server error");
  }
};
