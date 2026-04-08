# FORADMINS — Техническая документация проекта Aggregator

## Структура проекта

```
Aggregator-main_v2/
├── manage.py              # Django entry point
├── requirements.txt       # Python dependencies
├── aggregator.db          # SQLite database
├── aggregator/            # Django project settings
│   ├── settings.py        # Configuration
│   ├── urls.py            # Main URL router
│   └── wsgi.py            # WSGI entry
├── api/                   # API backend
│   ├── urls.py            # API routes
│   ├── views.py           # Request handlers
│   ├── models.py          # Database models
│   ├── auth.py            # Authentication
│   └── database.py        # DB connection
├── templates/             # HTML pages
│   ├── index.html         # Main swap page
│   ├── deposit.html       # Deposit page
│   ├── news.html          # News page
│   └── admin_profile.html # Admin panel
└── static/                # Frontend assets
    ├── app.js             # Main JavaScript
    ├── admin.js           # Admin panel JS
    ├── news.js            # News page JS
    ├── particles.js       # Background effect
    └── styles.css         # All styles
```

---

## Backend (Python/Django)

### api/models.py — Модели базы данных

```python
# User — Пользователь
class User:
    id           # Уникальный ID
    email        # Email (уникальный)
    password     # Хешированный пароль
    isAdmin      # True если администратор
    createdAt    # Дата создания

# Wallet — Кошелёк пользователя
class Wallet:
    id           # ID кошелька
    userId       # Ссылка на пользователя
    tokenMint    # Адрес токена (Solana mint)
    balance      # Баланс токена
    
# Transaction — Транзакция обмена
class Transaction:
    id           # ID транзакции
    userId       # Кто сделал обмен
    fromToken    # Какой токен отдал
    toToken      # Какой токен получил
    fromAmount   # Количество отданного
    toAmount     # Количество полученного
    usdValue     # Стоимость в USD
    status       # 'completed' или 'pending'
    createdAt    # Когда совершена

# News — Новость
class News:
    id           # ID новости
    title        # Заголовок
    summary      # Текст
    category     # Категория
    createdAt    # Дата публикации
```

### api/views.py — Основные API endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/auth/register/` | POST | Регистрация пользователя |
| `/api/auth/login/` | POST | Вход в систему |
| `/api/auth/me/` | GET | Данные текущего пользователя |
| `/api/wallet/balance/` | GET | Баланс кошелька |
| `/api/wallet/deposit/` | POST | Пополнение баланса |
| `/api/order/` | GET | Получение котировки обмена |
| `/api/swap/` | POST | Выполнение обмена |
| `/api/transactions/` | GET | История транзакций |
| `/api/price/{token}/` | GET | График цены токена |
| `/api/admin/overview/` | GET | Статистика (admin) |
| `/api/admin/profiles/` | GET | Список пользователей (admin) |
| `/api/admin/transactions/` | GET | Все транзакции (admin) |
| `/api/admin/news/` | GET/POST | Новости (admin) |

### api/auth.py — Аутентификация

```python
# Использует JWT токены
# Token хранится в localStorage браузера
# Каждый запрос отправляет: Authorization: Bearer {token}
```

---

## Frontend (HTML/CSS/JavaScript)

### templates/index.html — Главная страница

**Ключевые элементы:**
- `#priceChart` — График цены (Chart.js)
- `#fromAmount`, `#toAmount` — Поля ввода суммы
- `#fromTokenBtn`, `#toTokenBtn` — Выбор токенов
- `#swapBtn` — Кнопка обмена
- `#loginBtn` — Кнопка входа
- `#logoutBtn` — Кнопка выхода
- `#loginModal` — Модальное окно входа

### static/app.js — Главный JavaScript

**Основные функции:**

```javascript
// Состояние приложения
const state = {
    isAuthenticated: false,  // Авторизован ли
    user: null,              // Данные пользователя
    token: null,             // JWT токен
    balances: {},            // Балансы токенов
    fromToken: null,         // Токен "отдаю"
    toToken: null,           // Токен "получаю"
    slippage: 0.5,           // Проскальзывание %
    priceChart: null,        // Объект графика
    chartToken: 'SOL',       // Токен на графике
};

// Ключевые функции
loadAuthState()      // Загрузка сохранённой сессии
updateAuthUI()       // Обновление UI при входе/выходе
loadWalletBalances() // Загрузка балансов
getQuote()           // Получение котировки
executeSwap()        // Выполнение обмена
loadPriceChart()     // Загрузка графика
logout()             // Выход из аккаунта
```

### static/admin.js — Админ-панель

**Основные функции:**

```javascript
// Состояние админки
const adminState = {
    profilesExpanded: false,      // Развёрнуты ли профили
    transactionsExpanded: false,  // Развёрнуты ли транзакции
    transactionsSortAsc: false,   // Сортировка по дате
    allProfiles: [],              // Все профили
    allTransactions: []           // Все транзакции
};

// Ключевые функции
renderStats(overview)        // Отрисовка статистики
renderProfiles(profiles)     // Отрисовка списка пользователей
renderTransactions(items)    // Отрисовка транзакций
renderAdminNews(items)       // Отрисовка новостей
deleteNews(id)               // Удаление новости
```

### static/styles.css — Стили

**CSS переменные (Design Tokens):**

```css
:root {
    --bg-primary: #0a0512;      /* Основной фон */
    --bg-secondary: #130a24;    /* Вторичный фон */
    --accent-primary: #0ea5e9;  /* Основной акцент */
    --text-primary: #ffffff;    /* Основной текст */
    --success: #22c55e;         /* Успех (зелёный) */
    --error: #ef4444;           /* Ошибка (красный) */
}
```

---

## Как всё связано

```
[Browser] 
    ↓ HTTP Request
[Django urls.py] 
    ↓ Route matching
[api/views.py]
    ↓ Business logic
[api/models.py + database.py]
    ↓ SQL queries
[aggregator.db (SQLite)]
```

**Пример: Обмен токенов**

1. User clicks "Swap" → `app.js: executeSwap()`
2. JavaScript sends POST to `/api/swap/`
3. Django routes to `views.py: swap_view()`
4. View checks balance, creates transaction
5. Updates wallet balances in database
6. Returns JSON response
7. JavaScript shows success toast

---

## Внешние API

| API | Использование |
|-----|---------------|
| CoinGecko | Цены криптовалют, поиск |
| Jupiter | Котировки обмена (Solana) |

---

## Для разработчиков

**Добавить новый токен:**
1. Добавить в `COMMON_TOKENS` в `app.js`
2. Добавить `<option>` в `deposit.html`
3. Добавить в `chartTokenDropdown` в `index.html`

**Добавить новую страницу:**
1. Создать HTML в `templates/`
2. Добавить route в `aggregator/urls.py`
3. Добавить в навигацию (`main-nav`)

**Изменить стили:**
- Все стили в `static/styles.css`
- Используйте CSS переменные из `:root`
