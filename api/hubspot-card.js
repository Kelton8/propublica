function baseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  try {
    const companyId = req.query.associatedObjectId || "";
    const portalId = req.query.portalId || "";
    const nonprofitUrl = req.query.nonprofit_explorer_url || "";

    const viewer = new URL("/hubspot.html", baseUrl(req));

    if (companyId) viewer.searchParams.set("companyId", companyId);
    if (portalId) viewer.searchParams.set("portalId", portalId);
    if (nonprofitUrl)
      viewer.searchParams.set("nonprofit_explorer_url", nonprofitUrl);

    return res.status(200).json({
      results: [
        {
          objectId: Number(companyId) || 1,
          title: "ProPublica 990 Viewer",
          link: nonprofitUrl || null,
          properties: [
            {
              label: "Status",
              dataType: "STATUS",
              value: nonprofitUrl
                ? "Ready to generate"
                : "Missing Nonprofit Explorer URL",
              optionType: nonprofitUrl ? "SUCCESS" : "WARNING",
            },
            {
              label: "Nonprofit Explorer URL",
              dataType: nonprofitUrl ? "LINK" : "STRING",
              value: nonprofitUrl || "Populate nonprofit_explorer_url",
              linkLabel: "Open in ProPublica",
            },
          ],
          actions: [
            {
              type: "IFRAME",
              width: 1200,
              height: 780,
              uri: viewer.toString(),
              label: nonprofitUrl
                ? "Generate most recent ProPublica information"
                : "Open ProPublica viewer",
            },
          ],
        },
      ],
    });
  } catch (err) {
    return res.status(200).json({
      results: [
        {
          objectId: 1,
          title: "ProPublica Viewer",
          link: null,
          properties: [
            {
              label: "Error",
              dataType: "STRING",
              value: err.message,
            },
          ],
        },
      ],
    });
  }
}
