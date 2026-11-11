(() => {
  const selector = '.scroll > table, .public-raid-table > table';
  const mobile = matchMedia('(max-width: 760px)');
  const enhancedRows = new WeakSet();

  function enhance(table) {
    const headers = table.tHead?.rows[0]?.cells;
    if (!headers || headers.length < 2) return;
    table.setAttribute('role', 'table');
    table.tHead.setAttribute('role', 'rowgroup');
    table.tHead.rows[0].setAttribute('role', 'row');
    for (const header of headers) header.setAttribute('role', 'columnheader');
    const summary = Number(table.dataset.mobileSummary ?? (headers.length > 2 ? 1 : -1));
    for (const body of table.tBodies) {
      body.setAttribute('role', 'rowgroup');
      for (const row of body.rows) {
        if (enhancedRows.has(row) || row.cells.length !== headers.length) continue;
        enhancedRows.add(row);
        row.setAttribute('role', 'row');
        for (const cell of row.cells) cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell');
        const name = row.cells[0].textContent.trim();
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'mobile-row-toggle';
        toggle.textContent = 'Details';
        toggle.setAttribute('aria-label', 'Details for ' + name);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
          const open = row.classList.toggle('mobile-row-open');
          toggle.setAttribute('aria-expanded', String(open));
          toggle.textContent = open ? 'Hide' : 'Details';
        });
        row.cells[0].append(toggle);
        for (let index = 1; index < headers.length; index++) {
          const cell = row.cells[index];
          cell.dataset.mobileLabel = headers[index].textContent.trim();
          if (index === summary) cell.classList.add('mobile-row-summary');
        }
        row.classList.add('mobile-table-row');
      }
    }
    table.classList.add('mobile-table');
  }

  function refresh() {
    if (mobile.matches) document.querySelectorAll(selector).forEach(enhance);
  }

  new MutationObserver(records => {
    if (!mobile.matches) return;
    const tables = new Set();
    for (const { target, addedNodes } of records) {
      if (target instanceof HTMLTableSectionElement || target instanceof HTMLTableElement) {
        const table = target.closest(selector);
        if (table) tables.add(table);
      }
      for (const node of addedNodes) {
        if (!(node instanceof Element) || node instanceof HTMLTableRowElement) continue;
        if (node.matches(selector)) tables.add(node);
        node.querySelectorAll(selector).forEach(table => tables.add(table));
      }
    }
    tables.forEach(enhance);
  }).observe(document.body, { childList: true, subtree: true });

  mobile.addEventListener('change', refresh);
  refresh();
})();
