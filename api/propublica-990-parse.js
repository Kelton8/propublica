export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing ProPublica URL" });
    }

    const match = url.match(/organizations\/(\d+)/);
    if (!match) {
      return res.status(400).json({ error: "Invalid ProPublica URL" });
    }

    const ein = match[1];

    const orgRes = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`
    );

    if (!orgRes.ok) {
      return res.status(502).json({ error: "Failed to load organization data from ProPublica." });
    }

    const orgData = await orgRes.json();
    const filings = orgData.filings_with_data;

    if (!filings || filings.length === 0) {
      return res.status(404).json({ error: "No filings found" });
    }

    const latest = filings[0];

    if (!latest.object_id) {
      return res.status(404).json({ error: "Latest filing does not include an object id." });
    }

    const filingRes = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/filings/${latest.object_id}.json`
    );

    if (!filingRes.ok) {
      return res.status(502).json({ error: "Failed to load filing details from ProPublica." });
    }

    const filingData = await filingRes.json();
    const xmlUrl = filingData?.filing?.xml_url;

    if (!xmlUrl) {
      return res.status(404).json({ error: "No XML URL was found for the latest filing." });
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
