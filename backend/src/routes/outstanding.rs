use axum::{extract::{State, Extension}, http::StatusCode, Json};
use serde::Serialize;
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Serialize, FromRow)]
pub struct OutstandingRow {
    pub restaurant_id: String,
    pub restaurant_name: String,
    pub phone: Option<String>,
    pub unpaid_invoice_count: i64,
    /// Not yet due. Separate from the overdue buckets because "not yet due" is not
    /// the same claim as "recently due", and merging them inflates 0-15.
    pub bucket_current: f64,
    pub bucket_0_15: f64,
    pub bucket_15_30: f64,
    pub bucket_30_60: f64,
    pub bucket_60_plus: f64,
    pub total_outstanding: f64,
}

#[derive(Serialize)]
pub struct OutstandingResponse {
    pub rows: Vec<OutstandingRow>,
    pub total_outstanding: f64,
    pub restaurants_with_debt: i64,
}

pub async fn get_outstanding(
    State(state): State<AppState>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<OutstandingResponse>, StatusCode> {
    let rows = sqlx::query_as::<_, OutstandingRow>(
        r#"
        SELECT
            o.restaurant_id::TEXT AS restaurant_id,
            o.restaurant_name AS restaurant_name,
            o.phone,
            COALESCE(o.unpaid_invoice_count, 0)::BIGINT AS unpaid_invoice_count,
            CAST(COALESCE(o.bucket_current, 0) AS FLOAT8) AS bucket_current,
            CAST(COALESCE(o.bucket_0_15, 0) AS FLOAT8) AS bucket_0_15,
            CAST(COALESCE(o.bucket_15_30, 0) AS FLOAT8) AS bucket_15_30,
            CAST(COALESCE(o.bucket_30_60, 0) AS FLOAT8) AS bucket_30_60,
            CAST(COALESCE(o.bucket_60_plus, 0) AS FLOAT8) AS bucket_60_plus,
            CAST(COALESCE(o.total_outstanding, 0) AS FLOAT8) AS total_outstanding
        FROM restaurant_outstanding o
        WHERE o.company_id = $1
        ORDER BY o.total_outstanding DESC
        "#
    )
    .bind(tenant.0)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Outstanding query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let total_outstanding: f64 = rows.iter().map(|r| r.total_outstanding).sum();
    let restaurants_with_debt = rows.iter().filter(|r| r.total_outstanding > 0.0).count() as i64;

    Ok(Json(OutstandingResponse {
        rows,
        total_outstanding,
        restaurants_with_debt,
    }))
}
