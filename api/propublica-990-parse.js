export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing ProPublica URL" });
    }

    if (!String(url).includes("projects.propublica.org/nonprofits/organizations/")) {
      return res.status(400).json({ error: "Invalid ProPublica organization URL" });
    }

    const pageRes = await fetch(url);

    if (!pageRes.ok) {
      return res.status(502).json({ error: "Failed to load ProPublica organization page." });
    }

    const pageHtml = await pageRes.text();

    const xmlMatches = [
      ...pageHtml.matchAll(/href=["']([^"']*download-xml\?object_id=[^"']+)["']/gi),
    ];

    const xmlHref = xmlMatches[0]?.[1];

    if (!xmlHref) {
      return res.status(404).json({
        error: "Could not find an XML link on the ProPublica organization page.",
      });
    }

    const xmlUrl = xmlHref.startsWith("http")
      ? xmlHref
      : `https://projects.propublica.org${xmlHref}`;

    const xmlRes = await fetch(xmlUrl);

    if (!xmlRes.ok) {
      return res.status(502).json({ error: "Failed to download XML from ProPublica." });
    }

    const xmlText = await xmlRes.text();

    return res.status(200).json({
      organization: null,
      filingYear: null,
      xmlUrl,
      xmlText,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}
