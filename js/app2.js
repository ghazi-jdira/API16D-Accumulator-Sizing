/* Thin API client — API 16D 2nd edition (Method A + Method B).
 * Gathers inputs, POSTs to /api/compute2, renders results. The NIST grid and
 * all formulas live on the server (engine2.py); this file never sees them. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const API = (cfg.apiBase || "").replace(/\/$/, "");

  let specs = [];
  let specNames = [];

  // Default surface stack (workbook Inputs sheet): annular + shear + pipe + HCR.
  let rows = [
    { equip: 'Annular BOP 11" 5k' },
    { equip: 'SHEAR Ram BOP 11" 5k' },
    { equip: 'Pipe Ram BOP 11" 5k' },
    { equip: 'HCR Valve 5k' },
  ];

  // ---- API helper ----
  async function api(path, body) {
    const token = window.Auth && window.Auth.getToken();
    const opts = {
      method: body ? "POST" : "GET",
      headers: { "Authorization": "Bearer " + (token || "") },
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(API + path, opts);
    if (res.status === 401) {
      if (window.Auth) window.Auth.onUnauthorized();
      throw new Error("unauthorized");
    }
    if (res.status === 403) throw new Error("Your account is not authorized to use this calculator.");
    if (!res.ok) throw new Error("Server error (" + res.status + ").");
    return res.json();
  }

  // ---- helpers ----
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function fmt(x, d = 1) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(d) : "&mdash;"; }
  function numOrNull(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }
  function ratioNum(r) { return (typeof r === "number" && isFinite(r)) ? r : null; }
  function badge(ok, txt) { return `<span class="badge ${ok ? "ok" : "no"}">${txt}</span>`; }

  function equipOptions(selected) {
    return specNames.map((n) =>
      `<option value="${esc(n)}"${n === selected ? " selected" : ""}>${esc(n)}</option>`).join("");
  }

  function renderTable() {
    const tb = $("bopTable").querySelector("tbody");
    tb.innerHTML = rows.map((r, i) => {
      const s = specs.find((x) => x.name === r.equip) || {};
      const ratio = ratioNum(s.ratio);
      return `<tr>
        <td><select data-bop="${i}">${equipOptions(r.equip)}</select></td>
        <td class="num">${s.rwp ?? "&mdash;"}</td>
        <td class="num">${fmt(s.close, 2)}</td>
        <td class="num">${fmt(s.open, 2)}</td>
        <td class="num">${ratio != null ? fmt(ratio, 2) : "&mdash;"}</td>
        <td class="num">${fmt(s.pclose, 0)}</td>
        <td><button class="del" data-delbop="${i}">&times;</button></td>
      </tr>`;
    }).join("");
  }

  // ---- gather inputs ----
  function gather() {
    const equipment = rows.map((r) => {
      const s = specs.find((x) => x.name === r.equip) || {};
      return {
        name: s.name, rwp: s.rwp,
        close: numOrNull(s.close) || 0,
        open: numOrNull(s.open) || 0,
        pclose: numOrNull(s.pclose) || 0,
      };
    });
    return {
      atm: parseFloat($("atm").value),
      surfaceTempF: parseFloat($("surfaceTempF").value),
      maxSurfaceTempF: parseFloat($("maxSurfaceTempF").value),
      chargedPsig: parseFloat($("chargedPsig").value),
      prechargePsig: parseFloat($("prechargePsig").value),
      operatorShearPsig: parseFloat($("operatorShearPsig").value),
      gasVolPerBottle: parseFloat($("gasVolPerBottle").value),
      bottleRatingPsig: parseFloat($("bottleRatingPsig").value),
      equipment,
    };
  }

  // ---- rendering ----
  function renderCompare(a, b) {
    $("r_compare").querySelector("tbody").innerHTML = `
      <tr><td>Pressure-limited VE<sub>p</sub></td><td>${fmt(a.VEp, 4)}</td><td>${fmt(b.VEp, 4)}</td></tr>
      <tr><td>Volume-limited VE<sub>v</sub></td><td>${fmt(a.VEv, 4)}</td><td>${fmt(b.VEv, 4)}</td></tr>
      <tr><td>Governing VE = min</td><td><b>${fmt(a.VE, 4)}</b></td><td><b>${fmt(b.VE, 4)}</b></td></tr>
      <tr><td>Bottles required (raw)</td><td>${fmt(a.bottlesRaw, 2)}</td><td>${fmt(b.bottlesRaw, 2)}</td></tr>
      <tr><td>Bottles (round up)</td><td><b>${a.bottles}</b></td><td><b>${b.bottles}</b></td></tr>
      <tr><td>Total gas volume (gal)</td><td>${fmt(a.gasTotal, 1)}</td><td>${fmt(b.gasTotal, 1)}</td></tr>
      <tr><td>Usable volume (gal)</td><td>${fmt(a.usable, 2)}</td><td>${fmt(b.usable, 2)}</td></tr>
      <tr><td>Optimum precharge (psig)</td><td>${fmt(a.optPrechargePsig, 0)}</td><td>${fmt(b.optPrechargePsig, 0)}</td></tr>
      <tr><td>Precharge press. @ max temp (psig)</td><td>${fmt(a.presAtMaxTempPsig, 0)}</td><td>${fmt(b.presAtMaxTempPsig, 0)}</td></tr>`;
  }

  function perfTable(rowsArr, withRho) {
    const head = withRho
      ? `<tr><th>Condition</th><th>psig</th><th>psia</th><th>Gas (gal)</th><th>Liquid (gal)</th><th>&rho; (lbm/ft&sup3;)</th></tr>`
      : `<tr><th>Condition</th><th>psig</th><th>psia</th><th>Gas (gal)</th><th>Liquid (gal)</th></tr>`;
    const body = rowsArr.map((r) => withRho
      ? `<tr><td>${esc(r.label)}</td><td>${fmt(r.psig, 0)}</td><td>${fmt(r.psia, 1)}</td><td>${fmt(r.gas, 2)}</td><td>${fmt(r.liquid, 2)}</td><td>${fmt(r.rho, 4)}</td></tr>`
      : `<tr><td>${esc(r.label)}</td><td>${fmt(r.psig, 0)}</td><td>${fmt(r.psia, 1)}</td><td>${fmt(r.gas, 2)}</td><td>${fmt(r.liquid, 2)}</td></tr>`
    ).join("");
    return `<table class="dtable"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  function summaryTable(s) {
    const p = s.pressureDesign, v = s.volumeDesign;
    return `<table class="dtable"><thead><tr><th>Design check</th><th>Actual</th><th>With factor</th><th>FVR</th><th>Meets?</th></tr></thead><tbody>
      <tr><td>Pressure design (Cond.&nbsp;1&rarr;2)</td><td>${fmt(p.actual, 2)}</td><td>${fmt(p.factored, 2)}</td><td>${fmt(p.fvr, 2)}</td><td>${badge(p.meets, p.meets ? "YES" : "NO")}</td></tr>
      <tr><td>Volume design (Cond.&nbsp;1&rarr;3)</td><td>${fmt(v.actual, 2)}</td><td>${fmt(v.factored, 2)}</td><td>${fmt(v.fvr, 2)}</td><td>${badge(v.meets, v.meets ? "YES" : "NO")}</td></tr>
    </tbody></table>`;
  }

  function renderMethodA(a) {
    $("r_methodA").innerHTML = `
      <table class="dtable"><tbody>
        <tr><td>Governing volumetric efficiency VE</td><td>${fmt(a.VE, 4)}</td></tr>
        <tr><td>Bottles required</td><td><b>${a.bottles}</b> (${fmt(a.bottlesRaw, 2)} raw)</td></tr>
        <tr><td>Optimum precharge</td><td>${fmt(a.optPrechargePsig, 1)} psig</td></tr>
        <tr><td>Precharge pressure at max temp</td><td>${fmt(a.presAtMaxTempPsig, 1)} psig</td></tr>
      </tbody></table>
      <div class="section-sub">Performance table</div>
      ${perfTable(a.performance, false)}
      <div class="section-sub">Design summary</div>
      ${summaryTable(a.summary)}`;
  }

  function renderMethodB(b) {
    $("r_methodB").innerHTML = `
      <table class="dtable"><tbody>
        <tr><td>Charged density &rho;<sub>1</sub></td><td>${fmt(b.rho1, 4)} lbm/ft&sup3;</td></tr>
        <tr><td>MOP density &rho;<sub>2</sub></td><td>${fmt(b.rho2, 4)} lbm/ft&sup3;</td></tr>
        <tr><td>Optimum precharge density &rho;<sub>0,opt</sub></td><td>${fmt(b.rho0Opt, 4)} lbm/ft&sup3;</td></tr>
        <tr><td>Specified precharge density &rho;<sub>0</sub></td><td>${fmt(b.rho0, 4)} lbm/ft&sup3;</td></tr>
        <tr><td>Governing volumetric efficiency VE</td><td>${fmt(b.VE, 4)}</td></tr>
        <tr><td>Bottles required</td><td><b>${b.bottles}</b> (${fmt(b.bottlesRaw, 2)} raw)</td></tr>
        <tr><td>Optimum precharge</td><td>${fmt(b.optPrechargePsig, 1)} psig</td></tr>
        <tr><td>Precharge pressure at max temp</td><td>${fmt(b.presAtMaxTempPsig, 1)} psig</td></tr>
      </tbody></table>
      <div class="section-sub">Performance table</div>
      ${perfTable(b.performance, true)}
      <div class="section-sub">Design summary</div>
      ${summaryTable(b.summary)}`;
  }

  function renderResults(r) {
    const inp = r.inputs, a = r.methodA, b = r.methodB;
    $("r_fvr").textContent = inp.FVR.toFixed(2);
    $("r_bottlesA").textContent = a.bottles;
    $("r_bottlesB").textContent = b.bottles;
    $("r_mop").textContent = inp.mopPsig.toFixed(0);
    $("fvrResult").innerHTML = `
      <div class="row"><span>&Sigma; closing volumes</span><b>${fmt(inp.closeSum, 2)} gal</b></div>
      <div class="row"><span>&Sigma; opening volumes</span><b>${fmt(inp.openSum, 2)} gal</b></div>
      <div class="row"><span>FVR = max</span><b>${fmt(inp.FVR, 2)} gal</b></div>
      <div class="row"><span>MOP (Condition 2)</span><b>${fmt(inp.mopPsig, 0)} psig</b></div>`;
    renderCompare(a, b);
    renderMethodA(a);
    renderMethodB(b);
  }

  // ---- recompute (debounced) ----
  let recomputeTimer = null, inFlight = false, queued = false;
  function recompute() {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(runCompute, 250);
  }
  async function runCompute() {
    if (inFlight) { queued = true; return; }
    inFlight = true;
    try {
      const r = await api("/api/compute2", gather());
      renderResults(r);
    } catch (e) {
      if (e.message !== "unauthorized") console.error(e);
    } finally {
      inFlight = false;
      if (queued) { queued = false; runCompute(); }
    }
  }

  // ---- event wiring ----
  function bindInputs() {
    ["atm", "surfaceTempF", "maxSurfaceTempF", "chargedPsig", "prechargePsig",
     "operatorShearPsig", "gasVolPerBottle", "bottleRatingPsig"]
      .forEach((id) => $(id).addEventListener("input", recompute));
  }
  function bindTable() {
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.bop != null) { rows[+t.dataset.bop].equip = t.value; renderTable(); recompute(); }
    });
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t.dataset.delbop != null) { rows.splice(+t.dataset.delbop, 1); renderTable(); recompute(); }
      else if (t.dataset.add === "bop") { rows.push({ equip: specNames[0] }); renderTable(); recompute(); }
      else if (t.classList.contains("toggle")) { t.parentElement.classList.toggle("open"); }
    });
  }

  // ---- init (runs once we have an auth token) ----
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    try {
      const meta = await api("/api/meta2");
      specs = meta.bopSpecs;
      specNames = specs.map((s) => s.name);
    } catch (e) {
      if (e.message === "unauthorized") { started = false; return; }
      $("loading").textContent = "Could not reach the calculation server.";
      console.error(e);
      return;
    }
    bindInputs();
    bindTable();
    renderTable();
    runCompute();
    $("loading").classList.add("hidden");
  }

  window.addEventListener("auth:ready", start);
  if (window.Auth && window.Auth.isAuthed()) start();
})();
