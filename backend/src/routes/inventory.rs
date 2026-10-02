use axum::{extract::{State, Extension}, http::StatusCode, Json};
use serde::Serialize;
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Serialize, FromRow)]
pub struct InventoryItem {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub hsn_code: Option<String>,
    pub quantity: f64,
    pub min_stock_level: f64,
    pub is_low_stock: bool,
    pub last_updated: String,
}

pub async fn get_inventory(
    State(state): State<AppState>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<Vec<InventoryItem>>, StatusCode> {
    let rows = sqlx::query_as::<_, InventoryItem>(
        r#"
        SELECT
            i.id::TEXT AS id,
            i.product_id::TEXT AS product_id,
            p.name AS product_name,
            p.hsn_code,
            CAST(i.quantity AS FLOAT8) AS quantity,
            CAST(COALESCE(p.min_stock_level, 0) AS FLOAT8) AS min_stock_level,
            -- ISO-8601 rather than Postgres' default TEXT rendering
            -- ("2026-10-01 13:26:14.293203+00"), which new Date() cannot parse.
            -- The inventory table rendered "Invalid Date" for every row.
            TO_CHAR(i.last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_updated,
            (i.quantity < COALESCE(p.min_stock_level, 0)) AS is_low_stock
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE i.company_id = $1
          AND p.company_id = $1
        ORDER BY
            (i.quantity < COALESCE(p.min_stock_level, 0)) DESC,
            p.name ASC
        "#
    )
    .bind(tenant.0)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Inventory query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(rows))
}
