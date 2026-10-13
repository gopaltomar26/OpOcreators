const crypto = require("crypto");

const secret = () => {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("No secret set");
  return s;
};

exports.hash = (pw, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.scryptSync(pw, salt, 64).toString("hex"),
});

exports.verify = (pw, salt, hash) => {
  const h = crypto.scryptSync(pw, salt, 64);
  const k = Buffer.from(hash, "hex");
  return h.length === k.length && crypto.timingSafeEqual(h, k);
};

exports.sign = (id) => {
  const p = Buffer.from(JSON.stringify({ u: id, e: Date.now() + 30 * 864e5 })).toString("base64url");
  return p + "." + crypto.createHmac("sha256", secret()).update(p).digest("base64url");
};

exports.check = (token) => {
  try {
    const [p, s] = String(token).split(".");
    const x = crypto.createHmac("sha256", secret()).update(p).digest("base64url");
    const a = Buffer.from(s), b = Buffer.from(x);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    return d.e > Date.now() ? d.u : null;
  } catch (e) {
    return null;
  }
};

exports.profile = (r) => ({
  id: r.id,
  name: r.data.name,
  email: r.data.email,
  role: r.role,
  status: r.status,
});
