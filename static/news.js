const API_BASE = '/api';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

async function loadNews() {
    const container = document.getElementById('newsList');

    try {
        const response = await fetch(`${API_BASE}/news/`);
        const data = await response.json();
        const items = data.items || [];

        if (!items.length) {
            container.innerHTML = '<div class="transaction-empty">No news yet</div>';
            return;
        }

        container.innerHTML = items.map(item => `
            <article class="news-card">
                <div class="news-meta-row">
                    <span class="news-pill">${escapeHtml(item.category || 'Update')}</span>
                    <span class="news-date">${formatDate(item.date)}</span>
                </div>
                <h2 class="news-card-title">${escapeHtml(item.title)}</h2>
                <p class="news-card-summary">${escapeHtml(item.summary)}</p>
            </article>
        `).join('');
    } catch (error) {
        container.innerHTML = '<div class="transaction-empty">Failed to load news</div>';
    }
}

document.addEventListener('DOMContentLoaded', loadNews);
