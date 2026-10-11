// Czysta logika obliczeń planu budżetu (bez DOM), zgodna z PRD.
// Dzięki temu da się ją przetestować w Node i użyć w aplikacji.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BudgetCalc = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const MAX_BUDGET = 999999999;
  const MAX_CUSTOM_CATEGORIES = 20;
  const ROI_MIN = -100;
  const ROI_MAX = 1000;

  const DEFAULT_CATEGORIES = [
    'Social media',
    'WWW i SEO',
    'Google Ads (SEM)',
    'Radio',
    'Telewizja',
    'Prasa i druk',
    'Eventy i targi',
    'E-mail marketing',
    'Influencerzy',
    'Inne',
  ];

  // Mnożniki scenariuszy (FR-15, FR-16).
  const SCENARIOS = [
    { id: 'pesymistyczny', name: 'Pesymistyczny', multiplier: -0.3 },
    { id: 'bazowy', name: 'Bazowy', multiplier: 0 },
    { id: 'optymistyczny', name: 'Optymistyczny', multiplier: 0.3 },
  ];

  const round = (n, digits = 2) => {
    const f = 10 ** digits;
    return Math.round((Number(n) + Number.EPSILON) * f) / f;
  };

  // ROI skorygowany mnożnikiem scenariusza. Dla ROI ujemnego mnożnik działa
  // odwrotnie, żeby scenariusz „optymistyczny” zawsze był korzystniejszy.
  function effectiveRoi(roi, multiplier) {
    return roi >= 0 ? roi * (1 + multiplier) : roi * (1 - multiplier);
  }

  // Główne przeliczenie. Zwraca wiersze kategorii i sumy portfela.
  function computePlan(plan, multiplier = 0) {
    const budget = Number(plan.totalBudget) || 0;

    const rows = plan.categories.map((c) => {
      const percent = Number(c.percent) || 0;
      const roi = Number(c.roi) || 0;
      const roiUsed = effectiveRoi(roi, multiplier);
      const amount = (budget * percent) / 100;           // FR-06
      const net = (amount * roiUsed) / 100;               // Zwrot_k = Kwota_k × ROI_k
      const gross = amount * (1 + roiUsed / 100);         // Wartość_k = Kwota_k × (1 + ROI_k)
      return {
        id: c.id,
        name: c.name,
        percent,
        amount,
        roi,
        roiUsed,
        net,
        gross,
        negative: roi < 0,                                // FR-14
      };
    });

    const allocatedPercent = rows.reduce((s, r) => s + r.percent, 0);
    const allocatedAmount = rows.reduce((s, r) => s + r.amount, 0);
    const totalNet = rows.reduce((s, r) => s + r.net, 0);
    const totalGross = rows.reduce((s, r) => s + r.gross, 0);

    rows.forEach((r) => {
      r.shareOfNet = totalNet !== 0 ? (r.net / totalNet) * 100 : 0; // FR-13
    });

    return {
      rows,
      budget,
      allocatedPercent,
      allocatedAmount,
      reservePercent: 100 - allocatedPercent,
      reserveAmount: budget - allocatedAmount,              // FR-10
      totalNet,
      totalGross,
      // ROI portfela ważony budżetem: Σ Zwrot_k / Σ Kwota_k × 100%
      portfolioRoi: allocatedAmount > 0 ? (totalNet / allocatedAmount) * 100 : 0,
    };
  }

  // Walidacja planu. Zwraca listę komunikatów; pusta lista = plan poprawny.
  function validatePlan(plan) {
    const errors = [];
    const budget = Number(plan.totalBudget);

    if (!plan.name || !plan.name.trim()) errors.push({ field: 'name', message: 'Podaj nazwę planu.' });
    const year = Number(plan.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push({ field: 'year', message: 'Rok musi być liczbą całkowitą z zakresu 2000–2100.' });
    }
    if (!Number.isFinite(budget) || budget <= 0 || budget > MAX_BUDGET) {
      errors.push({ field: 'totalBudget', message: `Budżet musi być liczbą większą od 0 i nie większą niż ${MAX_BUDGET.toLocaleString('pl-PL')}.` });
    }

    const custom = plan.categories.filter((c) => c.isCustom).length;
    if (custom > MAX_CUSTOM_CATEGORIES) {
      errors.push({ field: 'categories', message: `Możesz mieć maksymalnie ${MAX_CUSTOM_CATEGORIES} własnych kategorii.` });
    }

    plan.categories.forEach((c) => {
      if (!c.name || !c.name.trim()) {
        errors.push({ field: `name:${c.id}`, message: 'Kategoria musi mieć nazwę.' });
      }
      const p = Number(c.percent);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        errors.push({ field: `percent:${c.id}`, message: `${c.name}: udział musi być w zakresie 0–100%.` });
      }
      const r = Number(c.roi);
      if (!Number.isFinite(r) || r < ROI_MIN || r > ROI_MAX) {
        errors.push({ field: `roi:${c.id}`, message: `${c.name}: ROI musi być w zakresie ${ROI_MIN}% – ${ROI_MAX}%.` });
      }
    });

    // FR-09: suma alokacji nie może przekroczyć 100%. Zaokrąglenie usuwa błędy zmiennoprzecinkowe.
    const sum = round(plan.categories.reduce((s, c) => s + (Number(c.percent) || 0), 0), 2);
    if (sum > 100) {
      errors.push({ field: 'sum', message: `Alokacje przekraczają 100% o ${round(sum - 100, 1)} p.p. Zmniejsz je, aby zapisać plan.` });
    }

    return errors;
  }

  // Kwota → procent (FR-07). Procent zapisujemy z pełną precyzją, wyświetlamy z 1 miejscem.
  function amountToPercent(amount, budget) {
    return budget > 0 ? (Number(amount) / budget) * 100 : 0;
  }

  function percentToAmount(percent, budget) {
    return (budget * Number(percent)) / 100;
  }

  function createId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function createPlan(overrides = {}) {
    const now = new Date().toISOString();
    return {
      id: createId(),
      name: 'Nowy plan',
      year: new Date().getFullYear() + 1,
      currency: 'PLN',
      totalBudget: 100000,
      createdAt: now,
      updatedAt: now,
      categories: DEFAULT_CATEGORIES.map((name) => ({
        id: createId(),
        name,
        isCustom: false,
        percent: 0,
        roi: 0,
      })),
      ...overrides,
    };
  }

  // Duplikat planu z nowym id i nazwą (FR-23). Kopiujemy też kategorie i ROI.
  function duplicatePlan(plan, newYear) {
    const copy = JSON.parse(JSON.stringify(plan));
    const now = new Date().toISOString();
    copy.id = createId();
    copy.name = `${plan.name} (kopia)`;
    if (newYear) copy.year = newYear;
    copy.createdAt = now;
    copy.updatedAt = now;
    copy.categories.forEach((c) => (c.id = createId()));
    return copy;
  }

  return {
    MAX_BUDGET,
    MAX_CUSTOM_CATEGORIES,
    ROI_MIN,
    ROI_MAX,
    DEFAULT_CATEGORIES,
    SCENARIOS,
    round,
    effectiveRoi,
    computePlan,
    validatePlan,
    amountToPercent,
    percentToAmount,
    createId,
    createPlan,
    duplicatePlan,
  };
});
