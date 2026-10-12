const redis = require("../lib/redis");

// Public list: only creators the admin has approved, and only public fields.
module.exports = async (req, res) => {
  try {
    const flat = (await redis(["HGETALL", "applications"])) || [];
    const list = [];
    for (let i = 1; i < flat.length; i += 2) {
      let r;
      try { r = JSON.parse(flat[i]); } catch (e) { continue; }
      if (r.role === "creator" && r.status === "approved") {
        const d = r.data;
        list.push({ id: r.id, name: d.name, niche: d.niche, platform: d.platform, followers: d.followers,
          handle: d.handle, port: d.port, rate: d.rate, bio: d.bio, at: r.createdAt });
      }
    }
    list.sort((a, b) => b.at.localeCompare(a.at));
    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    res.status(200).json({ list });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
};
