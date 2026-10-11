// Zapis planów w localStorage. Każde odwołanie jest owinięte w try/catch,
// bo przeglądarka może zablokować storage (tryb prywatny, zablokowane dane witryny).
(function (root) {
  const KEY = 'budget-planner:plans:v1';

  function loadPlans() {
    try {
      const raw = root.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Nie udało się odczytać planów', e);
      return [];
    }
  }

  function savePlans(plans) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(plans));
      return true;
    } catch (e) {
      console.warn('Nie udało się zapisać planów', e);
      return false;
    }
  }

  root.BudgetStorage = { loadPlans, savePlans };
})(typeof self !== 'undefined' ? self : globalThis);
