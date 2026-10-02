use axum::{extract::{State, Query, Extension}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Deserialize)]
pub struct ProductQuery {
    pub page: Option<i64>,
    pub search: Option<String>,
    pub status: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub hsn_code: String,
    pub gst_rate: f64,
    pub price: f64,
    pub is_active: bool,
    pub min_stock_level: f64,
}

#[derive(Serialize)]
pub struct ProductsResponse {
    pub data: Vec<Product>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

pub async fn get_products(
    State(state): State<AppState>,
    Query(q): Query<ProductQuery>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<ProductsResponse>, StatusCode> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size: i64 = 15;
    let offset = (page - 1) * page_size;
    let search = q.search.unwrap_or_default();
    let search_pattern = format!("%{}%", search);

    let active_filter: Option<bool> = match q.status.as_deref() {
        Some("active") => Some(true),
        Some("inactive") => Some(false),
        _ => None,
    };

    // The count is a separate query rather than a window or a CTE column: with a
// page past the end there is no row to carry the total, so `total` came back 0
// and the client's pagination collapsed. Two round-trips is the honest trade.
let total: i64 = sqlx::query_scalar(
    r#"
    SELECT COUNT(*)::BIGINT FROM products
    WHERE company_id = $1
      -- Soft-deleted rows stay for history but must not be listed or counted.
      AND deleted_at IS NULL
      AND ($2 = '' OR name ILIKE $2 OR hsn_code ILIKE $2)
      AND ($3::BOOL IS NULL OR is_active = $3)
    "#,
)
.bind(tenant.0)
    .bind(&search_pattern)
    .bind(active_filter)
    .fetch_one(&state.db)
.await
.map_err(|e| {
    tracing::error!("Products count query failed: {}", e);
    StatusCode::INTERNAL_SERVER_ERROR
})?;

let rows = sqlx::query_as::<_, Product>(
    r#"
    SELECT
        id::TEXT AS id,
        name,
        description,
        -- COALESCE required: hsn_code is nullable in the schema but this struct
        -- declares it non-nullable, so a bare NULL fails to decode and 500s the
        -- whole page.
        COALESCE(hsn_code, '') AS hsn_code,
        CAST(gst_rate AS FLOAT8) AS gst_rate,
        CAST(price AS FLOAT8) AS price,
        is_active,
        CAST(COALESCE(min_stock_level, 0) AS FLOAT8) AS min_stock_level
    FROM products
    WHERE company_id = $1
      AND deleted_at IS NULL
      AND ($2 = '' OR name ILIKE $2 OR hsn_code ILIKE $2)
      AND ($3::BOOL IS NULL OR is_active = $3)
    ORDER BY name
    LIMIT $4 OFFSET $5
    "#
)
.bind(tenant.0)
    .bind(&search_pattern)
    .bind(active_filter)
    .bind(page_size)
    .bind(offset)
.fetch_all(&state.db)
.await
.map_err(|e| {
    tracing::error!("Products query failed: {}", e);
    StatusCode::INTERNAL_SERVER_ERROR
})?;

Ok(Json(ProductsResponse {
        data: rows,
        total,
        page,
        page_size,
    }))
}
