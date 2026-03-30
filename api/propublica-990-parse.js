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

    const orgData = await orgRes.json();

    const filings = orgData.filings_with_data;

    if (!filings || filings.length === 0) {
      return res.status(404).json({ error: "No filings found" });
    }

    const latest = filings[0];

    const filingRes = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/filings/${latest.object_id}.json`
    );

    const filingData = await filingRes.json();

    const xmlUrl = filingData.filing.xml_url;

    const xmlRes = await fetch(xmlUrl);
    const xmlText = await xmlRes.text();

    res.status(200).json({
      organization: orgData.organization,
      filingYear: latest.tax_prd_yr,
      xmlUrl,
      xmlText
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
