use axum::{
    Router,
    routing::get,
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    extract::State,
};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use std::net::SocketAddr;

/// How many times to retry the initial database connection before giving up.
const DB_CONNECT_RETRIES: usize = 15;

#[cfg(test)]
use axum::body::Body;
#[cfg(test)]
use tower::ServiceExt;

mod routes;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub api_secret: String,
}

/// The company the caller is acting for.
///
/// The connection string uses the direct `postgres` role, which bypasses Row
/// Level Security entirely, so every query has to filter on this explicitly. It
/// arrives in the `X-Company-Id` header from the Next.js server, which reads it
/// from the caller's Clerk session claims.
#[derive(Clone, Copy, Debug)]
pub struct TenantId(pub uuid::Uuid);

/// Middleware: validate `X-Api-Key`, then resolve the tenant from
/// `X-Company-Id`.
///
/// There is deliberately no bypass. An earlier version skipped the check when
/// the secret equalled `dev-secret`, which meant forgetting to configure
/// `API_SECRET` silently disabled authentication entirely and exposed every
/// tenant's data. Startup now refuses to run without an explicit secret.
async fn require_api_key(
    State(state): State<AppState>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key = req
        .headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // Compared in constant time so the endpoint cannot be probed a byte at a time.
    if !constant_time_eq(key.as_bytes(), state.api_secret.as_bytes()) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // A valid key without a tenant would mean an unscoped query, which is exactly
    // the leak this header exists to prevent. Reject rather than default.
    let raw_tenant = req
        .headers()
        .get("x-company-id")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let tenant = uuid::Uuid::parse_str(raw_tenant).map_err(|_| StatusCode::UNAUTHORIZED)?;

    req.extensions_mut().insert(TenantId(tenant));

    Ok(next.run(req).await)
}

/// XOR-accumulate comparison. Length is leaked, which is not meaningful for a
/// shared secret, but the contents are not.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file
    dotenvy::dotenv().ok();
    dotenvy::from_path("backend/.env").ok();
    dotenvy::from_path("../backend/.env").ok();

    // Init tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "vasudha_api=debug,tower_http=info".into()),
        )
        .init();

    // Required env vars
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set. See backend/.env.example");

    // Fail closed: without an explicit secret the API would serve every tenant's
    // data to anyone who could reach the port.
    let api_secret = std::env::var("API_SECRET").unwrap_or_else(|_| {
        panic!("API_SECRET must be set. See backend/.env.example")
    });
    if api_secret.len() < 16 {
        panic!("API_SECRET must be at least 16 characters.");
    }

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse()
        .expect("PORT must be a valid number");

    // Connect with a connection pool (pre-warms connections for speed)
    tracing::info!("Connecting to database...");
    let connect_options: PgConnectOptions = database_url
        .parse::<PgConnectOptions>()?
        .application_name("vasudha-api");

    // Retry rather than exiting on the first failure: the database is often still
    // starting when this process comes up (docker compose, CI, a laptop waking
    // from sleep), and a crash loop there hides the real cause.
    let db = match PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect_with(connect_options.clone())
        .await
    {
        Ok(pool) => pool,
        Err(first) => {
            tracing::warn!(
                "Database not ready ({first}); retrying for up to {} seconds...",
                DB_CONNECT_RETRIES * 2
            );

            let mut last = first;
            let mut connected = None;

            for attempt in 1..=DB_CONNECT_RETRIES {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                match PgPoolOptions::new()
                    .max_connections(10)
                    .acquire_timeout(std::time::Duration::from_secs(10))
                    .connect_with(connect_options.clone())
                    .await
                {
                    Ok(pool) => {
                        tracing::info!("Connected on attempt {attempt}");
                        connected = Some(pool);
                        break;
                    }
                    Err(e) => last = e,
                }
            }

            match connected {
                Some(pool) => pool,
                None => {
                    return Err(anyhow::anyhow!(
                        "Failed to connect to database after {} attempts: {last}. \
                         Check DATABASE_URL, that the host is reachable, and that \
                         your IP is allowed in Supabase → Settings → Database → \
                         Connection pooler.",
                        DB_CONNECT_RETRIES + 1
                    ));
                }
            }
        }
    };

    // A cheap query proves the credentials work, not just that a socket opened.
    sqlx::query("SELECT 1")
        .execute(&db)
        .await
        .map_err(|e| anyhow::anyhow!("Database connected but the health query failed: {e}"))?;

    tracing::info!("Database connected ✓");

    let state = AppState { db, api_secret };

    // Build the router
    let api_routes = routes::api_routes()
        .route_layer(middleware::from_fn_with_state(state.clone(), require_api_key));

    let app = Router::new()
        .route("/health", get(health))
        .nest("/api", api_routes)
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any),
        );

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!("🚀 Vasudha API listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> &'static str {
    "OK"
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "an-example-secret-of-sufficient-length";

    fn request_with(method: &str, path: &str, headers: Vec<(&'static str, &'static str)>) -> Request<Body> {
        let mut req = Request::builder()
            .method(method)
            .uri(path)
            .body(Body::empty())
            .expect("valid request");
        for (name, value) in headers {
            req.headers_mut()
                .insert(axum::http::HeaderName::from_static(name), value.parse().unwrap());
        }
        req
    }

    fn valid_tenant() -> &'static str {
        "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    }

    /// Builds the router without a real database so the middleware can be
    /// exercised on its own. `PgPool::connect_lazy` does not open a socket.
    fn test_app() -> Router {
        let db = PgPool::connect_lazy("postgres://localhost/does-not-exist").unwrap();
        let state = AppState {
            db,
            api_secret: SECRET.to_string(),
        };

        let api_routes = routes::api_routes()
            .route_layer(middleware::from_fn_with_state(state.clone(), require_api_key));

        Router::new()
            .route("/health", get(health))
            .nest("/api", api_routes)
            .with_state(state)
    }

    async fn call(
        app: &Router,
        method: &str,
        path: &str,
        headers: Vec<(&'static str, &'static str)>,
    ) -> StatusCode {
        let res = app
            .clone()
            .oneshot(request_with(method, path, headers))
            .await
            .expect("router should respond");
        res.status()
    }

    #[test]
    fn constant_time_eq_matches_only_identical_input() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
        assert!(!constant_time_eq(b"", b"a"));
        assert!(constant_time_eq(b"", b""));
    }

    #[tokio::test]
    async fn health_needs_no_credentials() {
        assert_eq!(
            call(&test_app(), "GET", "/health", vec![]).await,
            StatusCode::OK,
        );
    }

    #[tokio::test]
    async fn rejects_missing_api_key() {
        let status = call(
            &test_app(),
            "GET",
            "/api/restaurants",
            vec![("x-company-id", valid_tenant())],
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_wrong_api_key() {
        let status = call(
            &test_app(),
            "GET",
            "/api/restaurants",
            vec![("x-api-key", "wrong"), ("x-company-id", valid_tenant())],
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    /// A correct key with no tenant would produce an unscoped query, which is the
    /// exact cross-tenant leak the header exists to prevent.
    #[tokio::test]
    async fn rejects_valid_key_without_tenant() {
        let status = call(&test_app(), "GET", "/api/restaurants", vec![("x-api-key", SECRET)]).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_valid_key_with_malformed_tenant() {
        for bad in ["", "not-a-uuid", "12345", "'; DROP TABLE users; --"] {
            let status = call(
                &test_app(),
                "GET",
                "/api/restaurants",
                vec![("x-api-key", SECRET), ("x-company-id", bad)],
            )
            .await;
            assert_eq!(
                status,
                StatusCode::UNAUTHORIZED,
                "tenant {bad:?} should have been rejected",
            );
        }
    }

    /// Every protected route must reject an unauthenticated caller, not just the
    /// ones exercised above.
    #[tokio::test]
    async fn all_protected_routes_require_auth() {
        for path in [
            "/api/dashboard",
            "/api/restaurants",
            "/api/products",
            "/api/collections/today",
            "/api/inventory",
            "/api/payments",
            "/api/billing",
            "/api/outstanding",
        ] {
            let status = call(&test_app(), "GET", path, vec![]).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED, "{path} was not protected");
        }
    }

    /// With a valid key and tenant the request reaches the handler. The handler
    /// then fails on the (nonexistent) database, so anything other than 401
    /// proves the middleware let it through.
    #[tokio::test]
    async fn accepts_valid_key_and_tenant() {
        let status = call(
            &test_app(),
            "GET",
            "/api/restaurants",
            vec![("x-api-key", SECRET), ("x-company-id", valid_tenant())],
        )
        .await;
        assert_ne!(status, StatusCode::UNAUTHORIZED);
    }
}
