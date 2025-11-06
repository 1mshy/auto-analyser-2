use crate::models::{Stock, StockAnalysis, StockFilter};
use anyhow::Result;
use futures::stream::StreamExt;
use mongodb::{
    bson::{doc, Document},
    options::{ClientOptions, ServerApi, ServerApiVersion},
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

        let mut cursor = collection
            .find(filter_doc)
            .sort(doc! { "analyzed_at": -1 })
            .limit(1000)
            .await?;

        let mut results = Vec::new();
        while let Some(doc) = cursor.next().await {
            if let Ok(analysis) = doc {
                results.push(analysis);
            }
        }
        Ok(results)
    }

    pub async fn get_analysis_count(&self) -> Result<u64> {
        Ok(self.analysis_collection().estimated_document_count().await?)
    }
}
