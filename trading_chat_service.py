import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Optional

import pandas as pd


@dataclass
class MarketSnapshot:
    timestamp: str
    close: float
    ema50: float
    ema200: float
    ema800: float
    rsi14: float
    above_ema800: bool
    distance_to_ema800_pct: float


@dataclass
class MultiTimeframeSnapshot:
    trend_1h: str
    trend_4h: str
    trend_1d: str
    aligned_direction: str


@dataclass
class GuardrailStatus:
    blocked: bool
    reasons: list[str]
    min_signal_score: int
    current_signal_score: int


@dataclass
class TradePlan:
    action: str
    timeframe: str
    entry: Optional[float]
    stop_loss: Optional[float]
    take_profit_1: Optional[float]
    take_profit_2: Optional[float]
    risk_reward_tp1: Optional[float]
    risk_reward_tp2: Optional[float]
    risk_per_trade_pct: float
    account_size_usdt: float
    position_size_units: Optional[float]
    signal_score: int
    thesis: str
    invalidation: str
    guardrails: GuardrailStatus


def _calculate_rsi(close: pd.Series, length: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / length, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def _calculate_atr(df: pd.DataFrame, length: int = 14) -> float:
    high = df["high"]
    low = df["low"]
    close = df["close"]
    high_low = high - low
    high_close = (high - close.shift()).abs()
    low_close = (low - close.shift()).abs()
    true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    atr = true_range.rolling(length).mean().iloc[-1]
    return float(atr) if pd.notna(atr) else float(true_range.iloc[-1])


def _load_data(csv_path: str = "data/btc_usdt_1h.csv") -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
        df = df.dropna(subset=["timestamp"]).set_index("timestamp")

    for col in ("open", "high", "low", "close", "volume"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["close"])
    if df.empty:
        raise ValueError("Keine gueltigen Kursdaten gefunden.")
    return df


def _resample_ohlcv(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    agg = {
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }
    out = df.resample(rule).agg(agg).dropna(subset=["close"])
    return out


def _trend_from_df(df: pd.DataFrame) -> str:
    if len(df) < 20:
        return "neutral"
    close = df["close"]
    price = float(close.iloc[-1])
    ema50 = float(close.ewm(span=50, adjust=False).mean().iloc[-1])
    ema200 = float(close.ewm(span=200, adjust=False).mean().iloc[-1])
    if price > ema50 > ema200:
        return "bull"
    if price < ema50 < ema200:
        return "bear"
    return "neutral"


def _get_mtf_snapshot(df_1h: pd.DataFrame) -> MultiTimeframeSnapshot:
    df_4h = _resample_ohlcv(df_1h, "4H")
    df_1d = _resample_ohlcv(df_1h, "1D")

    t1 = _trend_from_df(df_1h)
    t4 = _trend_from_df(df_4h)
    t1d = _trend_from_df(df_1d)

    if t1 == t4 == t1d and t1 in {"bull", "bear"}:
        aligned = t1
    else:
        aligned = "mixed"

    return MultiTimeframeSnapshot(
        trend_1h=t1,
        trend_4h=t4,
        trend_1d=t1d,
        aligned_direction=aligned,
    )


def _snapshot_from_df(df: pd.DataFrame) -> MarketSnapshot:
    close = df["close"]
    ema50 = close.ewm(span=50, adjust=False).mean().iloc[-1]
    ema200 = close.ewm(span=200, adjust=False).mean().iloc[-1]
    ema800 = close.ewm(span=800, adjust=False).mean().iloc[-1]
    rsi14 = _calculate_rsi(close, 14).iloc[-1]
    last_close = float(close.iloc[-1])
    last_ts = df.index[-1]
    distance_pct = ((last_close - ema800) / ema800) * 100 if ema800 else 0.0

    return MarketSnapshot(
        timestamp=last_ts.isoformat(),
        close=round(last_close, 2),
        ema50=round(float(ema50), 2),
        ema200=round(float(ema200), 2),
        ema800=round(float(ema800), 2),
        rsi14=round(float(rsi14), 2),
        above_ema800=last_close >= ema800,
        distance_to_ema800_pct=round(float(distance_pct), 3),
    )


def get_market_snapshot(csv_path: str = "data/btc_usdt_1h.csv") -> MarketSnapshot:
    return _snapshot_from_df(_load_data(csv_path))


def _calculate_signal_score(
    snapshot: MarketSnapshot,
    mtf: MultiTimeframeSnapshot,
    atr: float,
) -> int:
    score = 0

    if mtf.aligned_direction in {"bull", "bear"}:
        score += 45
    elif mtf.trend_1h in {"bull", "bear"} and mtf.trend_4h == mtf.trend_1h:
        score += 25
    else:
        score += 5

    rsi = snapshot.rsi14
    if 45 <= rsi <= 65:
        score += 20
    elif 35 <= rsi < 45 or 65 < rsi <= 75:
        score += 12
    else:
        score += 4

    dist = abs(snapshot.distance_to_ema800_pct)
    if dist <= 2.0:
        score += 15
    elif dist <= 5.0:
        score += 8
    else:
        score += 2

    atr_pct = (atr / snapshot.close) * 100 if snapshot.close else 0.0
    if 0.8 <= atr_pct <= 3.0:
        score += 20
    elif 0.4 <= atr_pct <= 4.5:
        score += 12
    else:
        score += 4

    return max(0, min(100, int(round(score))))


def _apply_guardrails(signal_score: int, context: Optional[dict]) -> GuardrailStatus:
    ctx = context or {}
    reasons: list[str] = []

    min_score = int(ctx.get("min_signal_score", 60))
    current_daily_pnl_pct = float(ctx.get("current_daily_pnl_pct", 0.0))
    max_daily_loss_pct = float(ctx.get("max_daily_loss_pct", 3.0))
    current_open_risk_pct = float(ctx.get("current_open_risk_pct", 0.0))
    max_concurrent_risk_pct = float(ctx.get("max_concurrent_risk_pct", 2.5))
    trading_enabled = bool(ctx.get("trading_enabled", True))

    if not trading_enabled:
        reasons.append("Trading ist im Kontext deaktiviert.")
    if signal_score < min_score:
        reasons.append(f"Signal-Score {signal_score} unter Mindestscore {min_score}.")
    if current_daily_pnl_pct <= -abs(max_daily_loss_pct):
        reasons.append(
            f"Daily-Loss-Limit erreicht ({current_daily_pnl_pct:.2f}% <= -{abs(max_daily_loss_pct):.2f}%)."
        )
    if current_open_risk_pct >= max_concurrent_risk_pct:
        reasons.append(
            f"Open-Risk-Limit erreicht ({current_open_risk_pct:.2f}% >= {max_concurrent_risk_pct:.2f}%)."
        )

    return GuardrailStatus(
        blocked=len(reasons) > 0,
        reasons=reasons,
        min_signal_score=min_score,
        current_signal_score=signal_score,
    )


def _build_trade_plan(
    snapshot: MarketSnapshot,
    mtf: MultiTimeframeSnapshot,
    df: pd.DataFrame,
    context: Optional[dict],
) -> TradePlan:
    ctx = context or {}
    account_size = float(ctx.get("account_size_usdt", 1000.0))
    risk_pct = float(ctx.get("risk_per_trade_pct", 1.0))
    allow_short = bool(ctx.get("allow_short", True))
    timeframe = str(ctx.get("timeframe", "1h"))

    atr = _calculate_atr(df, 14)
    close = snapshot.close
    signal_score = _calculate_signal_score(snapshot, mtf, atr)
    guardrails = _apply_guardrails(signal_score, ctx)

    action = "wait"
    entry = None
    stop = None
    tp1 = None
    tp2 = None
    thesis = "Kein klares Multi-Timeframe-Setup."
    invalidation = "MTF-Trend bleibt gemischt."

    if mtf.aligned_direction == "bull" and snapshot.rsi14 < 72:
        action = "long"
        entry = close
        stop = min(snapshot.ema200, close - (1.5 * atr))
        risk = max(entry - stop, 0.0001)
        tp1 = entry + (2.0 * risk)
        tp2 = entry + (3.5 * risk)
        thesis = "1h/4h/1d sind bullisch ausgerichtet und RSI ist nicht ueberhitzt."
        invalidation = "1H-Schlusskurs unter EMA200 oder unter Stop-Loss."
    elif mtf.aligned_direction == "bear" and snapshot.rsi14 > 28 and allow_short:
        action = "short"
        entry = close
        stop = max(snapshot.ema200, close + (1.5 * atr))
        risk = max(stop - entry, 0.0001)
        tp1 = entry - (2.0 * risk)
        tp2 = entry - (3.5 * risk)
        thesis = "1h/4h/1d sind bearisch ausgerichtet und RSI ist nicht extrem ueberverkauft."
        invalidation = "1H-Schlusskurs ueber EMA200 oder ueber Stop-Loss."

    if guardrails.blocked:
        action = "wait"
        entry = None
        stop = None
        tp1 = None
        tp2 = None
        thesis = "Guardrails blockieren einen neuen Trade."
        invalidation = "Trade erst wieder bei erfuellten Guardrails."

    rr1 = None
    rr2 = None
    position_size = None
    if action in {"long", "short"} and entry is not None and stop is not None:
        if action == "long":
            risk_per_unit = max(entry - stop, 0.0001)
            rr1 = (tp1 - entry) / risk_per_unit if tp1 is not None else None
            rr2 = (tp2 - entry) / risk_per_unit if tp2 is not None else None
        else:
            risk_per_unit = max(stop - entry, 0.0001)
            rr1 = (entry - tp1) / risk_per_unit if tp1 is not None else None
            rr2 = (entry - tp2) / risk_per_unit if tp2 is not None else None
        risk_amount = account_size * (risk_pct / 100.0)
        position_size = risk_amount / risk_per_unit

    return TradePlan(
        action=action,
        timeframe=timeframe,
        entry=round(entry, 2) if entry is not None else None,
        stop_loss=round(stop, 2) if stop is not None else None,
        take_profit_1=round(tp1, 2) if tp1 is not None else None,
        take_profit_2=round(tp2, 2) if tp2 is not None else None,
        risk_reward_tp1=round(rr1, 2) if rr1 is not None else None,
        risk_reward_tp2=round(rr2, 2) if rr2 is not None else None,
        risk_per_trade_pct=round(risk_pct, 3),
        account_size_usdt=round(account_size, 2),
        position_size_units=round(position_size, 6) if position_size is not None else None,
        signal_score=signal_score,
        thesis=thesis,
        invalidation=invalidation,
        guardrails=guardrails,
    )


def _ema800_answer(snapshot: MarketSnapshot) -> str:
    trigger_price = snapshot.ema800
    if snapshot.above_ema800:
        direction_text = "Der Kurs liegt aktuell UEBER EMA 800."
        trigger_text = (
            "Ein bearischer Trigger waere ein Schlusskurs UNTER "
            f"{trigger_price:,.2f} USDT (1H-Close)."
        )
    else:
        direction_text = "Der Kurs liegt aktuell UNTER EMA 800."
        trigger_text = (
            "Ein bullischer Trigger waere ein Schlusskurs UEBER "
            f"{trigger_price:,.2f} USDT (1H-Close)."
        )

    return (
        f"EMA 800 liegt bei {trigger_price:,.2f} USDT. "
        f"{direction_text} {trigger_text} "
        f"Aktueller Abstand: {snapshot.distance_to_ema800_pct:+.3f}%."
    )


def _tips_answer(snapshot: MarketSnapshot, mtf: MultiTimeframeSnapshot, plan: TradePlan) -> str:
    if plan.action == "wait":
        base = "Kein Trade jetzt. Fokus auf Kapitalerhalt."
        if plan.guardrails.reasons:
            return f"{base} Grund: {' | '.join(plan.guardrails.reasons)}"
        return f"{base} Trendlage aktuell: 1h={mtf.trend_1h}, 4h={mtf.trend_4h}, 1d={mtf.trend_1d}."
    return (
        f"Bevorzugte Richtung: {plan.action.upper()} (Score {plan.signal_score}/100). "
        f"Entry {plan.entry:,.2f}, SL {plan.stop_loss:,.2f}, TP1 {plan.take_profit_1:,.2f}, "
        f"TP2 {plan.take_profit_2:,.2f}. Risikobudget {plan.risk_per_trade_pct}%."
    )


def answer_trading_question(
    question: str,
    context: Optional[dict] = None,
    csv_path: str = "data/btc_usdt_1h.csv",
) -> dict:
    df = _load_data(csv_path)
    snapshot = _snapshot_from_df(df)
    mtf = _get_mtf_snapshot(df)
    plan = _build_trade_plan(snapshot, mtf, df, context)
    q = (question or "").strip().lower()

    ema800_pattern = re.compile(
        r"(ema\s*800|ema800|800\s*ema|ausloes|auslos|ausl[o\u00f6]st|trigger)",
        re.IGNORECASE,
    )
    plan_pattern = re.compile(
        r"(plan|setup|entry|einstieg|trade|signal|long|short|stop|take profit|tp)",
        re.IGNORECASE,
    )
    tips_pattern = re.compile(r"(tipp|tips|idee|strategie)", re.IGNORECASE)
    score_pattern = re.compile(r"(score|qualitaet|qualität|wahrscheinlichkeit|confidence)", re.IGNORECASE)
    guardrail_pattern = re.compile(r"(guardrail|risiko|daily loss|verlust|limit|risk)", re.IGNORECASE)

    if ema800_pattern.search(q):
        answer = _ema800_answer(snapshot)
    elif score_pattern.search(q):
        answer = (
            f"Aktueller Signal-Score: {plan.signal_score}/100. "
            f"Trendlage: 1h={mtf.trend_1h}, 4h={mtf.trend_4h}, 1d={mtf.trend_1d}, "
            f"Alignment={mtf.aligned_direction}."
        )
    elif guardrail_pattern.search(q):
        if plan.guardrails.blocked:
            answer = "Guardrails blockieren Trades: " + " | ".join(plan.guardrails.reasons)
        else:
            answer = (
                f"Guardrails OK. Mindestscore {plan.guardrails.min_signal_score}, "
                f"aktueller Score {plan.guardrails.current_signal_score}."
            )
    elif plan_pattern.search(q):
        if plan.action == "wait":
            reason = " | ".join(plan.guardrails.reasons) if plan.guardrails.reasons else plan.thesis
            answer = f"Aktuell kein Trade-Setup. {reason}"
        else:
            answer = (
                f"Plan ({plan.timeframe}): {plan.action.upper()} bei {plan.entry:,.2f}, "
                f"SL {plan.stop_loss:,.2f}, TP1 {plan.take_profit_1:,.2f}, TP2 {plan.take_profit_2:,.2f}. "
                f"RR: {plan.risk_reward_tp1:.2f}/{plan.risk_reward_tp2:.2f}. "
                f"Groesse: {plan.position_size_units} Units bei {plan.risk_per_trade_pct}% Risiko. "
                f"Signal-Score: {plan.signal_score}/100."
            )
    elif tips_pattern.search(q):
        answer = _tips_answer(snapshot, mtf, plan)
    else:
        answer = (
            "Ich kann dir konkret helfen mit: "
            "1) EMA-Triggern (z. B. 'Bei welchem Preis liegt EMA 800?') "
            "2) Trading-Plan (Entry/SL/TP/Groesse) "
            "3) Signal-Score und Guardrail-Status."
        )

    return {
        "answer": answer,
        "snapshot": asdict(snapshot),
        "multi_timeframe": asdict(mtf),
        "plan": {
            **asdict(plan),
            "guardrails": asdict(plan.guardrails),
        },
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "disclaimer": (
            "Nur technische Einschaetzung und kein Finanz- oder Anlageberatungsangebot. "
            "Bitte eigenes Risikomanagement verwenden."
        ),
    }

