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
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== "" && value != null));
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
  if (!value) return null;
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
    [contractor.CityNm, contractor.StateAbbreviationCd, contractor.ZIPCd].filter(Boolean).join(", "),
    contractor.CountryCd,
  ].filter(Boolean);

  return parts.length ? parts.join(" • ") : null;
}

function getGrade(parsed) {
  const revenue = Number(parsed?.CYTotalRevenueAmt || 0);
  const contractorCount = parsed?.ContractorCompensationGrp?.length || 0;
  const hasBooksCustodian = Boolean(
    parsed?.BooksInCareOfDetail?.PersonNm || parsed?.BooksInCareOfDetail?.BusinessNameLine1Txt
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
    findings.push(`Current year revenue reported: ${formatMoney(revenue)}.`);
  }

  if (books?.PersonNm || books?.BusinessNameLine1Txt) {
    findings.push(
      `Books and records appear to be assigned to ${books.PersonNm || books.BusinessNameLine1Txt}, which is a positive governance signal.`
    );
  } else {
    findings.push("No clear books-and-records custodian was detected in the extracted detail, which should be reviewed.");
  }

  if (contractors.length) {
    findings.push(`The filing lists ${contractors.length} independent contractor record${contractors.length === 1 ? "" : "s"}.`);
  } else {
    findings.push("No contractor compensation entries were found in the extracted section.");
  }

  if (largestContractor?.numericComp > 0) {
    findings.push(
      `Largest listed contractor payment appears to be ${formatMoney(largestContractor.numericComp)} to ${largestContractor.BusinessNameLine1Txt || largestContractor.PersonNm || "an identified vendor"}.`
    );
  }

  findings.push(
    "This is a limited structural review of the XML extract, not a full forensic opinion. Stronger grading would also require balance sheet, liquidity, debt, and change-in-net-assets context."
  );

  return {
    grade: getGrade(parsed),
    findings,
  };
}

function LabelValue({ label, value }) {
  if (!value) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-sm text-slate-900 break-words">{value}</div>
    </div>
  );
}

function ProPublicaUrlPanel({ nonprofitUrl, setNonprofitUrl, onLookup, loadingLookup }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Paste Nonprofit Explorer URL</h2>
          <p className="mt-1 text-sm text-slate-600">
            Paste a ProPublica Nonprofit Explorer organization URL and load the most recent XML filing automatically.
          </p>
        </div>
        <button
          onClick={onLookup}
          className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loadingLookup}
        >
          {loadingLookup ? "Loading..." : "Load From URL"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <input
          type="url"
          value={nonprofitUrl}
          onChange={(e) => setNonprofitUrl(e.target.value)}
          placeholder="https://projects.propublica.org/nonprofits/organizations/133846431"
          className="w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
      </div>
    </div>
  );
}

function PasteXmlPanel({ xmlInput, setXmlInput, onParse }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Paste XML Copy</h2>
          <p className="mt-1 text-sm text-slate-600">
            Paste raw IRS 990 XML directly into the box below, then click parse.
          </p>
        </div>
        <button
          onClick={onParse}
          className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
        >
          Parse Pasted XML
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <textarea
          value={xmlInput}
          onChange={(e) => setXmlInput(e.target.value)}
          placeholder="Paste your full XML copy here..."
          className="h-[420px] w-full rounded-2xl border border-slate-300 bg-white p-4 font-mono text-xs leading-5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>
    </div>
  );
}

export default function IRS990XmlParserApp() {
  const [xmlInput, setXmlInput] = useState(`Paste IRS 990 XML here if you want to test the parser manually.`);
  const [nonprofitUrl, setNonprofitUrl] = useState(
    "https://projects.propublica.org/nonprofits/organizations/133846431"
  );
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(null);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [sourceMeta, setSourceMeta] = useState(null);

  const contractorCount = parsed?.ContractorCompensationGrp?.length || 0;
  const analysis = useMemo(() => getForensicAnalysis(parsed), [parsed]);

  async function loadFromProPublicaUrl() {
    try {
      setLoadingLookup(true);
      setError("");

      if (!nonprofitUrl) {
        throw new Error("Please paste a ProPublica Nonprofit Explorer URL.");
      }

      const response = await fetch(`/api/propublica-990-parse?url=${encodeURIComponent(nonprofitUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Backend lookup failed.");
      }

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
    }
  }

  const summaryCards = useMemo(() => {
    if (!parsed) return [];
    return [
      { label: "Current Year Revenue", value: formatMoney(parsed.CYTotalRevenueAmt) },
      {
        label: "Books In Care Of",
        value: parsed.BooksInCareOfDetail?.PersonNm || parsed.BooksInCareOfDetail?.BusinessNameLine1Txt,
      },
      { label: "Contractor Records", value: contractorCount ? String(contractorCount) : null },
    ].filter((item) => item.value);
  }, [parsed, contractorCount]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">IRS 990 XML Parser</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Paste a ProPublica Nonprofit Explorer URL or paste raw XML to extract revenue, books and records detail,
            contractor compensation, and a quick forensic accountant style readout.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ProPublicaUrlPanel
            nonprofitUrl={nonprofitUrl}
            setNonprofitUrl={setNonprofitUrl}
            onLookup={loadFromProPublicaUrl}
            loadingLookup={loadingLookup}
          />
          <PasteXmlPanel xmlInput={xmlInput} setXmlInput={setXmlInput} onParse={handleParse} />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {parsed ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Forensic Accountant Panel
                  </div>
                  <h2 className="mt-1 text-2xl font-bold">Initial Fiscal Read</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    A fast interpretation of the extracted filing data to help spot basic governance and vendor-payment signals.
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-900 px-6 py-5 text-white shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Financial Grade</div>
                  <div className="mt-2 text-4xl font-bold">{analysis?.grade}</div>
                </div>
              </div>

              {sourceMeta ? (
                <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <div className="font-semibold">Source</div>
                  <div className="mt-1">{sourceMeta.sourceLabel}</div>
                  {sourceMeta.orgName ? <div className="mt-1">Organization: {sourceMeta.orgName}</div> : null}
                  {sourceMeta.filingYear ? <div className="mt-1">Most recent filing year: {sourceMeta.filingYear}</div> : null}
                  {sourceMeta.organizationUrl ? (
                    <div className="mt-1 break-all">Explorer URL: {sourceMeta.organizationUrl}</div>
                  ) : null}
                  {sourceMeta.xmlUrl ? <div className="mt-1 break-all">XML URL: {sourceMeta.xmlUrl}</div> : null}
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {summaryCards.map((card) => (
                  <LabelValue key={card.label} label={card.label} value={card.value} />
                ))}
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-5">
                <h3 className="text-base font-semibold">Analysis</h3>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                  {analysis?.findings?.map((finding, index) => (
                    <p key={index}>{finding}</p>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">Books and Records</h2>
                      <p className="mt-1 text-sm text-slate-600">Who appears to hold the organization’s books and records.</p>
                    </div>
                  </div>

                  {parsed.BooksInCareOfDetail && Object.keys(parsed.BooksInCareOfDetail).length ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <LabelValue label="Person Name" value={parsed.BooksInCareOfDetail.PersonNm} />
                      <LabelValue label="Business Name 1" value={parsed.BooksInCareOfDetail.BusinessNameLine1Txt} />
                      <LabelValue label="Business Name 2" value={parsed.BooksInCareOfDetail.BusinessNameLine2Txt} />
                      <LabelValue
                        label="Phone"
                        value={parsed.BooksInCareOfDetail.PhoneNum || parsed.BooksInCareOfDetail.ForeignPhoneNum}
                      />
                      <div className="sm:col-span-2">
                        <LabelValue label="Address" value={formatAddress(parsed.BooksInCareOfDetail)} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                      No books and records detail was found.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Independent Contractors</h2>
                    <p className="mt-1 text-sm text-slate-600">Compensation records extracted from ContractorCompensationGrp.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {contractorCount} contractor{contractorCount === 1 ? "" : "s"}
                  </span>
                </div>

                {contractorCount === 0 ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No contractor records found.</div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {parsed.ContractorCompensationGrp.map((contractor) => {
                      const title = contractor.BusinessNameLine1Txt || contractor.PersonNm || `Contractor ${contractor.id}`;
                      return (
                        <div key={contractor.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-base font-semibold text-slate-900">{title}</div>
                              {contractor.BusinessNameLine2Txt ? (
                                <div className="mt-1 text-sm text-slate-600">{contractor.BusinessNameLine2Txt}</div>
                              ) : null}
                            </div>
                            {contractor.CompensationAmt ? (
                              <div className="text-sm font-semibold text-slate-900">
                                {formatMoney(contractor.CompensationAmt)}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <LabelValue label="Contact" value={contractor.PersonNm} />
                            <LabelValue label="Services" value={contractor.ServicesDesc} />
                            <div className="sm:col-span-2">
                              <LabelValue label="Address" value={getContractorAddress(contractor)} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : !error ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            No parsed results yet. Paste a ProPublica URL to test the backend lookup, or paste raw XML to test the parser manually.
          </div>
        ) : null}
      </div>
    </div>
  );
}
