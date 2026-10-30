"use strict";

/* =========================================
   SUBSCRIPTION SENTINEL
   Subscription management and dashboard
========================================= */

const STORAGE_KEY = "subscriptionSentinelData";
const THEME_KEY = "subscriptionSentinelTheme";

const CATEGORY_COLORS = {
    Entertainment: "#237b53",
    Music: "#d88646",
    Productivity: "#547ca8",
    Education: "#a6a747",
    Fitness: "#bf806f",
    Shopping: "#8d79b9",
    Utilities: "#569e9a",
    Other: "#929a91"
};

const CATEGORY_BACKGROUNDS = {
    Entertainment: "#e4f2e8",
    Music: "#fff0e1",
    Productivity: "#eaf0f8",
    Education: "#f2f2df",
    Fitness: "#f8eae5",
    Shopping: "#eee8f8",
    Utilities: "#e3f3f0",
    Other: "#eff0eb"
};

const CATEGORY_INITIALS = {
    Entertainment: "E",
    Music: "M",
    Productivity: "P",
    Education: "E",
    Fitness: "F",
    Shopping: "S",
    Utilities: "U",
    Other: "O"
};

const CATEGORIES = [
    "Entertainment",
    "Music",
    "Productivity",
    "Education",
    "Fitness",
    "Shopping",
    "Utilities",
    "Other"
];

/* =========================================
   DOM ELEMENTS
========================================= */

const elements = {
    todayLabel: document.getElementById("todayLabel"),
    monthlySpending: document.getElementById("monthlySpending"),
    activeCount: document.getElementById("activeCount"),
    annualSpending: document.getElementById("annualSpending"),
    nextPaymentValue: document.getElementById("nextPaymentValue"),
    nextPaymentBadge: document.getElementById("nextPaymentBadge"),
    nextPaymentName: document.getElementById("nextPaymentName"),

    tableBody: document.getElementById("subscriptionTableBody"),
    tableCount: document.getElementById("tableCount"),
    emptyState: document.getElementById("emptyState"),
    searchInput: document.getElementById("searchInput"),
    categoryFilter: document.getElementById("categoryFilter"),
    viewAllButton: document.getElementById("viewAllButton"),

    chartCanvas: document.getElementById("spendingChart"),
    chartTotal: document.getElementById("chartTotal"),
    chartLegend: document.getElementById("chartLegend"),

    upcomingList: document.getElementById("upcomingList"),

    modal: document.getElementById("subscriptionModal"),
    modalTitle: document.getElementById("modalTitle"),
    form: document.getElementById("subscriptionForm"),
    formError: document.getElementById("formError"),

    subscriptionId: document.getElementById("subscriptionId"),
    subscriptionName: document.getElementById("subscriptionName"),
    subscriptionAmount: document.getElementById("subscriptionAmount"),
    subscriptionCategory: document.getElementById("subscriptionCategory"),
    billingCycle: document.getElementById("billingCycle"),
    nextPaymentDate: document.getElementById("nextPaymentDate"),
    subscriptionNotes: document.getElementById("subscriptionNotes"),

    saveButton: document.getElementById("saveSubscriptionButton"),
    themeToggle: document.getElementById("themeToggle"),
    mobileMenu: document.getElementById("mobileMenu"),
    sidebar: document.getElementById("sidebar")
};

/* =========================================
   STATE
========================================= */

let subscriptions = [];
let spendingChart = null;
let showAllSubscriptions = false;
let toastCounter = 0;

/* =========================================
   DATE HELPERS
========================================= */

function getLocalISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function parseISODate(value) {
    if (!value || typeof value !== "string") {
        return null;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(year, month - 1, day, 12, 0, 0, 0);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function dateDifferenceInDays(dateString) {
    const date = parseISODate(dateString);

    if (!date) {
        return Infinity;
    }

    const today = parseISODate(getLocalISODate());

    return Math.round((date - today) / 86400000);
}

function formatDate(dateString, options = {}) {
    const date = parseISODate(dateString);

    if (!date) {
        return "Invalid date";
    }

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        ...options
    });
}

function formatMonth(dateString) {
    const date = parseISODate(dateString);

    if (!date) {
        return "--";
    }

    return date.toLocaleDateString("en-IN", {
        month: "short"
    });
}

function formatDay(dateString) {
    const date = parseISODate(dateString);

    if (!date) {
        return "--";
    }

    return String(date.getDate()).padStart(2, "0");
}

/*
  Advances a date while preserving its intended day of month.

  Example:
  January 31 + one month becomes February 28 or 29,
  rather than overflowing into March.
*/

function addBillingPeriod(date, cycle) {
    const result = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        12
    );

    if (cycle === "Weekly") {
        result.setDate(result.getDate() + 7);
        return result;
    }

    if (cycle === "Yearly") {
        const targetYear = result.getFullYear() + 1;
        const month = result.getMonth();
        const day = result.getDate();

        const lastDay = new Date(targetYear, month + 1, 0).getDate();

        return new Date(
            targetYear,
            month,
            Math.min(day, lastDay),
            12
        );
    }

    const targetMonth = result.getMonth() + 1;
    const targetYear = result.getFullYear();

    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();

    return new Date(
        targetYear,
        targetMonth,
        Math.min(result.getDate(), lastDay),
        12
    );
}

/*
  Moves an overdue subscription to its next future billing date.

  This updates the payment date when the dashboard loads.
  It does not record or execute a real payment.
*/

function advancePaymentDate(subscription) {
    let date = parseISODate(subscription.nextPayment);

    if (!date) {
        return false;
    }

    const today = parseISODate(getLocalISODate());
    let changed = false;
    let iterations = 0;

    while (date < today && iterations < 500) {
        date = addBillingPeriod(date, subscription.cycle);
        changed = true;
        iterations++;
    }

    if (changed) {
        subscription.nextPayment = getLocalISODate(date);
    }

    return changed;
}

/* =========================================
   CURRENCY AND NORMALIZATION
========================================= */

function formatCurrency(amount, compact = false) {
    const value = Number(amount) || 0;

    if (compact && Math.abs(value) >= 100000) {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            notation: "compact",
            maximumFractionDigits: 1
        }).format(value);
    }

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(value);
}

function normalizeToMonthly(subscription) {
    const amount = Number(subscription.amount) || 0;

    switch (subscription.cycle) {
        case "Weekly":
            return amount * (365.2425 / 7) / 12;

        case "Yearly":
            return amount / 12;

        case "Monthly":
        default:
            return amount;
    }
}

function getYearlyProjection() {
    return subscriptions.reduce((total, subscription) => {
        return total + normalizeToMonthly(subscription) * 12;
    }, 0);
}

/* =========================================
   STORAGE
========================================= */

function loadSubscriptions() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (!stored) {
            subscriptions = [];
            return;
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            subscriptions = [];
            return;
        }

        subscriptions = parsed.filter(isValidStoredSubscription);
    } catch (error) {
        console.error("Could not load saved subscriptions:", error);
        subscriptions = [];
        showToast("Saved data could not be read.", true);
    }
}

function isValidStoredSubscription(item) {
    return Boolean(
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.name.trim() &&
        Number.isFinite(Number(item.amount)) &&
        Number(item.amount) > 0 &&
        CATEGORIES.includes(item.category) &&
        ["Monthly", "Yearly", "Weekly"].includes(item.cycle) &&
        parseISODate(item.nextPayment)
    );
}

function saveSubscriptions() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(subscriptions)
        );

        return true;
    } catch (error) {
        console.error("Could not save subscriptions:", error);

        showToast(
            "Could not save data. Check your browser storage settings.",
            true
        );

        return false;
    }
}

function saveSubscriptionsAndRender(successMessage) {
    if (!saveSubscriptions()) {
        return false;
    }

    renderDashboard();

    if (successMessage) {
        showToast(successMessage);
    }

    return true;
}

/* =========================================
   SECURITY: SAFE HTML OUTPUT
========================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
}

/* =========================================
   GENERAL HELPERS
========================================= */

function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getSortedSubscriptions(list = subscriptions) {
    return [...list].sort((a, b) => {
        return a.nextPayment.localeCompare(b.nextPayment);
    });
}

function getUpcomingSubscriptions() {
    return getSortedSubscriptions().filter(subscription => {
        const difference = dateDifferenceInDays(subscription.nextPayment);

        return difference >= 0 && difference <= 30;
    });
}

function getDaysLabel(dateString) {
    const days = dateDifferenceInDays(dateString);

    if (days === 0) {
        return "Due today";
    }

    if (days === 1) {
        return "Due tomorrow";
    }

    if (days < 0) {
        return "Overdue";
    }

    return `In ${days} days`;
}

function getSubscriptionInitial(name) {
    const trimmed = String(name || "").trim();

    return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

/* =========================================
   TOAST NOTIFICATIONS
========================================= */

function showToast(message, isError = false) {
    const container = document.getElementById("toastContainer");

    if (!container) {
        return;
    }

    const toast = document.createElement("div");

    toast.className = `toast${isError ? " error-toast" : ""}`;
    toast.setAttribute("role", isError ? "alert" : "status");

    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = isError ? "!" : "✓";

    const text = document.createElement("span");
    text.textContent = message;

    toast.append(icon, text);
    container.appendChild(toast);

    const id = ++toastCounter;

    window.setTimeout(() => {
        toast.remove();
    }, 3500);

    return id;
}

/* =========================================
   MODAL
========================================= */

function openModal(subscription = null) {
    elements.form.reset();
    elements.formError.textContent = "";
    elements.formError.classList.remove("visible");

    elements.subscriptionId.value = "";

    if (subscription) {
        elements.modalTitle.textContent = "Edit subscription";

        elements.subscriptionId.value = subscription.id;
        elements.subscriptionName.value = subscription.name;
        elements.subscriptionAmount.value = subscription.amount;
        elements.subscriptionCategory.value = subscription.category;
        elements.billingCycle.value = subscription.cycle;
        elements.nextPaymentDate.value = subscription.nextPayment;
        elements.subscriptionNotes.value = subscription.notes || "";

        elements.saveButton.textContent = "Update subscription";
    } else {
        elements.modalTitle.textContent = "Add subscription";
        elements.nextPaymentDate.value = getLocalISODate();
        elements.saveButton.textContent = "Save subscription";
    }

    elements.modal.classList.add("open");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
        elements.subscriptionName.focus();
    }, 50);
}

function closeModal() {
    elements.modal.classList.remove("open");
    elements.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    elements.formError.classList.remove("visible");
}

function showFormError(message) {
    elements.formError.textContent = message;
    elements.formError.classList.add("visible");
}

function validateForm() {
    const name = elements.subscriptionName.value.trim();
    const amount = Number(elements.subscriptionAmount.value);
    const category = elements.subscriptionCategory.value;
    const cycle = elements.billingCycle.value;
    const paymentDate = elements.nextPaymentDate.value;
    const notes = elements.subscriptionNotes.value.trim();

    if (!name) {
        return {
            valid: false,
            message: "Enter a subscription name."
        };
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
        return {
            valid: false,
            message: "Enter an amount greater than ₹0 and no more than ₹10 crore."
        };
    }

    if (!CATEGORIES.includes(category)) {
        return {
            valid: false,
            message: "Select a valid category."
        };
    }

    if (!["Monthly", "Yearly", "Weekly"].includes(cycle)) {
        return {
            valid: false,
            message: "Select a valid billing cycle."
        };
    }

    if (!parseISODate(paymentDate)) {
        return {
            valid: false,
            message: "Select a valid payment date."
        };
    }

    return {
        valid: true,
        data: {
            name,
            amount,
            category,
            cycle,
            nextPayment: paymentDate,
            notes
        }
    };
}

function handleFormSubmit(event) {
    event.preventDefault();

    const result = validateForm();

    if (!result.valid) {
        showFormError(result.message);
        return;
    }

    const existingId = elements.subscriptionId.value;
    const data = result.data;

    if (existingId) {
        const index = subscriptions.findIndex(item => item.id === existingId);

        if (index === -1) {
            showFormError("This subscription could not be found. Close the form and try again.");
            return;
        }

        const previous = subscriptions[index];

        subscriptions[index] = {
            ...previous,
            ...data
        };

        if (saveSubscriptions()) {
            closeModal();
            renderDashboard();
            showToast("Subscription updated successfully.");
        } else {
            subscriptions[index] = previous;
        }

        return;
    }

    const newSubscription = {
        id: generateId(),
        ...data,
        createdAt: new Date().toISOString()
    };

    subscriptions.push(newSubscription);

    if (saveSubscriptions()) {
        closeModal();
        renderDashboard();
        showToast("Subscription added successfully.");
    } else {
        subscriptions = subscriptions.filter(item => {
            return item.id !== newSubscription.id;
        });
    }
}

/* =========================================
   SUBSCRIPTION ACTIONS
========================================= */

function findSubscription(id) {
    return subscriptions.find(subscription => subscription.id === id);
}

function editSubscription(id) {
    const subscription = findSubscription(id);

    if (!subscription) {
        showToast("Subscription not found.", true);
        return;
    }

    openModal(subscription);
}

function deleteSubscription(id) {
    const subscription = findSubscription(id);

    if (!subscription) {
        showToast("Subscription not found.", true);
        return;
    }

    const confirmed = window.confirm(
        `Delete "${subscription.name}" from your subscriptions?`
    );

    if (!confirmed) {
        return;
    }

    const previousSubscriptions = [...subscriptions];

    subscriptions = subscriptions.filter(item => item.id !== id);

    if (!saveSubscriptions()) {
        subscriptions = previousSubscriptions;
        return;
    }

    renderDashboard();
    showToast(`${subscription.name} deleted.`);
}

/* =========================================
   SUMMARY CARDS
========================================= */

function renderSummary() {
    const monthlyTotal = subscriptions.reduce((total, subscription) => {
        return total + normalizeToMonthly(subscription);
    }, 0);

    elements.monthlySpending.textContent = formatCurrency(monthlyTotal, true);
    elements.activeCount.textContent = String(subscriptions.length);
    elements.annualSpending.textContent = formatCurrency(
        getYearlyProjection(),
        true
    );

    const upcoming = getSortedSubscriptions();

    if (upcoming.length === 0) {
        elements.nextPaymentValue.textContent = "—";
        elements.nextPaymentBadge.textContent = "NO PAYMENTS";
        elements.nextPaymentName.textContent = "Nothing scheduled";
        return;
    }

    const next = upcoming[0];
    const difference = dateDifferenceInDays(next.nextPayment);

    elements.nextPaymentValue.textContent = formatDate(next.nextPayment, {
        day: "numeric",
        month: "short"
    });

    elements.nextPaymentName.textContent = next.name;

    if (difference === 0) {
        elements.nextPaymentBadge.textContent = "DUE TODAY";
    } else if (difference === 1) {
        elements.nextPaymentBadge.textContent = "DUE TOMORROW";
    } else {
        elements.nextPaymentBadge.textContent = `${difference} DAYS LEFT`;
    }
}

/* =========================================
   SUBSCRIPTION TABLE
========================================= */

function getFilteredSubscriptions() {
    const query = elements.searchInput.value.trim().toLowerCase();
    const category = elements.categoryFilter.value;

    return getSortedSubscriptions().filter(subscription => {
        const matchesSearch = (
            subscription.name.toLowerCase().includes(query) ||
            subscription.category.toLowerCase().includes(query) ||
            (subscription.notes || "").toLowerCase().includes(query)
        );

        const matchesCategory = (
            category === "all" ||
            subscription.category === category
        );

        return matchesSearch && matchesCategory;
    });
}

function renderSubscriptionRow(subscription) {
    const initial = escapeHTML(getSubscriptionInitial(subscription.name));
    const name = escapeHTML(subscription.name);
    const category = escapeHTML(subscription.category);
    const cycle = escapeHTML(subscription.cycle);
    const paymentDate = escapeHTML(formatDate(subscription.nextPayment));
    const amount = escapeHTML(formatCurrency(subscription.amount));
    const notes = escapeHTML(subscription.notes || "");
    const id = escapeHTML(subscription.id);

    const categoryColor = CATEGORY_BACKGROUNDS[subscription.category] || CATEGORY_BACKGROUNDS.Other;
    const initialColor = CATEGORY_COLORS[subscription.category] || CATEGORY_COLORS.Other;
    const days = dateDifferenceInDays(subscription.nextPayment);

    const dueClass = days >= 0 && days <= 3 ? "due-soon" : "";

    return `
        <tr>
            <td>
                <div class="subscription-identity">
                    <div
                        class="subscription-logo"
                        style="background:${categoryColor};color:${initialColor}"
                    >${initial}</div>

                    <div>
                        <div class="subscription-name" title="${name}">${name}</div>
                        ${notes ? `<span class="subscription-note" title="${notes}">${notes}</span>` : ""}
                    </div>
                </div>
            </td>

            <td>
                <span class="category-tag">${category}</span>
            </td>

            <td>
                <span class="billing-text">${cycle}</span>
            </td>

            <td>
                <span class="payment-date ${dueClass}">${paymentDate}</span>
            </td>

            <td>
                <span class="amount-cell">${amount}</span>
            </td>

            <td>
                <div class="row-actions">
                    <button
                        class="row-action"
                        type="button"
                        data-action="edit"
                        data-id="${id}"
                        aria-label="Edit ${name}"
                        title="Edit subscription"
                    >✎</button>

                    <button
                        class="row-action delete-action"
                        type="button"
                        data-action="delete"
                        data-id="${id}"
                        aria-label="Delete ${name}"
                        title="Delete subscription"
                    >×</button>
                </div>
            </td>
        </tr>
    `;
}

function renderTable() {
    const filtered = getFilteredSubscriptions();

    const visibleSubscriptions = showAllSubscriptions
        ? filtered
        : filtered.slice(0, 6);

    elements.tableBody.innerHTML = visibleSubscriptions
        .map(renderSubscriptionRow)
        .join("");

    const hasSubscriptions = subscriptions.length > 0;
    const hasFilteredResults = filtered.length > 0;

    elements.emptyState.classList.toggle(
        "visible",
        !hasFilteredResults
    );

    const heading = elements.emptyState.querySelector("h3");
    const description = elements.emptyState.querySelector("p");
    const addButton = document.getElementById("emptyAddButton");

    if (!hasSubscriptions) {
        heading.textContent = "No subscriptions yet";
        description.textContent = "Add your first subscription to start tracking recurring expenses.";
        addButton.style.display = "inline-flex";
    } else {
        heading.textContent = "No matching subscriptions";
        description.textContent = "Try a different search term or category filter.";
        addButton.style.display = "none";
    }

    const totalFiltered = filtered.length;
    const totalVisible = visibleSubscriptions.length;

    elements.tableCount.textContent = (
        `Showing ${totalVisible} of ${totalFiltered} subscription${totalFiltered === 1 ? "" : "s"}`
    );

    elements.viewAllButton.style.display = (
        filtered.length > 6 ? "inline-block" : "none"
    );

    elements.viewAllButton.textContent = showAllSubscriptions
        ? "Show less ↑"
        : "View all ↗";
}

/* =========================================
   SPENDING CHART
========================================= */

function getCategoryTotals() {
    const totals = {};

    subscriptions.forEach(subscription => {
        const category = subscription.category;
        const monthlyAmount = normalizeToMonthly(subscription);

        totals[category] = (totals[category] || 0) + monthlyAmount;
    });

    return Object.entries(totals)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1]);
}

function renderChart() {
    const categoryTotals = getCategoryTotals();

    const total = categoryTotals.reduce((sum, [, amount]) => {
        return sum + amount;
    }, 0);

    elements.chartTotal.textContent = formatCurrency(total, true);

    if (spendingChart) {
        spendingChart.destroy();
        spendingChart = null;
    }

    if (typeof Chart === "undefined") {
        elements.chartLegend.innerHTML = `
            <div class="chart-empty">
                The chart library could not load. Check your internet connection and refresh the page.
            </div>
        `;

        return;
    }

    const isDark = document.body.classList.contains("dark-mode");

    const chartColors = categoryTotals.map(([category]) => {
        return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    });

    const chartLabels = categoryTotals.map(([category]) => category);

    const chartValues = categoryTotals.map(([, amount]) => amount);

    spendingChart = new Chart(elements.chartCanvas, {
        type: "doughnut",

        data: {
            labels: chartLabels,
            datasets: [{
                data: chartValues,
                backgroundColor: chartColors,
                borderWidth: 0,
                hoverOffset: 5,
                spacing: 3,
                borderRadius: 4
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "76%",

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    enabled: true,
                    backgroundColor: isDark ? "#202821" : "#252c27",
                    titleFont: {
                        family: "DM Sans",
                        size: 11
                    },
                    bodyFont: {
                        family: "DM Sans",
                        size: 11
                    },
                    padding: 10,
                    callbacks: {
                        label(context) {
                            return ` ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },

            animation: {
                duration: 350
            }
        }
    });

    if (categoryTotals.length === 0) {
        elements.chartLegend.innerHTML = `
            <div class="chart-empty">
                Add subscriptions to see your breakdown.
            </div>
        `;

        return;
    }

    elements.chartLegend.innerHTML = categoryTotals.map(([category, amount]) => {
        const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;

        return `
            <div class="legend-item">
                <div class="legend-label">
                    <span class="legend-dot" style="background:${color}"></span>
                    <span>${escapeHTML(category)}</span>
                </div>

                <span class="legend-amount">${escapeHTML(formatCurrency(amount))}</span>
            </div>
        `;
    }).join("");
}

/* =========================================
   UPCOMING PAYMENTS
========================================= */

function renderUpcomingPayments() {
    const upcoming = getUpcomingSubscriptions().slice(0, 5);

    if (upcoming.length === 0) {
        elements.upcomingList.innerHTML = `
            <div class="upcoming-empty">
                No payments scheduled in the next 30 days.
                <br>
                Add subscriptions to see their upcoming payment dates.
            </div>
        `;

        return;
    }

    elements.upcomingList.innerHTML = upcoming.map(subscription => {
        const name = escapeHTML(subscription.name);
        const month = escapeHTML(formatMonth(subscription.nextPayment));
        const day = escapeHTML(formatDay(subscription.nextPayment));
        const timing = escapeHTML(getDaysLabel(subscription.nextPayment));
        const amount = escapeHTML(formatCurrency(subscription.amount));

        return `
            <div class="upcoming-item">
                <div class="date-box">
                    <span class="date-month">${month}</span>
                    <span class="date-day">${day}</span>
                </div>

                <div class="upcoming-details">
                    <div class="upcoming-name" title="${name}">${name}</div>
                    <div class="upcoming-timing">${timing}</div>
                </div>

                <div class="upcoming-amount">${amount}</div>
            </div>
        `;
    }).join("");
}

/* =========================================
   THEME
========================================= */

function loadTheme() {
    try {
        const savedTheme = localStorage.getItem(THEME_KEY);

        if (savedTheme === "dark") {
            document.body.classList.add("dark-mode");
        }
    } catch (error) {
        console.warn("Theme preference could not be loaded.", error);
    }

    updateThemeButton();
}

function updateThemeButton() {
    const isDark = document.body.classList.contains("dark-mode");

    elements.themeToggle.textContent = isDark ? "☀" : "◐";

    elements.themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode"
    );

    elements.themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

function toggleTheme() {
    document.body.classList.toggle("dark-mode");

    const isDark = document.body.classList.contains("dark-mode");

    try {
        localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch (error) {
        console.warn("Theme preference could not be saved.", error);
    }

    updateThemeButton();
    renderChart();
}

/* =========================================
   DASHBOARD
========================================= */

function renderDate() {
    const now = new Date();

    elements.todayLabel.textContent = now.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function renderDashboard() {
    renderDate();
    renderSummary();
    renderTable();
    renderChart();
    renderUpcomingPayments();
}

/* =========================================
   EVENT LISTENERS
========================================= */

function initializeEventListeners() {
    document.getElementById("addSubscriptionButton")
        .addEventListener("click", () => openModal());

    document.getElementById("emptyAddButton")
        .addEventListener("click", () => openModal());

    document.getElementById("closeModalButton")
        .addEventListener("click", closeModal);

    document.getElementById("cancelModalButton")
        .addEventListener("click", closeModal);

    elements.form.addEventListener("submit", handleFormSubmit);

    elements.searchInput.addEventListener("input", () => {
        showAllSubscriptions = true;
        renderTable();
    });

    elements.categoryFilter.addEventListener("change", () => {
        showAllSubscriptions = true;
        renderTable();
    });

    elements.viewAllButton.addEventListener("click", () => {
        showAllSubscriptions = !showAllSubscriptions;
        renderTable();
    });

    elements.tableBody.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (action === "edit") {
            editSubscription(id);
        } else if (action === "delete") {
            deleteSubscription(id);
        }
    });

    elements.themeToggle.addEventListener("click", toggleTheme);

    elements.mobileMenu.addEventListener("click", () => {
        elements.sidebar.classList.toggle("mobile-open");
    });

    document.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("click", () => {
            document.querySelectorAll(".nav-link").forEach(item => {
                item.classList.remove("active");
            });

            link.classList.add("active");
            elements.sidebar.classList.remove("mobile-open");
        });
    });

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            if (elements.modal.classList.contains("open")) {
                closeModal();
            }

            elements.sidebar.classList.remove("mobile-open");
        }
    });

    document.getElementById("profileButton").addEventListener("click", () => {
        showToast("Subscription Sentinel — your personal subscription dashboard.");
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 700) {
            elements.sidebar.classList.remove("mobile-open");
        }
    });
}

/* =========================================
   INITIALIZATION
========================================= */

function initializeApp() {
    loadTheme();
    loadSubscriptions();

    let paymentDatesChanged = false;

    subscriptions.forEach(subscription => {
        if (advancePaymentDate(subscription)) {
            paymentDatesChanged = true;
        }
    });

    if (paymentDatesChanged) {
        saveSubscriptions();
    }

    initializeEventListeners();
    renderDashboard();
}

document.addEventListener("DOMContentLoaded", initializeApp);