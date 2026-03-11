import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.post("/proxy", async (req, res) => {
  const { url, method, headers, body } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  try {
    const opts = {
      method: method || "GET",
      headers: headers || {},
      redirect: "manual",
    };
    if (body !== undefined && body !== null && body !== "") {
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const upstream = await fetch(url, opts);
    const respBody = await upstream.text();

    res.status(upstream.status).json({
      status: upstream.status,
      headers: Object.fromEntries(upstream.headers.entries()),
      body: respBody,
    });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[proxy] 代理服务运行在 http://0.0.0.0:${PORT}`);
});
