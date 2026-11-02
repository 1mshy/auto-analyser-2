//! Run a brokerage export through the deterministic portfolio parser without
//! starting the server:
//!
//! ```bash
//! cargo run --example parse_portfolio -- /path/to/holdings.csv
//! ```
//!
//! Prints the decoded format, every holding the heuristic parser produced,
//! and the rows it skipped. Useful when a new broker's export doesn't map.

use auto_analyser_2::portfolio::{decode_document, parse_heuristic};

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: parse_portfolio <file>");
    let bytes = std::fs::read(&path).expect("read file");
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "upload".into());
    let doc = match decode_document(&name, &bytes) {
        Ok(doc) => doc,
        Err(e) => {
            eprintln!("cannot decode: {e}");
            std::process::exit(1);
        }
    };
    println!(
        "format: {}  chars: {}",
        doc.format,
        doc.text.chars().count()
    );
    let out = parse_heuristic(&doc.text);
    println!("parser: {:?}  holdings: {}", out.parser, out.holdings.len());
    for w in &out.warnings {
        println!("warning: {w}");
    }
    println!(
        "{:<8} {:<8} {:<4} {:>10} {:>12} {:>12} {:<4} {}",
        "symbol", "account", "ccy", "qty", "avg_cost", "mkt_value", "cdr", "description"
    );
    for h in &out.holdings {
        println!(
            "{:<8} {:<8} {:<4} {:>10} {:>12} {:>12} {:<4} {}",
            h.symbol,
            h.account.as_deref().unwrap_or("-"),
            h.currency.as_deref().unwrap_or("-"),
            h.quantity,
            h.avg_cost
                .map(|v| format!("{v:.4}"))
                .unwrap_or_else(|| "-".into()),
            h.market_value
                .map(|v| format!("{v:.2}"))
                .unwrap_or_else(|| "-".into()),
            if h.is_cdr { "yes" } else { "no" },
            h.description.as_deref().unwrap_or("")
        );
    }
    for s in &out.skipped {
        println!("skipped: {s}");
    }
}
