import { useState, useMemo } from "react";

const TEAL = {
  900: "#04342C",
  800: "#085041",
  600: "#0F6E56",
  400: "#1D9E75",
  200: "#5DCAA5",
  100: "#9FE1CB",
  50:  "#E1F5EE",
};
const AMBER = {
  800: "#633806",
  600: "#854F0B",
  400: "#BA7517",
  200: "#EF9F27",
  100: "#FAC775",
  50:  "#FAEEDA",
};
const GRAY = {
  900: "#2C2C2A",
  700: "#444441",
  500: "#5F5E5A",
  300: "#B4B2A9",
  100: "#D3D1C7",
  50:  "#F1EFE8",
};

const US_STATES = [
  { label: "No state income tax (FL, TX, WA, NV, WY, SD, AK)", rate: 0 },
  { label: "Alabama", rate: 0.05 },
  { label: "Arizona", rate: 0.025 },
  { label: "Arkansas", rate: 0.044 },
  { label: "California", rate: 0.133 },
  { label: "Colorado", rate: 0.044 },
  { label: "Connecticut", rate: 0.069 },
  { label: "Delaware", rate: 0.066 },
  { label: "Georgia", rate: 0.055 },
  { label: "Hawaii", rate: 0.11 },
  { label: "Idaho", rate: 0.058 },
  { label: "Illinois", rate: 0.0495 },
  { label: "Indiana", rate: 0.031 },
  { label: "Iowa", rate: 0.06 },
  { label: "Kansas", rate: 0.057 },
  { label: "Kentucky", rate: 0.045 },
  { label: "Louisiana", rate: 0.03 },
  { label: "Maine", rate: 0.075 },
  { label: "Maryland", rate: 0.0575 },
  { label: "Massachusetts", rate: 0.09 },
  { label: "Michigan", rate: 0.0425 },
  { label: "Minnesota", rate: 0.0985 },
  { label: "Mississippi", rate: 0.05 },
  { label: "Missouri", rate: 0.047 },
  { label: "Montana", rate: 0.059 },
  { label: "Nebraska", rate: 0.0664 },
  { label: "New Hampshire (interest/dividends only)", rate: 0 },
  { label: "New Jersey", rate: 0.107 },
  { label: "New Mexico", rate: 0.059 },
  { label: "New York", rate: 0.109 },
  { label: "North Carolina", rate: 0.045 },
  { label: "North Dakota", rate: 0.025 },
  { label: "Ohio", rate: 0.0375 },
  { label: "Oklahoma", rate: 0.0475 },
  { label: "Oregon", rate: 0.099 },
  { label: "Pennsylvania", rate: 0.0307 },
  { label: "Rhode Island", rate: 0.0599 },
  { label: "South Carolina", rate: 0.064 },
  { label: "Tennessee (no income tax)", rate: 0 },
  { label: "Utah", rate: 0.0485 },
  { label: "Vermont", rate: 0.0875 },
  { label: "Virginia", rate: 0.0575 },
  { label: "West Virginia", rate: 0.065 },
  { label: "Wisconsin", rate: 0.0765 },
];

function fmt(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtK(n) {
  return "$" + (Math.round(n / 100) / 10).toLocaleString("en-US") + "k";
}

function calcTax(income1099, incomeW2, stateRate, w2Has401k, w2Contrib, hasLLC) {
  const gross1099 = income1099;
  const gross = income1099 + incomeW2;

  // 2026 SE tax
  const ssTaxableWage = 176100;
  const seTaxBase = gross1099 * 0.9235; // net SE income
  const ssTax = Math.min(seTaxBase, Math.max(ssTaxableWage - incomeW2, 0)) * 0.124;
  const medicareTax = seTaxBase * 0.029;
  const addlMedicare = Math.max(gross - 200000, 0) * 0.009;
  const selfEmpTax = ssTax + medicareTax + addlMedicare;
  const seDeduction = selfEmpTax * 0.5;

  // Retirement contributions available from 1099
  // Employee deferral only if not maxed at W2
  const maxEmployeeDeferral = 23500;
  const w2DeferralUsed = w2Has401k ? Math.min(w2Contrib, maxEmployeeDeferral) : 0;
  const remainingDeferral = Math.max(maxEmployeeDeferral - w2DeferralUsed, 0);
  const employerProfit = Math.min(seTaxBase * 0.25, 70000);
  const totalSolo401k = Math.min(remainingDeferral + employerProfit, 70000);
  const solo401kMakesSense = income1099 > 25000;
  
  // For deduction purposes, assume they contribute the solo 401k
  const solo401kDeduction = solo401kMakesSense ? totalSolo401k : 0;

  // Federal taxable income from 1099
  const standardDeduction = 15000; // 2026 single estimate
  const agi1099Additions = gross1099 - seDeduction - solo401kDeduction;
  const totalAGI = incomeW2 + agi1099Additions;
  const federalTaxableIncome = Math.max(totalAGI - standardDeduction, 0);

  // 2026 Federal brackets (single) - approximate
  function federalTax(ti) {
    let tax = 0;
    const brackets = [
      [11925, 0.10],
      [48475, 0.12],
      [103350, 0.22],
      [197300, 0.24],
      [250525, 0.32],
      [626350, 0.35],
      [Infinity, 0.37],
    ];
    let prev = 0;
    for (const [limit, rate] of brackets) {
      if (ti <= prev) break;
      tax += Math.min(ti, limit) - prev;
      tax = tax - (Math.min(ti, limit) - prev) + (Math.min(ti, limit) - prev) * rate;
      // redo correctly
      prev = limit;
    }
    // recalc properly
    tax = 0;
    prev = 0;
    for (const [limit, rate] of brackets) {
      if (ti <= prev) break;
      const chunk = Math.min(ti, limit) - prev;
      tax += chunk * rate;
      prev = limit;
    }
    return tax;
  }

  const totalFederal = federalTax(federalTaxableIncome);
  const federalOnW2Only = federalTax(Math.max(incomeW2 - standardDeduction, 0));
  const federalAttributableTo1099 = totalFederal - federalOnW2Only;
  const marginalRate = federalTaxableIncome > 626350 ? 0.37
    : federalTaxableIncome > 250525 ? 0.35
    : federalTaxableIncome > 197300 ? 0.32
    : federalTaxableIncome > 103350 ? 0.24
    : federalTaxableIncome > 48475  ? 0.22
    : 0.12;

  const stateTax1099 = gross1099 * stateRate;
  const totalTaxOn1099 = selfEmpTax + federalAttributableTo1099 + stateTax1099;
  const effectiveRate = gross1099 > 0 ? totalTaxOn1099 / gross1099 : 0;

  // Quarterly payment
  const quarterlyPayment = totalTaxOn1099 / 4;

  // Per-paycheck (assume 24 pay periods)
  const perPaycheck = totalTaxOn1099 / 24;
  const setAsidePct = effectiveRate;

  // S-corp analysis
  const scorp_makes_sense = income1099 >= 80000;
  let scorp_savings = 0;
  if (scorp_makes_sense) {
    const reasonableSalary = income1099 * 0.65;
    const distributions = income1099 - reasonableSalary;
    const savedSE = Math.min(distributions * 0.9235, ssTaxableWage) * 0.153;
    const additionalCosts = 2200; // CPA + payroll
    scorp_savings = Math.max(savedSE - additionalCosts, 0);
  }

  return {
    selfEmpTax,
    federalAttributableTo1099,
    stateTax1099,
    totalTaxOn1099,
    effectiveRate,
    quarterlyPayment,
    perPaycheck,
    setAsidePct,
    solo401kMakesSense,
    totalSolo401k,
    employerProfit,
    remainingDeferral,
    scorp_makes_sense,
    scorp_savings,
    marginalRate,
    seDeduction,
  };
}

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: `1px solid ${GRAY[100]}`,
  fontSize: 15,
  color: GRAY[900],
  background: "#fff",
  outline: "none",
  transition: "border 0.15s",
  fontFamily: "inherit",
};

const selectStyle = { ...inputStyle };

function Label({ children }) {
  return (
    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: GRAY[700], marginBottom: 5 }}>
      {children}
    </label>
  );
}

function FieldGroup({ children }) {
  return <div style={{ marginBottom: 20 }}>{children}</div>;
}

function Toggle({ label, checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        fontFamily: "inherit",
      }}
      aria-pressed={checked}
    >
      <div
        style={{
          width: 42,
          height: 24,
          borderRadius: 12,
          background: checked ? TEAL[400] : GRAY[100],
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 21 : 3,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: "#fff",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        />
      </div>
      <span style={{ fontSize: 14, color: GRAY[700], fontWeight: 400 }}>{label}</span>
    </button>
  );
}

function ResultCard({ label, value, sub, accent, highlight }) {
  return (
    <div
      style={{
        background: highlight ? TEAL[50] : "#fff",
        border: `1px solid ${highlight ? TEAL[100] : GRAY[100]}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: highlight ? TEAL[600] : GRAY[500], marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color: accent || (highlight ? TEAL[800] : GRAY[900]), lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: highlight ? TEAL[600] : GRAY[500], marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Callout({ type, children }) {
  const isWarning = type === "warning";
  const bg = isWarning ? AMBER[50] : TEAL[50];
  const border = isWarning ? AMBER[200] : TEAL[200];
  const labelColor = isWarning ? AMBER[600] : TEAL[600];
  const textColor = isWarning ? AMBER[800] : TEAL[800];
  return (
    <div
      style={{
        background: bg,
        borderLeft: `3px solid ${border}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontSize: 13,
        color: textColor,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

function Rec({ num, title, body }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: TEAL[400],
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {num}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: GRAY[900], marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 13, color: GRAY[500], lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

export default function Calculator() {
  const [income1099, setIncome1099] = useState("");
  const [incomeW2, setIncomeW2] = useState("");
  const [stateIdx, setStateIdx] = useState(0);
  const [w2Has401k, setW2Has401k] = useState(false);
  const [w2Contrib, setW2Contrib] = useState("");
  const [hasLLC, setHasLLC] = useState(false);

  const parsed1099 = parseFloat((income1099 + "").replace(/,/g, "")) || 0;
  const parsedW2 = parseFloat((incomeW2 + "").replace(/,/g, "")) || 0;
  const parsedW2Contrib = parseFloat((w2Contrib + "").replace(/,/g, "")) || 0;
  const stateRate = US_STATES[stateIdx].rate;

  const hasInput = parsed1099 > 0;

  const results = useMemo(() => {
    if (!hasInput) return null;
    return calcTax(parsed1099, parsedW2, stateRate, w2Has401k, parsedW2Contrib, hasLLC);
  }, [parsed1099, parsedW2, stateRate, w2Has401k, parsedW2Contrib, hasLLC]);

  function getRecommendations() {
    if (!results) return [];
    const recs = [];
    if (results.solo401kMakesSense) {
      recs.push({
        title: "Open a solo 401(k) this year",
        body: `You can contribute up to ${fmt(results.totalSolo401k)} to a solo 401(k) on your 1099 income${w2Has401k ? " (after accounting for your W-2 plan contributions)" : ""}. This reduces your taxable 1099 income directly. Must be established by December 31 — open the account even if you fund it later.`,
      });
    }
    if (results.scorp_makes_sense) {
      recs.push({
        title: "Evaluate the S-corp election",
        body: `With ${fmt(parsed1099)} in net 1099 income, an S-corp election could save you approximately ${fmt(results.scorp_savings)} per year in self-employment taxes after accounting for additional administrative costs. Consult a CPA with physician experience before filing Form 2553.`,
      });
    } else if (parsed1099 > 40000) {
      recs.push({
        title: "Form an LLC now, revisit S-corp later",
        body: `Your 1099 income is not yet at the threshold where S-corp savings clearly exceed costs (typically $80k+). Forming an LLC now establishes the structure and provides liability separation. Revisit the S-corp election as income grows.`,
      });
    }
    if (results.quarterlyPayment > 0) {
      recs.push({
        title: "Start making quarterly estimated payments",
        body: `Set aside ${fmt(results.quarterlyPayment)} per quarter for estimated taxes. 2026 due dates: April 15, June 16, September 15, and January 15, 2027. Pay via IRS Direct Pay at irs.gov. Consider opening a dedicated high-yield savings account for this purpose.`,
      });
    }
    if (stateRate > 0.08 && !results.scorp_makes_sense) {
      recs.push({
        title: "Track every deductible business expense",
        body: `Your state's income tax rate is high. Every dollar of documented business expenses (malpractice insurance, licenses, CME, home office, mileage) reduces both your federal and state tax. A dedicated business checking account and credit card make this much easier to document.`,
      });
    }
    if (!recs.some(r => r.title.includes("quarterly"))) {
      recs.push({
        title: "Verify malpractice coverage before your first shift",
        body: "Confirm in writing whether the moonlighting facility provides malpractice coverage and whether it is occurrence or claims-made. If claims-made, negotiate for them to pay the tail. Your primary employer's policy does not cover outside work.",
      });
    }
    return recs.slice(0, 3);
  }

  const recs = getRecommendations();

  const inputFocusStyle = { borderColor: TEAL[400] };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: GRAY[900], maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL[400], marginBottom: 6 }}>
          ResolvedRx · Calculator
        </div>
        <h2 style={{ fontSize: "1.9rem", fontWeight: 700, color: TEAL[800], lineHeight: 1.2, marginBottom: 8 }}>
          1099 & Moonlighting Tax Estimator
        </h2>
        <p style={{ fontSize: 14, color: GRAY[500], lineHeight: 1.6, maxWidth: 580 }}>
          Enter your income details below. Results update in real time. All calculations are estimates for educational purposes — consult a CPA for your specific situation.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "2rem" }}>
        {/* ── LEFT COLUMN: INPUTS ── */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: GRAY[500], marginBottom: 16 }}>
            Your income & situation
          </div>

          <FieldGroup>
            <Label>Annual 1099 / moonlighting income (gross) *</Label>
            <input
              style={inputStyle}
              type="text"
              inputMode="numeric"
              placeholder="e.g. 80000"
              value={income1099}
              onChange={e => setIncome1099(e.target.value)}
              onFocus={e => Object.assign(e.target.style, { borderColor: TEAL[400] })}
              onBlur={e => Object.assign(e.target.style, { borderColor: GRAY[100] })}
            />
          </FieldGroup>

          <FieldGroup>
            <Label>W-2 income (salary from employer)</Label>
            <input
              style={inputStyle}
              type="text"
              inputMode="numeric"
              placeholder="e.g. 220000  (0 if none)"
              value={incomeW2}
              onChange={e => setIncomeW2(e.target.value)}
              onFocus={e => Object.assign(e.target.style, { borderColor: TEAL[400] })}
              onBlur={e => Object.assign(e.target.style, { borderColor: GRAY[100] })}
            />
          </FieldGroup>

          <FieldGroup>
            <Label>State of residence</Label>
            <select
              style={selectStyle}
              value={stateIdx}
              onChange={e => setStateIdx(Number(e.target.value))}
              onFocus={e => Object.assign(e.target.style, { borderColor: TEAL[400] })}
              onBlur={e => Object.assign(e.target.style, { borderColor: GRAY[100] })}
            >
              {US_STATES.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup>
            <div style={{ marginBottom: 12 }}>
              <Toggle
                label="I have a 401(k) through my W-2 employer"
                checked={w2Has401k}
                onChange={setW2Has401k}
              />
            </div>
            {w2Has401k && (
              <div style={{ marginTop: 10, paddingLeft: 52 }}>
                <Label>Annual W-2 401(k) contributions</Label>
                <input
                  style={{ ...inputStyle, width: "100%" }}
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 23500"
                  value={w2Contrib}
                  onChange={e => setW2Contrib(e.target.value)}
                  onFocus={e => Object.assign(e.target.style, { borderColor: TEAL[400] })}
                  onBlur={e => Object.assign(e.target.style, { borderColor: GRAY[100] })}
                />
              </div>
            )}
          </FieldGroup>

          <FieldGroup>
            <Toggle
              label="I already have an LLC for my 1099 work"
              checked={hasLLC}
              onChange={setHasLLC}
            />
          </FieldGroup>

          {!hasInput && (
            <Callout type="tip">
              Enter your annual 1099 income above to see your personalized tax estimate, solo 401(k) projection, and recommendations.
            </Callout>
          )}
        </div>

        {/* ── RIGHT COLUMN: RESULTS ── */}
        <div>
          {!hasInput ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: GRAY[300], textAlign: "center", padding: "2rem" }}>
              <div style={{ fontSize: 40, marginBottom: 12, color: TEAL[100] }}>⟳</div>
              <div style={{ fontSize: 14, color: GRAY[300] }}>Results will appear here as you type</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: GRAY[500], marginBottom: 16 }}>
                Your estimates
              </div>

              {/* Primary metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <ResultCard
                  label="Quarterly payment due"
                  value={fmt(results.quarterlyPayment)}
                  sub="4× per year (2026 dates below)"
                  highlight
                />
                <ResultCard
                  label="Total annual tax on 1099"
                  value={fmt(results.totalTaxOn1099)}
                  sub={`${Math.round(results.effectiveRate * 100)}% effective rate`}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <ResultCard
                  label="Set aside per payment received"
                  value={`${Math.round(results.setAsidePct * 100)}%`}
                  sub={`~${fmt(results.perPaycheck)} if paid 2×/month`}
                />
                <ResultCard
                  label="Self-employment tax"
                  value={fmt(results.selfEmpTax)}
                  sub="SS + Medicare on 1099 income"
                />
              </div>

              {/* Solo 401k */}
              <div
                style={{
                  background: results.solo401kMakesSense ? TEAL[50] : GRAY[50],
                  border: `1px solid ${results.solo401kMakesSense ? TEAL[100] : GRAY[100]}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: results.solo401kMakesSense ? TEAL[600] : GRAY[500], marginBottom: 4 }}>
                      Solo 401(k) opportunity
                    </div>
                    {results.solo401kMakesSense ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 600, color: TEAL[800] }}>
                          Up to {fmt(results.totalSolo401k)}
                        </div>
                        <div style={{ fontSize: 12, color: TEAL[600], marginTop: 3 }}>
                          {fmt(results.remainingDeferral)} employee deferral + {fmt(results.employerProfit)} profit sharing
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 14, color: GRAY[500] }}>Income too low for meaningful contribution</div>
                    )}
                  </div>
                  <div
                    style={{
                      background: results.solo401kMakesSense ? TEAL[400] : GRAY[300],
                      color: "#fff",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      flexShrink: 0,
                    }}
                  >
                    {results.solo401kMakesSense ? "RECOMMENDED" : "NOT YET"}
                  </div>
                </div>
              </div>

              {/* S-corp */}
              <div
                style={{
                  background: results.scorp_makes_sense ? AMBER[50] : GRAY[50],
                  border: `1px solid ${results.scorp_makes_sense ? AMBER[100] : GRAY[100]}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: results.scorp_makes_sense ? AMBER[600] : GRAY[500], marginBottom: 4 }}>
                      S-corp election
                    </div>
                    {results.scorp_makes_sense ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 600, color: AMBER[800] }}>
                          ~{fmt(results.scorp_savings)}/yr savings
                        </div>
                        <div style={{ fontSize: 12, color: AMBER[600], marginTop: 3 }}>
                          After CPA & payroll costs (~$2,200/yr)
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 14, color: GRAY[500] }}>
                        Typically beneficial above $80k in 1099 income — {parsed1099 > 60000 ? "getting close" : "not yet"}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      background: results.scorp_makes_sense ? AMBER[400] : GRAY[300],
                      color: "#fff",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      flexShrink: 0,
                    }}
                  >
                    {results.scorp_makes_sense ? "EVALUATE" : "NOT YET"}
                  </div>
                </div>
              </div>

              {/* Due dates compact */}
              <div style={{ background: "#fff", border: `1px solid ${GRAY[100]}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: GRAY[500], marginBottom: 10 }}>2026 quarterly due dates</div>
                {[
                  ["Q1", "Apr 15, 2026"],
                  ["Q2", "Jun 16, 2026"],
                  ["Q3", "Sep 15, 2026"],
                  ["Q4", "Jan 15, 2027"],
                ].map(([q, d]) => (
                  <div key={q} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: `1px solid ${GRAY[50]}` }}>
                    <span style={{ background: TEAL[50], color: TEAL[800], borderRadius: 4, padding: "1px 7px", fontWeight: 600, fontSize: 11 }}>{q}</span>
                    <span style={{ color: GRAY[700], fontWeight: 500 }}>{d}</span>
                    <span style={{ color: TEAL[600], fontWeight: 600 }}>{fmt(results.quarterlyPayment)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RECOMMENDATIONS ── */}
      {hasInput && recs.length > 0 && (
        <div style={{ marginTop: "2rem", paddingTop: "1.75rem", borderTop: `1px solid ${GRAY[100]}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: GRAY[500], marginBottom: 16 }}>
            Top 3 personalized recommendations
          </div>
          {recs.map((r, i) => (
            <Rec key={i} num={i + 1} title={r.title} body={r.body} />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ marginTop: "2rem", fontSize: 12, color: GRAY[300], lineHeight: 1.6, borderTop: `1px solid ${GRAY[50]}`, paddingTop: "1rem" }}>
        Estimates are for educational purposes only and assume single filing status and standard deduction. Federal brackets reflect 2026 IRS guidance. Solo 401(k) employer contribution calculation uses simplified net SE income. Consult a CPA for tax advice specific to your situation.
      </div>
    </div>
  );
}
