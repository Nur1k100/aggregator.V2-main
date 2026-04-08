import json
import os
import random
from datetime import datetime, timedelta
import requests
from django.http import JsonResponse
from django.views import View
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from sqlalchemy import func
from .database import SessionLocal, init_db
from .models import User, Wallet, Transaction, TransactionStatus, NewsPost, COMMON_TOKENS
from .auth import hash_password, verify_password, create_token, login_required

JUPITER_API_URL = getattr(settings, 'JUPITER_API_URL', 'https://lite-api.jup.ag')
ADMIN_EMAIL = os.environ.get('AGGREGATOR_ADMIN_EMAIL', 'admin@aggregator.local').lower()
ADMIN_PASSWORD = os.environ.get('AGGREGATOR_ADMIN_PASSWORD', 'admin')
DANIYAR_ADMIN_EMAIL = 'daniyar@gmail.com'
DANIYAR_ADMIN_PASSWORD = 'daniyar'
ADMIN_EMAILS = [ADMIN_EMAIL, DANIYAR_ADMIN_EMAIL]
TARGET_DEMO_PROFILES = 25
TOKEN_PRICE_USD = {
    'SOL': 98.0,
    'USDC': 1.0,
    'USDT': 1.0,
    'BONK': 0.000025,
    'JUP': 0.85,
}
DEFAULT_NEWS = [
    {
        'id': 2,
        'title': 'Админ-профиль теперь видит 25 пользователей',
        'summary': 'В админке появились карточки пользователей, транзакции и общая статистика по USD.',
        'date': '2026-02-03',
        'category': 'Admin'
    },
    {
        'id': 3,
        'title': 'История транзакций обновлена',
        'summary': 'Каждый пользователь видит свои операции с направлением и суммой.',
        'date': '2026-02-02',
        'category': 'Transactions'
    },
    {
        'id': 4,
        'title': 'Студенческая команда готовит публичный демо-день',
        'summary': 'Aggregator тестируется на сценариях входа, депозита и обмена токенов.',
        'date': '2026-01-31',
        'category': 'Team'
    },
]
def is_admin_email(email):
    return (email or '').strip().lower() in [e.lower() for e in ADMIN_EMAILS]

def _admin_guard(request):
    if not is_admin_email(getattr(request, 'user_email', '')):
        return JsonResponse(
            {'error': 'Admin access required', 'hint': f'Login as {ADMIN_EMAIL}'},
            status=403
        )
    return None

def _price_for_symbol(symbol):
    return TOKEN_PRICE_USD.get((symbol or '').upper(), 1.0)

def _estimate_tx_usd(tx):
    if tx.usd_value is not None and tx.usd_value > 0:
        return float(tx.usd_value)
    return float(tx.from_amount or 0) * _price_for_symbol(tx.from_token_symbol)

def _wallet_usd(wallet):
    return float(wallet.balance or 0) * _price_for_symbol(wallet.token_symbol)

STARTER_BALANCES = {
    'SOL': 1.5,
    'USDC': 120.0,
    'USDT': 80.0,
    'BONK': 20000.0,
    'JUP': 25.0,
}

def _ensure_wallet(db, user_id, token, balance):
    wallet = db.query(Wallet).filter(
        Wallet.user_id == user_id,
        Wallet.token_mint == token['mint']
    ).first()
    if not wallet:
        wallet = Wallet(
            user_id=user_id,
            token_mint=token['mint'],
            token_symbol=token['symbol'],
            token_name=token['name'],
            token_icon=token['icon'],
            token_decimals=token['decimals'],
            balance=balance
        )
        db.add(wallet)
    return wallet

def ensure_user_balances(db, user_id, is_admin=False):
    for token in COMMON_TOKENS:
        wallet = _ensure_wallet(db, user_id, token, balance=0.0)
        if is_admin:
            wallet.balance = 10000.0 if token['symbol'] == 'USDC' else 0.0
            continue
        target_balance = STARTER_BALANCES.get(token['symbol'], 10.0)
        if wallet.balance < target_balance:
            wallet.balance = float(target_balance)

def ensure_news_seed(db):
    if db.query(NewsPost).count() > 0:
        return
    for item in DEFAULT_NEWS:
        post = NewsPost(
            title=item['title'],
            summary=item['summary'],
            category=item['category'],
            author_email=ADMIN_EMAIL,
            created_at=datetime.strptime(item['date'], '%Y-%m-%d')
        )
        db.add(post)
    db.commit()

def _log_user_transaction(db, user_id, from_token, to_token, from_amount, to_amount, usd_value):
    tx = Transaction(
        user_id=user_id,
        from_token_mint=from_token.get('mint', ''),
        from_token_symbol=from_token.get('symbol', 'UNKNOWN'),
        from_amount=float(from_amount),
        to_token_mint=to_token.get('mint', ''),
        to_token_symbol=to_token.get('symbol', 'UNKNOWN'),
        to_amount=float(to_amount),
        rate=(float(to_amount) / float(from_amount)) if from_amount else 0.0,
        fee=0.0,
        slippage=0.0,
        usd_value=float(usd_value or 0),
        status=TransactionStatus.COMPLETED
    )
    db.add(tx)

def ensure_demo_data(db):
    randomizer = random.Random(42)
    admin_user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if not admin_user:
        admin_user = User(email=ADMIN_EMAIL, password_hash=hash_password(ADMIN_PASSWORD))
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
    ensure_user_balances(db, admin_user.id, is_admin=True)
    db.commit()

    daniyar_user = db.query(User).filter(User.email == DANIYAR_ADMIN_EMAIL).first()
    if not daniyar_user:
        daniyar_user = User(email=DANIYAR_ADMIN_EMAIL, password_hash=hash_password(DANIYAR_ADMIN_PASSWORD))
        db.add(daniyar_user)
        db.commit()
        db.refresh(daniyar_user)
    ensure_user_balances(db, daniyar_user.id, is_admin=True)
    db.commit()

    profile_count = db.query(User).filter(~User.email.in_(ADMIN_EMAILS)).count()
    to_create = max(0, TARGET_DEMO_PROFILES - profile_count)
    created = 0
    next_idx = 1
    while created < to_create:
        email = f'student{next_idx:02d}@aggregator.local'
        next_idx += 1
        if db.query(User).filter(User.email == email).first():
            continue
        user = User(email=email, password_hash=hash_password('student123'))
        db.add(user)
        db.commit()
        db.refresh(user)

        for token in COMMON_TOKENS:
            balance = round(randomizer.uniform(1, 25), 4)
            if token['symbol'] in ('USDC', 'USDT'):
                balance = round(randomizer.uniform(100, 800), 2)
            wallet = _ensure_wallet(db, user.id, token, balance=balance)
            if wallet.balance <= 0:
                wallet.balance = balance
        db.commit()

        tx_count = randomizer.randint(2, 5)
        for _ in range(tx_count):
            from_token, to_token = randomizer.sample(COMMON_TOKENS, 2)
            from_symbol = from_token['symbol']
            to_symbol = to_token['symbol']
            if from_symbol in ('USDC', 'USDT'):
                from_amount = round(randomizer.uniform(25, 400), 2)
            elif from_symbol == 'BONK':
                from_amount = round(randomizer.uniform(15000, 800000), 2)
            else:
                from_amount = round(randomizer.uniform(0.1, 8), 4)
            usd_value = round(from_amount * _price_for_symbol(from_symbol), 2)
            to_amount = round(max(0.000001, usd_value / _price_for_symbol(to_symbol) * randomizer.uniform(0.985, 1.015)), 6)
            created_at = datetime.utcnow() - timedelta(
                days=randomizer.randint(0, 14),
                hours=randomizer.randint(0, 23),
                minutes=randomizer.randint(0, 59)
            )
            transaction = Transaction(
                user_id=user.id,
                from_token_mint=from_token['mint'],
                from_token_symbol=from_symbol,
                from_amount=from_amount,
                to_token_mint=to_token['mint'],
                to_token_symbol=to_symbol,
                to_amount=to_amount,
                rate=(to_amount / from_amount) if from_amount else 0,
                fee=0.3,
                slippage=0.5,
                usd_value=usd_value,
                status=TransactionStatus.COMPLETED,
                created_at=created_at
            )
            db.add(transaction)
        db.commit()
        created += 1

    all_users = db.query(User).all()
    for user in all_users:
        ensure_user_balances(db, user.id, is_admin=is_admin_email(user.email))
    db.commit()
    ensure_news_seed(db)

def _user_stats(db, user):
    wallets = db.query(Wallet).filter(Wallet.user_id == user.id).all()
    transactions = db.query(Transaction).filter(Transaction.user_id == user.id).all()
    total_usd = sum(_estimate_tx_usd(tx) for tx in transactions)

    tx_dates = [tx.created_at for tx in transactions if tx.created_at]
    last_tx = max(tx_dates) if tx_dates else None

    return {
        'id': user.id,
        'email': user.email,
        'createdAt': user.created_at.isoformat() if user.created_at else None,
        'walletCount': len(wallets),
        'transactionCount': len(transactions),
        'walletUsdValue': round(sum(_wallet_usd(w) for w in wallets), 2),
        'totalUsdTransferred': round(total_usd, 2),
        'lastTransactionAt': last_tx.isoformat() if last_tx else None
    }


# Make sure tables exist on first import in local/dev mode.
init_db()
_bootstrap_db = SessionLocal()
try:
    ensure_demo_data(_bootstrap_db)
finally:
    _bootstrap_db.close()

# Jupiter API Proxy Views

class SearchTokenView(View):
    #Proxy for Jupiter token search API
    
    def get(self, request):
        query = request.GET.get('query', '')
        
        if not query:
            return JsonResponse({'error': 'Query parameter is required'}, status=400)
        
        try:
            response = requests.get(
                f'{JUPITER_API_URL}/ultra/v1/search',
                params={'query': query},
                timeout=10
            )
            return JsonResponse(response.json(), safe=False)
        except requests.RequestException as e:
            return JsonResponse({'error': str(e)}, status=500)


class ShieldView(View):
    #Proxy for Jupiter Shield API - token warnings
    
    def get(self, request):
        mints = request.GET.get('mints', '')
        
        if not mints:
            return JsonResponse({'error': 'Mints parameter is required'}, status=400)
        
        try:
            response = requests.get(
                f'{JUPITER_API_URL}/ultra/v1/shield',
                params={'mints': mints},
                timeout=10
            )
            return JsonResponse(response.json(), safe=False)
        except requests.RequestException as e:
            return JsonResponse({'error': str(e)}, status=500)


class OrderView(View):
    #Proxy for Jupiter Order API - get swap quote
    
    def get(self, request):
        input_mint = request.GET.get('inputMint')
        output_mint = request.GET.get('outputMint')
        amount = request.GET.get('amount')
        taker = request.GET.get('taker')
        
        if not all([input_mint, output_mint, amount]):
            return JsonResponse({
                'error': 'inputMint, outputMint, and amount are required'
            }, status=400)
        
        params = {
            'inputMint': input_mint,
            'outputMint': output_mint,
            'amount': amount,
        }
        
        if taker:
            params['taker'] = taker
        
        try:
            response = requests.get(
                f'{JUPITER_API_URL}/ultra/v1/order',
                params=params,
                timeout=15
            )
            return JsonResponse(response.json(), safe=False)
        except requests.RequestException as e:
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class ExecuteView(View):
    #Proxy for Jupiter Execute API - execute swap
    
    def post(self, request):
        try:
            data = json.loads(request.body)
            signed_transaction = data.get('signedTransaction')
            request_id = data.get('requestId')
            
            if not all([signed_transaction, request_id]):
                return JsonResponse({
                    'error': 'signedTransaction and requestId are required'
                }, status=400)
            
            response = requests.post(
                f'{JUPITER_API_URL}/ultra/v1/execute',
                json={
                    'signedTransaction': signed_transaction,
                    'requestId': request_id,
                },
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            return JsonResponse(response.json(), safe=False)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except requests.RequestException as e:
            return JsonResponse({'error': str(e)}, status=500)


class HoldingsView(View):
    #Proxy for Jupiter Holdings API - wallet balances
    
    def get(self, request, address):
        if not address:
            return JsonResponse({'error': 'Address is required'}, status=400)
        
        try:
            response = requests.get(
                f'{JUPITER_API_URL}/ultra/v1/holdings/{address}',
                timeout=15
            )
            return JsonResponse(response.json(), safe=False)
        except requests.RequestException as e:
            return JsonResponse({'error': str(e)}, status=500)

# Authentication Views

@method_decorator(csrf_exempt, name='dispatch')
class RegisterView(View):
    #User registration endpoint
    
    def post(self, request):
        try:
            data = json.loads(request.body)
            email = data.get('email', '').strip().lower()
            password = data.get('password', '')
            
            if not email or not password:
                return JsonResponse({'error': 'Email and password are required'}, status=400)
            
            if len(password) < 6:
                return JsonResponse({'error': 'Password must be at least 6 characters'}, status=400)
            
            db = SessionLocal()
            try:
                # Check if user exists
                existing_user = db.query(User).filter(User.email == email).first()
                if existing_user:
                    return JsonResponse({'error': 'Email already registered'}, status=400)
                
                # Create user
                password_hash = hash_password(password)
                user = User(email=email, password_hash=password_hash)
                db.add(user)
                db.commit()
                db.refresh(user)
                
                ensure_user_balances(db, user.id, is_admin=is_admin_email(user.email))
                db.commit()
                
                token = create_token(user.id, user.email)
                
                return JsonResponse({
                    'success': True,
                    'token': token,
                    'user': {
                        'id': user.id,
                        'email': user.email,
                        'isAdmin': is_admin_email(user.email)
                    }
                })
            finally:
                db.close()
                
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class LoginView(View):    
    def post(self, request):
        try:
            data = json.loads(request.body)
            email = data.get('email', '').strip().lower()
            password = data.get('password', '')
            
            if not email or not password:
                return JsonResponse({'error': 'Email and password are required'}, status=400)
            
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.email == email).first()
                if not user:
                    return JsonResponse({'error': 'Invalid email or password'}, status=401)
                
                if not verify_password(password, user.password_hash):
                    return JsonResponse({'error': 'Invalid email or password'}, status=401)
                
                token = create_token(user.id, user.email)
                
                return JsonResponse({
                    'success': True,
                    'token': token,
                    'user': {
                        'id': user.id,
                        'email': user.email,
                        'isAdmin': is_admin_email(user.email)
                    }
                })
            finally:
                db.close()
                
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


class MeView(View):    
    @login_required
    def get(self, request):
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == request.user_id).first()
            if not user:
                return JsonResponse({'error': 'User not found'}, status=404)
            
            return JsonResponse({
                'id': user.id,
                'email': user.email,
                'isAdmin': is_admin_email(user.email),
                'createdAt': user.created_at.isoformat() if user.created_at else None
            })
        finally:
            db.close()


# Wallet Views

class WalletBalanceView(View):
    #Get user's wallet balances
    
    @login_required
    def get(self, request):
        db = SessionLocal()
        try:
            wallets = db.query(Wallet).filter(Wallet.user_id == request.user_id).all()
            
            balances = []
            for wallet in wallets:
                balances.append({
                    'tokenMint': wallet.token_mint,
                    'symbol': wallet.token_symbol,
                    'name': wallet.token_name,
                    'icon': wallet.token_icon,
                    'decimals': wallet.token_decimals,
                    'balance': wallet.balance
                })
            
            return JsonResponse({'balances': balances})
        finally:
            db.close()


@method_decorator(csrf_exempt, name='dispatch')
class DepositView(View):
    #Deposit tokens to user's wallet
    
    @login_required
    def post(self, request):
        try:
            data = json.loads(request.body)
            token_mint = data.get('tokenMint')
            amount = data.get('amount', 0)
            
            if not token_mint or amount <= 0:
                return JsonResponse({'error': 'Token mint and positive amount required'}, status=400)
            
            db = SessionLocal()
            try:
                # Find or create wallet for this token
                wallet = db.query(Wallet).filter(
                    Wallet.user_id == request.user_id,
                    Wallet.token_mint == token_mint
                ).first()
                
                if not wallet:
                    # Find token info from COMMON_TOKENS or use defaults
                    token_info = next(
                        (t for t in COMMON_TOKENS if t['mint'] == token_mint),
                        None
                    )
                    
                    if not token_info:
                        return JsonResponse({'error': 'Unknown token'}, status=400)
                    
                    wallet = Wallet(
                        user_id=request.user_id,
                        token_mint=token_mint,
                        token_symbol=token_info['symbol'],
                        token_name=token_info['name'],
                        token_icon=token_info['icon'],
                        token_decimals=token_info['decimals'],
                        balance=0.0
                    )
                    db.add(wallet)
                
                amount_value = float(amount)
                wallet.balance += amount_value

                # Save deposit in transactions log so admin and user can see it
                _log_user_transaction(
                    db=db,
                    user_id=request.user_id,
                    from_token={'mint': 'cash', 'symbol': 'DEPOSIT'},
                    to_token={'mint': wallet.token_mint, 'symbol': wallet.token_symbol},
                    from_amount=amount_value,
                    to_amount=amount_value,
                    usd_value=amount_value * _price_for_symbol(wallet.token_symbol)
                )
                db.commit()
                
                return JsonResponse({
                    'success': True,
                    'newBalance': wallet.balance,
                    'token': wallet.token_symbol
                })
            finally:
                db.close()
                
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

# Swap Views

@method_decorator(csrf_exempt, name='dispatch')
class SwapView(View):
    #Execute a mock swap - validate balances locally, use Jupiter for quotes
    
    @login_required
    def post(self, request):
        try:
            data = json.loads(request.body)
            input_mint = data.get('inputMint')
            output_mint = data.get('outputMint')
            input_amount = float(data.get('inputAmount', 0))
            output_amount = float(data.get('outputAmount', 0))
            slippage = float(data.get('slippage', 0.5))
            usd_value = float(data.get('usdValue', 0) or 0)
            
            if not all([input_mint, output_mint]) or input_amount <= 0:
                return JsonResponse({'error': 'Invalid swap parameters'}, status=400)
            
            db = SessionLocal()
            try:
                # Get source wallet
                source_wallet = db.query(Wallet).filter(
                    Wallet.user_id == request.user_id,
                    Wallet.token_mint == input_mint
                ).first()
                
                if not source_wallet or source_wallet.balance < input_amount:
                    return JsonResponse({'error': 'Insufficient balance'}, status=400)
                
                # Get or create destination wallet
                dest_wallet = db.query(Wallet).filter(
                    Wallet.user_id == request.user_id,
                    Wallet.token_mint == output_mint
                ).first()
                
                if not dest_wallet:
                    # Find token info
                    token_info = next(
                        (t for t in COMMON_TOKENS if t['mint'] == output_mint),
                        None
                    )
                    
                    if token_info:
                        dest_wallet = Wallet(
                            user_id=request.user_id,
                            token_mint=output_mint,
                            token_symbol=token_info['symbol'],
                            token_name=token_info['name'],
                            token_icon=token_info['icon'],
                            token_decimals=token_info['decimals'],
                            balance=0.0
                        )
                        db.add(dest_wallet)
                    else:
                        # Try to get info from Jupiter search
                        try:
                            resp = requests.get(
                                f'{JUPITER_API_URL}/ultra/v1/search',
                                params={'query': output_mint},
                                timeout=5
                            )
                            tokens = resp.json()
                            if tokens and len(tokens) > 0:
                                t = tokens[0]
                                dest_wallet = Wallet(
                                    user_id=request.user_id,
                                    token_mint=output_mint,
                                    token_symbol=t.get('symbol', 'UNKNOWN'),
                                    token_name=t.get('name', 'Unknown Token'),
                                    token_icon=t.get('icon', ''),
                                    token_decimals=t.get('decimals', 9),
                                    balance=0.0
                                )
                                db.add(dest_wallet)
                        except:
                            return JsonResponse({'error': 'Unknown output token'}, status=400)
                
                # Calculate rate
                rate = output_amount / input_amount if input_amount > 0 else 0
                fee = 0.3  # 0.3% fee
                
                source_wallet.balance -= input_amount
                dest_wallet.balance += output_amount
                
                # Record transaction
                transaction = Transaction(
                    user_id=request.user_id,
                    from_token_mint=input_mint,
                    from_token_symbol=source_wallet.token_symbol,
                    from_amount=input_amount,
                    to_token_mint=output_mint,
                    to_token_symbol=dest_wallet.token_symbol,
                    to_amount=output_amount,
                    rate=rate,
                    fee=fee,
                    slippage=slippage,
                    usd_value=usd_value or (input_amount * _price_for_symbol(source_wallet.token_symbol)),
                    status=TransactionStatus.COMPLETED
                )
                db.add(transaction)
                db.commit()
                
                return JsonResponse({
                    'success': True,
                    'transaction': transaction.to_dict(),
                    'newBalances': {
                        source_wallet.token_symbol: source_wallet.balance,
                        dest_wallet.token_symbol: dest_wallet.balance
                    }
                })
            finally:
                db.close()
                
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


class TransactionListView(View):
    #Get user's transaction history
    
    @login_required
    def get(self, request):
        db = SessionLocal()
        try:
            transactions = db.query(Transaction).filter(
                Transaction.user_id == request.user_id
            ).order_by(Transaction.created_at.desc()).limit(50).all()
            
            return JsonResponse({
                'transactions': [t.to_dict() for t in transactions]
            })
        finally:
            db.close()

# News + Admin Views

class NewsListView(View):
    #Public news feed

    def get(self, request):
        db = SessionLocal()
        try:
            ensure_news_seed(db)
            items = db.query(NewsPost).order_by(NewsPost.created_at.desc()).limit(100).all()
            return JsonResponse({'items': [item.to_dict() for item in items]})
        finally:
            db.close()


class AdminOverviewView(View):
    #Overall transaction stats for admin profile

    @login_required
    def get(self, request):
        guard = _admin_guard(request)
        if guard:
            return guard

        db = SessionLocal()
        try:
            ensure_demo_data(db)

            user_count = db.query(func.count(User.id)).filter(User.email != ADMIN_EMAIL).scalar() or 0
            transaction_count = db.query(func.count(Transaction.id)).scalar() or 0
            transactions = db.query(Transaction).all()
            total_usd = sum(_estimate_tx_usd(tx) for tx in transactions)
            avg_usd = (total_usd / transaction_count) if transaction_count else 0.0

            since = datetime.utcnow() - timedelta(hours=24)
            daily_txs = db.query(Transaction).filter(Transaction.created_at >= since).all()
            daily_usd = sum(_estimate_tx_usd(tx) for tx in daily_txs)

            return JsonResponse({
                'users': user_count,
                'transactions': transaction_count,
                'totalUsdTransferred': round(total_usd, 2),
                'avgUsdPerTransaction': round(avg_usd, 2),
                'usdLast24h': round(daily_usd, 2)
            })
        finally:
            db.close()


class AdminProfilesView(View):
    #Admin list of up to 25 user profiles with stats

    @login_required
    def get(self, request):
        guard = _admin_guard(request)
        if guard:
            return guard

        limit = int(request.GET.get('limit', TARGET_DEMO_PROFILES))
        limit = max(1, min(limit, 100))

        db = SessionLocal()
        try:
            ensure_demo_data(db)
            users = db.query(User).filter(User.email != ADMIN_EMAIL).order_by(User.created_at.asc()).limit(limit).all()

            return JsonResponse({
                'profiles': [_user_stats(db, user) for user in users],
                'limit': limit
            })
        finally:
            db.close()


class AdminTransactionsView(View):
    #Admin view for all users transactions

    @login_required
    def get(self, request):
        guard = _admin_guard(request)
        if guard:
            return guard

        limit = int(request.GET.get('limit', 100))
        limit = max(10, min(limit, 300))

        db = SessionLocal()
        try:
            ensure_demo_data(db)
            rows = db.query(Transaction, User.email).join(User, User.id == Transaction.user_id).order_by(
                Transaction.created_at.desc()
            ).limit(limit).all()

            items = []
            for tx, email in rows:
                tx_item = tx.to_dict()
                tx_item['userEmail'] = email
                tx_item['usdValue'] = round(_estimate_tx_usd(tx), 2)
                items.append(tx_item)

            return JsonResponse({'transactions': items, 'limit': limit})
        finally:
            db.close()


@method_decorator(csrf_exempt, name='dispatch')
class AdminNewsView(View):
    #Admin news manager: GET list, POST create

    @login_required
    def get(self, request):
        guard = _admin_guard(request)
        if guard:
            return guard

        db = SessionLocal()
        try:
            ensure_news_seed(db)
            items = db.query(NewsPost).order_by(NewsPost.created_at.desc()).limit(100).all()
            return JsonResponse({'items': [item.to_dict() for item in items]})
        finally:
            db.close()

    @login_required
    def post(self, request):
        guard = _admin_guard(request)
        if guard:
            return guard

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        title = (data.get('title') or '').strip()
        summary = (data.get('summary') or '').strip()
        category = (data.get('category') or 'General').strip()[:50]

        if not title or not summary:
            return JsonResponse({'error': 'Title and summary are required'}, status=400)

        db = SessionLocal()
        try:
            post = NewsPost(
                title=title[:200],
                summary=summary[:1000],
                category=category or 'General',
                author_email=getattr(request, 'user_email', ADMIN_EMAIL)
            )
            db.add(post)
            db.commit()
            db.refresh(post)
            return JsonResponse({'success': True, 'item': post.to_dict()})
        finally:
            db.close()


@method_decorator(csrf_exempt, name='dispatch')
class AdminNewsDeleteView(View):
    #Admin news manager: DELETE item

    @login_required
    def delete(self, request, news_id):
        guard = _admin_guard(request)
        if guard:
            return guard

        db = SessionLocal()
        try:
            post = db.query(NewsPost).filter(NewsPost.id == news_id).first()
            if not post:
                return JsonResponse({'error': 'News item not found'}, status=404)

            db.delete(post)
            db.commit()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
        finally:
            db.close()

# Price Data View

class PriceHistoryView(View):
    #Get token price history for charts - uses CoinGecko API
    
    COINGECKO_IDS = {
        'SOL': 'solana',
        'USDC': 'usd-coin',
        'USDT': 'tether',
        'BONK': 'bonk',
        'JUP': 'jupiter-exchange-solana'
    }
    
    def get(self, request, token):
        days = request.GET.get('days', '1')  # 1, 7, 30, 365
        # Map token symbol to CoinGecko ID
        coingecko_id = self.COINGECKO_IDS.get(token.upper(), 'solana')
        try:
            response = requests.get(
                f'https://api.coingecko.com/api/v3/coins/{coingecko_id}/market_chart',
                params={
                    'vs_currency': 'usd',
                    'days': days
                },
                timeout=10
            )
            data = response.json()
            # Extract price data
            prices = data.get('prices', [])
            return JsonResponse({
                'token': token.upper(),
                'prices': prices,  # [[timestamp, price], ...]
                'days': days
            })
        except requests.RequestException as e:
            return JsonResponse({'error': str(e)}, status=500)


class TokenListView(View):
    #Get list of common tokens for selection
    def get(self, request):
        return JsonResponse({'tokens': COMMON_TOKENS})

# Database initialization endpoint (for development)
class InitDatabaseView(View):
    #Initialize database tables - development only
    def get(self, request):
        db = SessionLocal()
        try:
            init_db()
            ensure_demo_data(db)
            return JsonResponse({
                'success': True,
                'message': 'Database initialized: demo users, news, and admin 10k USDC prepared',
                'admin': {
                    'email': ADMIN_EMAIL,
                    'password': ADMIN_PASSWORD
                }
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
        finally:
            db.close()
