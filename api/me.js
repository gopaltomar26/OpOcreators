const redis = require("../lib/redis");
const auth = require("../lib/auth");

module.exports = async (req, res) => {
  try {
    const id = auth.check((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!id) return res.status(401).json({ error: "Please log in" });
    const a = await redis(["HGET", "applications", id]);
    if (!a) return res.status(401).json({ error: "Please log in" });
    res.status(200).json({ profile: auth.profile(JSON.parse(a)) });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};
