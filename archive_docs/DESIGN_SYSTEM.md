# VASUDHA OS — Design System

<p align="center">
  <strong>Component Library, Design Tokens & Visual Language</strong><br/>
  <em>A unified design language for consistent, beautiful interfaces</em>
</p>

---

## Table of Contents

- [Design System Overview](#design-system-overview)
- [Color Palette](#color-palette)
- [Typography](#typography)
- [Spacing & Layout](#spacing--layout)
- [Elevation & Shadows](#elevation--shadows)
- [Border Radius](#border-radius)
- [Icon System](#icon-system)
- [Component Library](#component-library)
- [Dark Mode](#dark-mode)
- [Theming Architecture](#theming-architecture)
- [Motion & Animation](#motion--animation)

---

## Design System Overview

The VASUDHA OS Design System provides a consistent visual language across all screens and modules. It is built on **Material 3** with custom extensions tailored for Indian supply chain ERP use cases.

### Design Tokens

All visual properties are defined as tokens — single source of truth for colors, typography, spacing, and more. Never use hardcoded values; always reference tokens.

---

## Color Palette

### Primary Colors

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `primary` | `#1B5E20` | 27, 94, 32 | Primary brand color (deep green — earth/vasudha) |
| `primaryLight` | `#4C8C4A` | 76, 140, 74 | Lighter variant for backgrounds |
| `primaryDark` | `#003300` | 0, 51, 0 | Darker variant for text on primary |
| `primaryContainer` | `#C8E6C9` | 200, 230, 201 | Container/surface with primary tint |
| `onPrimary` | `#FFFFFF` | 255, 255, 255 | Text/icons on primary color |
| `onPrimaryContainer` | `#1B5E20` | 27, 94, 32 | Text on primary container |

### Secondary Colors

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `secondary` | `#0D47A1` | 13, 71, 161 | Accent actions, links, info |
| `secondaryContainer` | `#BBDEFB` | 187, 222, 251 | Container with secondary tint |
| `onSecondary` | `#FFFFFF` | 255, 255, 255 | Text on secondary |

### Tertiary Colors

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `tertiary` | `#E65100` | 230, 81, 0 | Warm accent for highlights |
| `tertiaryContainer` | `#FFE0B2` | 255, 224, 178 | Container with tertiary tint |

### Semantic Colors

| Token | Hex | Usage | Context |
|-------|-----|-------|---------|
| `success` | `#2E7D32` | Positive states | Paid, completed, active |
| `successContainer` | `#E8F5E9` | Success backgrounds | Success banners |
| `warning` | `#F57F17` | Warning states | Overdue, low stock |
| `warningContainer` | `#FFF8E1` | Warning backgrounds | Alert banners |
| `error` | `#C62828` | Error states | Failed, bounced, errors |
| `errorContainer` | `#FFEBEE` | Error backgrounds | Error banners |
| `info` | `#0277BD` | Informational | Tips, hints, neutral info |
| `infoContainer` | `#E1F5FE` | Info backgrounds | Info banners |

### Financial Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `moneyPositive` | `#2E7D32` | Income, payments received |
| `moneyNegative` | `#C62828` | Expenses, outstanding |
| `moneyNeutral` | `#37474F` | Neutral financial display |
| `moneyHighlight` | `#1B5E20` | Large KPI amounts |

### Surface Colors (Light Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#FAFAFA` | Page background |
| `surface` | `#FFFFFF` | Card/panel surfaces |
| `surfaceVariant` | `#F5F5F5` | Alternate surface |
| `outline` | `#BDBDBD` | Borders, dividers |
| `outlineVariant` | `#E0E0E0` | Subtle borders |
| `onBackground` | `#212121` | Text on background |
| `onSurface` | `#212121` | Text on surface |
| `onSurfaceVariant` | `#757575` | Secondary text |

### Status-Specific Colors

| Status | Badge BG | Badge Text | Dot Color |
|--------|----------|-----------|-----------|
| Active | `#E8F5E9` | `#2E7D32` | `#4CAF50` |
| Pending | `#FFF8E1` | `#F57F17` | `#FFC107` |
| Overdue | `#FFEBEE` | `#C62828` | `#F44336` |
| Completed | `#E8F5E9` | `#2E7D32` | `#4CAF50` |
| In Progress | `#E3F2FD` | `#1565C0` | `#2196F3` |
| Cancelled | `#F5F5F5` | `#757575` | `#9E9E9E` |
| Draft | `#FFF3E0` | `#E65100` | `#FF9800` |
| Verified | `#F3E5F5` | `#6A1B9A` | `#9C27B0` |

---

## Typography

### Font Family

| Weight | Family | Usage |
|--------|--------|-------|
| Primary | **Inter** | All body text, labels, inputs |
| Monospace | **JetBrains Mono** | Numbers, codes, amounts |
| Display | **Outfit** | Dashboard KPIs, large headlines |

### Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|------------|----------------|-------|
| `displayLarge` | 32sp | 700 (Bold) | 40dp | -0.5 | Dashboard KPI values |
| `displayMedium` | 28sp | 700 (Bold) | 36dp | -0.25 | Section headers |
| `displaySmall` | 24sp | 600 (SemiBold) | 32dp | 0 | Screen titles |
| `headlineLarge` | 22sp | 600 (SemiBold) | 28dp | 0 | Card titles |
| `headlineMedium` | 20sp | 600 (SemiBold) | 26dp | 0 | Dialog titles |
| `headlineSmall` | 18sp | 600 (SemiBold) | 24dp | 0 | Sub-section titles |
| `titleLarge` | 16sp | 600 (SemiBold) | 22dp | 0.15 | List item titles |
| `titleMedium` | 14sp | 600 (SemiBold) | 20dp | 0.1 | Card subtitles |
| `titleSmall` | 12sp | 600 (SemiBold) | 18dp | 0.1 | Small titles |
| `bodyLarge` | 16sp | 400 (Regular) | 24dp | 0.5 | Primary body text |
| `bodyMedium` | 14sp | 400 (Regular) | 20dp | 0.25 | Standard body text |
| `bodySmall` | 12sp | 400 (Regular) | 16dp | 0.4 | Secondary text |
| `labelLarge` | 14sp | 500 (Medium) | 20dp | 0.1 | Button labels |
| `labelMedium` | 12sp | 500 (Medium) | 16dp | 0.5 | Input labels |
| `labelSmall` | 10sp | 500 (Medium) | 14dp | 0.5 | Captions, badges |

### Currency Typography

| Context | Font | Size | Weight | Example |
|---------|------|------|--------|---------|
| KPI card (large) | Outfit | 32sp | 700 | ₹12,50,000 |
| Card amount | Inter | 18sp | 600 | ₹12,500 |
| List item amount | Inter | 16sp | 600 | ₹5,000 |
| Table cell | JetBrains Mono | 14sp | 400 | ₹5,000.00 |
| Inline amount | Inter | 14sp | 500 | ₹500 |

---

## Spacing & Layout

### Spacing Scale

```dart
class AppSpacing {
  static const double xs  = 4;
  static const double sm  = 8;
  static const double md  = 16;
  static const double lg  = 24;
  static const double xl  = 32;
  static const double xxl = 48;
  static const double xxxl = 64;
}
```

### Screen Padding

| Context | Horizontal | Vertical |
|---------|-----------|----------|
| Screen edge padding | 16dp | 16dp |
| Card internal padding | 16dp | 12dp |
| Section spacing | — | 24dp |
| Between cards | — | 12dp |
| Dialog padding | 24dp | 20dp |
| Bottom sheet padding | 16dp | 16dp |

### Grid System

| Device | Columns | Gutter | Margin |
|--------|---------|--------|--------|
| Phone | 4 | 16dp | 16dp |
| Tablet portrait | 8 | 16dp | 24dp |
| Tablet landscape | 12 | 24dp | 32dp |

---

## Elevation & Shadows

### Elevation Scale

| Level | Elevation | Shadow | Usage |
|-------|-----------|--------|-------|
| `level0` | 0dp | None | Flat surfaces, backgrounds |
| `level1` | 1dp | Subtle | Cards, list items |
| `level2` | 3dp | Medium | Raised buttons, app bar |
| `level3` | 6dp | Strong | FAB, floating elements |
| `level4` | 8dp | Heavy | Modals, dialogs |
| `level5` | 12dp | Maximum | Navigation drawer, bottom sheet |

### Shadow Definitions

```dart
class AppShadows {
  static const level1 = BoxShadow(
    color: Color(0x1A000000),  // 10% black
    blurRadius: 4,
    offset: Offset(0, 1),
  );

  static const level2 = BoxShadow(
    color: Color(0x26000000),  // 15% black
    blurRadius: 8,
    offset: Offset(0, 2),
  );

  static const level3 = BoxShadow(
    color: Color(0x33000000),  // 20% black
    blurRadius: 16,
    offset: Offset(0, 4),
  );
}
```

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `none` | 0dp | Sharp edges (tables, dividers) |
| `xs` | 4dp | Small elements (badges, chips) |
| `sm` | 8dp | Buttons, inputs |
| `md` | 12dp | Cards |
| `lg` | 16dp | Modals, bottom sheets |
| `xl` | 24dp | Large cards, containers |
| `full` | 999dp | Pills, circular buttons |

---

## Icon System

### Icon Library

| Category | Source | Style |
|----------|--------|-------|
| Primary | Material Symbols (Rounded) | Filled for active, outlined for inactive |
| Custom | SVG (flutter_svg) | For domain-specific icons |

### Icon Sizes

| Token | Size | Usage |
|-------|------|-------|
| `xs` | 16dp | Inline icons, badge icons |
| `sm` | 20dp | List item icons, input icons |
| `md` | 24dp | Standard icon size (default) |
| `lg` | 32dp | Card header icons |
| `xl` | 48dp | Empty state, feature icons |
| `xxl` | 64dp | Splash, onboarding |

### Domain-Specific Icons

| Icon | Usage | Description |
|------|-------|-------------|
| 🏪 | Restaurant | Storefront icon |
| 🚚 | Collection/Delivery | Truck icon |
| 📦 | Inventory | Box/package icon |
| 🧾 | Bill/Invoice | Receipt icon |
| 💰 | Payment | Money/coin icon |
| 📊 | Reports | Chart/graph icon |
| 👤 | User/Agent | Person icon |
| ⚙️ | Settings | Gear icon |
| 🔔 | Notifications | Bell icon |
| 💧 | Water product | Water drop icon |

---

## Component Library

### Buttons

| Type | Usage | Variant |
|------|-------|---------|
| **Filled** | Primary actions (Save, Submit, Generate) | Primary color bg, white text |
| **Tonal** | Secondary actions (Edit, Filter) | Primary container bg, primary text |
| **Outlined** | Tertiary actions (Cancel, Clear) | Border only, primary text |
| **Text** | Inline actions (View All, Learn More) | No border, primary text |
| **FAB** | Main screen action (Add, Create) | Circular, elevated |
| **Icon** | Quick actions (Search, Filter, More) | Icon only, no background |

### Cards

| Card Type | Usage | Layout |
|-----------|-------|--------|
| **KPI Card** | Dashboard metrics | Large number + label + trend |
| **Entity Card** | Restaurant, Product items | Title + subtitle + badges + actions |
| **Summary Card** | Collection/Bill summaries | Key-value pairs with totals |
| **Action Card** | Quick actions on dashboard | Icon + title + tap handler |
| **Alert Card** | Notifications, warnings | Colored left border + icon + message |

### Input Fields

| Type | Usage |
|------|-------|
| **Text Input** | Names, addresses, notes |
| **Number Input** | Amounts, quantities (with +/- steppers) |
| **Phone Input** | Mobile numbers (10-digit format) |
| **Dropdown** | Area, status, payment mode |
| **Date Picker** | Dates (material date picker) |
| **Search Field** | Global and inline search |
| **PIN Input** | Authentication PIN entry |

### Status Badge Component

```dart
class StatusBadge extends StatelessWidget {
  final String status;

  Color get backgroundColor => switch(status) {
    'active' || 'paid' || 'completed' => AppColors.successContainer,
    'pending' || 'draft' => AppColors.warningContainer,
    'overdue' || 'bounced' => AppColors.errorContainer,
    'in_progress' => AppColors.infoContainer,
    'cancelled' || 'inactive' => AppColors.surfaceVariant,
    'verified' => Color(0xFFF3E5F5),
    _ => AppColors.surfaceVariant,
  };

  Color get textColor => switch(status) {
    'active' || 'paid' || 'completed' => AppColors.success,
    'pending' || 'draft' => AppColors.warning,
    'overdue' || 'bounced' => AppColors.error,
    'in_progress' => AppColors.info,
    'cancelled' || 'inactive' => AppColors.onSurfaceVariant,
    'verified' => Color(0xFF6A1B9A),
    _ => AppColors.onSurfaceVariant,
  };
}
```

### Bottom Sheet

| Use Case | Type | Content |
|----------|------|---------|
| Quick actions | Modal | List of action items |
| Filters | Persistent | Filter chips + date range |
| Payment mode | Modal | Mode selection cards |
| Confirmation | Modal | Warning + confirm/cancel |

---

## Dark Mode

### Dark Color Palette

| Token | Light | Dark |
|-------|-------|------|
| `background` | `#FAFAFA` | `#121212` |
| `surface` | `#FFFFFF` | `#1E1E1E` |
| `surfaceVariant` | `#F5F5F5` | `#2C2C2C` |
| `primary` | `#1B5E20` | `#81C784` |
| `onBackground` | `#212121` | `#E0E0E0` |
| `onSurface` | `#212121` | `#E0E0E0` |
| `outline` | `#BDBDBD` | `#424242` |
| `success` | `#2E7D32` | `#66BB6A` |
| `error` | `#C62828` | `#EF5350` |
| `warning` | `#F57F17` | `#FFB74D` |

### Dark Mode Rules

1. Use **surface colors** for containers (not pure black)
2. Reduce **elevation shadows** (dark mode uses surface tint instead)
3. Use **desaturated** accent colors (avoid neon brightness)
4. Maintain **WCAG AA** contrast ratios in both modes
5. Test **all status badges** for readability in dark mode

---

## Theming Architecture

### Theme Data Structure

```dart
class AppTheme {
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: _lightColorScheme,
      textTheme: _textTheme,
      cardTheme: _cardTheme,
      inputDecorationTheme: _inputTheme,
      elevatedButtonTheme: _buttonTheme,
      appBarTheme: _appBarTheme,
      bottomNavigationBarTheme: _bottomNavTheme,
      floatingActionButtonTheme: _fabTheme,
      dividerTheme: _dividerTheme,
      snackBarTheme: _snackBarTheme,
    );
  }

  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: _darkColorScheme,
      textTheme: _textTheme,
      // ... same structure with dark colors
    );
  }
}
```

---

## Motion & Animation

### Duration Scale

| Token | Duration | Usage |
|-------|----------|-------|
| `instant` | 100ms | Color changes, opacity |
| `fast` | 200ms | Small element transitions |
| `normal` | 300ms | Screen transitions, cards |
| `slow` | 400ms | Complex animations, modals |
| `deliberate` | 500ms | Full-screen transitions |

### Easing Curves

| Token | Curve | Usage |
|-------|-------|-------|
| `standard` | `Curves.easeInOut` | Default for most animations |
| `decelerate` | `Curves.easeOut` | Elements entering the screen |
| `accelerate` | `Curves.easeIn` | Elements leaving the screen |
| `emphasized` | `Curves.easeInOutCubicEmphasized` | Hero transitions, important |

### Transition Types

| Transition | Usage | Duration |
|-----------|-------|----------|
| **Fade** | Screen transitions, overlays | 300ms |
| **Slide Up** | Bottom sheets, modals | 300ms |
| **Slide Right** | Forward navigation | 300ms |
| **Scale** | FAB press, card expansion | 200ms |
| **Shimmer** | Loading skeletons | Loop (1.5s per cycle) |
| **Count Up** | KPI values on dashboard | 800ms |

### Animation Guidelines

1. **Purposeful** — Every animation should serve a purpose (guide attention, show state)
2. **Subtle** — Avoid flashy, distracting animations
3. **Interruptible** — User can start new action mid-animation
4. **Performant** — Target 60 FPS; use `RepaintBoundary` for complex animations
5. **Respectful** — Honor system "Reduce Motion" accessibility setting

---

<p align="center">
  <strong>VASUDHA OS Design System</strong> — Consistent, beautiful, and accessible. 🎨
</p>
