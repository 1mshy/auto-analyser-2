//! Pure condition-tree evaluator.
//!
//! `evaluate(group, ctx)` walks an AND/OR/NOT tree of `Condition`s against a
//! single `StockAnalysis` snapshot plus optional previous state (needed for
//! MACD cross detection). Side-effect free, so it's trivially testable.

use crate::models::StockAnalysis;
use crate::notifications::models::{Condition, ConditionGroup};

/// Evaluation context for a single `(rule, symbol)` check.
pub struct EvalContext<'a> {
    pub analysis: &'a StockAnalysis,
    /// Previous cycle's MACD histogram for this rule+symbol, if any.
    pub prev_macd_histogram: Option<f64>,
}

/// Evaluate the full tree. Returns (matched, per-leaf human descriptions of
/// which conditions fired — used to render the notification body).
pub fn evaluate(group: &ConditionGroup, ctx: &EvalContext) -> (bool, Vec<String>) {
    let mut matches = Vec::new();
    let ok = eval_inner(group, ctx, &mut matches);
    (ok, matches)
}

fn eval_inner(
    group: &ConditionGroup,
    ctx: &EvalContext,
    matched: &mut Vec<String>,
) -> bool {
    match group {
        ConditionGroup::And { children } => {
            // Collect matches from children only if the whole AND passes.
            let mut local = Vec::new();
            for child in children {
                if !eval_inner(child, ctx, &mut local) {
                    return false;
                }
            }
            matched.extend(local);
            true
        }
        ConditionGroup::Or { children } => {
            // Record matches from any child that fires, but require at least one.
            let mut any = false;
            for child in children {
                let mut local = Vec::new();
                if eval_inner(child, ctx, &mut local) {
                    any = true;
                    matched.extend(local);
                }
            }
            any
        }
        ConditionGroup::Not { child } => {
            let mut scratch = Vec::new();
            let inner = eval_inner(child, ctx, &mut scratch);
            !inner
        }
        ConditionGroup::Leaf { condition } => {
            if let Some(desc) = eval_condition(condition, ctx) {
                matched.push(desc);
                true
            } else {
                false
            }
        }
    }
}

/// Returns `Some(description)` if the leaf fires, `None` otherwise.
fn eval_condition(c: &Condition, ctx: &EvalContext) -> Option<String> {
    let a = ctx.analysis;
    match c {
        Condition::RsiBelow { value } => {
            a.rsi.filter(|r| r < value).map(|r| format!("RSI {:.1} < {}", r, value))
        }
        Condition::RsiAbove { value } => {
            a.rsi.filter(|r| r > value).map(|r| format!("RSI {:.1} > {}", r, value))
        }
        Condition::PriceBelow { value } => {
            if a.price < *value {
                Some(format!("Price ${:.2} < ${}", a.price, value))
            } else {
                None
            }
        }
        Condition::PriceAbove { value } => {
            if a.price > *value {
                Some(format!("Price ${:.2} > ${}", a.price, value))
            } else {
                None
            }
        }
        Condition::PriceChangePctBelow { value } => {
            a.price_change_percent
                .filter(|p| p < value)
                .map(|p| format!("Day change {:.2}% < {}%", p, value))
        }
        Condition::PriceChangePctAbove { value } => {
            a.price_change_percent
                .filter(|p| p > value)
                .map(|p| format!("Day change {:.2}% > {}%", p, value))
        }
        Condition::Near52WeekLow { within_pct } => {
            let low = a
                .technicals
                .as_ref()
                .and_then(|t| t.fifty_two_week_low)?;
            if low <= 0.0 {
                return None;
            }
            let delta_pct = ((a.price - low).abs() / low) * 100.0;
            if delta_pct <= *within_pct {
                Some(format!(
                    "Within {:.2}% of 52w low (${:.2})",
                    delta_pct, low
                ))
            } else {
                None
            }
        }
        Condition::Near52WeekHigh { within_pct } => {
            let high = a
                .technicals
                .as_ref()
                .and_then(|t| t.fifty_two_week_high)?;
            if high <= 0.0 {
                return None;
            }
            let delta_pct = ((high - a.price).abs() / high) * 100.0;
            if delta_pct <= *within_pct {
                Some(format!(
                    "Within {:.2}% of 52w high (${:.2})",
                    delta_pct, high
                ))
            } else {
                None
            }
        }
        Condition::MacdBullishCross => {
            let curr = a.macd.as_ref().map(|m| m.histogram)?;
            let prev = ctx.prev_macd_histogram?;
            if prev <= 0.0 && curr > 0.0 {
                Some(format!(
                    "MACD bullish cross (histogram {:.3} → {:.3})",
                    prev, curr
                ))
            } else {
                None
            }
        }
        Condition::MacdBearishCross => {
            let curr = a.macd.as_ref().map(|m| m.histogram)?;
            let prev = ctx.prev_macd_histogram?;
            if prev >= 0.0 && curr < 0.0 {
                Some(format!(
                    "MACD bearish cross (histogram {:.3} → {:.3})",
                    prev, curr
                ))
            } else {
                None
            }
        }
        Condition::StochasticKBelow { value } => a
            .stochastic
            .as_ref()
            .map(|s| s.k_line)
            .filter(|k| k < value)
            .map(|k| format!("Stochastic %K {:.1} < {}", k, value)),
        Condition::StochasticKAbove { value } => a
            .stochastic
            .as_ref()
            .map(|s| s.k_line)
            .filter(|k| k > value)
            .map(|k| format!("Stochastic %K {:.1} > {}", k, value)),
        Condition::BollingerBandwidthBelow { value } => a
            .bollinger
            .as_ref()
            .map(|b| b.bandwidth)
            .filter(|b| b < value)
            .map(|b| format!("Bollinger bandwidth {:.4} < {}", b, value)),
        Condition::IsOversold => {
            if a.is_oversold {
                Some("Oversold".into())
            } else {
                None
            }
        }
        Condition::IsOverbought => {
            if a.is_overbought {
                Some("Overbought".into())
            } else {
                None
            }
        }
        Condition::VolumeAbove { value } => a
            .volume
            .filter(|v| v > value)
            .map(|v| format!("Volume {:.0} > {}", v, value)),
        Condition::SectorEquals { sector } => match &a.sector {
            Some(s) if s.eq_ignore_ascii_case(sector) => {
                Some(format!("Sector = {}", sector))
            }
            _ => None,
        },
        Condition::DropFromHighPct { value } => {
            let high = a
                .technicals
                .as_ref()
                .and_then(|t| t.fifty_two_week_high)?;
            if high <= 0.0 {
                return None;
            }
            let drop_pct = ((high - a.price) / high) * 100.0;
            if drop_pct >= *value {
                Some(format!(
                    "Down {:.2}% from 52w high (${:.2})",
                    drop_pct, high
                ))
            } else {
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        BollingerBands, MACDIndicator, NasdaqTechnicals, StochasticOscillator, StockAnalysis,
    };
    use chrono::Utc;

    fn base() -> StockAnalysis {
        StockAnalysis {
            id: None,
            symbol: "AAPL".into(),
            price: 100.0,
            price_change: None,
            price_change_percent: None,
            rsi: None,
            sma_20: None,
            sma_50: None,
            macd: None,
            volume: None,
            market_cap: None,
            sector: None,
            is_oversold: false,
            is_overbought: false,
            analyzed_at: Utc::now(),
            bollinger: None,
            stochastic: None,
            earnings: None,
            technicals: None,
            news: None,
        }
    }

    fn ctx<'a>(a: &'a StockAnalysis, prev: Option<f64>) -> EvalContext<'a> {
        EvalContext {
            analysis: a,
            prev_macd_histogram: prev,
        }
    }

    fn leaf(c: Condition) -> ConditionGroup {
        ConditionGroup::Leaf { condition: c }
    }

    #[test]
    fn rsi_below_fires() {
        let mut a = base();
        a.rsi = Some(22.0);
        let (ok, m) = evaluate(&leaf(Condition::RsiBelow { value: 30.0 }), &ctx(&a, None));
        assert!(ok);
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn rsi_below_doesnt_fire() {
        let mut a = base();
        a.rsi = Some(45.0);
        let (ok, _) = evaluate(&leaf(Condition::RsiBelow { value: 30.0 }), &ctx(&a, None));
        assert!(!ok);
    }

    #[test]
    fn rsi_missing_never_fires() {
        let a = base();
        let (ok, _) = evaluate(&leaf(Condition::RsiBelow { value: 30.0 }), &ctx(&a, None));
        assert!(!ok);
    }

    #[test]
    fn price_bounds() {
        let mut a = base();
        a.price = 42.0;
        assert!(evaluate(&leaf(Condition::PriceBelow { value: 50.0 }), &ctx(&a, None)).0);
        assert!(!evaluate(&leaf(Condition::PriceBelow { value: 40.0 }), &ctx(&a, None)).0);
        assert!(evaluate(&leaf(Condition::PriceAbove { value: 40.0 }), &ctx(&a, None)).0);
    }

    #[test]
    fn price_change_pct() {
        let mut a = base();
        a.price_change_percent = Some(-3.5);
        assert!(evaluate(&leaf(Condition::PriceChangePctBelow { value: -2.0 }), &ctx(&a, None)).0);
        assert!(!evaluate(&leaf(Condition::PriceChangePctBelow { value: -5.0 }), &ctx(&a, None)).0);
    }

    fn with_tech(hi: f64, lo: f64) -> NasdaqTechnicals {
        NasdaqTechnicals {
            exchange: None,
            sector: None,
            industry: None,
            one_year_target: None,
            todays_high: None,
            todays_low: None,
            share_volume: None,
            average_volume: None,
            previous_close: None,
            fifty_two_week_high: Some(hi),
            fifty_two_week_low: Some(lo),
            pe_ratio: None,
            forward_pe: None,
            eps: None,
            annualized_dividend: None,
            ex_dividend_date: None,
            dividend_pay_date: None,
            current_yield: None,
            last_sale_price: None,
            net_change: None,
            percentage_change: None,
        }
    }

    #[test]
    fn near_52w_low_true_and_false() {
        let mut a = base();
        a.price = 101.0;
        a.technicals = Some(with_tech(200.0, 100.0));
        // 1% above low → fires at within_pct=2
        assert!(evaluate(&leaf(Condition::Near52WeekLow { within_pct: 2.0 }), &ctx(&a, None)).0);
        // But not at within_pct=0.5
        assert!(!evaluate(&leaf(Condition::Near52WeekLow { within_pct: 0.5 }), &ctx(&a, None)).0);
    }

    #[test]
    fn near_52w_low_without_technicals_never_fires() {
        let mut a = base();
        a.price = 100.0;
        a.technicals = None;
        assert!(!evaluate(&leaf(Condition::Near52WeekLow { within_pct: 100.0 }), &ctx(&a, None)).0);
    }

    #[test]
    fn near_52w_high_fires() {
        let mut a = base();
        a.price = 198.0;
        a.technicals = Some(with_tech(200.0, 100.0));
        assert!(evaluate(&leaf(Condition::Near52WeekHigh { within_pct: 2.0 }), &ctx(&a, None)).0);
    }

    #[test]
    fn drop_from_high_fires() {
        let mut a = base();
        a.price = 150.0;
        a.technicals = Some(with_tech(200.0, 100.0));
        // 25% down from high
        assert!(evaluate(&leaf(Condition::DropFromHighPct { value: 20.0 }), &ctx(&a, None)).0);
        assert!(!evaluate(&leaf(Condition::DropFromHighPct { value: 30.0 }), &ctx(&a, None)).0);
    }

    #[test]
    fn macd_bullish_cross_needs_prev() {
        let mut a = base();
        a.macd = Some(MACDIndicator {
            macd_line: 1.0,
            signal_line: 0.5,
            histogram: 0.5,
        });
        // Without prev histogram, don't fire (avoid false positives on first cycle).
        assert!(!evaluate(&leaf(Condition::MacdBullishCross), &ctx(&a, None)).0);
        // Prev negative → cross fires.
        assert!(evaluate(&leaf(Condition::MacdBullishCross), &ctx(&a, Some(-0.2))).0);
        // Prev also positive → no cross.
        assert!(!evaluate(&leaf(Condition::MacdBullishCross), &ctx(&a, Some(0.1))).0);
    }

    #[test]
    fn macd_bearish_cross() {
        let mut a = base();
        a.macd = Some(MACDIndicator {
            macd_line: -0.2,
            signal_line: 0.1,
            histogram: -0.3,
        });
        assert!(evaluate(&leaf(Condition::MacdBearishCross), &ctx(&a, Some(0.2))).0);
        assert!(!evaluate(&leaf(Condition::MacdBearishCross), &ctx(&a, Some(-0.1))).0);
    }

    #[test]
    fn stochastic_and_bollinger() {
        let mut a = base();
        a.stochastic = Some(StochasticOscillator {
            k_line: 15.0,
            d_line: 18.0,
        });
        a.bollinger = Some(BollingerBands {
            upper_band: 110.0,
            lower_band: 90.0,
            middle_band: 100.0,
            bandwidth: 0.02,
        });
        assert!(evaluate(&leaf(Condition::StochasticKBelow { value: 20.0 }), &ctx(&a, None)).0);
        assert!(!evaluate(&leaf(Condition::StochasticKAbove { value: 80.0 }), &ctx(&a, None)).0);
        assert!(evaluate(&leaf(Condition::BollingerBandwidthBelow { value: 0.05 }), &ctx(&a, None)).0);
    }

    #[test]
    fn is_oversold_overbought() {
        let mut a = base();
        a.is_oversold = true;
        assert!(evaluate(&leaf(Condition::IsOversold), &ctx(&a, None)).0);
        assert!(!evaluate(&leaf(Condition::IsOverbought), &ctx(&a, None)).0);
    }

    #[test]
    fn sector_equals_case_insensitive() {
        let mut a = base();
        a.sector = Some("Technology".into());
        assert!(evaluate(&leaf(Condition::SectorEquals { sector: "technology".into() }), &ctx(&a, None)).0);
        assert!(!evaluate(&leaf(Condition::SectorEquals { sector: "healthcare".into() }), &ctx(&a, None)).0);
    }

    #[test]
    fn volume_above() {
        let mut a = base();
        a.volume = Some(2_000_000.0);
        assert!(evaluate(&leaf(Condition::VolumeAbove { value: 1_000_000.0 }), &ctx(&a, None)).0);
    }

    #[test]
    fn and_group_requires_all() {
        let mut a = base();
        a.rsi = Some(25.0);
        a.price_change_percent = Some(-4.0);
        let g = ConditionGroup::And {
            children: vec![
                leaf(Condition::RsiBelow { value: 30.0 }),
                leaf(Condition::PriceChangePctBelow { value: -2.0 }),
            ],
        };
        let (ok, matches) = evaluate(&g, &ctx(&a, None));
        assert!(ok);
        assert_eq!(matches.len(), 2);

        a.price_change_percent = Some(1.0);
        let (ok2, _) = evaluate(&g, &ctx(&a, None));
        assert!(!ok2);
    }

    #[test]
    fn or_group_accepts_any() {
        let mut a = base();
        a.rsi = Some(75.0);
        let g = ConditionGroup::Or {
            children: vec![
                leaf(Condition::RsiBelow { value: 30.0 }),
                leaf(Condition::IsOverbought),
            ],
        };
        a.is_overbought = true;
        let (ok, matches) = evaluate(&g, &ctx(&a, None));
        assert!(ok);
        assert_eq!(matches.len(), 1);
    }

    #[test]
    fn not_group_inverts() {
        let mut a = base();
        a.rsi = Some(50.0);
        let g = ConditionGroup::Not {
            child: Box::new(leaf(Condition::RsiBelow { value: 30.0 })),
        };
        assert!(evaluate(&g, &ctx(&a, None)).0);
    }

    #[test]
    fn nested_tree() {
        // (RSI < 30 OR near 52w low) AND NOT overbought
        let mut a = base();
        a.rsi = Some(22.0);
        a.technicals = Some(with_tech(200.0, 100.0));
        a.price = 101.0;
        let g = ConditionGroup::And {
            children: vec![
                ConditionGroup::Or {
                    children: vec![
                        leaf(Condition::RsiBelow { value: 30.0 }),
                        leaf(Condition::Near52WeekLow { within_pct: 5.0 }),
                    ],
                },
                ConditionGroup::Not {
                    child: Box::new(leaf(Condition::IsOverbought)),
                },
            ],
        };
        assert!(evaluate(&g, &ctx(&a, None)).0);
    }
}
