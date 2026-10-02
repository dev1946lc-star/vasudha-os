# VASUDHA OS — API Specification

<p align="center">
  <strong>Internal & External API Contracts</strong><br/>
  <em>Repository APIs (v1.0) + REST API specification (v2.0)</em>
</p>

---

## Table of Contents

- [API Architecture](#api-architecture)
- [Internal Repository APIs (v1.0)](#internal-repository-apis-v10)
- [REST API Specification (v2.0)](#rest-api-specification-v20)
- [Authentication API](#authentication-api)
- [Restaurant API](#restaurant-api)
- [Collection API](#collection-api)
- [Billing API](#billing-api)
- [Payment API](#payment-api)
- [Inventory API](#inventory-api)
- [Report API](#report-api)
- [Error Codes](#error-codes)
- [Pagination & Filtering](#pagination--filtering)
- [Versioning Strategy](#versioning-strategy)
- [Rate Limiting](#rate-limiting)

---

## API Architecture

### v1.0: Internal Repository API

In v1.0, VASUDHA OS is a purely offline app. The "API" is the **repository interface** between the domain layer and the data layer. These contracts define how business logic accesses data.

```
Presentation → Use Cases → Repository Interface → Repository Implementation → SQLite
```

### v2.0: REST API (Future)

In v2.0, a REST API will be introduced for cloud synchronization, multi-device access, and the web dashboard.

```
Mobile App → REST API → Cloud Backend → PostgreSQL
                ↕
Mobile App → Local Repository → SQLite (offline fallback)
```

---

## Internal Repository APIs (v1.0)

### RestaurantRepository

```dart
abstract class RestaurantRepository {
  /// Get all active restaurants
  /// Returns: List<Restaurant> sorted by name
  Future<Result<List<Restaurant>, Failure>> getAll();

  /// Get a single restaurant by ID
  /// Throws NotFoundFailure if ID doesn't exist
  Future<Result<Restaurant, Failure>> getById(String id);

  /// Search restaurants by name, owner, mobile, or address
  /// Supports partial matching (LIKE '%query%')
  Future<Result<List<Restaurant>, Failure>> search(String query);

  /// Create a new restaurant
  /// Validates: name required, mobile required, mobile format
  Future<Result<Restaurant, Failure>> create(Restaurant restaurant);

  /// Update an existing restaurant
  /// Only active and inactive restaurants can be updated
  Future<Result<Restaurant, Failure>> update(Restaurant restaurant);

  /// Soft-delete a restaurant
  /// Sets deleted_at; preserves historical data
  Future<Result<void, Failure>> delete(String id);

  /// Get restaurants by area/zone
  Future<Result<List<Restaurant>, Failure>> getByArea(String areaId);

  /// Get restaurants by status
  Future<Result<List<Restaurant>, Failure>> getByStatus(RestaurantStatus status);

  /// Get restaurant statistics (total billed, paid, outstanding, last collection)
  Future<Result<RestaurantStats, Failure>> getStats(String restaurantId);

  /// Get paginated restaurant list with filters
  Future<Result<PaginatedList<Restaurant>, Failure>> getPaginated({
    int page = 1,
    int pageSize = 50,
    String? searchQuery,
    String? areaId,
    RestaurantStatus? status,
    String sortBy = 'name',
    bool ascending = true,
  });
}
```

### CollectionRepository

```dart
abstract class CollectionRepository {
  /// Get today's collection list for a specific agent
  Future<Result<List<Collection>, Failure>> getDailyCollections({
    required String agentId,
    required DateTime date,
  });

  /// Create a new collection with items
  /// Validates: restaurant exists, products exist, quantities > 0
  /// Side effect: Deducts inventory for each collection item
  Future<Result<Collection, Failure>> create(Collection collection);

  /// Update collection status
  /// Enforces status workflow: pending → in_progress → completed → verified
  Future<Result<Collection, Failure>> updateStatus(
    String collectionId,
    CollectionStatus newStatus,
  );

  /// Get collection summary for a date range
  Future<Result<CollectionSummary, Failure>> getSummary({
    required DateTime startDate,
    required DateTime endDate,
    String? agentId,
    String? areaId,
  });

  /// Get collections for a specific restaurant
  Future<Result<List<Collection>, Failure>> getByRestaurant(
    String restaurantId, {
    DateTime? startDate,
    DateTime? endDate,
  });
}
```

### BillingRepository

```dart
abstract class BillingRepository {
  /// Generate bills from collections for a billing period
  /// Creates one bill per restaurant with all collection items
  Future<Result<List<Bill>, Failure>> generateBills({
    required DateTime periodStart,
    required DateTime periodEnd,
    String? restaurantId, // null = all restaurants
  });

  /// Approve a draft bill (transitions draft → approved)
  Future<Result<Bill, Failure>> approveBill(String billId, String approvedBy);

  /// Generate PDF for a bill
  /// Returns path to generated PDF file
  Future<Result<String, Failure>> generatePdf(String billId);

  /// Get bills with filters
  Future<Result<List<Bill>, Failure>> getBills({
    String? restaurantId,
    BillStatus? status,
    DateTime? startDate,
    DateTime? endDate,
  });

  /// Get GST report data for a period
  Future<Result<GstReport, Failure>> getGstReport({
    required DateTime startDate,
    required DateTime endDate,
  });
}
```

### PaymentRepository

```dart
abstract class PaymentRepository {
  /// Record a new payment
  /// Side effect: Updates bill's paid_amount and status
  /// If payment exceeds bill balance, excess is marked as advance
  Future<Result<Payment, Failure>> recordPayment(Payment payment);

  /// Get outstanding balance for a restaurant
  Future<Result<Outstanding, Failure>> getOutstanding(String restaurantId);

  /// Get aging analysis for all restaurants or a specific one
  Future<Result<List<AgingRecord>, Failure>> getAgingAnalysis({
    String? restaurantId,
  });

  /// Get payment history with filters
  Future<Result<List<Payment>, Failure>> getPayments({
    String? restaurantId,
    String? billId,
    PaymentMode? mode,
    DateTime? startDate,
    DateTime? endDate,
  });

  /// Generate payment receipt PDF
  Future<Result<String, Failure>> generateReceipt(String paymentId);
}
```

### InventoryRepository

```dart
abstract class InventoryRepository {
  /// Get current stock levels for all products
  Future<Result<List<StockLevel>, Failure>> getCurrentStock();

  /// Add stock entry (purchase, return, opening)
  /// Side effect: Increases product's current stock
  Future<Result<StockEntry, Failure>> addStock(StockEntry entry);

  /// Record stock adjustment (wastage, damage, correction)
  Future<Result<StockAdjustment, Failure>> adjustStock(StockAdjustment adjustment);

  /// Get stock movement history for a product
  Future<Result<List<StockMovement>, Failure>> getStockHistory(
    String productId, {
    DateTime? startDate,
    DateTime? endDate,
  });

  /// Get products with stock below minimum level
  Future<Result<List<LowStockAlert>, Failure>> getLowStockAlerts();
}
```

---

## REST API Specification (v2.0)

### Base URL

```
Production:  https://api.vasudha-os.com/v1
Staging:     https://staging-api.vasudha-os.com/v1
```

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
Accept: application/json
X-Device-Id: <device-uuid>
X-App-Version: 2.0.0
```

---

## Authentication API

### POST /auth/register

Register a new company and owner account.

**Request**:
```json
{
  "company_name": "Sharma Water Supply",
  "owner_name": "Rajesh Sharma",
  "mobile": "9876543210",
  "pin": "1234",
  "city": "Jaipur",
  "state": "Rajasthan"
}
```

**Response** (201 Created):
```json
{
  "status": "success",
  "data": {
    "company_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "dGhpcyBpcyBhIHJl...",
    "expires_at": "2026-07-06T18:30:00Z"
  }
}
```

### POST /auth/login

```json
{
  "mobile": "9876543210",
  "pin": "1234",
  "device_id": "abc-def-123"
}
```

### POST /auth/refresh

```json
{
  "refresh_token": "dGhpcyBpcyBhIHJl..."
}
```

### POST /auth/logout

```
Authorization: Bearer <token>
```

---

## Restaurant API

### GET /restaurants

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 50 | Items per page (max 100) |
| search | string | — | Search by name, mobile, address |
| area_id | uuid | — | Filter by area |
| status | enum | — | Filter by status |
| sort_by | string | name | Sort field |
| order | string | asc | Sort direction (asc/desc) |

**Response** (200 OK):
```json
{
  "status": "success",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "name": "Hotel Rajdhani",
      "owner_name": "Suresh Kumar",
      "mobile": "9876543211",
      "address": "23, MG Road, Jaipur",
      "area": {
        "id": "area-001",
        "name": "MG Road"
      },
      "payment_cycle": "monthly",
      "credit_limit": 50000.00,
      "outstanding_balance": 12500.00,
      "status": "active",
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 234,
    "total_pages": 5
  }
}
```

### POST /restaurants

### GET /restaurants/:id

### PUT /restaurants/:id

### DELETE /restaurants/:id

---

## Collection API

### GET /collections

### POST /collections

**Request**:
```json
{
  "restaurant_id": "550e8400-e29b-41d4-a716-446655440010",
  "collection_date": "2026-07-06",
  "route_id": "route-001",
  "items": [
    {
      "product_id": "prod-001",
      "quantity": 10,
      "unit_price": 50.00
    },
    {
      "product_id": "prod-002",
      "quantity": 5,
      "unit_price": 30.00,
      "returned_quantity": 1,
      "return_reason": "Damaged seal"
    }
  ],
  "notes": "Owner not available, delivered to staff"
}
```

**Response** (201 Created):
```json
{
  "status": "success",
  "data": {
    "id": "coll-001",
    "collection_number": "COL-20260706-001",
    "restaurant_id": "550e8400-e29b-41d4-a716-446655440010",
    "total_amount": 650.00,
    "return_amount": 30.00,
    "net_amount": 620.00,
    "status": "completed",
    "items": [
      {
        "product_id": "prod-001",
        "product_name": "20L Water Can",
        "quantity": 10,
        "unit_price": 50.00,
        "amount": 500.00,
        "returned_quantity": 0,
        "net_quantity": 10,
        "net_amount": 500.00
      },
      {
        "product_id": "prod-002",
        "product_name": "1L Milk Packet",
        "quantity": 5,
        "unit_price": 30.00,
        "amount": 150.00,
        "returned_quantity": 1,
        "return_reason": "Damaged seal",
        "net_quantity": 4,
        "net_amount": 120.00
      }
    ]
  }
}
```

### PATCH /collections/:id/status

---

## Billing API

### POST /bills/generate

### GET /bills

### GET /bills/:id

### GET /bills/:id/pdf

### PATCH /bills/:id/approve

---

## Payment API

### POST /payments

**Request**:
```json
{
  "restaurant_id": "550e8400-e29b-41d4-a716-446655440010",
  "bill_id": "bill-001",
  "amount": 5000.00,
  "payment_mode": "upi",
  "payment_date": "2026-07-06",
  "reference_number": "UPI-REF-123456"
}
```

### GET /payments

### GET /payments/:id/receipt

---

## Inventory API

### GET /inventory/stock

### POST /inventory/stock-entry

### POST /inventory/adjustment

### GET /inventory/low-stock

---

## Report API

### GET /reports/daily-summary

**Query Parameters**: `date`

### GET /reports/outstanding

**Query Parameters**: `area_id`, `min_amount`

### GET /reports/aging

### GET /reports/sales

**Query Parameters**: `start_date`, `end_date`, `group_by` (product/restaurant/area)

### GET /reports/gst

**Query Parameters**: `start_date`, `end_date`

### GET /reports/collection-performance

**Query Parameters**: `start_date`, `end_date`, `agent_id`

---

## Error Codes

### Standard Error Response

```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid",
    "details": [
      {
        "field": "mobile",
        "message": "Mobile number must be 10 digits starting with 6-9"
      }
    ]
  }
}
```

### Error Code Reference

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 400 | `VALIDATION_ERROR` | Request body validation failed |
| 400 | `INVALID_STATE_TRANSITION` | Invalid status change (e.g., draft → paid) |
| 400 | `INSUFFICIENT_STOCK` | Not enough stock for collection |
| 400 | `CREDIT_LIMIT_EXCEEDED` | Restaurant credit limit exceeded |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| 401 | `TOKEN_EXPIRED` | JWT token has expired |
| 401 | `INVALID_PIN` | Incorrect PIN |
| 401 | `ACCOUNT_LOCKED` | Too many failed attempts |
| 403 | `FORBIDDEN` | User doesn't have permission for this action |
| 404 | `NOT_FOUND` | Requested resource not found |
| 409 | `DUPLICATE_ENTRY` | Record already exists (unique constraint) |
| 409 | `SYNC_CONFLICT` | Conflicting changes during sync |
| 422 | `BUSINESS_RULE_VIOLATION` | Business logic constraint violated |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `SERVICE_UNAVAILABLE` | Server temporarily unavailable |

---

## Pagination & Filtering

### Pagination Response Format

```json
{
  "pagination": {
    "page": 2,
    "per_page": 50,
    "total": 234,
    "total_pages": 5,
    "has_next": true,
    "has_prev": true
  }
}
```

### Filter Operators

| Operator | Query Param | Example | Description |
|----------|------------|---------|-------------|
| Equals | `field=value` | `status=active` | Exact match |
| In | `field=a,b,c` | `status=active,inactive` | Any of listed values |
| Range | `field_min=x&field_max=y` | `amount_min=100&amount_max=500` | Range filter |
| Date Range | `start_date&end_date` | `start_date=2026-01-01&end_date=2026-06-30` | Date range |
| Search | `search=text` | `search=sharma` | Full-text search |
| Sort | `sort_by=field&order=asc` | `sort_by=created_at&order=desc` | Sorting |

---

## Versioning Strategy

### URL-Based Versioning

```
/v1/restaurants    ← Version 1
/v2/restaurants    ← Version 2 (future)
```

### Version Deprecation Policy

1. New API version released → Old version supported for **12 months**
2. Deprecation warning header added to old version: `Sunset: Sat, 01 Jul 2028 00:00:00 GMT`
3. After sunset date → Old version returns `410 Gone`

---

## Rate Limiting

### Rate Limits (v2.0)

| Endpoint Category | Rate Limit | Window |
|-------------------|-----------|--------|
| Authentication | 10 requests | 1 minute |
| Read (GET) | 100 requests | 1 minute |
| Write (POST/PUT/DELETE) | 50 requests | 1 minute |
| Report Generation | 10 requests | 1 minute |
| Sync | 5 requests | 1 minute |
| PDF Generation | 20 requests | 1 minute |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1720288800
```

---

<p align="center">
  <strong>VASUDHA OS API Specification</strong> — Clean contracts for reliable data access. 🔌
</p>
