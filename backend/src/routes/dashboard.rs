use axum::{extract::State, http::StatusCode, Json, Extension};
use serde::Serialize;
use sqlx::FromRow;
use crate::{AppState, TenantId};

#[derive(Serialize, FromRow)]
pub struct DashboardKpis {
    pub today_revenue: f64,
    pub total_stops: i64,
    pub completed_stops: i64,
    pub market_debt: f64,
    pub low_stock_count: i64,
}

#[derive(Serialize, FromRow)]
pub struct TrendPoint {
    pub payment_date: String,
    pub total_revenue: f64,
}

#[derive(Serialize)]
pub struct DashboardResponse {
    pub kpis: DashboardKpis,
    pub trend_7: Vec<TrendPoint>,
    pub trend_30: Vec<TrendPoint>,
}

pub async fn get_dashboard(
    State(state): State<AppState>,
    Extension(tenant): Extension<TenantId>,
) -> Result<Json<DashboardResponse>, StatusCode> {
    // All KPIs in one database round-trip, scoped to the caller's company.
    //
    // low_stock_count compares against products.min_stock_level (joined, not the
    // hardcoded threshold of 10 the previous version used) so it agrees with
    // /api/inventory, which is where the user clicks through to from this card.
    let kpi_row = sqlx::query_as::<_, DashboardKpis>(
        r#"
        SELECT
            CAST(COALESCE(
                (SELECT SUM(amount) FROM payments
                  WHERE payment_date = CURRENT_DATE AND company_id = $1), 0
            ) AS FLOAT8) AS today_revenue,
            (SELECT COUNT(*) FROM collections
              WHERE collection_date = CURRENT_DATE AND company_id = $1)::BIGINT
                AS total_stops,
            (SELECT COUNT(*) FROM collections
                WHERE collection_date = CURRENT_DATE
                AND company_id = $1
                AND status IN ('completed', 'verified'))::BIGINT AS completed_stops,
            CAST(COALESCE(
                (SELECT SUM(total_outstanding) FROM restaurant_outstanding
                  WHERE company_id = $1), 0
            ) AS FLOAT8) AS market_debt,
            (SELECT COUNT(*) FROM inventory i
               JOIN products p ON p.id = i.product_id
              WHERE i.company_id = $1
                AND i.quantity < COALESCE(p.min_stock_level, 0))::BIGINT
                AS low_stock_count
        "#
    )
    .bind(tenant.0)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Dashboard KPI query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Revenue trend — last 30 days (we slice for 7-day on the client)
    let trend_30 = sqlx::query_as::<_, TrendPoint>(
        r#"
        SELECT
            payment_date::TEXT AS payment_date,
            CAST(SUM(amount) AS FLOAT8) AS total_revenue
        FROM payments
        WHERE company_id = $1
          AND payment_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY payment_date
        ORDER BY payment_date
        "#
    )
    .bind(tenant.0)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Revenue trend query failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // 7-day slice: last 7 entries
    let trend_7 = trend_30
        .iter()
        .rev()
        .take(7)
        .rev()
        .map(|p| TrendPoint {
            payment_date: p.payment_date.clone(),
            total_revenue: p.total_revenue,
        })
        .collect();

    Ok(Json(DashboardResponse {
        kpis: kpi_row,
        trend_7,
        trend_30,
    }))
}
