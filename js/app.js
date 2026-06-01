/* Thin API client: gather inputs, POST to the backend, render the results.
 * The confidential NIST grid, Cameron constants and all formulas live on the
 * server (server/engine.py); this file never sees them. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const API = (cfg.apiBase || "").replace(/\/$/, "");

  // meta (BOP specs + dropdown lists) is loaded from the server at startup.
  let lists = { bopTypes: [], ramTypes: [], pipeGrades: [] };
  let specs = [];
  let specNames = [];

  // Default equipment configuration (API 16D Annex C, Example 6 surface case).
  let mbRows = [
    { equip: 'Annular BOP 11" 5k' },
    { equip: 'SHEAR Ram BOP 11" 5k' },
    { equip: 'Pipe Ram BOP 11" 5k' },
    { equip: 'HCR Valve 5k' },
  ];
  let mcRows = [
    { equip: 'Annular BOP 11" 5k', close: 9.81, ratio: null, mopflps: null },
    { equip: 'SHEAR Ram BOP 11" 5k', close: 12.2, ratio: 21.1, mopflps: 1500 },
    { equip: 'SHEAR Ram BOP 11" 5k', close: 0, ratio: 7.3, mopflps: 520 },
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
    if (res.status === 403) {
      throw new Error("Your account is not authorized to use this calculator.");
    }
    if (!res.ok) throw new Error("Server error (" + res.status + ").");
    return res.json();
  }

  // ---- dropdowns / tables ----
  function fillSelect(sel, options, selected) {
    sel.innerHTML = "";
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o; opt.textContent = o;
      if (o === selected) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function equipOptions(selected) {
    return specNames.map((n) =>
      `<option value="${esc(n)}"${n === selected ? " selected" : ""}>${esc(n)}</option>`).join("");
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function fmt(x, d = 1) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(d) : "&mdash;"; }

  function renderMB() {
    const tb = $("mbTable").querySelector("tbody");
    tb.innerHTML = mbRows.map((r, i) => {
      const s = specs.find((x) => x.name === r.equip) || {};
      const pclose = typeof s.pclose === "number" ? s.pclose
        : (typeof s.ratio === "number" ? s.rwp / s.ratio : null);
      return `<tr>
        <td><select data-mb="${i}">${equipOptions(r.equip)}</select></td>
        <td class="num">${s.rwp ?? "&mdash;"}</td>
        <td class="num">${fmt(s.close, 2)}</td>
        <td class="num">${typeof s.ratio === "number" ? fmt(s.ratio, 2) : "&mdash;"}</td>
        <td class="num">${fmt(pclose, 0)}</td>
        <td><button class="del" data-delmb="${i}">&times;</button></td>
      </tr>`;
    }).join("");
  }

  function renderMC() {
    const tb = $("mcTable").querySelector("tbody");
    tb.innerHTML = mcRows.map((r, i) => {
      const s = specs.find((x) => x.name === r.equip) || {};
      return `<tr>
        <td><select data-mc="${i}">${equipOptions(r.equip)}</select></td>
        <td class="num">${s.rwp ?? "&mdash;"}</td>
        <td><input class="small" type="number" step="0.01" data-mcclose="${i}" value="${r.close ?? 0}"></td>
        <td><input class="small" type="number" step="0.1" data-mcratio="${i}" value="${r.ratio ?? ""}"></td>
        <td><input class="small" type="number" step="10" data-mcmop="${i}" value="${r.mopflps ?? ""}"></td>
        <td class="num" data-mcadj="${i}">&mdash;</td>
        <td><button class="del" data-delmc="${i}">&times;</button></td>
      </tr>`;
    }).join("");
  }

  // ---- gather inputs ----
  function numOrNull(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

  function gather() {
    return {
      atmospheric: parseFloat($("atmospheric").value),
      surfaceTemp: parseFloat($("surfaceTemp").value),
      tempRange: parseFloat($("tempRange").value),
      rwp: parseFloat($("rwp").value),
      mopOverride: numOrNull($("mopOverride").value),
      prechargeOverride: numOrNull($("prechargeOverride").value),
      shear: {
        bopType: $("sh_bopType").value,
        ramType: $("sh_ramType").value,
        pipeGrade: $("sh_pipeGrade").value,
        od: parseFloat($("sh_od").value),
        wall: parseFloat($("sh_wall").value),
        ppf: parseFloat($("sh_ppf").value),
        pw: parseFloat($("sh_pw").value),
        maxOpOverride: numOrNull($("sh_maxOp").value),
      },
      methodBRows: mbRows,
      methodCRows: mcRows,
    };
  }

  // ---- rendering of results ----
  function badge(ok, txt) { return `<span class="badge ${ok ? "ok" : "no"}">${txt}</span>`; }

  function renderShear(sh) {
    const el = $("shearResult");
    if (!sh || !sh.found) { el.innerHTML = `<div class="row"><span>No constants for this BOP / RAM / grade combination.</span></div>`; return; }
    el.innerHTML = `
      <div class="row"><span>Method 1 (ppf) shear pressure</span>
        <b>${fmt(sh.method1, 0)} psi &nbsp;${badge(sh.capable1, fmt(sh.pct1 * 100, 1) + "% of max")}</b></div>
      <div class="row"><span>Method 2 (OD/ID) shear pressure</span>
        <b>${fmt(sh.method2, 0)} psi &nbsp;${badge(sh.capable2, fmt(sh.pct2 * 100, 1) + "% of max")}</b></div>
      <div class="row"><span>Max operator pressure</span><b>${fmt(sh.maxOp, 0)} psi</b></div>`;
  }

  function densRow(label, p_psig, p_psia, t, rho) {
    return `<tr><td>${label}</td><td>${fmt(p_psig, 0)}</td><td>${fmt(p_psia, 1)}</td><td>${fmt(t, 1)}</td><td>${fmt(rho, 4)}</td></tr>`;
  }

  function renderMethodB(b) {
    $("r_methodB").innerHTML = `
      <table class="dtable"><tbody>
        <tr><td>Functional volume requirement FVR<sub>B</sub></td><td>${fmt(b.fvr, 2)} gal</td></tr>
        <tr><td>Pressure required</td><td>${fmt(b.pressureRequired, 1)} psig</td></tr>
        <tr><td>Optimum precharge (Method B)</td><td>${fmt(b.prechargePsig, 1)} psig</td></tr>
      </tbody></table>
      <div class="section-sub">Charged densities (&rho;1) @ ${fmt(b.chargedPsia, 1)} psia</div>
      <table class="dtable"><thead><tr><th>Condition</th><th>psig</th><th>psia</th><th>&deg;F</th><th>&rho; (lbm/ft&sup3;)</th></tr></thead><tbody>
        ${densRow("High temp", b.chargedPsig, b.chargedPsia, b.inputsTh, b.rho1BH)}
        ${densRow("Normal", b.chargedPsig, b.chargedPsia, b.inputsTn, b.rho1BN)}
        ${densRow("Low temp", b.chargedPsig, b.chargedPsia, b.inputsTl, b.rho1BL)}
      </tbody></table>
      <div class="section-sub">MOP densities (&rho;2) @ ${fmt(b.mopPsia, 1)} psia</div>
      <table class="dtable"><tbody>
        ${densRow("High temp", b.mopPsig, b.mopPsia, b.inputsTh, b.rho2BH)}
        ${densRow("Normal", b.mopPsig, b.mopPsia, b.inputsTn, b.rho2BN)}
        ${densRow("Low temp", b.mopPsig, b.mopPsia, b.inputsTl, b.rho2BL)}
      </tbody></table>`;
  }

  function renderMethodC(c) {
    $("r_methodC").innerHTML = `
      <table class="dtable"><tbody>
        <tr><td>Functional volume requirement FVR<sub>C</sub></td><td>${fmt(c.fvr, 2)} gal</td></tr>
        <tr><td>Pressure required</td><td>${fmt(c.pressureRequired, 1)} psig</td></tr>
        <tr><td>Optimum precharge (Method C)</td><td>${fmt(c.prechargePsig, 1)} psig</td></tr>
      </tbody></table>
      <div class="section-sub">Charged densities &amp; entropy @ ${fmt(c.chargedPsia, 1)} psia</div>
      <table class="dtable"><thead><tr><th>Condition</th><th>&deg;F</th><th>&rho;1</th><th>S1</th></tr></thead><tbody>
        <tr><td>High temp</td><td>${fmt(c.inputsTh,1)}</td><td>${fmt(c.rho1CH,4)}</td><td>${fmt(c.S1CH,5)}</td></tr>
        <tr><td>Normal</td><td>${fmt(c.inputsTn,1)}</td><td>${fmt(c.rho1CN,4)}</td><td>${fmt(c.S1CN,5)}</td></tr>
        <tr><td>Low temp</td><td>${fmt(c.inputsTl,1)}</td><td>${fmt(c.rho1CL,4)}</td><td>${fmt(c.S1CL,5)}</td></tr>
      </tbody></table>
      <div class="section-sub">MOP densities (&rho;2, entropy-matched temp) @ ${fmt(c.mopPsia, 1)} psia</div>
      <table class="dtable"><thead><tr><th>Condition</th><th>matched &deg;F</th><th>&rho;2</th></tr></thead><tbody>
        <tr><td>High temp</td><td>${fmt(c.T2CH,2)}</td><td>${fmt(c.rho2CH,4)}</td></tr>
        <tr><td>Normal</td><td>${fmt(c.T2CN,2)}</td><td>${fmt(c.rho2CN,4)}</td></tr>
        <tr><td>Low temp</td><td>${fmt(c.T2CL,2)}</td><td>${fmt(c.rho2CL,4)}</td></tr>
      </tbody></table>`;
  }

  function renderVE(s) {
    $("r_ve").innerHTML = `
      <table class="dtable"><thead><tr><th></th><th>Method B</th><th>Method C</th></tr></thead><tbody>
        <tr><td>Pressure-limited VE<sub>PL</sub></td><td>${fmt(s.VE_PL_B,4)}</td><td>${fmt(s.VE_PL_C,4)}</td></tr>
        <tr><td>Volume-limited VE<sub>VH</sub></td><td>${fmt(s.VE_VH_B,4)}</td><td>${fmt(s.VE_VH_C,4)}</td></tr>
        <tr><td>Governing VE = min</td><td>${fmt(s.VE_B,4)}</td><td>${fmt(s.VE_C,4)}</td></tr>
        <tr><td>Volume required (gal)</td><td>${fmt(s.ACR_B,2)}</td><td>${fmt(s.ACR_C,2)}</td></tr>
      </tbody></table>
      <p class="note">Using precharge density &rho;0 = <b>${fmt(s.rho0,4)}</b> lbm/ft&sup3;
        ${s.hasOverride ? "(from precharge override)" : "(from combined optimum)"}.</p>`;
  }

  function renderDecision(r) {
    const s = r.summary;
    const warn1 = s.prechargeOkMinTemp;
    const warn2 = s.prechargeOkMaxTemp;
    $("r_decision").innerHTML = `
      <div class="branch">Governing branch: ${s.branch}</div>
      <table><tbody>
        <tr><td>&rho;<sub>0</sub> Method B</td><td>${fmt(r.methodB.rho0,4)}</td></tr>
        <tr><td>&rho;<sub>0</sub> Method C</td><td>${fmt(r.methodC.rho0,4)}</td></tr>
        <tr><td>&rho;<sub>XBC</sub> / &rho;<sub>XCB</sub></td><td>${fmt(s.rho_XBC,4)} / ${fmt(s.rho_XCB,4)}</td></tr>
        <tr><td>Selected precharge</td><td>${fmt(s.selectedPrechargePsig,1)} psig</td></tr>
        <tr><td>Combined optimum precharge</td><td>${fmt(s.overallPsig,1)} psig</td></tr>
      </tbody></table>
      <div class="warnline ${warn1 ? "ok" : "bad"}">${warn1
        ? `Precharge at min temp (${fmt(s.prechargeMinTempPsia,0)} psia) is above 25% of charged pressure &mdash; OK.`
        : `Warning: precharge at min temp is below 25% of charged accumulator pressure.`}</div>
      <div class="warnline ${warn2 ? "ok" : "bad"}">${warn2
        ? `Precharge at max temp (${fmt(s.prechargeMaxPsig,0)} psig) is below accumulator RWP &mdash; OK.`
        : `Warning: precharge at max temp exceeds accumulator RWP.`}</div>`;
  }

  // ---- chart ----
  function drawChart(r) {
    const cv = $("chart");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const m = { l: 56, r: 16, t: 14, b: 38 };
    const pts = r.curve.points;
    const xs = pts.map((p) => p.p0);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    let yMax = 0;
    pts.forEach((p) => { yMax = Math.max(yMax, p.vB, p.vC); });
    yMax = Math.max(yMax, r.curve.optimumVol);
    yMax = Math.ceil(yMax / 100) * 100;
    const X = (v) => m.l + (v - xMin) / (xMax - xMin) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);

    // grid + axes
    ctx.strokeStyle = "#243040"; ctx.fillStyle = "#7e8b99"; ctx.font = "11px Segoe UI"; ctx.lineWidth = 1;
    const yStep = yMax / 5;
    for (let v = 0; v <= yMax + 1; v += yStep) {
      ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(W - m.r, Y(v)); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(v.toFixed(0), m.l - 8, Y(v) + 3);
    }
    ctx.textAlign = "center";
    for (let v = xMin; v <= xMax; v += 400) {
      ctx.fillText(v, X(v), H - m.b + 16);
    }
    ctx.fillText("Precharge pressure (psig)", (m.l + W - m.r) / 2, H - 4);
    ctx.save(); ctx.translate(14, (m.t + H - m.b) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("Accumulator volume (gal)", 0, 0); ctx.restore();

    const series = (key, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((p, i) => { const x = X(p.p0), y = Y(p[key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    };
    series("vB", "#4ea1ff");
    series("vC", "#ff7a59");

    // optimum point
    const ox = X(r.curve.optimumPsig), oy = Y(r.curve.optimumVol);
    if (r.curve.optimumPsig >= xMin && r.curve.optimumPsig <= xMax) {
      ctx.fillStyle = "#58d68d";
      ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#58d68d"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, H - m.b); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function renderResults(r) {
    // attach temps onto method blocks for the detail tables
    r.methodB.inputsTh = r.temps.Th; r.methodB.inputsTn = r.temps.Tn; r.methodB.inputsTl = r.temps.Tl;
    r.methodC.inputsTh = r.temps.Th; r.methodC.inputsTn = r.temps.Tn; r.methodC.inputsTl = r.temps.Tl;

    $("r_minVolume").textContent = r.summary.minVolume.toFixed(2);
    $("r_b11").textContent = r.summary.bottles11whole;
    $("r_b15").textContent = r.summary.bottles15whole;
    $("r_precharge").textContent = r.summary.selectedPrechargePsig.toFixed(0);

    renderShear(r.shear);
    renderMethodB(r.methodB);
    renderMethodC(r.methodC);
    renderVE(r.summary);
    renderDecision(r);
    drawChart(r);

    r.methodC.rows.forEach((row, i) => {
      const cell = document.querySelector(`[data-mcadj="${i}"]`);
      if (cell) cell.innerHTML = fmt(row.adjusted, 0);
    });
  }

  // ---- recompute (debounced API call) ----
  let recomputeTimer = null;
  let inFlight = false;
  let queued = false;

  function recompute() {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(runCompute, 250);
  }

  async function runCompute() {
    if (inFlight) { queued = true; return; }
    inFlight = true;
    try {
      const r = await api("/api/compute", gather());
      renderResults(r);
    } catch (e) {
      if (e.message !== "unauthorized") console.error(e);
    } finally {
      inFlight = false;
      if (queued) { queued = false; runCompute(); }
    }
  }

  // ---- event wiring ----
  function bindGlobalInputs() {
    ["atmospheric", "surfaceTemp", "tempRange", "rwp", "mopOverride", "prechargeOverride",
     "sh_bopType", "sh_ramType", "sh_pipeGrade", "sh_od", "sh_wall", "sh_ppf", "sh_pw", "sh_maxOp"]
      .forEach((id) => $(id).addEventListener("input", recompute));
  }

  function bindTables() {
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.mb != null) { mbRows[+t.dataset.mb].equip = t.value; renderMB(); recompute(); }
      else if (t.dataset.mc != null) { mcRows[+t.dataset.mc].equip = t.value; renderMC(); recompute(); }
    });
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.mcclose != null) { mcRows[+t.dataset.mcclose].close = numOrNull(t.value); recompute(); }
      else if (t.dataset.mcratio != null) { mcRows[+t.dataset.mcratio].ratio = numOrNull(t.value); recompute(); }
      else if (t.dataset.mcmop != null) { mcRows[+t.dataset.mcmop].mopflps = numOrNull(t.value); recompute(); }
    });
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t.dataset.delmb != null) { mbRows.splice(+t.dataset.delmb, 1); renderMB(); recompute(); }
      else if (t.dataset.delmc != null) { mcRows.splice(+t.dataset.delmc, 1); renderMC(); recompute(); }
      else if (t.dataset.add === "mb") { mbRows.push({ equip: specNames[0] }); renderMB(); recompute(); }
      else if (t.dataset.add === "mc") { mcRows.push({ equip: specNames[0], close: 0, ratio: null, mopflps: null }); renderMC(); recompute(); }
      else if (t.classList.contains("toggle")) { t.parentElement.classList.toggle("open"); }
    });
  }

  // ---- init (runs once we have an auth token) ----
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    try {
      const meta = await api("/api/meta");
      lists = meta.lists;
      specs = meta.bopSpecs;
      specNames = specs.map((s) => s.name);
    } catch (e) {
      if (e.message === "unauthorized") { started = false; return; }
      $("loading").textContent = "Could not reach the calculation server.";
      console.error(e);
      return;
    }

    fillSelect($("sh_bopType"), lists.bopTypes,
      "11-3M THRU 1OM U BOP Large bore Shear Bonnet equiped with booster assembly (LBT)");
    fillSelect($("sh_ramType"), lists.ramTypes, "DS");
    fillSelect($("sh_pipeGrade"), lists.pipeGrades, "S135");

    bindGlobalInputs();
    bindTables();
    renderMB();
    renderMC();
    runCompute();
    $("loading").classList.add("hidden");
  }

  // auth.js fires "auth:ready" once a valid login token is available.
  window.addEventListener("auth:ready", start);
  if (window.Auth && window.Auth.isAuthed()) start();
})();
