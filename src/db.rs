use crate::models::{Stock, StockAnalysis, StockFilter, MarketSummary};
use anyhow::Result;
use chrono::{DateTime, Utc};
use futures::stream::StreamExt;
use mongodb::{
    bson::{doc, Document},
    options::{ClientOptions, ServerApi, ServerApiVersion, FindOptions},
    Client, Collection, Database,
};

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
        let analysis_collection: Collection<StockAnalysis> = 
            database.collection("stock_analysis");
        
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
        
        match collection.find_one(doc! { "symbol": symbol }).await? {
            Some(analysis) => Ok(Some(analysis)),
            None => Ok(None),
        }
    }

    pub async fn get_latest_analyses(&self, filter: StockFilter) -> Result<Vec<StockAnalysis>> {
        let collection = self.analysis_collection();
        let mut filter_doc = Document::new();

        if let Some(min_price) = filter.min_price {
            filter_doc.insert("price", doc! { "$gte": min_price });
        }
        if let Some(max_price) = filter.max_price {
            filter_doc.insert("price", doc! { "$lte": max_price });
        }
        if let Some(min_volume) = filter.min_volume {
            filter_doc.insert("volume", doc! { "$gte": min_volume });
        }
        if let Some(min_mc) = filter.min_market_cap {
            filter_doc.insert("market_cap", doc! { "$gte": min_mc });
        }
        if let Some(max_mc) = filter.max_market_cap {
            filter_doc.insert("market_cap", doc! { "$lte": max_mc });
        }
        if let Some(min_rsi) = filter.min_rsi {
            filter_doc.insert("rsi", doc! { "$gte": min_rsi });
        }
        if let Some(max_rsi) = filter.max_rsi {
            filter_doc.insert("rsi", doc! { "$lte": max_rsi });
        }
        if let Some(sectors) = filter.sectors {
            if !sectors.is_empty() {
                filter_doc.insert("sector", doc! { "$in": sectors });
            }
        }
        if let Some(true) = filter.only_oversold {
            filter_doc.insert("is_oversold", true);
        }
        if let Some(true) = filter.only_overbought {
            filter_doc.insert("is_overbought", true);
        }

        // Build sort document
        let sort_field = filter.sort_by.as_deref().unwrap_or("market_cap");
        let sort_order = if filter.sort_order.as_deref() == Some("asc") { 1 } else { -1 };
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
        let mut filter_doc = Document::new();

        if let Some(min_price) = filter.min_price {
            filter_doc.insert("price", doc! { "$gte": min_price });
        }
        if let Some(max_price) = filter.max_price {
            filter_doc.insert("price", doc! { "$lte": max_price });
        }
        if let Some(min_volume) = filter.min_volume {
            filter_doc.insert("volume", doc! { "$gte": min_volume });
        }
        if let Some(min_mc) = filter.min_market_cap {
            filter_doc.insert("market_cap", doc! { "$gte": min_mc });
        }
        if let Some(max_mc) = filter.max_market_cap {
            filter_doc.insert("market_cap", doc! { "$lte": max_mc });
        }
        if let Some(min_rsi) = filter.min_rsi {
            filter_doc.insert("rsi", doc! { "$gte": min_rsi });
        }
        if let Some(max_rsi) = filter.max_rsi {
            filter_doc.insert("rsi", doc! { "$lte": max_rsi });
        }
        if let Some(sectors) = filter.sectors {
            if !sectors.is_empty() {
                filter_doc.insert("sector", doc! { "$in": sectors });
            }
        }
        if let Some(true) = filter.only_oversold {
            filter_doc.insert("is_oversold", true);
        }
        if let Some(true) = filter.only_overbought {
            filter_doc.insert("is_overbought", true);
        }

        Ok(collection.count_documents(filter_doc).await?)
    }

    /// Get market summary with top gainers, losers, and highlights
    pub async fn get_market_summary(&self, limit: usize) -> Result<MarketSummary> {
        let collection = self.analysis_collection();
        let limit_i64 = limit as i64;

        // Top gainers (sorted by price_change_percent desc)
        let gainers_options = FindOptions::builder()
            .sort(doc! { "price_change_percent": -1 })
            .limit(limit_i64)
            .build();
        let mut gainers_cursor = collection
            .find(doc! { "price_change_percent": { "$exists": true, "$ne": null } })
            .with_options(gainers_options)
            .await?;
        let mut top_gainers = Vec::new();
        while let Some(doc) = gainers_cursor.next().await {
            if let Ok(analysis) = doc {
                if analysis.price_change_percent.unwrap_or(0.0) > 0.0 {
                    top_gainers.push(analysis);
                }
            }
        }

        // Top losers (sorted by price_change_percent asc)
        let losers_options = FindOptions::builder()
            .sort(doc! { "price_change_percent": 1 })
            .limit(limit_i64)
            .build();
        let mut losers_cursor = collection
            .find(doc! { "price_change_percent": { "$exists": true, "$ne": null } })
            .with_options(losers_options)
            .await?;
        let mut top_losers = Vec::new();
        while let Some(doc) = losers_cursor.next().await {
            if let Ok(analysis) = doc {
                if analysis.price_change_percent.unwrap_or(0.0) < 0.0 {
                    top_losers.push(analysis);
                }
            }
        }

        // Most oversold (RSI < 30, sorted by RSI asc)
        let oversold_options = FindOptions::builder()
            .sort(doc! { "rsi": 1 })
            .limit(limit_i64)
            .build();
        let mut oversold_cursor = collection
            .find(doc! { "rsi": { "$lt": 30.0, "$exists": true } })
            .with_options(oversold_options)
            .await?;
        let mut most_oversold = Vec::new();
        while let Some(doc) = oversold_cursor.next().await {
            if let Ok(analysis) = doc {
                most_oversold.push(analysis);
            }
        }

        // Most overbought (RSI > 70, sorted by RSI desc)
        let overbought_options = FindOptions::builder()
            .sort(doc! { "rsi": -1 })
            .limit(limit_i64)
            .build();
        let mut overbought_cursor = collection
            .find(doc! { "rsi": { "$gt": 70.0, "$exists": true } })
            .with_options(overbought_options)
            .await?;
        let mut most_overbought = Vec::new();
        while let Some(doc) = overbought_cursor.next().await {
            if let Ok(analysis) = doc {
                most_overbought.push(analysis);
            }
        }

        // Mega cap highlights (>$200B market cap, sorted by market cap desc)
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

        // Get total stock count
        let total_stocks = collection.count_documents(doc! {}).await? as usize;

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
        Ok(self.analysis_collection().estimated_document_count().await?)
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
