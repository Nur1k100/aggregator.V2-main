const API_BASE = '/api';

// State for collapsible sections and sorting
const adminState = {
    profilesExpanded: false,
    transactionsExpanded: false,
    transactionsSortAsc: false, // false = newest first, true = oldest first
    allProfiles: [],
    allTransactions: []
};

function getToken() {
    return localStorage.getItem('authToken');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span><button class="toast-close">&times;</button>`;
    container.appendChild(toast);

    toast.querySelector('.toast-close').onclick = () => toast.remove();
    setTimeout(() => toast.remove(), 4500);
}

function formatNumber(value, digits = 2) {
    const parsed = Number(value || 0);
    return parsed.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatUSD(value) {
    return '$' + formatNumber(value, 2);
}

function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function apiFetch(url) {
    const token = getToken();
    return fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        return data;
    });
}

function renderStats(overview) {
    const grid = document.getElementById('statsGrid');
    const cards = [
        { label: 'Users', value: overview.users || 0 },
        { label: 'Transactions', value: overview.transactions || 0 },
        { label: 'Total Transferred', value: formatUSD(overview.totalUsdTransferred || 0) },
        { label: '24h Volume', value: formatUSD(overview.usdLast24h || 0) },
    ];

    grid.innerHTML = cards.map(card => `
        <div class="stat-card">
            <div class="stat-label">${card.label}</div>
            <div class="stat-value">${card.value}</div>
        </div>
    `).join('');
}

function renderProfiles(profiles) {
    const container = document.getElementById('profilesGrid');
    adminState.allProfiles = profiles;

    if (!profiles.length) {
        container.innerHTML = '<div class="transaction-empty">No profiles found</div>';
        return;
    }

    const visibleCount = adminState.profilesExpanded ? profiles.length : 2;
    const visibleProfiles = profiles.slice(0, Math.min(visibleCount, 25));
    // const hiddenCount = Math.min(25, profiles.length) - visibleCount; // Unused now

    let html = visibleProfiles.map(profile => `
        <article class="profile-card">
            <h3 class="profile-email">${profile.email}</h3>
            <div class="profile-metrics">
                <span>Wallets: ${profile.walletCount}</span>
                <span>Tx: ${profile.transactionCount}</span>
                <span>Tx USD: ${formatUSD(profile.totalUsdTransferred || 0)}</span>
                <span>Balance USD: ${formatUSD(profile.walletUsdValue || 0)}</span>
            </div>
            <div class="profile-foot">Last tx: ${formatDate(profile.lastTransactionAt)}</div>
        </article>
    `).join('');

    // Add expand/collapse card if there are more profiles
    if (profiles.length > 2) {
        if (adminState.profilesExpanded) {
            html += `
                <div class="profile-action-card" onclick="toggleProfilesExpand()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 15l-6-6-6 6"/>
                    </svg>
                    <span>Collapse</span>
                </div>
            `;
        } else {
            html += `
                <div class="profile-action-card" onclick="toggleProfilesExpand()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span>Show all (${Math.min(25, profiles.length)})</span>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

function toggleProfilesExpand() {
    adminState.profilesExpanded = !adminState.profilesExpanded;
    renderProfiles(adminState.allProfiles);
}

function renderTransactions(items) {
    const tbody = document.getElementById('adminTransactionsBody');
    adminState.allTransactions = items;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="5">No transactions</td></tr>';
        return;
    }

    // Sort transactions
    const sortedItems = [...items].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return adminState.transactionsSortAsc ? dateA - dateB : dateB - dateA;
    });

    // Show only 1 transaction if collapsed, all if expanded
    const visibleCount = adminState.transactionsExpanded ? sortedItems.length : 1;
    const visibleItems = sortedItems.slice(0, visibleCount);

    let html = visibleItems.map(tx => `
        <tr>
            <td>${tx.userEmail}</td>
            <td>${tx.fromToken} → ${tx.toToken}</td>
            <td>${formatNumber(tx.fromAmount, 4)} → ${formatNumber(tx.toAmount, 4)}</td>
            <td>${formatUSD(tx.usdValue || 0)}</td>
            <td>${formatDate(tx.createdAt)}</td>
        </tr>
    `).join('');

    // Add expand/collapse row if there are more transactions
    if (items.length > 1) {
        if (adminState.transactionsExpanded) {
            html += `
                <tr class="expand-collapse-row">
                    <td colspan="5">
                        <button class="expand-collapse-btn" onclick="toggleTransactionsExpand()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M18 15l-6-6-6 6"/>
                            </svg>
                            Collapse (show 1)
                        </button>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr class="expand-collapse-row">
                    <td colspan="5">
                        <button class="expand-collapse-btn" onclick="toggleTransactionsExpand()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M6 9l6 6 6-6"/>
                            </svg>
                            Show all (${items.length})
                        </button>
                    </td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = html;
}

function toggleTransactionsExpand() {
    adminState.transactionsExpanded = !adminState.transactionsExpanded;
    renderTransactions(adminState.allTransactions);
}

function toggleTransactionsSort() {
    adminState.transactionsSortAsc = !adminState.transactionsSortAsc;
    renderTransactions(adminState.allTransactions);
    updateSortButton();
}

function updateSortButton() {
    const sortBtn = document.getElementById('sortDateBtn');
    if (sortBtn) {
        const icon = adminState.transactionsSortAsc ? '↑' : '↓';
        sortBtn.innerHTML = `Date ${icon}`;
    }
}

function renderAdminNews(items) {
    const container = document.getElementById('adminNewsList');
    if (!items.length) {
        container.innerHTML = '<div class="transaction-empty">No news yet</div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <article class="admin-news-item">
            <div class="admin-news-top">
                <strong>${item.title}</strong>
                <div class="admin-news-meta">
                    <span>${item.category || 'General'} • ${formatDate(item.createdAt)}</span>
                    <button class="news-delete-btn" onclick="deleteNews(${item.id})" title="Delete news">&times;</button>
                </div>
            </div>
            <p>${item.summary}</p>
        </article>
    `).join('');
}

async function deleteNews(id) {
    if (!confirm('Are you sure you want to delete this news item?')) return;

    try {
        await fetch(`${API_BASE}/admin/news/${id}/`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        }).then(async (response) => {
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete');
            }
            return data;
        });

        showToast('News deleted', 'success');
        // Refresh list
        const listResponse = await apiFetch(`${API_BASE}/admin/news/`);
        renderAdminNews(listResponse.items || []);
    } catch (error) {
        showToast(error.message || 'Failed to delete news', 'error');
    }
}

function bindNewsForm() {
    const form = document.getElementById('newsPublishForm');
    const titleInput = document.getElementById('newsTitleInput');
    const categoryInput = document.getElementById('newsCategoryInput');
    const summaryInput = document.getElementById('newsSummaryInput');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            await fetch(`${API_BASE}/admin/news/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    title: titleInput.value,
                    category: categoryInput.value || 'General',
                    summary: summaryInput.value
                })
            }).then(async (response) => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to publish');
                }
                return data;
            });

            showToast('News published', 'success');
            titleInput.value = '';
            categoryInput.value = '';
            summaryInput.value = '';

            const listResponse = await apiFetch(`${API_BASE}/admin/news/`);
            renderAdminNews(listResponse.items || []);
        } catch (error) {
            showToast(error.message || 'Failed to publish news', 'error');
        }
    });
}

function showLockedState(message) {
    document.getElementById('statsGrid').innerHTML = '<div class="transaction-empty">No access</div>';
    document.getElementById('profilesGrid').innerHTML = `<div class="transaction-empty">${message}</div>`;
    document.getElementById('adminTransactionsBody').innerHTML = `<tr><td colspan="5">${message}</td></tr>`;
    document.getElementById('adminNewsList').innerHTML = `<div class="transaction-empty">${message}</div>`;
    const form = document.getElementById('newsPublishForm');
    if (form) form.classList.add('hidden');
}

async function initAdmin() {
    const logoutBtn = document.getElementById('adminLogoutBtn');
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/';
    });

    const token = getToken();
    if (!token) {
        showLockedState('Login as admin first');
        return;
    }

    try {
        const me = await apiFetch(`${API_BASE}/auth/me/`);
        document.getElementById('adminIdentity').textContent = me.email;

        if (!me.isAdmin) {
            showLockedState('This account is not admin. Use admin@aggregator.local');
            return;
        }

        const [overview, profilesData, transactionsData, newsData] = await Promise.all([
            apiFetch(`${API_BASE}/admin/overview/`),
            apiFetch(`${API_BASE}/admin/profiles/?limit=25`),
            apiFetch(`${API_BASE}/admin/transactions/?limit=100`),
            apiFetch(`${API_BASE}/admin/news/`)
        ]);

        renderStats(overview);
        renderProfiles(profilesData.profiles || []);
        renderTransactions(transactionsData.transactions || []);
        renderAdminNews(newsData.items || []);
        document.getElementById('newsPublishForm').classList.remove('hidden');
        bindNewsForm();
        showToast('Admin dashboard updated', 'success');
    } catch (error) {
        showLockedState(error.message || 'Failed to load admin data');
        showToast(error.message || 'Failed to load admin data', 'error');
    }
}

document.addEventListener('DOMContentLoaded', initAdmin);
