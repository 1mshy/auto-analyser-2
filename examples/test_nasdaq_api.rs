/// Test NASDAQ API integration
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct NasdaqResponse {
    data: NasdaqData,
}

#[derive(Debug, Deserialize)]
struct NasdaqData {
    table: NasdaqTable,
}

#[derive(Debug, Deserialize)]
struct NasdaqTable {
    rows: Vec<NasdaqStock>,
}

#[derive(Debug, Deserialize)]
struct NasdaqStock {
    symbol: String,
    name: String,
    #[serde(rename = "marketCap")]
    market_cap: String,
}

fn parse_market_cap(market_cap_str: &str) -> Option<f64> {
    let cleaned = market_cap_str.replace(',', "");
    cleaned.parse::<f64>().ok()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Testing NASDAQ API Integration");
    println!("================================\n");

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let url = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=0";
    
    println!("Fetching from: {}", url);
    
    let response = client
        .get(url)
        .send()
        .await?
        .error_for_status()?;

    println!("✓ Response received (Status: 200)\n");

    let nasdaq_response: NasdaqResponse = response.json().await?;
    
    let total_stocks = nasdaq_response.data.table.rows.len();
    println!("✓ Parsed {} total stocks\n", total_stocks);

    // Parse and filter stocks with valid market cap
    let mut stocks: Vec<(String, String, f64)> = nasdaq_response
        .data
        .table
        .rows
        .into_iter()
        .filter_map(|stock| {
            let market_cap = parse_market_cap(&stock.market_cap)?;
            if !stock.symbol.is_empty() && market_cap > 0.0 {
                Some((stock.symbol, stock.name, market_cap))
            } else {
                None
            }
        })
        .collect();

    println!("✓ Filtered to {} stocks with valid market cap\n", stocks.len());

    // Sort by market cap descending
    stocks.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());

    println!("Top 20 Stocks by Market Cap:");
    println!("{:<8} {:<50} {:>20}", "Symbol", "Name", "Market Cap");
    println!("{}", "-".repeat(80));
    
    for (symbol, name, market_cap) in stocks.iter().take(20) {
        let name_short = if name.len() > 47 {
            format!("{}...", &name[..47])
        } else {
            name.clone()
        };
        
        let cap_formatted = if *market_cap >= 1_000_000_000_000.0 {
            format!("${:.2}T", market_cap / 1_000_000_000_000.0)
        } else if *market_cap >= 1_000_000_000.0 {
            format!("${:.2}B", market_cap / 1_000_000_000.0)
        } else {
            format!("${:.2}M", market_cap / 1_000_000.0)
        };
        
        println!("{:<8} {:<50} {:>20}", symbol, name_short, cap_formatted);
    }

    println!("\n✓ NASDAQ API integration working correctly!");
    println!("\nThe analysis engine will now:");
    println!("  1. Fetch top 500 stocks by market cap from NASDAQ");
    println!("  2. Cache the list in memory");
    println!("  3. Fall back to cached/hardcoded list if API fails");
    println!("  4. Include market cap data in stock analysis");

    Ok(())
}
