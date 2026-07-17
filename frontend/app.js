const API_BASE_URL = "http://localhost:5000/api";
const state = {
  categories: [],
  months: [],
  month: null,
};

const selectors = {
  income: document.getElementById("summary-income"),
  expense: document.getElementById("summary-expense"),
  investment: document.getElementById("summary-investment"),
  savings: document.getElementById("summary-savings"),
  breakdown: document.getElementById("category-breakdown"),
  goals: document.getElementById("goal-progress"),
  transactionTable: document.getElementById("transaction-table"),
  monthPicker: document.getElementById("month-filter"),
  clearMonth: document.getElementById("clear-month"),
  refresh: document.getElementById("refresh-data"),
  toast: document.getElementById("toast"),
  transactionForm: document.getElementById("transaction-form"),
  categoryForm: document.getElementById("category-form"),
  goalForm: document.getElementById("goal-form"),
  sankeyButton: document.getElementById("sankey-button"),
  sankeyMonth: document.getElementById("sankey-month"),
  sankeyStatus: document.getElementById("sankey-status"),
  sankeyChart: document.getElementById("sankey-chart"),
  sankeyPanel: document.getElementById("sankey-panel"),
  sankeyJump: document.getElementById("sankey-jump"),
  yearlyTable: document.getElementById("yearly-table"),
};

const sankeyPalette = {
  income: "#6cf7c5",
  expense: "#ff5b7f",
  investment: "#f7c56c",
  withdrawal: "#c5a6ff",
  savings: "#2fb5ff",
  pool: "#6cf7c5",
  shortfall: "#ff8c5b",
  category: "#7f8cff",
};

const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

function resetForm(form) {
  if (!form) {
    return;
  }
  form.reset();
  form.querySelectorAll("select[data-placeholder]").forEach((select) => {
    if (select.options.length) {
      select.selectedIndex = 0;
    } else {
      select.value = "";
    }
  });
}

function showToast(message, variant = "info") {
  selectors.toast.textContent = message;
  selectors.toast.classList.toggle("error", variant === "error");
  selectors.toast.classList.add("show");
  setTimeout(() => selectors.toast.classList.remove("show"), 2600);
}

function formatMonthLabel(token) {
  const [year, month] = token.split("-").map(Number);
  if (!year || !month) {
    return token;
  }
  return new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function populateMonthDropdowns() {
  if (!selectors.monthPicker || !selectors.sankeyMonth) {
    return;
  }
  const sankeyValue = selectors.sankeyMonth.value;
  const baseOption = '<option value="">All months</option>';
  const monthOptions = state.months
    .map((token) => `<option value="${token}">${formatMonthLabel(token)}</option>`)
    .join("\n");
  const combined = [baseOption, monthOptions].join("\n");
  selectors.monthPicker.innerHTML = combined;
  selectors.sankeyMonth.innerHTML = combined;
  selectors.monthPicker.value = state.month || "";
  if (sankeyValue && state.months.includes(sankeyValue)) {
    selectors.sankeyMonth.value = sankeyValue;
  } else {
    selectors.sankeyMonth.value = "";
  }
}

async function fetchMonths() {
  const payload = await api("/months");
  state.months = payload.months || [];
  if (state.month && !state.months.includes(state.month)) {
    state.months.unshift(state.month);
  }
  populateMonthDropdowns();
}

async function api(path, options = {}) {
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options,
  };
  const response = await fetch(`${API_BASE_URL}${path}`, config);
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: "Request failed" }));
    const message = errorPayload.error || response.statusText;
    throw new Error(message);
  }
  return response.json();
}

function buildQuery(path, params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function fetchCategories() {
  const data = await api("/categories");
  state.categories = data;
  populateCategorySelects();
}

function populateCategorySelects() {
  const transactionSelect = selectors.transactionForm.querySelector("select[name=\"category_id\"]");
  const goalSelect = selectors.goalForm.querySelector("select[name=\"category_id\"]");

  if (!state.categories.length) {
    transactionSelect.innerHTML = '<option disabled selected>Create a category first</option>';
    goalSelect.innerHTML = '<option disabled selected>No expense categories yet</option>';
    return;
  }

  const option = (category) =>
    `<option value="${category.id}">${escapeHtml(category.name)} · ${escapeHtml(category.type)}</option>`;
  const transactionPlaceholder = '<option value="" disabled selected hidden>Select category</option>';
  transactionSelect.innerHTML = [transactionPlaceholder, ...state.categories.map(option)].join("\n");
  if (transactionSelect.options.length) {
    transactionSelect.selectedIndex = 0;
  }

  const expenseOptions = state.categories.filter((category) => category.type === "expense");
  if (expenseOptions.length) {
    const goalPlaceholder = '<option value="" disabled selected hidden>Select expense category</option>';
    goalSelect.innerHTML = [goalPlaceholder, ...expenseOptions.map(option)].join("\n");
    goalSelect.selectedIndex = 0;
  } else {
    goalSelect.innerHTML = '<option disabled selected>No expense categories yet</option>';
  }
}

async function fetchTransactions() {
  const path = buildQuery("/transactions", { month: state.month });
  const data = await api(path);
  renderTransactions(data);
}

function renderTransactions(list) {
  if (!list.length) {
    selectors.transactionTable.innerHTML = `
      <tr>
        <td colspan="6" class="muted">No transactions found</td>
      </tr>
    `;
    return;
  }
  const inflowTypes = new Set(["income", "withdrawal"]);
  selectors.transactionTable.innerHTML = list
    .map((transaction) => {
      const sign = inflowTypes.has(transaction.type) ? "+" : "-";
      return `
        <tr data-id="${transaction.id}">
          <td>${escapeHtml(transaction.occurred_on)}</td>
          <td class="mono">${escapeHtml(transaction.uid)}</td>
          <td>${escapeHtml(transaction.description)}</td>
          <td>${escapeHtml(transaction.category_name)}</td>
          <td>${sign}${currency(transaction.amount)}</td>
          <td><button class="danger" data-action="delete">Delete</button></td>
        </tr>
      `;
    })
    .join("");
}

async function fetchSummary() {
  const path = buildQuery("/summary", { month: state.month });
  const summary = await api(path);
  selectors.income.textContent = currency(summary.totals.income);
  selectors.expense.textContent = currency(summary.totals.expense);
  selectors.investment.textContent = currency(summary.totals.investment || 0);
  selectors.savings.textContent = currency(summary.net);
  renderBreakdown(summary.by_category);
  renderGoals(summary.goals);
}

async function fetchYearlySummary() {
  const data = await api("/yearly-summary");
  renderYearlySummary(data);
}

function renderYearlySummary(rows) {
  if (!selectors.yearlyTable) {
    return;
  }
  if (!rows.length) {
    selectors.yearlyTable.innerHTML = `
      <tr>
        <td colspan="5" class="muted">No transactions yet</td>
      </tr>
    `;
    return;
  }
  selectors.yearlyTable.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.year}</td>
          <td>${currency(row.income)}</td>
          <td>${currency(row.expense)}</td>
          <td>${currency(row.investment)}</td>
          <td>${currency(row.net)}</td>
        </tr>
      `
    )
    .join("\n");
}

function renderBreakdown(breakdown) {
  const entries = Object.entries(breakdown);
  if (!entries.length) {
    selectors.breakdown.innerHTML = `<li>No transactions yet</li>`;
    return;
  }
  selectors.breakdown.innerHTML = entries
    .map(([name, value]) => `<li>${escapeHtml(name)}: ${currency(value)}</li>`)
    .join("\n");
}

function renderGoals(goalPayload) {
  if (!goalPayload.length) {
    selectors.goals.innerHTML = `<p class="muted">No goals configured.</p>`;
    return;
  }
  selectors.goals.innerHTML = goalPayload
    .map(({ goal, spent, progress }) => {
      const ratio = Math.min(progress, 1);
      const pct = Math.round(ratio * 100);
      return `
        <div class="goal-row">
          <div class="goal-meta">
            <span>${escapeHtml(goal.category_name)}</span>
            <span>${currency(spent)} / ${currency(goal.monthly_limit)}</span>
          </div>
          <div class="goal-track">
            <div class="goal-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("\n");
}

function sankeyNodeColor(node) {
  const typeKey = node.type || "category";
  return sankeyPalette[typeKey] || sankeyPalette.category;
}

function renderSankeyDiagram(payload, labelText) {
  const chart = selectors.sankeyChart;
  const status = selectors.sankeyStatus;
  if (!chart || !status) {
    return;
  }

  if (!window.Plotly) {
    status.textContent = "Plotly failed to load.";
    return;
  }

  if (!payload.links.length) {
    status.textContent = "No flows found for the selected range.";
    Plotly.purge(chart);
    return;
  }

  const data = [
    {
      type: "sankey",
      orientation: "h",
      node: {
        pad: 16,
        thickness: 18,
        label: payload.nodes.map((node) => node.name),
        color: payload.nodes.map((node) => sankeyNodeColor(node)),
        line: { color: "rgba(255,255,255,0.12)", width: 1 },
      },
      link: {
        source: payload.links.map((link) => link.source),
        target: payload.links.map((link) => link.target),
        value: payload.links.map((link) => link.value),
        color: payload.links.map(() => "rgba(108,247,197,0.4)"),
      },
    },
  ];

  const layout = {
    font: { family: "Space Grotesk, sans-serif", color: "#f2f5fb" },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 10, l: 10, r: 10, b: 10 },
  };

  Plotly.react(chart, data, layout, { responsive: true });
  status.textContent = labelText;
}

async function buildSankey() {
  const button = selectors.sankeyButton;
  const monthInput = selectors.sankeyMonth;
  const status = selectors.sankeyStatus;
  if (!button || !monthInput || !status) {
    return;
  }
  const month = monthInput.value || null;
  const label = month ? `Showing flows for ${month}` : "Showing flows for all history";
  button.disabled = true;
  status.textContent = "Building Sankey diagram...";
  api(buildQuery("/sankey", { month }))
    .then((payload) => renderSankeyDiagram(payload, label))
    .catch((error) => {
      showToast(error.message, "error");
      status.textContent = "Unable to render chart. Please try again.";
    })
    .finally(() => {
      button.disabled = false;
    });
}

function setupSankey() {
  if (!selectors.sankeyButton || !selectors.sankeyMonth) {
    return;
  }

  selectors.sankeyButton.addEventListener("click", buildSankey);

  if (selectors.sankeyJump && selectors.sankeyPanel) {
    selectors.sankeyJump.addEventListener("click", () => {
      selectors.sankeyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  buildSankey();
}

async function deleteTransaction(id) {
  await api(`/transactions/${id}`, { method: "DELETE" });
  showToast("Transaction removed");
  refreshData();
}

function attachEventListeners() {
  selectors.monthPicker.addEventListener("change", (event) => {
    state.month = event.target.value || null;
    refreshData();
  });

  selectors.clearMonth.addEventListener("click", () => {
    selectors.monthPicker.value = "";
    state.month = null;
    refreshData();
  });

  selectors.refresh.addEventListener("click", refreshData);

  selectors.transactionTable.addEventListener("click", (event) => {
    if (event.target.matches("[data-action=delete]")) {
      const row = event.target.closest("tr");
      deleteTransaction(row.dataset.id).catch((error) => showToast(error.message, "error"));
    }
  });

  selectors.transactionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());
    payload.amount = Number(payload.amount);
    payload.category_id = Number(payload.category_id);
    if (!payload.occurred_on) {
      delete payload.occurred_on;
    }
    api("/transactions", { method: "POST", body: JSON.stringify(payload) })
      .then(() => {
        resetForm(event.target);
        showToast("Transaction saved");
        refreshData();
      })
      .catch((error) => showToast(error.message, "error"));
  });

  selectors.categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());
    api("/categories", { method: "POST", body: JSON.stringify(payload) })
      .then(() => {
        resetForm(event.target);
        showToast("Category created");
        fetchCategories().then(refreshData);
      })
      .catch((error) => showToast(error.message, "error"));
  });

  selectors.goalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());
    payload.category_id = Number(payload.category_id);
    payload.monthly_limit = Number(payload.monthly_limit);
    api("/goals", { method: "POST", body: JSON.stringify(payload) })
      .then(() => {
        resetForm(event.target);
        showToast("Goal saved");
        refreshData();
      })
      .catch((error) => showToast(error.message, "error"));
  });
}

function refreshData() {
  fetchSummary().catch((error) => showToast(error.message, "error"));
  fetchTransactions().catch((error) => showToast(error.message, "error"));
  fetchYearlySummary().catch((error) => showToast(error.message, "error"));
  fetchMonths().catch((error) => showToast(error.message, "error"));
}

function init() {
  attachEventListeners();
  setupSankey();
  fetchCategories()
    .then(() => {
      refreshData();
    })
    .catch((error) => showToast(error.message, "error"));
}

document.addEventListener("DOMContentLoaded", init);
