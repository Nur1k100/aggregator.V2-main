from django.urls import path
from . import views

urlpatterns = [
    path('search/', views.SearchTokenView.as_view(), name='search'),
    path('shield/', views.ShieldView.as_view(), name='shield'),
    path('order/', views.OrderView.as_view(), name='order'),
    path('execute/', views.ExecuteView.as_view(), name='execute'),
    path('holdings/<str:address>/', views.HoldingsView.as_view(), name='holdings'),
    
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/me/', views.MeView.as_view(), name='me'),
    
    path('wallet/balance/', views.WalletBalanceView.as_view(), name='wallet_balance'),
    path('wallet/deposit/', views.DepositView.as_view(), name='deposit'),
    
    path('swap/', views.SwapView.as_view(), name='swap'),
    path('transactions/', views.TransactionListView.as_view(), name='transactions'),

    path('news/', views.NewsListView.as_view(), name='news'),

    path('admin/overview/', views.AdminOverviewView.as_view(), name='admin_overview'),
    path('admin/profiles/', views.AdminProfilesView.as_view(), name='admin_profiles'),
    path('admin/transactions/', views.AdminTransactionsView.as_view(), name='admin_transactions'),
    path('admin/news/', views.AdminNewsView.as_view(), name='admin_news'),
    path('admin/news/<int:news_id>/', views.AdminNewsDeleteView.as_view(), name='admin_news_delete'),
    
    path('tokens/', views.TokenListView.as_view(), name='tokens'),
    path('price/<str:token>/', views.PriceHistoryView.as_view(), name='price_history'),
    
    path('init-db/', views.InitDatabaseView.as_view(), name='init_db'),
]
