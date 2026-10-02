use axum::{extract::{State, Query, Extension}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Deserialize)]
pub struct PageQuery {
    pub page: Option<i64>,
}

#[derive(Serialize, FromRow)]
pub struct Payment {
    pub id: String,
    pub restaurant_name: String,
    pub payment_mode: Option<String>,
    pub payment_date: String,
    pub reference_number: Option<String>,
    pub amount: f64,
}

#[derive(Serialize)]
pub struct PaymentsResponse {
    pub data: Vec<Payment>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

pub async fn get_payments(
    State(state): State<AppState>,
    Query(q): Query<PageQuery>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<PaymentsResponse>, StatusCode> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size: i64 = 25;
    let offset = (page - 1) * page_size;

    // Separate count for the same reason as the other paginated endpoints: a page
    // past the end has no row to carry a total.
    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::BIGINT
        FROM payments p
        JOIN restaurants r ON r.id = p.restaurant_id AND r.company_id = p.company_id
        WHERE p.company_id = $1
        "#,
    )
    .bind(tenant.0)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Payments count query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rows = sqlx::query_as::<_, Payment>(
        r#"
        SELECT
            p.id::TEXT AS id,
            r.name AS restaurant_name,
            p.payment_mode,
            p.payment_date::TEXT AS payment_date,
            p.reference_number,
            CAST(p.amount AS FLOAT8) AS amount
        FROM payments p
        JOIN restaurants r ON r.id = p.restaurant_id AND r.company_id = p.company_id
        WHERE p.company_id = $1
        ORDER BY p.payment_date DESC, p.created_at DESC
        LIMIT $2 OFFSET $3
        "#
    )
    .bind(tenant.0)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Payments query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(PaymentsResponse {
        data: rows,
        total,
        page,
        page_size,
    }))
}
