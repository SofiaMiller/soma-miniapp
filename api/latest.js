const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

function parseQueryString(qs) {
  const params = new URLSearchParams(qs);
  const obj = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

function validateTelegramInitData(initData, botToken) {
  const data = parseQueryString(initData);
  const hash = data.hash;
  if (!hash) return { ok: false, reason: "Missing hash" };
  delete data.hash;

  const keys = Object.keys(data).sort();
  const dataCheckString = keys.map((k) => `${k}=${data[k]}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computed !== hash) return { ok: false, reason: "Invalid hash" };

  const user = data.user ? JSON.parse(data.user) : null;
  if (!user || !user.id) return { ok: false, reason: "Missing user" };
  return { ok: true, user };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { initData } = body;
    if (!initData) return res.status(400).send("Missing initData");

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!BOT_TOKEN  !SUPABASE_URL  !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).send("Server env not configured (BOT_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)");
    }

    const v = validateTelegramInitData(initData, BOT_TOKEN);
    if (!v.ok) return res.status(401).send(v.reason);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from("checkins")
      .select("created_at,soma,insight")
      .eq("telegram_user_id", String(v.user.id))
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return res.status(500).send("Supabase: " + error.message);
    return res.status(200).json({ latest: (data && data[0]) ? data[0] : null });
  } catch (e) {
    return res.status(500).send(e && e.stack ? e.stack : String(e));
  }
};
