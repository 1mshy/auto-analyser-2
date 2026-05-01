use crate::models::{
    AggregatedNewsItem, MarketSummary, SectorPerformance, Stock, StockAnalysis, StockFilter,
};
use anyhow::Result;
use chrono::{DateTime, Utc};
use futures::stream::StreamExt;
use mongodb::{
    bson::{doc, Bson, Document, Regex},
    options::{ClientOptions, FindOptions, ServerApi, ServerApiVersion},
    Client, Collection, Database,
};

/// Escape regex metacharacters so the `symbol_search` filter only ever does
/// substring matching. Symbols are alphanumeric in practice but we treat the
/// input as untrusted.
fn escape_regex(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        if matches!(
            c,
            '.' | '+'
                | '*'
                | '?'
                | '('
                | ')'
                | '|'
                | '['
                | ']'
                | '{'
                | '}'
                | '^'
                | '$'
                | '\\'
                | '/'
        ) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Insert a `$gte` / `$lte` range predicate for `field`. Previous versions
/// called `filter_doc.insert(field, ...)` twice which silently overwrote the
/// min bound with the max bound; this helper merges them into a single doc.
fn insert_range(filter_doc: &mut Document, field: &str, min: Option<f64>, max: Option<f64>) {
    if min.is_none() && max.is_none() {
        return;
    }
    let mut range = Document::new();
    if let Some(lo) = min {
        range.insert("$gte", lo);
    }
    if let Some(hi) = max {
        range.insert("$lte", hi);
    }
    filter_doc.insert(field, range);
}

fn allowed_sort_field(sort_by: Option<&str>) -> &'static str {
    match sort_by {
        Some("price") => "price",
        Some("price_change_percent") => "price_change_percent",
        Some("rsi") => "rsi",
        Some("analyzed_at") => "analyzed_at",
        Some("volume") => "volume",
        Some("market_cap") | None => "market_cap",
        Some(_) => "market_cap",
    }
}

fn price_change_summary_filter(min: f64, max: Option<f64>) -> Document {
    let mut d = doc! { "$exists": true, "$ne": Bson::Null };
    d.insert("$gt", min);
    if let Some(max) = max {
        d.insert("$lte", max);
    }
    d
}

fn negative_price_change_summary_filter(max: f64, min: Option<f64>) -> Document {
    let mut d = doc! { "$exists": true, "$ne": Bson::Null };
    d.insert("$lt", max);
    if let Some(min) = min {
        d.insert("$gte", min);
    }
    d
}

/// Build a MongoDB filter document from a `StockFilter`. Pure function so we
/// can unit-test the shape without a live Mongo.
pub(crate) fn build_filter_doc(filter: &StockFilter) -> Document {
    let mut filter_doc = Document::new();

    insert_range(&mut filter_doc, "price", filter.min_price, filter.max_price);

    if let Some(min_volume) = filter.min_volume {
        filter_doc.insert("volume", doc! { "$gte": min_volume });
    }

    insert_range(
        &mut filter_doc,
        "market_cap",
        filter.min_market_cap,
        filter.max_market_cap,
    );
    insert_range(&mut filter_doc, "rsi", filter.min_rsi, filter.max_rsi);
    insert_range(
        &mut filter_doc,
        "stochastic.k_line",
        filter.min_stochastic_k,
        filter.max_stochastic_k,
    );
    insert_range(
        &mut filter_doc,
        "bollinger.bandwidth",
        filter.min_bandwidth,
        filter.max_bandwidth,
    );

    if let Some(sectors) = &filter.sectors {
        if !sectors.is_empty() {
            filter_doc.insert("sector", doc! { "$in": sectors.clone() });
        }
    }
    if let Some(true) = filter.only_oversold {
        filter_doc.insert("is_oversold", true);
    }
    if let Some(true) = filter.only_overbought {
        filter_doc.insert("is_overbought", true);
    }

    if let Some(q) = filter
        .symbol_search
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        filter_doc.insert(
            "symbol",
            Bson::RegularExpression(Regex {
                pattern: escape_regex(q),
                options: "i".to_string(),
            }),
        );
    }

    // Cap |price_change_percent| to drop runaway gainers/losers from the feed.
    if let Some(max_abs) = filter.max_abs_price_change_percent {
        let max_abs = max_abs.abs();
        filter_doc.insert(
            "price_change_percent",
            doc! { "$gte": -max_abs, "$lte": max_abs },
        );
    }

    filter_doc
}

#[derive(Clone)]
pub struct MongoDB {
    client: Client,
    database: Database,
}

impl MongoDB {
    pub async fn new(uri: &str, database_name: &str) -> Result<Self> {
        let mut client_options = ClientOptions::parse(uri).await?;

        // Set the server API version
        let server_api = ServerApi::builder().version(ServerApiVersion::V1).build();
        client_options.server_api = Some(server_api);

        let client = Client::with_options(client_options)?;

        // Test connection
        client
            .database("admin")
            .run_command(doc! { "ping": 1 })
            .await?;

        let database = client.database(database_name);

        // Create indexes
        Self::create_indexes(&database).await?;

        Ok(MongoDB { client, database })
    }

    async fn create_indexes(database: &Database) -> Result<()> {
        let analysis_collection: Collection<StockAnalysis> = database.collection("stock_analysis");

        // Create index on symbol for faster queries
        analysis_collection
            .create_index(
                mongodb::IndexModel::builder()
                    .keys(doc! { "symbol": 1 })
                    .build(),
            )
            .await?;

        // Create index on analyzed_at for time-based queries
        analysis_collection
            .create_index(
                mongodb::IndexModel::builder()
                    .keys(doc! { "analyzed_at": -1 })
                    .build(),
            )
            .await?;

        Ok(())
    }

    pub fn analysis_collection(&self) -> Collection<StockAnalysis> {
        self.database.collection("stock_analysis")
    }

    /// Raw handle to the Mongo database — exposed so sibling modules (e.g.
    /// `notifications::repo`) can register their own collections without
    /// cluttering `MongoDB` with notification-specific accessors.
    pub fn database(&self) -> &Database {
        &self.database
    }

    pub fn stocks_collection(&self) -> Collection<Stock> {
        self.database.collection("stocks")
    }

    pub async fn save_analysis(&self, analysis: &StockAnalysis) -> Result<()> {
        let collection = self.analysis_collection();

        // Update or insert
        collection
            .update_one(
                doc! { "symbol": &analysis.symbol },
                doc! { "$set": mongodb::bson::to_document(analysis)? },
            )
            .upsert(true)
            .await?;

        Ok(())
    }

    /// Get analysis for a specific symbol
    pub async fn get_analysis_by_symbol(&self, symbol: &str) -> Result<Option<StockAnalysis>> {
        let collection = self.analysis_collection();
        let symbol = crate::symbols::normalize_symbol_key(symbol);

        match collection.find_one(doc! { "symbol": symbol }).await? {
            Some(analysis) => Ok(Some(analysis)),
            None => Ok(None),
        }
    }

    pub async fn get_latest_analyses(&self, filter: StockFilter) -> Result<Vec<StockAnalysis>> {
        let collection = self.analysis_collection();
        let filter_doc = build_filter_doc(&filter);

        // Build sort document
        let sort_field = allowed_sort_field(filter.sort_by.as_deref());
        let sort_order = if filter.sort_order.as_deref() == Some("asc") {
            1
        } else {
            -1
        };
        let sort_doc = doc! { sort_field: sort_order };

        // Pagination
        let page = filter.page.unwrap_or(1).max(1) as i64;
        let page_size = filter.page_size.unwrap_or(50).min(200) as i64;
        let skip = (page - 1) * page_size;

        let find_options = FindOptions::builder()
            .sort(sort_doc)
            .skip(skip as u64)
            .limit(page_size)
            .build();

        let mut cursor = collection
            .find(filter_doc)
            .with_options(find_options)
            .await?;

        let mut results = Vec::new();
        while let Some(doc) = cursor.next().await {
            if let Ok(analysis) = doc {
                results.push(analysis);
            }
        }
        Ok(results)
    }

    /// Get total count for a filter (for pagination)
    pub async fn get_filtered_count(&self, filter: StockFilter) -> Result<u64> {
        let collection = self.analysis_collection();
        let filter_doc = build_filter_doc(&filter);
        Ok(collection.count_documents(filter_doc).await?)
    }

    /// Get market summary with top gainers, losers, and highlights
    /// Accepts optional filters for minimum market cap and maximum price change percent
    pub async fn get_market_summary(
        &self,
        limit: usize,
        min_market_cap: Option<f64>,
        max_price_change_percent: Option<f64>,
    ) -> Result<MarketSummary> {
        let collection = self.analysis_collection();
        let limit_i64 = limit as i64;

        // Build base filter document with optional market cap filter
        let mut base_filter = Document::new();
        if let Some(min_mc) = min_market_cap {
            base_filter.insert("market_cap", doc! { "$gte": min_mc });
        }

        // Build filter for gainers (positive change, within max threshold if set)
        let mut gainers_filter = base_filter.clone();
        gainers_filter.insert(
            "price_change_percent",
            price_change_summary_filter(0.0, max_price_change_percent),
        );

        // Top gainers (sorted by price_change_percent desc)
        let gainers_options = FindOptions::builder()
            .sort(doc! { "price_change_percent": -1 })
            .limit(limit_i64)
            .build();
        let mut gainers_cursor = collection
            .find(gainers_filter)
            .with_options(gainers_options)
            .await?;
        let mut top_gainers = Vec::new();
        while let Some(doc) = gainers_cursor.next().await {
            if let Ok(analysis) = doc {
                top_gainers.push(analysis);
            }
        }

        // Build filter for losers (negative change, within max threshold if set)
        let mut losers_filter = base_filter.clone();
        losers_filter.insert(
            "price_change_percent",
            negative_price_change_summary_filter(0.0, max_price_change_percent.map(|p| -p)),
        );

        // Top losers (sorted by price_change_percent asc)
        let losers_options = FindOptions::builder()
            .sort(doc! { "price_change_percent": 1 })
            .limit(limit_i64)
            .build();
        let mut losers_cursor = collection
            .find(losers_filter)
            .with_options(losers_options)
            .await?;
        let mut top_losers = Vec::new();
        while let Some(doc) = losers_cursor.next().await {
            if let Ok(analysis) = doc {
                top_losers.push(analysis);
            }
        }

        // Most oversold (RSI < 30, sorted by RSI asc) - apply market cap filter
        let mut oversold_filter = base_filter.clone();
        oversold_filter.insert("rsi", doc! { "$lt": 30.0, "$exists": true });
        let oversold_options = FindOptions::builder()
            .sort(doc! { "rsi": 1 })
            .limit(limit_i64)
            .build();
        let mut oversold_cursor = collection
            .find(oversold_filter)
            .with_options(oversold_options)
            .await?;
        let mut most_oversold = Vec::new();
        while let Some(doc) = oversold_cursor.next().await {
            if let Ok(analysis) = doc {
                most_oversold.push(analysis);
            }
        }

        // Most overbought (RSI > 70, sorted by RSI desc) - apply market cap filter
        let mut overbought_filter = base_filter.clone();
        overbought_filter.insert("rsi", doc! { "$gt": 70.0, "$exists": true });
        let overbought_options = FindOptions::builder()
            .sort(doc! { "rsi": -1 })
            .limit(limit_i64)
            .build();
        let mut overbought_cursor = collection
            .find(overbought_filter)
            .with_options(overbought_options)
            .await?;
        let mut most_overbought = Vec::new();
        while let Some(doc) = overbought_cursor.next().await {
            if let Ok(analysis) = doc {
                most_overbought.push(analysis);
            }
        }

        // Mega cap highlights (>$200B market cap, sorted by market cap desc)
        // Note: This section ignores the min_market_cap filter since it's specifically for mega caps
        let mega_cap_options = FindOptions::builder()
            .sort(doc! { "market_cap": -1 })
            .limit(limit_i64)
            .build();
        let mut mega_cursor = collection
            .find(doc! { "market_cap": { "$gte": 200_000_000_000.0 } })
            .with_options(mega_cap_options)
            .await?;
        let mut mega_cap_highlights = Vec::new();
        while let Some(doc) = mega_cursor.next().await {
            if let Ok(analysis) = doc {
                mega_cap_highlights.push(analysis);
            }
        }

        // Get total stock count (with market cap filter if applied)
        let total_stocks = if min_market_cap.is_some() {
            collection.count_documents(base_filter).await? as usize
        } else {
            collection.count_documents(doc! {}).await? as usize
        };

        Ok(MarketSummary {
            total_stocks,
            top_gainers,
            top_losers,
            most_oversold,
            most_overbought,
            mega_cap_highlights,
            generated_at: Utc::now(),
        })
    }

    pub async fn get_analysis_count(&self) -> Result<u64> {
        Ok(self
            .analysis_collection()
            .estimated_document_count()
            .await?)
    }

    /// Get the timestamp of the most recent analysis
    pub async fn get_latest_analysis_timestamp(&self) -> Result<Option<DateTime<Utc>>> {
        let collection = self.analysis_collection();

        let mut cursor = collection
            .find(doc! {})
            .sort(doc! { "analyzed_at": -1 })
            .limit(1)
            .await?;

        if let Some(doc) = cursor.next().await {
            if let Ok(analysis) = doc {
                return Ok(Some(analysis.analyzed_at));
            }
        }
        Ok(None)
    }

    /// Get sector performance aggregation
    pub async fn get_sector_performance(&self) -> Result<Vec<SectorPerformance>> {
        let collection = self.analysis_collection();

        // Get all analyses grouped by sector
        let mut sector_map: std::collections::HashMap<String, Vec<StockAnalysis>> =
            std::collections::HashMap::new();

        let mut cursor = collection
            .find(doc! { "sector": { "$exists": true, "$ne": null } })
            .await?;

        while let Some(doc) = cursor.next().await {
            if let Ok(analysis) = doc {
                if let Some(ref sector) = analysis.sector {
                    sector_map.entry(sector.clone()).or_default().push(analysis);
                }
            }
        }

        let mut results = Vec::new();
        for (sector, mut stocks) in sector_map {
            let stock_count = stocks.len() as u32;
            let avg_change_percent = stocks
                .iter()
                .filter_map(|s| s.price_change_percent)
                .sum::<f64>()
                / stocks
                    .iter()
                    .filter(|s| s.price_change_percent.is_some())
                    .count()
                    .max(1) as f64;
            let avg_rsi = stocks.iter().filter_map(|s| s.rsi).sum::<f64>()
                / stocks.iter().filter(|s| s.rsi.is_some()).count().max(1) as f64;

            // Sort by price_change_percent for top/bottom
            stocks.sort_by(|a, b| {
                b.price_change_percent
                    .unwrap_or(0.0)
                    .partial_cmp(&a.price_change_percent.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            let top_performers: Vec<StockAnalysis> = stocks.iter().take(3).cloned().collect();
            let bottom_performers: Vec<StockAnalysis> =
                stocks.iter().rev().take(3).cloned().collect();

            results.push(SectorPerformance {
                sector,
                stock_count,
                avg_change_percent,
                avg_rsi,
                top_performers,
                bottom_performers,
            });
        }

        // Sort sectors by avg_change_percent descending
        results.sort_by(|a, b| {
            b.avg_change_percent
                .partial_cmp(&a.avg_change_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(results)
    }

    /// Get aggregated news from all stocks
    pub async fn get_all_news(
        &self,
        sector: Option<String>,
        search: Option<String>,
        page: u32,
        page_size: u32,
    ) -> Result<(Vec<AggregatedNewsItem>, u64)> {
        let collection = self.analysis_collection();

        let mut filter_doc =
            doc! { "news": { "$exists": true, "$ne": null, "$not": { "$size": 0 } } };
        if let Some(ref s) = sector {
            filter_doc.insert("sector", s);
        }

        let mut cursor = collection.find(filter_doc).await?;

        let mut all_news: Vec<AggregatedNewsItem> = Vec::new();
        while let Some(doc) = cursor.next().await {
            if let Ok(analysis) = doc {
                if let Some(news_items) = analysis.news {
                    for item in news_items {
                        // Apply search filter
                        if let Some(ref query) = search {
                            let q = query.to_lowercase();
                            if !item.title.to_lowercase().contains(&q)
                                && !analysis.symbol.to_lowercase().contains(&q)
                            {
                                continue;
                            }
                        }
                        all_news.push(AggregatedNewsItem {
                            symbol: analysis.symbol.clone(),
                            sector: analysis.sector.clone(),
                            title: item.title,
                            url: item.url,
                            publisher: item.publisher,
                            created: item.created,
                            ago: item.ago,
                        });
                    }
                }
            }
        }

        // Sort by created date descending (most recent first)
        all_news.sort_by(|a, b| b.created.cmp(&a.created));

        let total = all_news.len() as u64;
        let skip = ((page - 1) * page_size) as usize;
        let paginated: Vec<AggregatedNewsItem> = all_news
            .into_iter()
            .skip(skip)
            .take(page_size as usize)
            .collect();

        Ok((paginated, total))
    }

    /// Get all analyses from the database
    pub async fn get_all_analyses(&self) -> Result<Vec<StockAnalysis>> {
        let collection = self.analysis_collection();
        let mut cursor = collection
            .find(doc! {})
            .sort(doc! { "analyzed_at": -1 })
            .await?;

        let mut results = Vec::new();
        while let Some(doc) = cursor.next().await {
            if let Ok(analysis) = doc {
                results.push(analysis);
            }
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_filter() -> StockFilter {
        StockFilter {
            min_price: None,
            max_price: None,
            min_volume: None,
            min_market_cap: None,
            max_market_cap: None,
            min_rsi: None,
            max_rsi: None,
            sectors: None,
            only_oversold: None,
            only_overbought: None,
            symbol_search: None,
            min_stochastic_k: None,
            max_stochastic_k: None,
            min_bandwidth: None,
            max_bandwidth: None,
            max_abs_price_change_percent: None,
            sort_by: None,
            sort_order: None,
            page: None,
            page_size: None,
        }
    }

    #[test]
    fn test_build_filter_doc_empty() {
        let d = build_filter_doc(&empty_filter());
        assert!(
            d.is_empty(),
            "Empty filter should produce empty doc, got {:?}",
            d
        );
    }

    #[test]
    fn test_price_range_merges_gte_and_lte() {
        // Regression: prior code called filter_doc.insert("price", ...) twice,
        // so the second call clobbered the first. The merged doc must contain
        // BOTH $gte and $lte for the same field.
        let mut f = empty_filter();
        f.min_price = Some(10.0);
        f.max_price = Some(500.0);
        let d = build_filter_doc(&f);

        let price = d.get_document("price").expect("price field must exist");
        assert_eq!(price.get_f64("$gte").unwrap(), 10.0);
        assert_eq!(price.get_f64("$lte").unwrap(), 500.0);
    }

    #[test]
    fn test_market_cap_range_merges() {
        let mut f = empty_filter();
        f.min_market_cap = Some(1e9);
        f.max_market_cap = Some(1e12);
        let d = build_filter_doc(&f);
        let mc = d.get_document("market_cap").unwrap();
        assert_eq!(mc.get_f64("$gte").unwrap(), 1e9);
        assert_eq!(mc.get_f64("$lte").unwrap(), 1e12);
    }

    #[test]
    fn test_rsi_range_merges() {
        let mut f = empty_filter();
        f.min_rsi = Some(30.0);
        f.max_rsi = Some(70.0);
        let d = build_filter_doc(&f);
        let rsi = d.get_document("rsi").unwrap();
        assert_eq!(rsi.get_f64("$gte").unwrap(), 30.0);
        assert_eq!(rsi.get_f64("$lte").unwrap(), 70.0);
    }

    #[test]
    fn test_only_min_side() {
        let mut f = empty_filter();
        f.min_price = Some(5.0);
        let d = build_filter_doc(&f);
        let price = d.get_document("price").unwrap();
        assert_eq!(price.get_f64("$gte").unwrap(), 5.0);
        assert!(price.get("$lte").is_none());
    }

    #[test]
    fn test_only_max_side() {
        let mut f = empty_filter();
        f.max_price = Some(50.0);
        let d = build_filter_doc(&f);
        let price = d.get_document("price").unwrap();
        assert!(price.get("$gte").is_none());
        assert_eq!(price.get_f64("$lte").unwrap(), 50.0);
    }

    #[test]
    fn test_nested_field_paths_merge() {
        let mut f = empty_filter();
        f.min_stochastic_k = Some(20.0);
        f.max_stochastic_k = Some(80.0);
        f.min_bandwidth = Some(1.0);
        f.max_bandwidth = Some(40.0);
        let d = build_filter_doc(&f);

        let stoch = d.get_document("stochastic.k_line").unwrap();
        assert_eq!(stoch.get_f64("$gte").unwrap(), 20.0);
        assert_eq!(stoch.get_f64("$lte").unwrap(), 80.0);

        let bw = d.get_document("bollinger.bandwidth").unwrap();
        assert_eq!(bw.get_f64("$gte").unwrap(), 1.0);
        assert_eq!(bw.get_f64("$lte").unwrap(), 40.0);
    }

    #[test]
    fn test_volume_only_has_gte() {
        let mut f = empty_filter();
        f.min_volume = Some(1_000_000.0);
        let d = build_filter_doc(&f);
        let vol = d.get_document("volume").unwrap();
        assert_eq!(vol.get_f64("$gte").unwrap(), 1_000_000.0);
    }

    #[test]
    fn test_sectors_in() {
        let mut f = empty_filter();
        f.sectors = Some(vec!["Technology".into(), "Healthcare".into()]);
        let d = build_filter_doc(&f);
        let sectors = d.get_document("sector").unwrap();
        let arr = sectors.get_array("$in").unwrap();
        assert_eq!(arr.len(), 2);
    }

    #[test]
    fn test_empty_sectors_skipped() {
        let mut f = empty_filter();
        f.sectors = Some(vec![]);
        let d = build_filter_doc(&f);
        assert!(d.get("sector").is_none());
    }

    #[test]
    fn test_only_oversold_flag() {
        let mut f = empty_filter();
        f.only_oversold = Some(true);
        let d = build_filter_doc(&f);
        assert_eq!(d.get_bool("is_oversold").unwrap(), true);

        // only_oversold=false should NOT produce a filter (we only filter when explicitly true)
        let mut f2 = empty_filter();
        f2.only_oversold = Some(false);
        let d2 = build_filter_doc(&f2);
        assert!(d2.get("is_oversold").is_none());
    }

    #[test]
    fn test_max_abs_price_change_percent_caps_both_sides() {
        let mut f = empty_filter();
        f.max_abs_price_change_percent = Some(25.0);
        let d = build_filter_doc(&f);
        let pct = d.get_document("price_change_percent").unwrap();
        assert_eq!(pct.get_f64("$gte").unwrap(), -25.0);
        assert_eq!(pct.get_f64("$lte").unwrap(), 25.0);
    }

    #[test]
    fn test_max_abs_price_change_percent_normalizes_negative_input() {
        // Defensive: accept a negative threshold as the absolute value.
        let mut f = empty_filter();
        f.max_abs_price_change_percent = Some(-15.0);
        let d = build_filter_doc(&f);
        let pct = d.get_document("price_change_percent").unwrap();
        assert_eq!(pct.get_f64("$gte").unwrap(), -15.0);
        assert_eq!(pct.get_f64("$lte").unwrap(), 15.0);
    }

    #[test]
    fn test_sort_field_allowlist_defaults_unknown_to_market_cap() {
        assert_eq!(allowed_sort_field(Some("price")), "price");
        assert_eq!(
            allowed_sort_field(Some("price_change_percent")),
            "price_change_percent"
        );
        assert_eq!(allowed_sort_field(Some("$where")), "market_cap");
        assert_eq!(allowed_sort_field(None), "market_cap");
    }

    #[test]
    fn test_market_summary_gainer_filter_preserves_null_guard_and_cap() {
        let pct = price_change_summary_filter(0.0, Some(25.0));
        assert_eq!(pct.get_bool("$exists").unwrap(), true);
        assert_eq!(pct.get("$ne"), Some(&Bson::Null));
        assert_eq!(pct.get_f64("$gt").unwrap(), 0.0);
        assert_eq!(pct.get_f64("$lte").unwrap(), 25.0);
    }

    #[test]
    fn test_market_summary_loser_filter_preserves_null_guard_and_cap() {
        let pct = negative_price_change_summary_filter(0.0, Some(-25.0));
        assert_eq!(pct.get_bool("$exists").unwrap(), true);
        assert_eq!(pct.get("$ne"), Some(&Bson::Null));
        assert_eq!(pct.get_f64("$lt").unwrap(), 0.0);
        assert_eq!(pct.get_f64("$gte").unwrap(), -25.0);
    }
}
