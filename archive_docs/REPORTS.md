# VASUDHA OS — Reports System

<p align="center">
  <strong>Financial Statements, Operational Auditing & PDF Exports</strong><br/>
  <em>A comprehensive guide to generating business intelligence reports</em>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Report Catalog](#report-catalog)
- [Daily Collection Report](#daily-collection-report)
- [Outstanding & Aging Report](#outstanding--aging-report)
- [GST Tax Ledger](#gst-tax-ledger)
- [Wastage & Stock Report](#wastage--stock-report)
- [Export Formats & Delivery](#export-formats--delivery)
- [Reporting Engine Architecture](#reporting-engine-architecture)

---

## Overview

The Reports system in VASUDHA OS processes transactional data (deliveries, sales, returns, and payments) into clean, printable reports. It serves as the primary tool for auditing field staff and calculating tax liabilities.

---

## Report Catalog

| Name | Frequency | Target User | Key Table Source | Export Formats |
|------|-----------|-------------|------------------|----------------|
| **Daily Collection** | Daily | Managers, Owners | `collections`, `collection_items` | PDF, CSV |
| **Outstanding & Aging** | On Demand | Accountants, Owners | `bills`, `payments` | PDF, CSV |
| **GST Tax Ledger** | Monthly | Accountants | `bill_items`, `bills` | CSV (Excel-ready) |
| **Wastage & Stock** | Weekly | Managers | `stock_adjustments`, `stock_entries` | PDF |
| **Agent Performance** | Weekly | Managers | `collections` | PDF |

---

## Daily Collection Report

This report summarizes daily activity for a single driver or across the whole company. It is used to verify loaded inventory against delivered inventory and cash collected.

### Schema Fields
*   `date`: Date of transactions
*   `agent_id`: Identifier of the collection agent
*   `total_delivered`: Cumulative count of products dropped off
*   `total_returned`: Cumulative empty cans/bottles collected back
*   `cash_collected`: Actual physical currency received
*   `upi_collected`: UPI online payments recorded

```
DAILY SUMMARY: 2026-07-06
Agent: Suresh Kumar
=====================================================
Product          Loaded   Delivered   Returned   In-Truck
-----------------------------------------------------
20L Water Can    200      180         150        20
1L Milk Packet   100      95          0          5
=====================================================
Total Sales Value: ₹11,850
Payments Collected: Cash: ₹8,000 | UPI: ₹3,000
```

---

## Outstanding & Aging Report

Classifies unpaid balances into time-based intervals (0–15 days, 16–30 days, 31–60 days, 60+ days) to help focus recovery efforts.

### Aging Formula

```dart
int getAgeInDays(DateTime dueDate) {
  return DateTime.now().difference(dueDate).inDays;
}
```

### Visual Breakdown
*   **0-15 Days (Current)**: Normal operating cycle. Displayed in Green.
*   **16-30 Days (Overdue)**: Soft follow-up via WhatsApp. Displayed in Yellow.
*   **31-60 Days (Critical)**: Require call or stop delivery. Displayed in Orange.
*   **60+ Days (Bad Debt Risk)**: Delivery blocked automatically. Displayed in Red.

---

## GST Tax Ledger

A structured ledger containing transactional details required for GSTR-1 and GSTR-3B filings in India.

### Output Structure
1.  **GSTIN of Customer**: (15-character ID)
2.  **Place of Supply**: State Code (e.g. "08" for Rajasthan)
3.  **Taxable Value**: Price before tax
4.  **CGST Rate / Amount**: Central Tax (usually 2.5% or 9%)
5.  **SGST Rate / Amount**: State Tax (usually 2.5% or 9%)
6.  **IGST Rate / Amount**: Integrated Tax for inter-state deliveries

---

## Wastage & Stock Report

Identifies physical stock loss patterns to detect theft or cold chain equipment failure.

### Loss Indicators
*   **Spoilage**: Exceeded shelf-life limit
*   **Damaged**: Physical handling breaks (broken crates)
*   **Variance**: Difference found during end-of-week physical count audits

---

## Export Formats & Delivery

1.  **PDF (Portrait/Landscape)**: Formatted for standard A4 printing. Includes company headers, total values, and signature fields.
2.  **CSV / Excel**: Raw, unformatted records optimized for loading into accounting software like Tally Prime or Zoho Books.
3.  **Direct WhatsApp Sharing**: Text-based summaries sent directly to delivery agents or managers.

---

## Reporting Engine Architecture

```dart
abstract class BaseReport {
  String get reportName;
  Future<List<Map<String, dynamic>>> queryData(Database db, Map<String, dynamic> params);
  Future<String> exportToCSV(List<Map<String, dynamic>> data);
  Future<Uint8List> exportToPDF(List<Map<String, dynamic>> data);
}
```

---

<p align="center">
  <strong>VASUDHA OS Reports</strong> — Data-driven operational clarity. 📊
</p>
