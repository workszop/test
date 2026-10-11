// Kontroler interfejsu. Logika liczb jest w calc.js, zapis w storage.js.
(function () {
  'use strict';

  const C = window.BudgetCalc;
  const S = window.BudgetStorage;
  const $ = (id) => document.getElementById(id);

  const el = {
    btnNew: $('btn-new-plan'),
    viewList: $('view-list'),
    viewPlan: $('view-plan'),
    list: $('plan-list'),
    emptyMsg: $('list-empty'),
    btnBack: $('btn-back'),
    btnDuplicate: $('btn-duplicate'),
    btnDelete: $('btn-delete'),
    btnCsv: $('btn-export-csv'),
    btnXlsx: $('btn-export-xlsx'),
    status: $('save-status'),
    configForm: $('config-form'),
    planName: $('plan-name'),
    planYear: $('plan-year'),
    planBudget: $('plan-budget'),
    planCurrency: $('plan-currency'),
    progress: $('progress'),
    progressBar: $('progress-bar'),
    progressText: $('progress-text'),
    alert: $('alert'),
    allocBody: $('alloc-body'),
    allocFoot: $('alloc-foot'),
    addForm: $('add-category-form'),
    newCat: $('new-category'),
    pie: $('pie'),
    pieLegend: $('pie-legend'),
    bars: $('bars'),
    scenBody: $('scen-body'),
    dialog: $('confirm-dialog'),
    confirmText: $('confirm-text'),
    confirmOk: $('confirm-ok'),
  };

  let plans = S.loadPlans();
  let draft = null;                 // plan w edycji (kopia robocza)
  const rowRefs = new Map();        // id kategorii -> referencje do komórek

  // ---------- Formatowanie i pomocnicze ----------

  const nf = (digits) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const nf1 = nf(1);
  const fmtMoney = (v, cur) => new Intl.NumberFormat('pl-PL', {
    style: 'currency', currency: cur || 'PLN', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number.isFinite(v) ? v : 0);
  const fmtPct = (v) => `${nf1.format(Number.isFinite(v) ? v : 0)}%`;
  const fmtPP = (v) => `${nf1.format(v)} p.p.`;
  const fmtInput = (v, digits = 2) => (Number.isFinite(v) ? String(C.round(v, digits)) : '');
  const fmtDate = (iso) => new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  // Pusty input daje NaN, dzięki temu walidacja łapie wyczyszczone pole.
  const parseNum = (s) => (String(s).trim() === '' ? NaN : Number(s));

  // Tworzy element DOM. Tekst zawsze trafia jako textContent (ochrona przed XSS).
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'value') node.value = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  // Nie nadpisujemy pola, w którym użytkownik właśnie pisze.
  function setIfIdle(input, value) {
    if (document.activeElement !== input && input.value !== value) input.value = value;
  }

  function setStatus(text, isError = false) {
    el.status.textContent = text;
    el.status.classList.toggle('is-error', isError);
  }

  function showView(name) {
    el.viewList.hidden = name !== 'list';
    el.viewPlan.hidden = name !== 'plan';
    window.scrollTo(0, 0);
  }

  function slugify(text) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
  }

  // Potwierdzenie przez <dialog> zamiast window.confirm (lepsza dostępność i wygląd).
  function confirmAction(text, okLabel = 'Tak') {
    el.confirmText.textContent = text;
    el.confirmOk.textContent = okLabel;
    el.dialog.returnValue = '';
    return new Promise((resolve) => {
      el.dialog.addEventListener('close', () => resolve(el.dialog.returnValue === 'ok'), { once: true });
      el.dialog.showModal();
    });
  }

  // ---------- Zapis ----------

  function saveStored(plan) {
    const idx = plans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) plans[idx] = plan;
    else plans.push(plan);
    return S.savePlans(plans);
  }

  // Autozapis po każdej poprawnej zmianie (FR-22). Przy błędach zapisana zostaje
  // ostatnia poprawna wersja, a kopia robocza czeka na poprawki.
  function commit() {
    const errors = C.validatePlan(draft);
    if (errors.length === 0) {
      draft.updatedAt = new Date().toISOString();
      const ok = saveStored(structuredClone(draft));
      if (ok) setStatus(`Zapisano automatycznie o ${fmtTime(draft.updatedAt)}`);
      else setStatus('Nie udało się zapisać – przeglądarka blokuje pamięć lokalną.', true);
    } else {
      setStatus('Zmiany niezapisane – popraw zaznaczone pola.', true);
    }
    updateAll(errors);
  }

  // ---------- Lista planów ----------

  function renderList() {
    const sorted = [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    el.emptyMsg.hidden = sorted.length > 0;
    el.list.replaceChildren(...sorted.map((p) => h('li', { class: 'plan-item' },
      h('div', {},
        h('strong', {}, p.name),
        h('div', { class: 'meta' }, `Rok ${p.year} · ${fmtMoney(p.totalBudget, p.currency)} · edytowano ${fmtDate(p.updatedAt)}`)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => openPlan(p.id) }, 'Otwórz'),
        h('button', { type: 'button', class: 'btn', onclick: () => duplicateStored(p.id) }, 'Duplikuj'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: () => deleteStored(p.id) }, 'Usuń')),
    )));
  }

  function openPlan(id) {
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    draft = structuredClone(p);
    el.planName.value = draft.name;
    el.planYear.value = draft.year;
    el.planBudget.value = draft.totalBudget;
    el.planCurrency.value = draft.currency;
    renderTable();
    showView('plan');
    updateAll();
    setStatus(`Zapisano ${fmtDate(draft.updatedAt)}`);
  }

  async function deleteStored(id) {
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    const ok = await confirmAction(`Usunąć plan „${p.name}”? Tej operacji nie można cofnąć.`, 'Usuń');
    if (!ok) return;
    plans = plans.filter((x) => x.id !== id);
    S.savePlans(plans);
    if (draft && draft.id === id) draft = null;
    renderList();
    showView('list');
  }

  // Duplikat na kolejny rok (FR-23) z ostatniej zapisanej wersji.
  function duplicateStored(id) {
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    const copy = C.duplicatePlan(p, p.year + 1);
    saveStored(copy);
    openPlan(copy.id);
    setStatus(`Utworzono kopię planu na rok ${copy.year}.`);
  }

  // Jeśli kopia robocza ma błędy, pytamy, zanim ją porzucimy.
  async function allowDiscard(message) {
    if (!draft || C.validatePlan(draft).length === 0) return true;
    return confirmAction(message, 'Odrzuć');
  }

  // ---------- Tabela alokacji ----------

  function renderTable() {
    rowRefs.clear();
    el.allocBody.replaceChildren(...draft.categories.map((cat) => {
      const ref = {};
      ref.name = h('input', { type: 'text', maxlength: '60', value: cat.name, class: 'name-input', 'aria-label': 'Nazwa kategorii' });
      ref.percent = h('input', { type: 'number', min: '0', max: '100', step: '0.1', inputmode: 'decimal', class: 'num' });
      ref.amount = h('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', class: 'num' });
      ref.roi = h('input', { type: 'number', min: String(C.ROI_MIN), max: String(C.ROI_MAX), step: '0.1', inputmode: 'decimal', class: 'num' });
      ref.net = h('td', { class: 'num' });
      ref.gross = h('td', { class: 'num' });
      ref.share = h('td', { class: 'num' });
      ref.badge = h('span', { class: 'warn-badge', hidden: true }, '⚠ ROI ujemny');
      ref.nameCell = h('th', { scope: 'row' }, ref.name, ref.badge);
      ref.tr = h('tr', {},
        ref.nameCell,
        h('td', {}, ref.percent),
        h('td', {}, ref.amount),
        h('td', {}, ref.roi),
        ref.net, ref.gross, ref.share,
        h('td', {}, h('button', {
          type: 'button', class: 'btn btn-ghost btn-danger', 'aria-label': `Usuń kategorię ${cat.name}`,
          onclick: () => removeCategory(cat.id),
        }, '✕')));

      // Każda zmiana w wierszu trafia do kopii roboczej i przelicza wszystko.
      ref.name.addEventListener('input', () => { cat.name = ref.name.value; commit(); });
      ref.percent.addEventListener('input', () => { cat.percent = parseNum(ref.percent.value); commit(); });
      ref.amount.addEventListener('input', () => {
        const v = parseNum(ref.amount.value);
        cat.percent = Number.isFinite(v) ? C.amountToPercent(v, draft.totalBudget) : NaN;
        commit();
      });
      ref.roi.addEventListener('input', () => { cat.roi = parseNum(ref.roi.value); commit(); });

      rowRefs.set(cat.id, ref);
      return ref.tr;
    }));
  }

  function removeCategory(id) {
    draft.categories = draft.categories.filter((c) => c.id !== id);
    renderTable();
    commit();
  }

  el.addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el.newCat.value.trim();
    if (!name) {
      setStatus('Podaj nazwę kategorii.', true);
      return;
    }
    const customs = draft.categories.filter((c) => c.isCustom).length;
    if (customs >= C.MAX_CUSTOM_CATEGORIES) {
      setStatus(`Osiągnięto limit ${C.MAX_CUSTOM_CATEGORIES} własnych kategorii.`, true);
      return;
    }
    draft.categories.push({ id: C.createId(), name, isCustom: true, percent: 0, roi: 0 });
    el.newCat.value = '';
    renderTable();
    commit();
  });

  // ---------- Aktualizacja widoku ----------

  function updateAll(errors = C.validatePlan(draft)) {
    const res = C.computePlan(draft, 0);
    const cur = draft.currency;
    const errKeys = new Set(errors.map((e) => e.field));

    // Pasek sumy (FR-08, FR-09, FR-10)
    const sum = C.round(res.allocatedPercent, 2);
    const shown = Math.min(Math.max(sum, 0), 100);
    el.progressBar.style.width = `${shown}%`;
    el.progress.setAttribute('aria-valuenow', String(shown));
    el.progress.dataset.state = sum > 100 ? 'over' : sum === 100 ? 'ok' : '';
    if (sum > 100) {
      const overAmount = res.allocatedAmount - res.budget;
      el.progressText.textContent = `Rozdysponowano ${fmtPct(sum)} budżetu. Przekroczenie o ${fmtPP(sum - 100)} – zmniejsz alokacje o ${fmtMoney(overAmount, cur)}.`;
    } else {
      el.progressText.textContent = `Rozdysponowano ${fmtPct(sum)} (${fmtMoney(res.allocatedAmount, cur)}). Pozostało ${fmtPct(100 - sum)} – rezerwa ${fmtMoney(res.reserveAmount, cur)}.`;
    }

    el.alert.hidden = errors.length === 0;
    el.alert.replaceChildren(...errors.map((e) => h('p', { class: 'alert-line' }, e.message)));

    // Wiersze kategorii
    for (const r of res.rows) {
      const ref = rowRefs.get(r.id);
      if (!ref) continue;
      setIfIdle(ref.percent, fmtInput(r.percent));
      setIfIdle(ref.amount, fmtInput(r.amount));
      setIfIdle(ref.roi, fmtInput(r.roi));
      ref.net.textContent = fmtMoney(r.net, cur);
      ref.net.className = r.net < 0 ? 'num neg' : 'num';
      ref.gross.textContent = fmtMoney(r.gross, cur);
      ref.share.textContent = fmtPct(r.shareOfNet);
      ref.badge.hidden = !r.negative;
      ref.percent.setAttribute('aria-invalid', String(errKeys.has(`percent:${r.id}`)));
      ref.roi.setAttribute('aria-invalid', String(errKeys.has(`roi:${r.id}`)));
      ref.name.setAttribute('aria-invalid', String(errKeys.has(`name:${r.id}`)));
      ref.percent.setAttribute('aria-label', `Udział % – ${r.name}`);
      ref.amount.setAttribute('aria-label', `Kwota – ${r.name}`);
      ref.roi.setAttribute('aria-label', `ROI % – ${r.name}`);
    }

    // Stopka: suma kategorii i rezerwa
    const dash = '–';
    el.allocFoot.replaceChildren(
      h('tr', {},
        h('th', { scope: 'row' }, 'Razem (kategorie)'),
        h('td', { class: 'num' }, fmtPct(res.allocatedPercent)),
        h('td', { class: 'num' }, fmtMoney(res.allocatedAmount, cur)),
        h('td', { class: 'num' }, fmtPct(res.portfolioRoi)),
        h('td', { class: res.totalNet < 0 ? 'num neg' : 'num' }, fmtMoney(res.totalNet, cur)),
        h('td', { class: 'num' }, fmtMoney(res.totalGross, cur)),
        h('td', { class: 'num' }, res.totalNet !== 0 ? '100,0%' : dash),
        h('td', {})),
      h('tr', { class: 'row-reserve' },
        h('th', { scope: 'row' }, 'Rezerwa'),
        h('td', { class: 'num' }, fmtPct(res.reservePercent)),
        h('td', { class: 'num' }, fmtMoney(res.reserveAmount, cur)),
        h('td', { class: 'num' }, dash),
        h('td', { class: 'num' }, dash),
        h('td', { class: 'num' }, dash),
        h('td', { class: 'num' }, dash),
        h('td', {})),
    );

    renderPie(res);
    renderBars(res);
    renderScenarios();
  }

  // Wykres kołowy zrobiony z conic-gradient (bez biblioteki).
  function renderPie(res) {
    const segments = res.rows.map((r, i) => ({ name: r.name, value: Math.max(r.percent, 0), color: `hsl(${(i * 47) % 360} 62% 52%)` }));
    if (res.reservePercent > 0) segments.push({ name: 'Rezerwa', value: res.reservePercent, color: '#9aa3b5' });
    const total = segments.reduce((s, x) => s + x.value, 0);

    let acc = 0;
    const stops = segments.filter((s) => s.value > 0).map((s) => {
      const start = acc;
      acc += (s.value / total) * 100;
      return `${s.color} ${start}% ${acc}%`;
    });
    el.pie.style.background = total > 0 ? `conic-gradient(${stops.join(', ')})` : 'var(--track)';
    el.pie.setAttribute('aria-label', total > 0
      ? `Wykres kołowy: ${segments.map((s) => `${s.name} ${fmtPct(s.value)}`).join(', ')}`
      : 'Wykres kołowy: brak alokacji');

    el.pieLegend.replaceChildren(...segments.map((s) => h('li', {},
      h('span', { class: 'swatch', style: `background:${s.color}` }),
      `${s.name} – ${fmtPct(s.value)}`)));
  }

  // Słupki zwrotu netto; szerokość proporcjonalna do |wartości|.
  function renderBars(res) {
    if (res.rows.length === 0) {
      el.bars.replaceChildren(h('p', { class: 'muted' }, 'Dodaj kategorie, aby zobaczyć zwrot.'));
      return;
    }
    const maxAbs = Math.max(...res.rows.map((r) => Math.abs(r.net)), 0);
    el.bars.replaceChildren(...res.rows.map((r) => {
      const width = maxAbs > 0 ? (Math.abs(r.net) / maxAbs) * 100 : 0;
      return h('div', { class: 'bar-row' },
        h('span', {}, r.name),
        h('div', { class: 'bar-track' },
          h('div', { class: `bar-fill${r.net < 0 ? ' neg-fill' : ''}`, style: `width:${width}%` })),
        h('span', { class: `bar-value${r.net < 0 ? ' neg' : ''}` }, fmtMoney(r.net, draft.currency)));
    }));
  }

  // Porównanie scenariuszy obok siebie (FR-17)
  function renderScenarios() {
    const cur = draft.currency;
    const results = C.SCENARIOS.map((s) => C.computePlan(draft, s.multiplier));
    const base = results[1].totalNet;
    const rowsDef = [
      ['Zwrot netto łącznie', (r) => fmtMoney(r.totalNet, cur)],
      ['Wartość brutto łącznie', (r) => fmtMoney(r.totalGross, cur)],
      ['ROI portfela', (r) => fmtPct(r.portfolioRoi)],
      ['Różnica netto względem bazowego', (r) => {
        const d = r.totalNet - base;
        return `${d > 0 ? '+' : ''}${fmtMoney(d, cur)}`;
      }],
    ];
    el.scenBody.replaceChildren(...rowsDef.map(([label, fn]) => h('tr', {},
      h('th', { scope: 'row' }, label),
      ...results.map((r) => h('td', { class: 'num' }, fn(r))))));
  }

  // ---------- Konfiguracja planu ----------

  el.configForm.addEventListener('submit', (e) => e.preventDefault());
  el.planName.addEventListener('input', () => { draft.name = el.planName.value; commit(); });
  el.planYear.addEventListener('input', () => { draft.year = parseNum(el.planYear.value); commit(); });
  el.planBudget.addEventListener('input', () => { draft.totalBudget = parseNum(el.planBudget.value); commit(); });
  el.planCurrency.addEventListener('change', () => { draft.currency = el.planCurrency.value; commit(); });

  // ---------- Przyciski ----------

  el.btnNew.addEventListener('click', () => {
    const p = C.createPlan();
    saveStored(p);
    openPlan(p.id);
    el.planName.focus();
  });

  el.btnBack.addEventListener('click', async () => {
    if (!(await allowDiscard('Ostatnie zmiany są niepoprawne i nie zostały zapisane. Odrzucić je?'))) return;
    draft = null;
    renderList();
    showView('list');
  });

  el.btnDuplicate.addEventListener('click', async () => {
    if (!(await allowDiscard('Duplikat powstanie z ostatniej zapisanej wersji, a niepoprawne zmiany zostaną odrzucone. Kontynuować?'))) return;
    duplicateStored(draft.id);
  });

  el.btnDelete.addEventListener('click', () => deleteStored(draft.id));

  // Eksport CSV: wartości liczbowe bez formatowania (FR-26), separator „;” dla polskiego Excela.
  el.btnCsv.addEventListener('click', () => {
    const res = C.computePlan(draft, 0);
    const n = (v, d = 2) => (Number.isFinite(v) ? String(C.round(v, d)) : '');
    const q = (v) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [['Kategoria', 'Udział %', 'Kwota', 'ROI %', 'Zwrot netto', 'Wartość brutto', 'Udział w zwrocie %']];
    res.rows.forEach((r) => lines.push([r.name, n(r.percent), n(r.amount), n(r.roi), n(r.net), n(r.gross), n(r.shareOfNet)]));
    lines.push(['Rezerwa', n(res.reservePercent), n(res.reserveAmount), '', '', '', '']);
    // W wierszu „Razem” kolumna ROI to ROI portfela (ważony budżetem).
    lines.push(['Razem', n(res.allocatedPercent), n(res.allocatedAmount), n(res.portfolioRoi), n(res.totalNet), n(res.totalGross), res.totalNet !== 0 ? '100' : '']);
    const csv = '﻿' + lines.map((l) => l.map(q).join(';')).join('\r\n');
    download(`${slugify(draft.name)}-${draft.year}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  });

  // Eksport XLSX: arkusz „Plan” z formułami, „Podsumowanie” z odwołaniami do „Plan” (FR-25).
  el.btnXlsx.addEventListener('click', () => {
    if (!window.XLSX) {
      setStatus('Nie udało się wczytać biblioteki XLSX. Sprawdź połączenie lub użyj eksportu CSV.', true);
      return;
    }
    exportXlsx();
  });

  function exportXlsx() {
    const X = window.XLSX;
    const res = C.computePlan(draft, 0);
    const first = 7;
    const last = first + res.rows.length - 1;
    const tot = last + 1;
    const resRow = last + 2;

    const aoa = [
      ['Plan', draft.name],
      ['Rok', draft.year],
      ['Budżet roczny', draft.totalBudget],
      ['Waluta', draft.currency],
      [],
      ['Kategoria', 'Udział %', 'Kwota', 'ROI %', 'Zwrot netto', 'Wartość brutto', 'Udział w zwrocie %'],
      ...res.rows.map((r) => [r.name, r.percent, r.amount, r.roi, r.net, r.gross, r.shareOfNet]),
      ['Razem (kategorie)', res.allocatedPercent, res.allocatedAmount, res.portfolioRoi, res.totalNet, res.totalGross, res.totalNet !== 0 ? 100 : 0],
      ['Rezerwa', res.reservePercent, res.reserveAmount],
    ];
    const ws = X.utils.aoa_to_sheet(aoa);

    // Formuły zamiast wartości, żeby arkusz dał się edytować w Excelu i LibreOffice
    const fcell = (f, v, z) => ({ t: 'n', f, v, z });
    res.rows.forEach((r, i) => {
      const row = first + i;
      ws[`C${row}`] = fcell(`B${row}*$B$3/100`, r.amount, '#,##0.00');
      ws[`E${row}`] = fcell(`C${row}*D${row}/100`, r.net, '#,##0.00');
      ws[`F${row}`] = fcell(`C${row}*(1+D${row}/100)`, r.gross, '#,##0.00');
      ws[`G${row}`] = fcell(`IF($E$${tot}=0,0,E${row}/$E$${tot}*100)`, r.shareOfNet, '0.0');
    });
    ws[`B${tot}`] = fcell(`SUM(B${first}:B${last})`, res.allocatedPercent, '0.0');
    ws[`C${tot}`] = fcell(`SUM(C${first}:C${last})`, res.allocatedAmount, '#,##0.00');
    ws[`D${tot}`] = fcell(`IF(C${tot}=0,0,E${tot}/C${tot}*100)`, res.portfolioRoi, '0.0');
    ws[`E${tot}`] = fcell(`SUM(E${first}:E${last})`, res.totalNet, '#,##0.00');
    ws[`F${tot}`] = fcell(`SUM(F${first}:F${last})`, res.totalGross, '#,##0.00');
    ws[`G${tot}`] = fcell(`SUM(G${first}:G${last})`, res.totalNet !== 0 ? 100 : 0, '0.0');
    ws[`B${resRow}`] = fcell(`100-B${tot}`, res.reservePercent, '0.0');
    ws[`C${resRow}`] = fcell(`$B$3-C${tot}`, res.reserveAmount, '#,##0.00');
    ws['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];

    const ws2 = X.utils.aoa_to_sheet([
      ['Podsumowanie', draft.name],
      ['Budżet roczny', draft.totalBudget],
      ['Rozdysponowana kwota', res.allocatedAmount],
      ['Rezerwa (kwota)', res.reserveAmount],
      ['Zwrot netto łącznie', res.totalNet],
      ['Wartość brutto łącznie', res.totalGross],
      ['ROI portfela (%)', res.portfolioRoi],
      [],
      ['Wykresy nie są eksportowane w tej wersji. Dane do wykresów znajdziesz w arkuszu „Plan”.'],
    ]);
    ws2['B2'] = fcell(`'Plan'!B3`, draft.totalBudget, '#,##0.00');
    ws2['B3'] = fcell(`'Plan'!C${tot}`, res.allocatedAmount, '#,##0.00');
    ws2['B4'] = fcell(`'Plan'!C${resRow}`, res.reserveAmount, '#,##0.00');
    ws2['B5'] = fcell(`'Plan'!E${tot}`, res.totalNet, '#,##0.00');
    ws2['B6'] = fcell(`'Plan'!F${tot}`, res.totalGross, '#,##0.00');
    ws2['B7'] = fcell(`'Plan'!D${tot}`, res.portfolioRoi, '0.0');
    ws2['!cols'] = [{ wch: 30 }, { wch: 22 }];

    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Plan');
    X.utils.book_append_sheet(wb, ws2, 'Podsumowanie');
    X.writeFile(wb, `${slugify(draft.name)}-${draft.year}.xlsx`);
  }

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Start ----------

  renderList();
  showView('list');
})();
