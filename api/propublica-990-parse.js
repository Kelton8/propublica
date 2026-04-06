const USER_AGENT = "CharterImpact-ProPublica-Parser/1.0";

function getHeader(headers, key) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(key);
  const foundKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === key.toLowerCase()
  );
  return foundKey ? headers[foundKey] : null;
}

function isXmlLike(text) {
  if (!text || typeof text !== "string") return false;
  const sample = text.trim().slice(0, 300).toLowerCase();
  return (
    sample.startsWith("<?xml") ||
    sample.includes("<return") ||
    sample.includes("<irs990") ||
    sample.includes("<form990")
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method && req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed. Use GET." });
    }

    const rawUrl = req.query?.url;
    const url = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;

    if (!url) {
      return res.status(400).json({ error: "Missing ProPublica URL" });
    }

    const match = String(url).match(/organizations\/(\d{9})/);
    if (!match) {
      return res.status(400).json({ error: "Invalid ProPublica URL" });
    }

    const ein = match[1];

    const orgRes = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      }
    );

    if (!orgRes.ok) {
      const body = await orgRes.text().catch(() => "");
      return res.status(502).json({
        error: `Failed to load organization data from ProPublica. Status ${orgRes.status}.`,
        details: body.slice(0, 300),
      });
    }

    const orgData = await orgRes.json();
    const filings = Array.isArray(orgData?.filings_with_data)
      ? orgData.filings_with_data
      : [];

    if (!filings.length) {
      return res.status(404).json({ error: "No filings found" });
    }

    const latest = [...filings]
      .filter(
        (filing) =>
          filing &&
          (filing.object_id ||
            filing.pdf_url ||
            filing.tax_prd ||
            filing.tax_prd_yr)
      )
      .sort((a, b) => {
        const aDate = Number(a?.tax_prd || 0);
        const bDate = Number(b?.tax_prd || 0);
        if (bDate !== aDate) return bDate - aDate;
        return Number(b?.tax_prd_yr || 0) - Number(a?.tax_prd_yr || 0);
      })[0];

    const objectId = latest?.object_id;
    if (!objectId) {
      return res
        .status(404)
        .json({ error: "Could not determine latest filing object id." });
    }

    const xmlUrl = `https://projects.propublica.org/nonprofits/download-xml?object_id=${encodeURIComponent(
      objectId
    )}`;

    const xmlRes = await fetch(xmlUrl, {
      redirect: "follow",
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
    });

    if (!xmlRes.ok) {
      const body = await xmlRes.text().catch(() => "");
      return res.status(502).json({
        error: `Failed to download XML from ProPublica. Status ${xmlRes.status}.`,
        details: body.slice(0, 300),
      });
    }

    const contentType = getHeader(xmlRes.headers, "content-type") || "";
    const xmlText = await xmlRes.text();

    if (!xmlText || !isXmlLike(xmlText)) {
      return res.status(502).json({
        error: "ProPublica returned a response, but it did not look like XML.",
        contentType,
        preview: String(xmlText || "").slice(0, 300),
      });
    }

    return res.status(200).json({
      organization: orgData?.organization || null,
      filingYear: latest?.tax_prd_yr || null,
      xmlUrl,
      xmlText,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Unexpected server error.",
      stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}
