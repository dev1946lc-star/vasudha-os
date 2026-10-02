use axum::{extract::{State, Query, Extension}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Deserialize)]
pub struct PageQuery {
    pub page: Option<i64>,
}

#[derive(Serialize, FromRow)]
pub struct Invoice {
    pub id: String,
    pub invoice_number: String,
    pub restaurant_name: String,
    pub invoice_date: String,
    pub status: String,
    pub total_amount: f64,
    /// Drives the ageing and overdue clock. NOT NULL since migration 29.
    pub due_date: String,
    /// True once the bill has been approved. The deliveries behind it can no
    /// longer be edited, which is what makes "approved" mean something.
    pub is_frozen: bool,
}

#[derive(Serialize)]
pub struct InvoicesResponse {
    pub data: Vec<Invoice>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

pub async fn get_invoices(
    State(state): State<AppState>,
    Query(q): Query<PageQuery>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<InvoicesResponse>, StatusCode> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size: i64 = 25;
    let offset = (page - 1) * page_size;

    // Separate count: a page past the end has no row to carry a total.
    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::BIGINT
        FROM invoices i
        JOIN restaurants r
          ON r.id = i.restaurant_id
         AND r.company_id = i.company_id
         AND r.deleted_at IS NULL
        WHERE i.company_id = $1
        "#,
    )
    .bind(tenant.0)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Invoices count query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rows = sqlx::query_as::<_, Invoice>(
        r#"
        SELECT
            i.id::TEXT AS id,
            i.invoice_number AS invoice_number,
            r.name AS restaurant_name,
            i.invoice_date::TEXT AS invoice_date,
            COALESCE(i.status, 'unpaid') AS status,
            CAST(i.total_amount AS FLOAT8) AS total_amount,
            i.due_date::TEXT AS due_date,
            (i.approved_at IS NOT NULL) AS is_frozen
        FROM invoices i
        JOIN restaurants r
          ON r.id = i.restaurant_id
         AND r.company_id = i.company_id
         -- A soft-deleted restaurant keeps its invoices for the audit trail, but
         -- must not appear in the working billing list.
         AND r.deleted_at IS NULL
        WHERE i.company_id = $1
        ORDER BY i.invoice_date DESC, i.created_at DESC
        LIMIT $2 OFFSET $3
        "#
    )
    .bind(tenant.0)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Invoices query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(InvoicesResponse {
        data: rows,
        total,
        page,
        page_size,
    }))
}
