use axum::{Router, routing::get};
use crate::AppState;

pub mod dashboard;
pub mod restaurants;
pub mod collections;
pub mod inventory;
pub mod payments;
pub mod billing;
pub mod outstanding;
pub mod products;

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .route("/dashboard", get(dashboard::get_dashboard))
        .route("/restaurants", get(restaurants::get_restaurants))
        .route("/collections/today", get(collections::get_today_route))
        .route("/inventory", get(inventory::get_inventory))
        .route("/payments", get(payments::get_payments))
        .route("/billing", get(billing::get_invoices))
        .route("/outstanding", get(outstanding::get_outstanding))
        .route("/products", get(products::get_products))
}
