use axum::{extract::{State, Query, Extension}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Deserialize)]
pub struct RestaurantQuery {
    pub page: Option<i64>,
    pub search: Option<String>,
    pub status: Option<String>, // "active" | "inactive" | "all"
}

#[derive(Serialize, FromRow)]
pub struct Restaurant {
    pub id: String,
    pub name: String,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub phone: Option<String>,
    pub is_active: bool,
    pub credit_limit: f64,
    pub payment_terms_days: i32,
}

#[derive(Serialize)]
pub struct RestaurantsResponse {
    pub data: Vec<Restaurant>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

pub async fn get_restaurants(
    State(state): State<AppState>,
    Query(q): Query<RestaurantQuery>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<RestaurantsResponse>, StatusCode> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size: i64 = 25;
    let offset = (page - 1) * page_size;
    let search = q.search.unwrap_or_default();
    let search_pattern = format!("%{}%", search);

    // Filter by active status
    let active_filter: Option<bool> = match q.status.as_deref() {
        Some("active") => Some(true),
        Some("inactive") => Some(false),
        _ => None,
    };

    // Separate count: a page past the end has no row to carry a total, so a window
    // or CTE column reported 0 and broke the client's pagination.
    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::BIGINT FROM restaurants
        WHERE company_id = $1
          -- Soft-deleted rows stay for history but must not be listed or counted.
          AND deleted_at IS NULL
          AND ($2 = '' OR name ILIKE $2 OR phone ILIKE $2 OR contact_person ILIKE $2)
          AND ($3::BOOL IS NULL OR is_active = $3)
        "#,
    )
    .bind(tenant.0)
    .bind(&search_pattern)
    .bind(active_filter)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Restaurants count query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rows = sqlx::query_as::<_, Restaurant>(
        r#"
        SELECT
            id::TEXT AS id,
            name,
            address,
            contact_person,
            phone,
            is_active,
            CAST(credit_limit AS FLOAT8) AS credit_limit,
            payment_terms_days
        FROM restaurants
        WHERE company_id = $1
          AND deleted_at IS NULL
          AND ($2 = '' OR name ILIKE $2 OR phone ILIKE $2 OR contact_person ILIKE $2)
          AND ($3::BOOL IS NULL OR is_active = $3)
        ORDER BY name
        LIMIT $4 OFFSET $5
        "#,
    )
    .bind(tenant.0)
    .bind(&search_pattern)
    .bind(active_filter)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Restaurants query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(RestaurantsResponse {
        data: rows,
        total,
        page,
        page_size,
    }))
}
