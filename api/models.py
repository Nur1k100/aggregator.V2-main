from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.orm import relationship
import enum
from .database import Base

class TransactionStatus(enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    wallets = relationship("Wallet", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")

class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_mint = Column(String(64), nullable=False)
    token_symbol = Column(String(20), nullable=False)
    token_name = Column(String(100), nullable=True)
    token_icon = Column(Text, nullable=True)
    token_decimals = Column(Integer, default=9)
    balance = Column(Float, default=0.0)
    user = relationship("User", back_populates="wallets")

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    from_token_mint = Column(String(64), nullable=False)
    from_token_symbol = Column(String(20), nullable=False)
    from_amount = Column(Float, nullable=False)
    to_token_mint = Column(String(64), nullable=False)
    to_token_symbol = Column(String(20), nullable=False)
    to_amount = Column(Float, nullable=False)
    rate = Column(Float, nullable=True)
    fee = Column(Float, default=0.0)
    slippage = Column(Float, default=0.5)
    usd_value = Column(Float, default=0.0)
    status = Column(SQLEnum(TransactionStatus), default=TransactionStatus.COMPLETED)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="transactions")

    def to_dict(self):
        return {
            "id": self.id,
            "fromToken": self.from_token_symbol,
            "toToken": self.to_token_symbol,
            "fromAmount": self.from_amount,
            "toAmount": self.to_amount,
            "rate": self.rate,
            "fee": self.fee,
            "slippage": self.slippage,
            "usdValue": self.usd_value or 0.0,
            "status": self.status.value,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }

class NewsPost(Base):
    __tablename__ = "news_posts"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    summary = Column(Text, nullable=False)
    category = Column(String(50), default="General")
    author_email = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "summary": self.summary,
            "category": self.category or "General",
            "authorEmail": self.author_email or "",
            "date": self.created_at.date().isoformat() if self.created_at else "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

COMMON_TOKENS = [
    {
        "mint": "So11111111111111111111111111111111111111112",
        "symbol": "SOL",
        "name": "Solana",
        "decimals": 9,
        "icon": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
    },
    {
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": 6,
        "icon": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
    },
    {
        "mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        "symbol": "USDT",
        "name": "Tether USD",
        "decimals": 6,
        "icon": "https://assets.coingecko.com/coins/images/325/small/Tether.png"
    },
    {
        "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "symbol": "BONK",
        "name": "Bonk",
        "decimals": 5,
        "icon": "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I"
    },
    {
        "mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        "symbol": "JUP",
        "name": "Jupiter",
        "decimals": 6,
        "icon": "https://static.jup.ag/jup/icon.png"
    }
]
