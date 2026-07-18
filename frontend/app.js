const API_KEY_STORAGE_KEY = "lucidflow_api_key";
const API_BASE_URL_STORAGE_KEY = "lucidflow_api_base_url";
const DEFAULT_API_BASE_URL = `${window.location.origin}/api`;
const state = {
  categories: [],
  months: [],
  month: null,
  apiKey: localStorage.getItem(API_KEY_STORAGE_KEY) || "",
  apiBaseUrl: localStorage.getItem(API_BASE_URL_STORAGE_KEY) || DEFAULT_API_BASE_URL,
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
  apiKeyInput: document.getElementById("api-key-input"),
  apiKeySave: document.getElementById("api-key-save"),
  apiBaseUrlInput: document.getElementById("api-base-url-input"),
  apiBaseUrlSave: document.getElementById("api-base-url-save"),
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
  clearFormErrors(form);
}

function setFieldError(input, message) {
  clearFieldError(input);
  input.classList.add("invalid");
  const span = document.createElement("span");
  span.className = "field-error";
  span.textContent = message;
  input.insertAdjacentElement("afterend", span);
}

function clearFieldError(input) {
  input.classList.remove("invalid");
  const next = input.nextElementSibling;
  if (next && next.classList.contains("field-error")) {
    next.remove();
  }
}

function clearFormErrors(form) {
  form.querySelectorAll(".field-error").forEach((el) => el.remove());
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
}

function attachClearOnInput(form, fieldNames) {
  fieldNames.forEach((name) => {
    const input = form.elements[name];
    if (input) {
      input.addEventListener("input", () => clearFieldError(input));
      input.addEventListener("change", () => clearFieldError(input));
    }
  });
}

function parseAmountInput(value) {
  if (value === "" || value === null) {
    return { error: "Amount is required" };
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return { error: "Amount must be a number" };
  }
  if (numeric <= 0) {
    return { error: "Amount must be positive" };
  }
  return { value: numeric };
}

function validateTransactionForm(form) {
  const errors = [];
  const description = form.elements.description;
  const amount = form.elements.amount;
  const category = form.elements.category_id;

  if (!description.value.trim()) {
    errors.push([description, "Description is required"]);
  }
  const amountResult = parseAmountInput(amount.value);
  if (amountResult.error) {
    errors.push([amount, amountResult.error]);
  }
  if (!category.value) {
    errors.push([category, "Select a category"]);
  }
  return errors;
}

function validateCategoryForm(form) {
  const errors = [];
  const name = form.elements.name;
  const type = form.elements.type;

  if (!name.value.trim()) {
    errors.push([name, "Category name is required"]);
  }
  if (!type.value) {
    errors.push([type, "Select a type"]);
  }
  return errors;
}

function validateGoalForm(form) {
  const errors = [];
  const category = form.elements.category_id;
  const monthlyLimit = form.elements.monthly_limit;

  if (!category.value) {
    errors.push([category, "Select a category"]);
  }
  const limitResult = parseAmountInput(monthlyLimit.value);
  if (limitResult.error) {
    errors.push([monthlyLimit, limitResult.error.replace("Amount", "Monthly limit")]);
  }
  return errors;
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

const activeRequests = {};

function abortableSignal(kind) {
  if (activeRequests[kind]) {
    activeRequests[kind].abort();
  }
  const controller = new AbortController();
  activeRequests[kind] = controller;
  return controller.signal;
}

async function api(path, options = {}) {
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(state.apiKey ? { "X-API-Key": state.apiKey } : {}),
    },
    ...options,
  };
  const response = await fetch(`${state.apiBaseUrl}${path}`, config);
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: "Request failed" }));
    if (response.status === 401) {
      throw new Error("Unauthorized: check the API key above");
    }
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
  const signal = abortableSignal("transactions");
  let data;
  try {
    data = await api(path, { signal });
  } catch (error) {
    if (error.name === "AbortError") {
      return; // superseded by a newer request for this same data
    }
    throw error;
  }
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
  const signal = abortableSignal("summary");
  let summary;
  try {
    summary = await api(path, { signal });
  } catch (error) {
    if (error.name === "AbortError") {
      return; // superseded by a newer request for this same data
    }
    throw error;
  }
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
  const signal = abortableSignal("sankey");
  let payload;
  try {
    payload = await api(buildQuery("/sankey", { month }), { signal });
  } catch (error) {
    if (error.name === "AbortError") {
      return; // superseded by a newer request; let that one own the button/status state
    }
    showToast(error.message, "error");
    status.textContent = "Unable to render chart. Please try again.";
    button.disabled = false;
    return;
  }
  renderSankeyDiagram(payload, label);
  button.disabled = false;
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
  if (selectors.apiKeySave && selectors.apiKeyInput) {
    selectors.apiKeySave.addEventListener("click", () => {
      state.apiKey = selectors.apiKeyInput.value.trim();
      if (state.apiKey) {
        localStorage.setItem(API_KEY_STORAGE_KEY, state.apiKey);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
      showToast("API key saved");
      fetchCategories().then(refreshData).catch((error) => showToast(error.message, "error"));
    });
  }

  if (selectors.apiBaseUrlSave && selectors.apiBaseUrlInput) {
    selectors.apiBaseUrlSave.addEventListener("click", () => {
      const value = selectors.apiBaseUrlInput.value.trim();
      state.apiBaseUrl = value || DEFAULT_API_BASE_URL;
      if (value) {
        localStorage.setItem(API_BASE_URL_STORAGE_KEY, value);
      } else {
        localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
      }
      selectors.apiBaseUrlInput.value = state.apiBaseUrl;
      showToast("API base URL saved");
      fetchCategories().then(refreshData).catch((error) => showToast(error.message, "error"));
    });
  }

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

  attachClearOnInput(selectors.transactionForm, ["description", "amount", "category_id"]);
  attachClearOnInput(selectors.categoryForm, ["name", "type"]);
  attachClearOnInput(selectors.goalForm, ["category_id", "monthly_limit"]);

  selectors.transactionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormErrors(event.target);
    const errors = validateTransactionForm(event.target);
    if (errors.length) {
      errors.forEach(([input, message]) => setFieldError(input, message));
      errors[0][0].focus();
      return;
    }
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
    clearFormErrors(event.target);
    const errors = validateCategoryForm(event.target);
    if (errors.length) {
      errors.forEach(([input, message]) => setFieldError(input, message));
      errors[0][0].focus();
      return;
    }
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
    clearFormErrors(event.target);
    const errors = validateGoalForm(event.target);
    if (errors.length) {
      errors.forEach(([input, message]) => setFieldError(input, message));
      errors[0][0].focus();
      return;
    }
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
  if (selectors.apiKeyInput) {
    selectors.apiKeyInput.value = state.apiKey;
  }
  if (selectors.apiBaseUrlInput) {
    selectors.apiBaseUrlInput.value = state.apiBaseUrl;
  }
  attachEventListeners();
  setupSankey();
  fetchCategories()
    .then(() => {
      refreshData();
    })
    .catch((error) => showToast(error.message, "error"));
}

document.addEventListener("DOMContentLoaded", init);
