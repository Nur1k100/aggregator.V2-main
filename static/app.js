/**
 * SWAP Application - Main JavaScript
 * Handles authentication, wallet, swap, and price chart functionality
 */

const API_BASE = '/api';

// ============================================
// State Management
// ============================================

const state = {
    isAuthenticated: false,
    user: null,
    token: null,
    balances: {},
    fromToken: null,
    toToken: null,
    slippage: 0.5,
    priceChart: null,
    chartToken: 'SOL',
    chartDays: 1,
    tokens: [],
    tokenSelectTarget: null, // 'from' or 'to'
    quoteTimeout: null,
    currency: 'USD',
    currencyRates: { USD: 1, EUR: 0.92, RUB: 92.5, KZT: 450 },
    cryptoSearchTimeout: null
};

// Common Solana tokens (fallback)
const COMMON_TOKENS = [
    {
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        decimals: 9,
        icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
    },
    {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
    },
    {
        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        symbol: "USDT",
        name: "Tether USD",
        decimals: 6,
        icon: "https://assets.coingecko.com/coins/images/325/small/Tether.png"
    },
    {
        mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        symbol: "BONK",
        name: "Bonk",
        decimals: 5,
        icon: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I"
    },
    {
        mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        symbol: "JUP",
        name: "Jupiter",
        decimals: 6,
        icon: "https://static.jup.ag/jup/icon.png"
    }
];

// ============================================
// Utility Functions
// ============================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-close">&times;</button>
    `;
    container.appendChild(toast);

    toast.querySelector('.toast-close').onclick = () => toast.remove();
    setTimeout(() => toast.remove(), 5000);
}

function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '0';
    return parseFloat(num).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatUSD(num) {
    return '$' + formatNumber(num, 2);
}

function parseUsdText(value) {
    const raw = String(value || '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// ============================================
// Authentication
// ============================================

function loadAuthState() {
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (token && user) {
        state.isAuthenticated = true;
        state.token = token;
        state.user = user;
        updateAuthUI();
        loadWalletBalances();
        loadTransactions();
    }
}

function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const logoutBtn = document.getElementById('logoutBtn');
    const swapBtn = document.getElementById('swapBtn');
    const swapBtnText = document.getElementById('swapBtnText');
    const adminNavLink = document.getElementById('adminNavLink');

    if (state.isAuthenticated) {
        loginBtnText.textContent = state.user.email.split('@')[0];
        loginBtn.onclick = showUserMenu;
        // Show logout button
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        updateSwapButton();
        // Show admin link if user is admin
        if (adminNavLink && state.user?.isAdmin) {
            adminNavLink.style.display = '';
        }
    } else {
        loginBtnText.textContent = 'Login';
        loginBtn.onclick = () => showModal('loginModal');
        // Hide logout button
        if (logoutBtn) logoutBtn.classList.add('hidden');
        swapBtnText.textContent = 'Connect Wallet';
        swapBtn.disabled = true;
        // Hide admin link
        if (adminNavLink) {
            adminNavLink.style.display = 'none';
        }
    }
}

function showUserMenu() {
    if (state.user?.isAdmin) {
        const openAdmin = confirm('Open admin profile? Click Cancel to open logout dialog.');
        if (openAdmin) {
            window.location.href = '/admin-profile/';
            return;
        }
    }

    if (confirm('Do you want to logout?')) {
        logout();
    }
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    state.isAuthenticated = false;
    state.token = null;
    state.user = null;
    state.balances = {};
    updateAuthUI();
    showToast('Logged out successfully', 'info');
    updateBalanceDisplays();
    loadTransactions();
}

async function handleAuthSubmit(e) {
    e.preventDefault();

    const isLogin = document.getElementById('authModalTitle').textContent === 'Login';
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const confirmPassword = document.getElementById('authConfirmPassword').value;

    if (!isLogin && password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    const endpoint = isLogin ? '/auth/login/' : '/auth/register/';
    const submitBtn = document.getElementById('authSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = isLogin ? 'Logging in...' : 'Creating account...';

    try {
        const response = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            state.isAuthenticated = true;
            state.token = data.token;
            state.user = data.user;

            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            hideModal('loginModal');
            updateAuthUI();
            loadWalletBalances();
            loadTransactions();

            showToast(`Welcome${isLogin ? ' back' : ''}, ${data.user.email}!`, 'success');

            // Redirect to deposit page if new user
            if (!isLogin) {
                if (confirm('Would you like to deposit some tokens to start trading?')) {
                    window.location.href = '/deposit/';
                }
            }
        } else {
            showToast(data.error || 'Authentication failed', 'error');
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isLogin ? 'Login' : 'Sign Up';
    }
}

function toggleAuthMode() {
    const title = document.getElementById('authModalTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const switchText = document.getElementById('authSwitchText');
    const switchBtn = document.getElementById('authSwitchBtn');
    const confirmGroup = document.getElementById('confirmPasswordGroup');

    const isLogin = title.textContent === 'Login';

    if (isLogin) {
        title.textContent = 'Sign Up';
        submitBtn.textContent = 'Sign Up';
        switchText.textContent = 'Already have an account?';
        switchBtn.textContent = 'Login';
        confirmGroup.classList.remove('hidden');
    } else {
        title.textContent = 'Login';
        submitBtn.textContent = 'Login';
        switchText.textContent = "Don't have an account?";
        switchBtn.textContent = 'Sign Up';
        confirmGroup.classList.add('hidden');
    }
}

// ============================================
// Wallet & Balances
// ============================================

async function loadWalletBalances() {
    if (!state.token) return;

    try {
        const response = await fetch(API_BASE + '/wallet/balance/', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        const data = await response.json();

        if (data.balances) {
            state.balances = {};
            data.balances.forEach(b => {
                state.balances[b.tokenMint] = b;
            });
            updateBalanceDisplays();
        }
    } catch (error) {
        console.error('Failed to load balances:', error);
    }
}

function updateBalanceDisplays() {
    const fromBalance = document.getElementById('fromBalance');
    const toBalance = document.getElementById('toBalance');

    if (state.fromToken && state.balances[state.fromToken.mint]) {
        const balance = state.balances[state.fromToken.mint].balance;
        fromBalance.textContent = `Balance: ${formatNumber(balance, 4)}`;
    } else {
        fromBalance.textContent = 'Balance: 0.00';
    }

    if (state.toToken && state.balances[state.toToken.mint]) {
        const balance = state.balances[state.toToken.mint].balance;
        toBalance.textContent = `Balance: ${formatNumber(balance, 4)}`;
    } else {
        toBalance.textContent = 'Balance: 0.00';
    }
}

// ============================================
// Token Selection
// ============================================

function initDefaultTokens() {
    // Set default tokens
    state.fromToken = COMMON_TOKENS[0]; // SOL
    state.toToken = COMMON_TOKENS[1]; // USDC

    updateTokenDisplay('from', state.fromToken);
    updateTokenDisplay('to', state.toToken);

    // Load tokens list
    state.tokens = [...COMMON_TOKENS];
}

function updateTokenDisplay(side, token) {
    const iconEl = document.getElementById(`${side}TokenIcon`);
    const symbolEl = document.getElementById(`${side}TokenSymbol`);

    iconEl.src = token.icon;
    iconEl.onerror = () => iconEl.style.display = 'none';
    symbolEl.textContent = token.symbol;
}

function openTokenModal(target) {
    state.tokenSelectTarget = target;
    showModal('tokenModal');
    renderTokenList();
    document.getElementById('tokenSearchInput').value = '';
    document.getElementById('tokenSearchInput').focus();
}

function renderTokenList(searchQuery = '') {
    const container = document.getElementById('tokenList');

    let tokens = state.tokens;

    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        tokens = tokens.filter(t =>
            t.symbol.toLowerCase().includes(query) ||
            t.name.toLowerCase().includes(query) ||
            t.mint.toLowerCase().includes(query)
        );
    }

    if (tokens.length === 0) {
        container.innerHTML = '<div class="token-list-loading">No tokens found</div>';

        // Search Jupiter API for more tokens
        if (searchQuery.length >= 2) {
            searchJupiterTokens(searchQuery);
        }
        return;
    }

    container.innerHTML = tokens.map(token => `
        <div class="token-list-item" data-mint="${token.mint}">
            <img class="token-list-icon" src="${token.icon}" alt="${token.symbol}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><circle cx=%2220%22 cy=%2220%22 r=%2218%22 fill=%22%23334155%22/></svg>'">
            <div class="token-list-info">
                <span class="token-list-name">${token.name}</span>
                <span class="token-list-symbol">${token.symbol}</span>
            </div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.token-list-item').forEach(item => {
        item.addEventListener('click', () => {
            const mint = item.dataset.mint;
            const token = tokens.find(t => t.mint === mint);
            if (token) {
                selectToken(token);
            }
        });
    });
}

async function searchJupiterTokens(query) {
    try {
        const response = await fetch(`${API_BASE}/search/?query=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            const tokens = data.slice(0, 10).map(t => ({
                mint: t.id,
                symbol: t.symbol,
                name: t.name,
                icon: t.icon || '',
                decimals: t.decimals || 9
            }));

            // Add to state tokens if not already present
            tokens.forEach(t => {
                if (!state.tokens.find(st => st.mint === t.mint)) {
                    state.tokens.push(t);
                }
            });

            renderTokenList(query);
        }
    } catch (error) {
        console.error('Token search failed:', error);
    }
}

function selectToken(token) {
    if (state.tokenSelectTarget === 'from') {
        // Don't allow same token for both sides
        if (state.toToken && token.mint === state.toToken.mint) {
            // Swap them
            state.toToken = state.fromToken;
            updateTokenDisplay('to', state.toToken);
        }
        state.fromToken = token;
        updateTokenDisplay('from', token);
    } else {
        // Don't allow same token for both sides
        if (state.fromToken && token.mint === state.fromToken.mint) {
            // Swap them
            state.fromToken = state.toToken;
            updateTokenDisplay('from', state.fromToken);
        }
        state.toToken = token;
        updateTokenDisplay('to', token);
    }

    hideModal('tokenModal');
    updateBalanceDisplays();
    updateSwapButton();

    // Update chart to show selected token
    if (state.tokenSelectTarget === 'from') {
        state.chartToken = token.symbol;
        updateChartPair();
        loadPriceChart();
    }

    // Get new quote
    getQuote();
}

function swapTokenDirection() {
    const temp = state.fromToken;
    state.fromToken = state.toToken;
    state.toToken = temp;

    updateTokenDisplay('from', state.fromToken);
    updateTokenDisplay('to', state.toToken);

    // Swap amounts
    const fromInput = document.getElementById('fromAmount');
    const toInput = document.getElementById('toAmount');
    fromInput.value = toInput.value;
    toInput.value = '';

    updateBalanceDisplays();
    getQuote();
}

// ============================================
// Quote & Swap
// ============================================

async function getQuote() {
    const fromAmount = parseFloat(document.getElementById('fromAmount').value);

    if (!fromAmount || fromAmount <= 0 || !state.fromToken || !state.toToken) {
        document.getElementById('toAmount').value = '';
        document.getElementById('fromUsdValue').textContent = '≈ $0.00';
        document.getElementById('toUsdValue').textContent = '≈ $0.00';
        document.getElementById('swapRate').textContent = `1 ${state.fromToken?.symbol || 'SOL'} = 0 ${state.toToken?.symbol || 'USDC'}`;
        updateSwapButton();
        return;
    }

    // Clear previous timeout
    if (state.quoteTimeout) {
        clearTimeout(state.quoteTimeout);
    }

    // Debounce the quote request
    state.quoteTimeout = setTimeout(async () => {
        try {
            // Convert to lamports/smallest unit
            const amountInSmallestUnit = Math.floor(fromAmount * Math.pow(10, state.fromToken.decimals));

            const response = await fetch(
                `${API_BASE}/order/?inputMint=${state.fromToken.mint}&outputMint=${state.toToken.mint}&amount=${amountInSmallestUnit}`
            );

            const data = await response.json();

            if (data.outAmount) {
                const outAmount = parseFloat(data.outAmount) / Math.pow(10, state.toToken.decimals);
                document.getElementById('toAmount').value = outAmount.toFixed(6);

                // Calculate rate
                const rate = outAmount / fromAmount;
                document.getElementById('swapRate').textContent = `1 ${state.fromToken.symbol} = ${formatNumber(rate, 6)} ${state.toToken.symbol}`;

                // Update USD values
                const inUsd = data.inUsdValue || 0;
                const outUsd = data.outUsdValue || 0;
                document.getElementById('fromUsdValue').textContent = `≈ ${formatUSD(inUsd)}`;
                document.getElementById('toUsdValue').textContent = `≈ ${formatUSD(outUsd)}`;

                // Update fee and slippage
                document.getElementById('swapFee').textContent = `${(data.feeBps || 30) / 100}%`;
                document.getElementById('swapSlippage').textContent = `${state.slippage}%`;
            } else if (data.error || data.errorMessage) {
                showToast(data.error || data.errorMessage || 'Failed to get quote', 'error');
            }

            updateSwapButton();
        } catch (error) {
            console.error('Quote failed:', error);
        }
    }, 300);
}

function updateSwapButton() {
    const swapBtn = document.getElementById('swapBtn');
    const swapBtnText = document.getElementById('swapBtnText');
    const fromAmount = parseFloat(document.getElementById('fromAmount').value);
    const toAmount = parseFloat(document.getElementById('toAmount').value);

    if (!state.isAuthenticated) {
        swapBtnText.textContent = 'Connect Wallet';
        swapBtn.disabled = true;
        return;
    }

    if (!state.fromToken || !state.toToken) {
        swapBtnText.textContent = 'Select tokens';
        swapBtn.disabled = true;
        return;
    }

    if (!fromAmount || fromAmount <= 0) {
        swapBtnText.textContent = 'Enter amount';
        swapBtn.disabled = true;
        return;
    }

    // Check balance
    const balance = state.balances[state.fromToken.mint]?.balance || 0;
    if (fromAmount > balance) {
        swapBtnText.textContent = 'Insufficient balance';
        swapBtn.disabled = true;
        return;
    }

    if (!toAmount || toAmount <= 0) {
        swapBtnText.textContent = 'Getting quote...';
        swapBtn.disabled = true;
        return;
    }

    swapBtnText.textContent = 'Swap';
    swapBtn.disabled = false;
}

async function executeSwap() {
    if (!state.isAuthenticated) {
        showModal('loginModal');
        return;
    }

    const fromAmount = parseFloat(document.getElementById('fromAmount').value);
    const toAmount = parseFloat(document.getElementById('toAmount').value);

    if (!fromAmount || !toAmount) {
        showToast('Invalid swap amount', 'error');
        return;
    }

    const swapBtn = document.getElementById('swapBtn');
    const swapBtnText = document.getElementById('swapBtnText');
    const loader = document.getElementById('swapLoader');

    swapBtn.disabled = true;
    swapBtnText.textContent = 'Swapping...';
    loader.classList.remove('hidden');

    try {
        const response = await fetch(API_BASE + '/swap/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                inputMint: state.fromToken.mint,
                outputMint: state.toToken.mint,
                inputAmount: fromAmount,
                outputAmount: toAmount,
                slippage: state.slippage,
                usdValue: parseUsdText(document.getElementById('fromUsdValue').textContent)
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Swapped ${fromAmount} ${state.fromToken.symbol} for ${toAmount.toFixed(4)} ${state.toToken.symbol}!`, 'success');

            // Clear inputs
            document.getElementById('fromAmount').value = '';
            document.getElementById('toAmount').value = '';

            // Reload balances and transactions
            loadWalletBalances();
            loadTransactions();
        } else {
            showToast(data.error || 'Swap failed', 'error');
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
    } finally {
        swapBtn.disabled = false;
        swapBtnText.textContent = 'Swap';
        loader.classList.add('hidden');
        updateSwapButton();
    }
}

// ============================================
// Transactions
// ============================================

async function loadTransactions() {
    const container = document.getElementById('transactionsList');

    if (!state.isAuthenticated) {
        container.innerHTML = '<div class="transaction-empty">Login to see your transactions</div>';
        return;
    }

    try {
        const response = await fetch(API_BASE + '/transactions/', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        const data = await response.json();

        if (data.transactions && data.transactions.length > 0) {
            container.innerHTML = data.transactions.slice(0, 10).map(tx => `
                <div class="transaction-item">
                    <div class="transaction-tokens">
                        <span>${tx.fromToken}</span>
                        <span class="transaction-arrow">→</span>
                        <span>${tx.toToken}</span>
                        <span class="transaction-amount">${formatNumber(tx.fromAmount, 4)} → ${formatNumber(tx.toAmount, 4)}</span>
                    </div>
                    <div class="transaction-meta">
                        <span class="transaction-usd">${formatUSD(tx.usdValue || 0)}</span>
                        <span class="transaction-time">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 6v6l4 2"/>
                            </svg>
                            ${getTimeAgo(tx.createdAt)}
                        </span>
                        <span class="transaction-status ${tx.status}">${tx.status}</span>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="transaction-empty">No transactions yet</div>';
        }
    } catch (error) {
        console.error('Failed to load transactions:', error);
        container.innerHTML = '<div class="transaction-empty">Failed to load transactions</div>';
    }
}

// ============================================
// Price Chart
// ============================================

function updateChartPair() {
    document.getElementById('chartPair').textContent = `${state.chartToken}/USD`;
}

async function loadPriceChart() {
    try {
        const response = await fetch(`${API_BASE}/price/${state.chartToken}/?days=${state.chartDays}`);
        const data = await response.json();

        if (data.prices && data.prices.length > 0) {
            renderChart(data.prices);

            // Update current price display
            const currentPrice = data.prices[data.prices.length - 1][1];
            const firstPrice = data.prices[0][1];
            const priceChange = ((currentPrice - firstPrice) / firstPrice) * 100;
            const dollarChange = currentPrice - firstPrice;

            document.getElementById('chartPrice').textContent = formatUSD(currentPrice);

            const changeEl = document.getElementById('chartChange');
            const priceChangeEl = document.getElementById('chartPriceChange');

            if (priceChange >= 0) {
                changeEl.textContent = `+${priceChange.toFixed(2)}%`;
                changeEl.className = 'chart-change positive';
                priceChangeEl.textContent = `+${formatUSD(dollarChange)} today`;
                priceChangeEl.className = 'chart-price-change';
            } else {
                changeEl.textContent = `${priceChange.toFixed(2)}%`;
                changeEl.className = 'chart-change negative';
                priceChangeEl.textContent = `${formatUSD(dollarChange)} today`;
                priceChangeEl.className = 'chart-price-change negative';
            }
        }
    } catch (error) {
        console.error('Failed to load price chart:', error);
    }
}

function renderChart(prices) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    // Destroy previous chart if exists
    if (state.priceChart) {
        state.priceChart.destroy();
    }

    const labels = prices.map(p => {
        const date = new Date(p[0]);
        if (state.chartDays <= 1) {
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    });

    const values = prices.map(p => p[1]);

    // Determine if price is up or down
    const isUp = values[values.length - 1] >= values[0];
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const gradientTop = isUp ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, gradientTop);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    state.priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                borderColor: lineColor,
                borderWidth: 2,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#132743',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => formatUSD(ctx.raw)
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.3)',
                        maxTicksLimit: 6,
                        font: { size: 11 }
                    }
                },
                y: {
                    display: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.3)',
                        padding: 10,
                        font: { size: 11 },
                        callback: (value) => formatUSD(value)
                    }
                }
            }
        }
    });
}

// ============================================
// Modals
// ============================================

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// ============================================
// Settings
// ============================================

function updateSlippage(value) {
    state.slippage = parseFloat(value);
    document.getElementById('swapSlippage').textContent = `${state.slippage}%`;

    // Update active button
    document.querySelectorAll('.slippage-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.value) === state.slippage);
    });
}

// ============================================
// Event Listeners
// ============================================

function initEventListeners() {
    // Auth
    document.getElementById('loginBtn').addEventListener('click', () => showModal('loginModal'));
    document.getElementById('closeLoginModal').addEventListener('click', () => hideModal('loginModal'));
    document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);
    document.getElementById('authSwitchBtn').addEventListener('click', toggleAuthMode);

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Token selection
    document.getElementById('fromTokenBtn').addEventListener('click', () => openTokenModal('from'));
    document.getElementById('toTokenBtn').addEventListener('click', () => openTokenModal('to'));
    document.getElementById('closeTokenModal').addEventListener('click', () => hideModal('tokenModal'));
    document.getElementById('tokenSearchInput').addEventListener('input', (e) => {
        renderTokenList(e.target.value);
    });

    // Swap direction
    document.getElementById('swapDirectionBtn').addEventListener('click', swapTokenDirection);

    // Amount input
    document.getElementById('fromAmount').addEventListener('input', () => {
        getQuote();
        updateSwapButton();
    });

    // Swap button
    document.getElementById('swapBtn').addEventListener('click', executeSwap);

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => showModal('settingsModal'));
    document.getElementById('closeSettingsModal').addEventListener('click', () => hideModal('settingsModal'));
    document.querySelectorAll('.slippage-btn').forEach(btn => {
        btn.addEventListener('click', () => updateSlippage(btn.dataset.value));
    });
    document.getElementById('customSlippage').addEventListener('change', (e) => {
        if (e.target.value) {
            updateSlippage(e.target.value);
        }
    });

    // Timeframe buttons
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.chartDays = parseFloat(btn.dataset.days);
            loadPriceChart();
        });
    });

    // Modal backdrop clicks
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            backdrop.closest('.modal').classList.add('hidden');
        });
    });

    // Currency selector
    initCurrencySelector();

    // Chart token selector
    initChartTokenSelector();

    // Crypto search
    initCryptoSearch();
}

// ============================================
// Initialization
// ============================================

async function init() {
    initEventListeners();
    initDefaultTokens();
    loadAuthState();
    updateChartPair();
    loadPriceChart();
    // Check admin visibility on page load
    updateAdminVisibility();
}

// Update admin link visibility
function updateAdminVisibility() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const adminNavLink = document.getElementById('adminNavLink');
    if (adminNavLink && user && user.isAdmin) {
        adminNavLink.style.display = '';
    }
}

// ============================================
// Currency Selector
// ============================================

function initCurrencySelector() {
    const currencyBtn = document.getElementById('currencyBtn');
    const currencyDropdown = document.getElementById('currencyDropdown');

    if (!currencyBtn || !currencyDropdown) return;

    currencyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currencyDropdown.classList.toggle('hidden');
    });

    document.querySelectorAll('.currency-option').forEach(option => {
        option.addEventListener('click', () => {
            const currency = option.dataset.currency;
            state.currency = currency;
            document.getElementById('currencyLabel').textContent = currency;

            // Update active state
            document.querySelectorAll('.currency-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            currencyDropdown.classList.add('hidden');

            // Refresh data with new currency
            loadPriceChart();
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        currencyDropdown.classList.add('hidden');
    });
}

// ============================================
// Chart Token Selector
// ============================================

function initChartTokenSelector() {
    const tokenBtn = document.getElementById('chartTokenBtn');
    const tokenDropdown = document.getElementById('chartTokenDropdown');

    if (!tokenBtn || !tokenDropdown) return;

    tokenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        tokenDropdown.classList.toggle('hidden');
    });

    document.querySelectorAll('.chart-token-option').forEach(option => {
        option.addEventListener('click', () => {
            const token = option.dataset.token;
            state.chartToken = token;

            // Update display
            document.getElementById('chartPair').textContent = `${token}/USD`;

            // Update active state
            document.querySelectorAll('.chart-token-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');

            tokenDropdown.classList.add('hidden');

            // Reload chart with new token
            loadPriceChart();
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        tokenDropdown.classList.add('hidden');
    });
}

function convertCurrency(usdValue) {
    const rate = state.currencyRates[state.currency] || 1;
    return usdValue * rate;
}

function getCurrencySymbol() {
    const symbols = { USD: '$', EUR: '€', RUB: '₽', KZT: '₸' };
    return symbols[state.currency] || '$';
}

function formatCurrency(num) {
    const converted = convertCurrency(num);
    return getCurrencySymbol() + formatNumber(converted, 2);
}

// ============================================
// Crypto Search
// ============================================

function initCryptoSearch() {
    const searchBtn = document.getElementById('searchBtn');
    const searchModal = document.getElementById('cryptoSearchModal');
    const closeBtn = document.getElementById('closeCryptoSearchModal');
    const searchInput = document.getElementById('cryptoSearchInput');

    if (!searchBtn || !searchModal) return;

    searchBtn.addEventListener('click', () => {
        showModal('cryptoSearchModal');
        searchInput.value = '';
        searchInput.focus();
        document.getElementById('cryptoSearchResults').innerHTML =
            '<div class="crypto-search-empty">Enter a cryptocurrency name to search</div>';
    });

    closeBtn.addEventListener('click', () => {
        hideModal('cryptoSearchModal');
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        if (state.cryptoSearchTimeout) {
            clearTimeout(state.cryptoSearchTimeout);
        }

        if (query.length < 2) {
            document.getElementById('cryptoSearchResults').innerHTML =
                '<div class="crypto-search-empty">Enter at least 2 characters</div>';
            return;
        }

        document.getElementById('cryptoSearchResults').innerHTML =
            '<div class="crypto-search-loading"><div class="loader"></div><span>Searching...</span></div>';

        state.cryptoSearchTimeout = setTimeout(() => {
            searchCryptoPrice(query);
        }, 500);
    });
}

async function searchCryptoPrice(query) {
    try {
        // Search CoinGecko for the coin
        const searchResponse = await fetch(
            `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`
        );
        const searchData = await searchResponse.json();

        if (!searchData.coins || searchData.coins.length === 0) {
            document.getElementById('cryptoSearchResults').innerHTML =
                '<div class="crypto-search-empty">No cryptocurrencies found</div>';
            return;
        }

        // Get top 5 results
        const topCoins = searchData.coins.slice(0, 5);
        const coinIds = topCoins.map(c => c.id).join(',');

        // Get prices for these coins
        const priceResponse = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`
        );
        const priceData = await priceResponse.json();

        const resultsContainer = document.getElementById('cryptoSearchResults');

        resultsContainer.innerHTML = topCoins.map(coin => {
            const price = priceData[coin.id]?.usd || 0;
            const change = priceData[coin.id]?.usd_24h_change || 0;
            const convertedPrice = convertCurrency(price);
            const changeClass = change >= 0 ? 'positive' : 'negative';
            const changeSign = change >= 0 ? '+' : '';

            return `
                <div class="crypto-result-item">
                    <div class="crypto-result-info">
                        <img class="crypto-result-icon" src="${coin.thumb}" alt="${coin.symbol}" onerror="this.style.display='none'">
                        <div>
                            <div class="crypto-result-name">${coin.name}</div>
                            <div class="crypto-result-symbol">${coin.symbol.toUpperCase()}</div>
                        </div>
                    </div>
                    <div class="crypto-result-price">
                        <div class="crypto-result-price-value">${getCurrencySymbol()}${formatNumber(convertedPrice, price < 1 ? 6 : 2)}</div>
                        <div class="crypto-result-price-change ${changeClass}">${changeSign}${change.toFixed(2)}%</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Crypto search failed:', error);
        document.getElementById('cryptoSearchResults').innerHTML =
            '<div class="crypto-search-empty">Search failed. Please try again.</div>';
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
