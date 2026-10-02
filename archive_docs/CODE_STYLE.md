# VASUDHA OS — Code Style & Guidelines

<p align="center">
  <strong>Standard Coding Conventions for Flutter & Supabase Development</strong><br/>
  <em>Ensuring maintainability, clean architecture, and safety</em>
</p>

---

## Table of Contents

- [Introduction](#introduction)
- [Dart & Flutter Guidelines](#dart--flutter-guidelines)
- [SQLite & SQL Style Guide](#sqlite--sql-style-guide)
- [Clean Architecture Code Structure](#clean-architecture-code-structure)
- [Error Handling Standards](#error-handling-standards)
- [Testing & Quality Assurance](#testing--quality-assurance)

---

## Introduction

This document outlines the coding standards, patterns, and conventions followed in VASUDHA OS. Adherence to these guidelines is mandatory for all code contributions to maintain codebase health, safety, and readability.

---

## Dart & Flutter Guidelines

### Naming Conventions

*   **Classes & Enums**: `PascalCase` (e.g. `CollectionRepository`, `PaymentMode`)
*   **Variables, Functions & Parameters**: `camelCase` (e.g. `netAmount`, `calculateTax()`)
*   **Files & Folders**: `snake_case` (e.g. `invoice_number_service.dart`, `kpi_card.dart`)
*   **Constants**: `camelCase` (prefixed with `k` is optional; choose consistent local style)

### Widget Rules
1.  **Prefer Const Constructors**: Add `const` prefix wherever possible to optimize rendering performance.
2.  **Separate UI from Business Logic**: UI files must only contain layout rules and event triggers. Business logic and status changes must live inside Riverpod StateNotifiers / Providers.
3.  **Encapsulation**: Extracted widgets must live in a local `widgets/` folder if they are only used inside one screen, or `core/presentation/widgets/` if shared globally.

---

## Supabase & SQL Style Guide

### Database Naming Standards
*   **Tables**: `snake_case` and plural (e.g. `restaurants`, `collection_items`)
*   **Columns**: `snake_case` and singular (e.g. `unit_price`, `due_date`)
*   **Indexes**: Format as `idx_{table_name}_{column_name}`

### Safe Query Rules
1.  **Supabase Client Filters**: Use the Supabase client builder methods to write type-safe queries. Never concatenate parameters into raw SQL scripts.
    ```dart
    // GOOD
    final response = await supabase.from('bills').select().eq('status', status);

    // BAD
    // final response = await supabase.rpc('raw_sql', {'query': 'SELECT * FROM bills WHERE status = ' + status});
    ```
2.  **Transactions**: Wrap complex write operations using RPC functions on PostgreSQL, or handle atomic operations within single API calls where possible.

---

## Clean Architecture Code Structure

Every new feature must fit within our Clean Architecture directories:

*   **Domain Layer (Pure Dart)**: Entities, Repository Contracts, Use cases. No Flutter framework dependencies.
*   **Data Layer (Platform-Specific)**: Models (JSON mapping), Datasources (Supabase API client calls), Repository implementations.
*   **Presentation Layer (Flutter UI)**: Widgets, Screens, Providers (Riverpod / ViewModels).

---

## Error Handling Standards

Never allow uncaught exceptions to crash the application.

### Result Pattern
Instead of throwing raw exceptions up the stack, wrap return values inside a custom monadic `Result` type.

```dart
abstract class Failure {
  final String message;
  Failure(this.message);
}

class DatabaseFailure extends Failure {
  DatabaseFailure(super.message);
}

class Result<S, F extends Failure> {
  // Encapsulates success (S) and failure (F) states
}
```

---

## Testing & Quality Assurance

### Testing Priorities
1.  **Domain Business Logic (Unit Tests)**: 100% test coverage target for usecases, validators, and calculations (like GST or aging calculation).
2.  **Supabase Integration Tests**: Run verification scripts using a local Docker-based Supabase instance (Supabase CLI) to validate schemas, RLS policies, and database triggers.

---

<p align="center">
  <strong>VASUDHA OS Code Style</strong> — Clean code, robust architecture. 💻
</p>
