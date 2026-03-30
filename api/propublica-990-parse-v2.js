export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing ProPublica URL" });
    }

    const match = String(url).match(/organizations\/(\d+)/);
    if (!match) {
      return res.status(400).json({ error: "Invalid ProPublica URL" });
    }

    const ein = match[1];
    const orgUrl = `https://projects.propublica.org/nonprofits/organizations/${ein}`;

    const orgRes = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`
    );

    if (!orgRes.ok) {
      return res.status(502).json({ error: "Failed to load organization data from ProPublica." });
    }

    const orgData = await orgRes.json();
    const filings = orgData.filings_with_data || [];

    if (!filings.length) {
      return res.status(404).json({ error: "No filings found" });
    }

    const latest = [...filings].sort(
      (a, b) => Number(b.tax_prd || 0) - Number(a.tax_prd || 0)
    )[0];

    let xmlUrl = null;

    if (latest.object_id) {
      xmlUrl = `https://projects.propublica.org/nonprofits/download-xml?object_id=${latest.object_id}`;
    } else {
      const pageRes = await fetch(orgUrl);
      if (!pageRes.ok) {
        return res.status(502).json({ error: "Failed to load organization page for XML discovery." });
      }

      const pageHtml = await pageRes.text();
      const xmlMatches = [...pageHtml.matchAll(/href=["']([^"']*download-xml\?object_id=[^"']+)["']/gi)];
      const xmlHref = xmlMatches[0]?.[1];

      if (!xmlHref) {
        return res.status(404).json({ error: "Could not find an XML download link on the ProPublica organization page." });
      }

      xmlUrl = xmlHref.startsWith("http")
        ? xmlHref
        : `https://projects.propublica.org${xmlHref}`;
    }

    const xmlRes = await fetch(xmlUrl);

    if (!xmlRes.ok) {
      return res.status(502).json({ error: "Failed to download XML from ProPublica." });
    }

    const xmlText = await xmlRes.text();

    return res.status(200).json({
      organization: orgData.organization || null,
      filingYear: latest.tax_prd_yr || null,
      xmlUrl,
      xmlText,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}
