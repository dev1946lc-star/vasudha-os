use axum::{extract::{State, Extension}, http::StatusCode, Json};
use serde::Serialize;
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Serialize, FromRow)]
pub struct RouteStop {
    pub restaurant_id: String,
    pub name: String,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub phone: Option<String>,
    pub collection_id: Option<String>,
    pub status: String,
    pub total_amount: f64,
}

#[derive(Serialize)]
pub struct TodayRouteResponse {
    pub stops: Vec<RouteStop>,
    pub total: i64,
    pub completed: i64,
    pub progress_percent: i64,
}

pub async fn get_today_route(
    State(state): State<AppState>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<TodayRouteResponse>, StatusCode> {
    // Active restaurants LEFT JOINED with today's collections. Both sides are
    // scoped: the join is on restaurant_id, so filtering r alone would be enough
    // for the result set, but c.company_id is asserted too so a mis-linked
    // collection can never leak in.
    let rows = sqlx::query_as::<_, RouteStop>(
        r#"
        SELECT
            r.id::TEXT AS restaurant_id,
            r.name AS name,
            r.address,
            r.contact_person,
            r.phone,
            c.id::TEXT AS collection_id,
            COALESCE(c.status, 'pending_visit') AS status,
            CAST(COALESCE(c.total_amount, 0) AS FLOAT8) AS total_amount
        FROM restaurants r
        LEFT JOIN collections c
            ON c.restaurant_id = r.id
            AND c.collection_date = CURRENT_DATE
            AND c.company_id = r.company_id
        WHERE r.is_active = TRUE
          AND r.company_id = $1
        ORDER BY r.name
        "#
    )
    .bind(tenant.0)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Today's route query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let total = rows.len() as i64;
    let completed = rows
        .iter()
        .filter(|r| r.status == "completed" || r.status == "verified")
        .count() as i64;
    let progress_percent = if total > 0 {
        (completed * 100) / total
    } else {
        0
    };

    Ok(Json(TodayRouteResponse {
        stops: rows,
        total,
        completed,
        progress_percent,
    }))
}
