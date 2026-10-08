/* BRRRR Deal Analyzer — math + rendering, localStorage-persisted */
(function () {
  "use strict";

  var STORE_KEY = "brrrr-inputs-v1";
  var REFI_LTV = 0.75; // 75% cash-out of ARV

  var DEMO = {
    purchase: 120000, rehab: 40000, arv: 220000,
    downpct: 25, rate: 7.5, term: 30,
    rent: 1900, tax: 3600, ins: 1500,
    vac: 5, maint: 5, capex: 5, mgmt: 8
  };

  var FIELDS = [
    "purchase", "rehab", "arv",
    "downpct", "rate", "term",
    "rent", "tax", "ins",
    "vac", "maint", "capex", "mgmt"
  ];

  /* ---------- formatting ---------- */
  function money(n) {
    if (!isFinite(n)) return "—";
    var sign = n < 0 ? "−" : "";
    return sign + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  }
  function pct(n, digits) {
    if (!isFinite(n)) return "—";
    return (n * 100).toFixed(digits === undefined ? 1 : digits) + "%";
  }
  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  /* ---------- state ---------- */
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        var out = {};
        FIELDS.forEach(function (f) {
          out[f] = (s && isFinite(num(s[f], NaN))) ? num(s[f]) : DEMO[f];
        });
        return out;
      }
    } catch (e) { /* fall through to demo */ }
    return Object.assign({}, DEMO);
  }
  function saveState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* ---------- math ---------- */
  function pmt(principal, annualRate, years) {
    if (principal <= 0 || years <= 0) return 0;
    var r = annualRate / 100 / 12, n = years * 12;
    if (r <= 0) return principal / n;
    var f = Math.pow(1 + r, n);
    return principal * r * f / (f - 1);
  }

  function analyze(s) {
    var downPay = s.purchase * s.downpct / 100;
    var acqLoan = Math.max(0, s.purchase - downPay);
    var invested = downPay + s.rehab;

    var refiLoan = REFI_LTV * s.arv;
    var proceeds = Math.max(0, refiLoan - acqLoan); // pays off acquisition loan
    var cashOut = Math.max(0, proceeds - invested);
    var leftIn = Math.max(0, invested - proceeds);

    var refiPmt = pmt(refiLoan, s.rate, s.term);

    var effRent = s.rent * (1 - s.vac / 100);
    var opEx = s.tax / 12 + s.ins / 12 +
      s.rent * (s.maint + s.capex + s.mgmt) / 100;
    var noi = effRent - opEx;
    var cashFlow = noi - refiPmt;

    var coc = leftIn > 0 ? (cashFlow * 12) / leftIn : (cashFlow > 0 ? Infinity : 0);
    var dscr = refiPmt > 0 ? noi / refiPmt : (noi >= 0 ? Infinity : 0);

    return {
      downPay: downPay, acqLoan: acqLoan, invested: invested,
      refiLoan: refiLoan, proceeds: proceeds, cashOut: cashOut, leftIn: leftIn,
      refiPmt: refiPmt, effRent: effRent, opEx: opEx, noi: noi,
      cashFlow: cashFlow, coc: coc, dscr: dscr
    };
  }

  /* ---------- verdict ---------- */
  function verdict(s, a) {
    var el = document.getElementById("verdict");
    var ratio = a.invested > 0 ? a.leftIn / a.invested : 1;
    var title, cls = "";
    if (a.leftIn <= 0.005) { title = "TRUE BRRRR"; }
    else if (ratio <= 0.25) { title = "STRONG BRRRR"; cls = "mid"; }
    else if (ratio <= 0.6) { title = "PARTIAL BRRRR — CASH TRAPPED"; cls = "warn"; }
    else { title = "NOT A BRRRR"; cls = "warn"; }

    var leftTxt = a.leftIn <= 0.005
      ? "every dollar comes home" + (a.cashOut > 0 ? ", plus " + money(a.cashOut) + " extra in your pocket" : "")
      : money(a.leftIn) + " stays in the deal";
    var flowTxt = a.cashFlow >= 0
      ? "and it cash-flows " + money(a.cashFlow) + "/mo after the refi"
      : "but it bleeds " + money(a.cashFlow) + "/mo after the refi";

    el.className = "verdict" + (cls ? " " + cls : "");
    el.innerHTML =
      '<div class="v-title">' + title + "</div>" +
      '<div class="v-sub">' + leftTxt + " " + flowTxt + ".</div>";
  }

  /* ---------- rendering ---------- */
  function row(label, value, cls) {
    return '<div class="row"><span>' + label + '</span><b' +
      (cls ? ' class="' + cls + '"' : "") + ">" + value + "</b></div>";
  }

  function render(s, a) {
    var steps = {
      "step-buy":
        row("Purchase price", money(s.purchase)) +
        row("Down payment (" + s.downpct + "%)", money(a.downPay)) +
        row("Acquisition loan", money(a.acqLoan)),
      "step-rehab":
        row("Rehab budget", money(s.rehab)) +
        row("Total cash invested", money(a.invested)),
      "step-rent":
        row("Monthly rent", money(s.rent)) +
        row("Less vacancy (" + s.vac + "%)", money(s.rent - a.effRent), "neg") +
        row("Operating expenses", money(a.opEx), "neg") +
        row("Net operating income", money(a.noi), a.noi >= 0 ? "pos" : "neg"),
      "step-refi":
        row("ARV", money(s.arv)) +
        row("New loan — 75% of ARV", money(a.refiLoan)) +
        row("Pay off acquisition loan", money(-a.acqLoan), "neg") +
        row("Cash back to you", money(a.proceeds), "pos") +
        row("Cash left in deal", money(a.leftIn), a.leftIn > 0 ? "neg" : "pos"),
      "step-repeat":
        row("Capital freed to recycle", money(a.invested - a.leftIn), "pos") +
        row("New monthly payment", money(a.refiPmt), "neg")
    };
    Object.keys(steps).forEach(function (id) {
      document.querySelector("#" + id + " .step-lines").innerHTML = steps[id];
    });

    document.getElementById("m-invested").textContent = money(a.invested);
    document.getElementById("m-proceeds").textContent = money(a.proceeds);

    var leftEl = document.getElementById("m-left");
    leftEl.textContent = money(a.leftIn);
    leftEl.className = a.leftIn > 0 ? "neg" : "pos";

    var cfEl = document.getElementById("m-cashflow");
    cfEl.textContent = money(a.cashFlow) + "/mo";
    cfEl.className = a.cashFlow >= 0 ? "pos" : "neg";

    document.getElementById("m-coc").textContent =
      a.coc === Infinity ? "∞ infinite" : (isFinite(a.coc) ? pct(a.coc, 1) : "—");
    document.getElementById("m-dscr").textContent =
      a.dscr === Infinity ? "∞" : (isFinite(a.dscr) ? a.dscr.toFixed(2) : "—");

    verdict(s, a);
  }

  /* ---------- wiring ---------- */
  var state = loadState();

  FIELDS.forEach(function (f) {
    var el = document.getElementById("in-" + f);
    el.value = state[f];
    el.addEventListener("input", function () {
      state[f] = num(el.value, DEMO[f]);
      saveState(state);
      render(state, analyze(state));
    });
  });

  document.getElementById("btn-demo").addEventListener("click", function () {
    state = Object.assign({}, DEMO);
    FIELDS.forEach(function (f) {
      document.getElementById("in-" + f).value = state[f];
    });
    saveState(state);
    render(state, analyze(state));
  });

  render(state, analyze(state));
})();
