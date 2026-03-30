import React, { useMemo, useState } from "react";

function getText(node) {
  if (!node) return "";
  return (node.textContent || "").trim();
}

function firstByLocalName(root, localName) {
  const all = root.getElementsByTagName("*");
  for (const el of all) {
    const name = el.localName || el.nodeName?.split(":").pop();
    if (name === localName) return el;
  }
  return null;
}

function allByLocalName(root, localName) {
  const all = root.getElementsByTagName("*");
  const matches = [];
  for (const el of all) {
    const name = el.localName || el.nodeName?.split(":").pop();
    if (name === localName) matches.push(el);
  }
  return matches;
}

function removeBlankFields(obj) {
  if (!obj || typeof obj !== "object") return obj;
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== "" && value != null)
  );
}

function parseBooksInCareOf(detailNode) {
  if (!detailNode) return null;

  const fields = {
    BusinessNameLine1Txt: getText(firstByLocalName(detailNode, "BusinessNameLine1Txt")),
    BusinessNameLine2Txt: getText(firstByLocalName(detailNode, "BusinessNameLine2Txt")),
    PersonNm: getText(firstByLocalName(detailNode, "PersonNm")),
    PhoneNum: getText(firstByLocalName(detailNode, "PhoneNum")),
    ForeignPhoneNum: getText(firstByLocalName(detailNode, "ForeignPhoneNum")),
    AddressLine1Txt: getText(firstByLocalName(detailNode, "AddressLine1Txt")),
    AddressLine2Txt: getText(firstByLocalName(detailNode, "AddressLine2Txt")),
    CityNm: getText(firstByLocalName(detailNode, "CityNm")),
    StateAbbreviationCd: getText(firstByLocalName(detailNode, "StateAbbreviationCd")),
    ZIPCd: getText(firstByLocalName(detailNode, "ZIPCd")),
    ForeignProvinceOrStateNm: getText(firstByLocalName(detailNode, "ForeignProvinceOrStateNm")),
    ForeignPostalCd: getText(firstByLocalName(detailNode, "ForeignPostalCd")),
    CountryCd: getText(firstByLocalName(detailNode, "CountryCd")),
  };

  return removeBlankFields(fields);
}

function parseContractor(node, index) {
  return removeBlankFields({
    id: index + 1,
    BusinessNameLine1Txt: getText(firstByLocalName(node, "BusinessNameLine1Txt")),
    BusinessNameLine2Txt: getText(firstByLocalName(node, "BusinessNameLine2Txt")),
    PersonNm: getText(firstByLocalName(node, "PersonNm")),
    AddressLine1Txt: getText(firstByLocalName(node, "AddressLine1Txt")),
    AddressLine2Txt: getText(firstByLocalName(node, "AddressLine2Txt")),
    CityNm: getText(firstByLocalName(node, "CityNm")),
    StateAbbreviationCd: getText(firstByLocalName(node, "StateAbbreviationCd")),
    ZIPCd: getText(firstByLocalName(node, "ZIPCd")),
    CountryCd: getText(firstByLocalName(node, "CountryCd")),
    ServicesDesc: getText(firstByLocalName(node, "ServicesDesc")),
    CompensationAmt: getText(firstByLocalName(node, "CompensationAmt")),
  });
}

function parse990Xml(xmlString) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");
  const parserError = xml.querySelector("parsererror");

  if (parserError) {
    throw new Error("That file could not be parsed as valid XML.");
  }

  const totalRevenue = getText(firstByLocalName(xml, "CYTotalRevenueAmt"));
  const booksInCareOf = parseBooksInCareOf(firstByLocalName(xml, "BooksInCareOfDetail"));
  const contractors = allByLocalName(xml, "ContractorCompensationGrp").map(parseContractor);

  return {
    CYTotalRevenueAmt: totalRevenue,
    BooksInCareOfDetail: booksInCareOf,
    ContractorCompensationGrp: contractors,
  };
}

function formatMoney(value) {
  if (!value) return "—";
  const num = Number(String(value).replace(/,/g, ""));
  if (Number.isNaN(num)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatAddress(detail) {
  if (!detail) return null;
  const parts = [
    detail.AddressLine1Txt,
    detail.AddressLine2Txt,
    [detail.CityNm, detail.StateAbbreviationCd, detail.ZIPCd].filter(Boolean).join(", "),
    detail.CountryCd,
  ].filter(Boolean);

  if (!parts.length) return null;
  return parts.join(" • ");
}

function getContractorAddress(contractor) {
  const parts = [
    contractor.AddressLine1Txt,
    contractor.AddressLine2Txt,
    [contractor.CityNm, contractor.StateAbbreviationCd, contractor.ZIPCd]
      .filter(Boolean)
      .join(", "),
    contractor.CountryCd,
  ].filter(Boolean);

  return parts.length ? parts.join(" • ") : null;
}

function detectServiceSignals(parsed) {
  if (!parsed) {
    return {
      detectedVendors: [],
      summarySignals: [],
      outsourcingLikelihood: "Low",
    };
  }

  const serviceRules = [
    {
      category: "Business Management",
      patterns: [
        "business management",
        "management services",
        "school management",
        "charter management",
        "back office",
        "business office",
      ],
      signal: "Potential outsourced business management relationship",
    },
    {
      category: "Accounting / Financial Services",
      patterns: [
        "accounting",
        "financial services",
        "finance services",
        "bookkeeping",
        "general ledger",
        "accounts payable",
        "accounts receivable",
        "fiscal services",
        "controller services",
        "cfo services",
        "finance",
      ],
      signal: "Potential outsourced finance or accounting relationship",
    },
    {
      category: "Payroll / HR",
      patterns: [
        "payroll",
        "human resources",
        "hr services",
        "benefits administration",
        "retirement services",
      ],
      signal: "Potential outsourced payroll or HR relationship",
    },
    {
      category: "Audit / Tax",
      patterns: [
        "audit",
        "auditing",
        "tax preparation",
        "tax services",
        "assurance services",
        "financial statement",
      ],
      signal: "Professional audit or tax support detected",
    },
  ];

  const contractors = parsed.ContractorCompensationGrp || [];
  const detectedVendors = [];
  const summarySignals = new Set();
  let outsourcingScore = 0;

  contractors.forEach((contractor) => {
    const serviceText = String(contractor.ServicesDesc || "").toLowerCase();
    if (!serviceText) return;

    serviceRules.forEach((rule) => {
      const matchedPattern = rule.patterns.find((pattern) =>
        serviceText.includes(pattern)
      );
      if (!matchedPattern) return;

      detectedVendors.push({
        vendorName:
          contractor.BusinessNameLine1Txt ||
          contractor.PersonNm ||
          `Contractor ${contractor.id}`,
        category: rule.category,
        reason: `Matched keyword: ${matchedPattern}`,
        services: contractor.ServicesDesc,
        compensation: contractor.CompensationAmt,
      });

      summarySignals.add(rule.signal);

      if (
        rule.category === "Business Management" ||
        rule.category === "Accounting / Financial Services"
      ) {
        outsourcingScore += 2;
      } else {
        outsourcingScore += 1;
      }
    });
  });

  let outsourcingLikelihood = "Low";
  if (outsourcingScore >= 4) outsourcingLikelihood = "High";
  else if (outsourcingScore >= 2) outsourcingLikelihood = "Medium";

  return {
    detectedVendors,
    summarySignals: [...summarySignals],
    outsourcingLikelihood,
  };
}

function getGrade(parsed) {
  const revenue = Number(parsed?.CYTotalRevenueAmt || 0);
  const contractorCount = parsed?.ContractorCompensationGrp?.length || 0;
  const hasBooksCustodian = Boolean(
    parsed?.BooksInCareOfDetail?.PersonNm ||
      parsed?.BooksInCareOfDetail?.BusinessNameLine1Txt
  );

  if (revenue > 10000000 && hasBooksCustodian && contractorCount >= 3) return "A-";
  if (revenue > 3000000 && hasBooksCustodian) return "B";
  if (revenue > 1000000) return "C+";
  if (revenue > 0) return "C";
  return "Insufficient Data";
}

function getForensicAnalysis(parsed) {
  if (!parsed) return null;

  const revenue = Number(parsed.CYTotalRevenueAmt || 0);
  const contractors = parsed.ContractorCompensationGrp || [];
  const books = parsed.BooksInCareOfDetail || null;
  const largestContractor = [...contractors]
    .map((contractor) => ({
      ...contractor,
      numericComp: Number(String(contractor.CompensationAmt || 0).replace(/,/g, "")),
    }))
    .sort((a, b) => b.numericComp - a.numericComp)[0];

  const findings = [];

  if (revenue > 0) {
    findings.push(`Current year revenue reported: ${formatMoney(revenue)}`);
  }

  if (books?.PersonNm || books?.BusinessNameLine1Txt) {
    findings.push(
      `Books and records held by ${books.PersonNm || books.BusinessNameLine1Txt}`
    );
  } else {
    findings.push("No clear books and records custodian detected");
  }

  if (contractors.length) {
    findings.push(`${contractors.length} independent contractor relationship${contractors.length === 1 ? "" : "s"} detected`);
  } else {
    findings.push("No contractor compensation entries detected");
  }

  if (largestContractor?.numericComp > 0) {
    findings.push(
      `Largest contractor payment: ${
        largestContractor.BusinessNameLine1Txt ||
        largestContractor.PersonNm ||
        "Unknown vendor"
      } (${formatMoney(largestContractor.numericComp)})`
    );
  }

  findings.push(
    "Note: This is a structural interpretation of the filing, not a full audit."
  );

  return {
    grade: getGrade(parsed),
    findings,
  };
}

function getGradeBadgeClasses(grade) {
  if (!grade) return "bg-slate-100 text-slate-700 border-slate-200";
  const normalized = String(grade).charAt(0).toUpperCase();

  if (normalized === "A") return "bg-green-50 text-green-700 border-green-200";
  if (normalized === "B") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (normalized === "C") return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalized === "D") return "bg-orange-50 text-orange-700 border-orange-200";
  if (normalized === "F") return "bg-red-50 text-red-700 border-red-200";

  return "bg-slate-100 text-slate-700 border-slate-200";
}

function cardClass(extra = "") {
  return `rounded-[10px] border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${extra}`;
}

function IconDollar() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2v20M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5 1.5 2.8 5 3.5 5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" />
    </svg>
  );
}

function IconBadge() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l2.2 2.2 3.1-.4.4 3.1L20 10l-2.2 2.2.4 3.1-3.1.4L12 18l-2.2-2.2-3.1.4-.4-3.1L4 10l2.2-2.2-.4-3.1 3.1-.4L12 3z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3.5 3.5 0 0 1 0 6.74" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v6c0 5-3.4 8.7-7 10-3.6-1.3-7-5-7-10V6l7-3z" />
    </svg>
  );
}

function IconRadar() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M12 12l6-6" />
    </svg>
  );
}

function exportFinancialSummary(parsed, analysis, serviceSignals) {
  if (!parsed) return;

  const lines = [
    "IRS 990 Financial Summary",
    "",
    `Revenue: ${formatMoney(parsed.CYTotalRevenueAmt)}`,
    `Financial Grade: ${analysis?.grade || "—"}`,
    `Independent Contractors: ${parsed.ContractorCompensationGrp?.length || 0}`,
    `Books & Records Custodian: ${
      parsed.BooksInCareOfDetail?.PersonNm ||
      parsed.BooksInCareOfDetail?.BusinessNameLine1Txt ||
      "—"
    }`,
    "",
    "AI Financial Interpretation",
    ...(analysis?.findings || []).map((f) => `• ${f}`),
    "",
    "Vendor & Finance Signals",
    `Outsourcing Likelihood: ${serviceSignals?.outsourcingLikelihood || "Low"}`,
    ...(serviceSignals?.summarySignals || []).map((s) => `• ${s}`),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "irs-990-financial-summary.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function IRS990XmlParserApp() {
  const [xmlInput, setXmlInput] = useState(`Paste IRS 990 XML here if you want to test the parser manually.

For production use, the ProPublica URL lookup should call your backend endpoint instead of fetching ProPublica directly from the browser.`);
  const [nonprofitUrl, setNonprofitUrl] = useState(
    "https://projects.propublica.org/nonprofits/organizations/133846431"
  );
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(null);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [loadingParse, setLoadingParse] = useState(false);
  const [sourceMeta, setSourceMeta] = useState(null);
  const [showRawXml, setShowRawXml] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "CompensationAmt", direction: "desc" });

  const contractorCount = parsed?.ContractorCompensationGrp?.length || 0;
  const analysis = useMemo(() => getForensicAnalysis(parsed), [parsed]);
  const serviceSignals = useMemo(() => detectServiceSignals(parsed), [parsed]);

  const sortedContractors = useMemo(() => {
    const contractors = [...(parsed?.ContractorCompensationGrp || [])];
    const { key, direction } = sortConfig;

    contractors.sort((a, b) => {
      let aVal = a[key] || "";
      let bVal = b[key] || "";

      if (key === "CompensationAmt") {
        aVal = Number(String(aVal).replace(/,/g, "")) || 0;
        bVal = Number(String(bVal).replace(/,/g, "")) || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });

    return contractors;
  }, [parsed, sortConfig]);

  function handleSort(key) {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: key === "CompensationAmt" ? "desc" : "asc" };
    });
  }

  async function loadFromProPublicaUrl() {
    try {
      setLoadingLookup(true);
      setError("");

      if (!nonprofitUrl) {
        throw new Error("Please paste a ProPublica Nonprofit Explorer URL.");
      }

      const response = await fetch(
        `/api/propublica-990-parse?url=${encodeURIComponent(nonprofitUrl)}`
      );

      if (!response.ok) {
        throw new Error(
          "Backend lookup failed. The /api/propublica-990-parse endpoint may not be running."
        );
      }

      const data = await response.json();

      if (!data?.xmlText) {
        throw new Error("The backend did not return XML data.");
      }

      const xmlText = data.xmlText;
      setXmlInput(xmlText);

      setSourceMeta({
        method: "propublica-url",
        orgName: data?.organization?.name,
        sourceLabel: "Loaded from ProPublica via backend",
        filingYear: data?.filingYear,
        xmlUrl: data?.xmlUrl,
        organizationUrl: nonprofitUrl,
      });

      setParsed(parse990Xml(xmlText));
    } catch (err) {
      setParsed(null);
      setSourceMeta(null);
      setError(err.message || "Unable to load filing from ProPublica.");
    } finally {
      setLoadingLookup(false);
    }
  }

  function handleParse() {
    try {
      setLoadingParse(true);
      setError("");
      setSourceMeta({
        method: "pasted-xml",
        orgName: "Pasted XML",
        sourceLabel: "Parsed from pasted XML content",
      });
      setParsed(parse990Xml(xmlInput));
    } catch (err) {
      setParsed(null);
      setError(err.message || "Unable to parse XML.");
    } finally {
      setLoadingParse(false);
    }
  }

  const metrics = useMemo(() => {
    return [
      {
        label: "Revenue",
        value: parsed ? formatMoney(parsed.CYTotalRevenueAmt) : "—",
        icon: <IconDollar />,
      },
      {
        label: "Financial Grade",
        value: analysis?.grade || "—",
        icon: <IconBadge />,
      },
      {
        label: "Independent Contractors",
        value: parsed ? `${contractorCount} contractor${contractorCount === 1 ? "" : "s"}` : "—",
        icon: <IconUsers />,
      },
      {
        label: "Books & Records Custodian",
        value:
          parsed?.BooksInCareOfDetail?.PersonNm ||
          parsed?.BooksInCareOfDetail?.BusinessNameLine1Txt ||
          "—",
        icon: <IconShield />,
      },
    ];
  }, [parsed, analysis, contractorCount]);

  return (
    <div
      className="min-h-screen bg-[#F7F8FA] text-slate-900"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            IRS 990 Financial Analyzer
          </h1>
          <p className="mt-2 text-sm font-normal text-slate-600">
            Upload or paste a ProPublica filing to analyze nonprofit financial signals
          </p>
        </div>

        <div className={cardClass("mb-8")}>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <div className="mb-3 text-sm font-medium text-slate-700">ProPublica URL</div>
              <input
                type="url"
                value={nonprofitUrl}
                onChange={(e) => setNonprofitUrl(e.target.value)}
                placeholder="https://projects.propublica.org/nonprofits/organizations/133846431"
                className="w-full rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={loadFromProPublicaUrl}
                disabled={loadingLookup}
                className="mt-4 inline-flex items-center rounded-[10px] bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingLookup ? "Parsing IRS Filing..." : "Load Filing"}
              </button>
            </div>

            <div className="xl:col-span-7">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">XML Input</div>
                <button
                  type="button"
                  onClick={() => setShowRawXml((prev) => !prev)}
                  className="text-sm font-medium text-[#2563EB]"
                >
                  {showRawXml ? "Hide Raw XML" : "Show Raw XML"}
                </button>
              </div>

              {showRawXml ? (
                <textarea
                  value={xmlInput}
                  onChange={(e) => setXmlInput(e.target.value)}
                  placeholder="Paste your full XML copy here..."
                  className="h-[280px] w-full rounded-[10px] border border-[#E5E7EB] bg-white p-4 font-mono text-xs leading-5 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                />
              ) : (
                <div className="rounded-[10px] border border-dashed border-[#E5E7EB] bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  Raw XML hidden for easier scanning. Toggle “Show Raw XML” to view or edit.
                </div>
              )}

              <button
                onClick={handleParse}
                disabled={loadingParse}
                className="mt-4 inline-flex items-center rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingParse ? "Parsing IRS Filing..." : "Parse XML"}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-8 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#DC2626]">
            {error}
          </div>
        ) : null}

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className={cardClass()}>
              <div className="flex items-center gap-3 text-[#2563EB]">
                {metric.icon}
                <div className="text-sm font-medium text-slate-600">{metric.label}</div>
              </div>

              {metric.label === "Financial Grade" ? (
                <div className="mt-4">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getGradeBadgeClasses(
                      metric.value
                    )}`}
                  >
                    {metric.value}
                  </span>
                </div>
              ) : (
                <div className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                  {metric.value}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mb-8 flex items-center justify-end">
          <button
            type="button"
            onClick={() => exportFinancialSummary(parsed, analysis, serviceSignals)}
            disabled={!parsed}
            className="rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Financial Summary (PDF)
          </button>
        </div>

        {parsed ? (
          <>
            <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="xl:col-span-8">
                <div className={cardClass("bg-blue-50/60")}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">
                        AI Financial Interpretation
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Analysis Confidence: Moderate
                      </p>
                    </div>
                    <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-[#2563EB]">
                      {analysis?.grade || "—"} grade
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {analysis?.findings?.map((finding, index) => (
                      <div key={index} className="flex items-start gap-3 text-sm text-slate-700">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                        <span>{finding}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="xl:col-span-4">
                <div className={cardClass()}>
                  <div className="flex items-center gap-3 text-slate-900">
                    <IconShield />
                    <h2 className="text-lg font-semibold">Books & Records Custodian</h2>
                  </div>

                  <div className="mt-5 space-y-4 text-sm text-slate-700">
                    <div>
                      <div className="font-medium text-slate-500">Name</div>
                      <div className="mt-1">
                        {parsed.BooksInCareOfDetail?.PersonNm ||
                          parsed.BooksInCareOfDetail?.BusinessNameLine1Txt ||
                          "—"}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-500">Phone</div>
                      <div className="mt-1">
                        {parsed.BooksInCareOfDetail?.PhoneNum ||
                          parsed.BooksInCareOfDetail?.ForeignPhoneNum ||
                          "—"}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-500">Address</div>
                      <div className="mt-1">
                        {formatAddress(parsed.BooksInCareOfDetail) || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className={cardClass()}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-slate-900">
                    <IconRadar />
                    <div>
                      <h2 className="text-lg font-semibold">Vendor & Finance Signals</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Service-keyword detection across contractor records
                      </p>
                    </div>
                  </div>

                  <div
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      serviceSignals.outsourcingLikelihood === "High"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : serviceSignals.outsourcingLikelihood === "Medium"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-green-200 bg-green-50 text-green-700"
                    }`}
                  >
                    Outsourcing Likelihood: {serviceSignals.outsourcingLikelihood}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {serviceSignals.summarySignals.length ? (
                    serviceSignals.summarySignals.map((signal, index) => (
                      <span
                        key={index}
                        className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-[#2563EB]"
                      >
                        Prospecting Signal Detected
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      No finance-related service keywords detected.
                    </span>
                  )}
                </div>

                {serviceSignals.detectedVendors.length ? (
                  <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {serviceSignals.detectedVendors.map((vendor, index) => (
                      <div
                        key={`${vendor.vendorName}-${index}`}
                        className="rounded-[10px] border border-[#E5E7EB] bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-base font-semibold text-slate-950">
                              {vendor.vendorName}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              Service: {vendor.category}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-slate-950">
                            {formatMoney(vendor.compensation)}
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-slate-700">
                          <div>
                            <span className="font-medium text-slate-500">Signal: </span>
                            {vendor.reason}
                          </div>
                          <div>
                            <span className="font-medium text-slate-500">Matched Keywords: </span>
                            {vendor.services || "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mb-8">
              <div className={cardClass()}>
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      Independent Contractors
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Sortable contractor table with vendor, service, amount, and location
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        <th
                          className="cursor-pointer border-b border-[#E5E7EB] px-4 py-3"
                          onClick={() => handleSort("BusinessNameLine1Txt")}
                        >
                          Vendor
                        </th>
                        <th
                          className="cursor-pointer border-b border-[#E5E7EB] px-4 py-3"
                          onClick={() => handleSort("ServicesDesc")}
                        >
                          Service
                        </th>
                        <th
                          className="cursor-pointer border-b border-[#E5E7EB] px-4 py-3 text-right"
                          onClick={() => handleSort("CompensationAmt")}
                        >
                          Amount
                        </th>
                        <th
                          className="cursor-pointer border-b border-[#E5E7EB] px-4 py-3"
                          onClick={() => handleSort("CityNm")}
                        >
                          Location
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedContractors.length ? (
                        sortedContractors.map((contractor) => (
                          <tr
                            key={contractor.id}
                            className="transition-colors hover:bg-slate-50"
                          >
                            <td className="border-b border-[#E5E7EB] px-4 py-4 text-sm font-medium text-slate-900">
                              {contractor.BusinessNameLine1Txt ||
                                contractor.PersonNm ||
                                `Contractor ${contractor.id}`}
                            </td>
                            <td className="border-b border-[#E5E7EB] px-4 py-4 text-sm text-slate-700">
                              {contractor.ServicesDesc || "—"}
                            </td>
                            <td className="border-b border-[#E5E7EB] px-4 py-4 text-right text-sm font-medium text-slate-900">
                              {formatMoney(contractor.CompensationAmt)}
                            </td>
                            <td className="border-b border-[#E5E7EB] px-4 py-4 text-sm text-slate-700">
                              {getContractorAddress(contractor) || "—"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-sm text-slate-500"
                          >
                            No contractor records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : !error ? (
          <div className={cardClass("text-center text-sm text-slate-500")}>
            No parsed results yet. Paste a ProPublica URL to test the backend lookup, or
            paste raw XML to test the parser manually.
          </div>
        ) : null}
      </div>
    </div>
  );
}
