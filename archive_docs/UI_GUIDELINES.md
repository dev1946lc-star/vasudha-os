# VASUDHA OS — UI Guidelines

<p align="center">
  <strong>Design Philosophy, Patterns & Principles</strong><br/>
  <em>Building intuitive interfaces for field workers and office staff</em>
</p>

---

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Target Users & Constraints](#target-users--constraints)
- [Layout Principles](#layout-principles)
- [Navigation Architecture](#navigation-architecture)
- [Screen Patterns](#screen-patterns)
- [Form Design](#form-design)
- [Data Display Patterns](#data-display-patterns)
- [State Handling](#state-handling)
- [Interaction Patterns](#interaction-patterns)
- [Feedback & Communication](#feedback--communication)
- [Accessibility](#accessibility)
- [Responsive Design](#responsive-design)
- [Platform-Specific Guidelines](#platform-specific-guidelines)
- [Performance Guidelines](#performance-guidelines)

---

## Design Philosophy

### Core Principles

#### 1. Field-First Design
VASUDHA OS is used by collection agents standing at restaurant doorways, drivers in delivery trucks, and accountants at cluttered desks. Every screen must work in challenging real-world conditions:
- **Bright sunlight** — High contrast, bold text
- **One-handed operation** — Critical actions within thumb reach
- **Distractions** — Minimal cognitive load; obvious next steps
- **Dirty/wet hands** — Large touch targets; no precision gestures

#### 2. Speed Over Beauty
For field workers, speed is everything. A collection agent visiting 40 restaurants/day needs:
- **< 30 seconds** per restaurant for data entry
- **< 3 taps** for the most common action
- **Zero scrolling** for critical information
- **No "Loading..." screens** for local operations

#### 3. Confidence in Data
Financial data requires absolute user confidence:
- **Clear confirmation** for irreversible actions
- **Visual distinction** between monetary amounts
- **Obvious status indicators** for collection/bill/payment states
- **Undo capability** where possible

#### 4. Progressive Complexity
- **Simple default** — Works out of the box with minimal configuration
- **Advanced features discoverable** — Power features accessible but not distracting
- **Contextual actions** — Show relevant actions based on current state
- **Guided workflows** — Step-by-step for complex operations (billing, setup)

---

## Target Users & Constraints

### Device Constraints

| Constraint | Specification | Design Impact |
|-----------|--------------|---------------|
| Screen size | 5.0"–6.7" (majority) | Optimize for 5.5" as baseline |
| RAM | 3–4 GB (budget phones) | Minimal widget tree depth |
| Network | Unreliable / None | No loading states for local data |
| Battery | Conservation critical | Minimize animations, background work |
| Brightness | Often outdoors | High contrast, bold typography |
| Storage | 32–64 GB total | Efficient data storage |

### User Literacy Levels

| User Type | Digital Literacy | UI Approach |
|-----------|-----------------|-------------|
| Business Owner | Moderate | Standard mobile patterns |
| Accountant | High | Can handle complexity |
| Collection Agent | Low–Moderate | Simplified, icon-heavy |
| Driver | Low | Minimal text, large buttons |

---

## Layout Principles

### Screen Layout Template

```
┌─────────────────────────────────┐
│  App Bar (Title + Actions)      │  ← Fixed height: 56dp
├─────────────────────────────────┤
│  Quick Filters / Tabs           │  ← Optional: 48dp
├─────────────────────────────────┤
│                                 │
│                                 │
│        Content Area             │  ← Scrollable
│        (Cards / Lists)          │
│                                 │
│                                 │
├─────────────────────────────────┤
│  FAB / Bottom Actions           │  ← Primary action
├─────────────────────────────────┤
│  Bottom Navigation (5 items)    │  ← Fixed height: 80dp
└─────────────────────────────────┘
```

### Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4dp | Inline spacing, icon padding |
| `sm` | 8dp | Between related elements |
| `md` | 16dp | Standard padding, between cards |
| `lg` | 24dp | Section separation |
| `xl` | 32dp | Major section breaks |
| `xxl` | 48dp | Page-level spacing |

### Touch Targets

| Element | Minimum Size | Recommended | Spacing Between |
|---------|-------------|-------------|-----------------|
| Buttons | 44×44dp | 48×48dp | 8dp |
| List items | 48dp height | 56–72dp | 0dp (dividers) |
| Icons | 40×40dp | 48×48dp | 8dp |
| Input fields | 48dp height | 56dp | 16dp |
| FAB | 56×56dp | 56×56dp | — |

---

## Navigation Architecture

### Bottom Navigation (5 Tabs)

```
┌──────┬──────┬──────┬──────┬──────┐
│  🏠  │  🏪  │  🚚  │  📊  │  ⚙️  │
│ Home │ Rest.│ Coll.│Report│ More │
└──────┴──────┴──────┴──────┴──────┘
```

| Tab | Module | Icon | Default View |
|-----|--------|------|-------------|
| Home | Dashboard | 🏠 | Today's summary |
| Restaurants | Restaurant Management | 🏪 | Restaurant list |
| Collection | Collection & Delivery | 🚚 | Today's collection list |
| Reports | Reports & Analytics | 📊 | Report type selection |
| More | Settings, Billing, Payments | ⚙️ | Module grid |

### Navigation Rules

1. **Bottom nav** is persistent across all main screens
2. **Detail screens** push on top (hide bottom nav)
3. **Modal flows** (create/edit) use full-screen modal with close/save
4. **Back button** always returns to previous screen (predictable)
5. **Deep navigation** (> 3 levels) is avoided

---

## Screen Patterns

### List Screen Pattern

```
┌─────────────────────────────────┐
│ ← Restaurants           🔍 ➕  │  App Bar with search + add
├─────────────────────────────────┤
│ [Active ▼] [All Areas ▼]       │  Filter chips
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 🏪 Hotel Rajdhani           │ │  Restaurant card
│ │    MG Road · ₹12,500 due   │ │  Subtitle: area + outstanding
│ │    📞 Call   📋 Bill  ➡️   │ │  Quick actions
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 🏪 Sharma Restaurant        │ │
│ │    Vaishali Nagar · ✅ Paid │ │
│ │    📞 Call   📋 Bill  ➡️   │ │
│ └─────────────────────────────┘ │
│         ... more items ...      │
├─────────────────────────────────┤
│                           [➕]  │  FAB: Add new
└─────────────────────────────────┘
```

### Detail Screen Pattern

```
┌─────────────────────────────────┐
│ ← Hotel Rajdhani         ✏️ ⋮  │  Name + Edit + More
├─────────────────────────────────┤
│                                 │
│  ┌─── Summary Card ──────────┐  │
│  │ Outstanding: ₹12,500      │  │  Key metric, prominent
│  │ Last Payment: 3 days ago  │  │
│  │ Credit Limit: ₹50,000    │  │
│  └────────────────────────────┘  │
│                                 │
│  [Collections] [Bills] [Pay]    │  Tab bar for sub-sections
│                                 │
│  ┌─── Recent Collections ────┐  │
│  │ Jul 6  · 10 cans · ₹500  │  │
│  │ Jul 5  · 8 cans  · ₹400  │  │
│  │ Jul 4  · 12 cans · ₹600  │  │
│  └────────────────────────────┘  │
│                                 │
│  [📞 Call] [📋 Generate Bill]   │  Action buttons
└─────────────────────────────────┘
```

### Form Screen Pattern

```
┌─────────────────────────────────┐
│ ✕ Add Restaurant         Save   │  Close + Save in app bar
├─────────────────────────────────┤
│                                 │
│  Restaurant Name *              │
│  ┌─────────────────────────────┐│
│  │ Hotel Rajdhani              ││  Input field
│  └─────────────────────────────┘│
│                                 │
│  Owner Name                     │
│  ┌─────────────────────────────┐│
│  │ Suresh Kumar                ││
│  └─────────────────────────────┘│
│                                 │
│  Mobile Number *                │
│  ┌─────────────────────────────┐│
│  │ 9876543210                  ││  Numeric keyboard
│  └─────────────────────────────┘│
│                                 │
│  Area                           │
│  ┌─────────────────────────────┐│
│  │ MG Road            ▼       ││  Dropdown
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │        Save Restaurant     ││  Primary button
│  └─────────────────────────────┘│
└─────────────────────────────────┘
```

---

## Form Design

### Input Field Guidelines

| Guideline | Rule |
|-----------|------|
| Labels | Always above field (floating label) |
| Placeholder | Example value in lighter color |
| Required indicator | Red asterisk (*) after label |
| Error messages | Below field, red text, specific message |
| Helper text | Below field, gray text, format hints |
| Character count | For limited fields (notes, description) |
| Keyboard type | Match input (numeric for phone, email for email) |
| Auto-capitalize | Names and addresses |
| Auto-focus | First field on form open |

### Validation Timing

| Trigger | Behavior |
|---------|----------|
| On focus leave (blur) | Validate field; show error if invalid |
| On change (typing) | Clear error once user starts correcting |
| On submit | Validate all fields; scroll to first error |
| Pre-fill | No validation on pre-filled data until modified |

### Number Input for Quantities

For field workers entering quantities quickly:

```
┌─────────────────────────────────┐
│  20L Water Can                  │
│  ┌───┐ ┌─────────────┐ ┌───┐   │
│  │ - │ │     10      │ │ + │   │  Stepper for common quantities
│  └───┘ └─────────────┘ └───┘   │
│  [5] [10] [15] [20] [25]       │  Quick-select presets
└─────────────────────────────────┘
```

---

## Data Display Patterns

### Currency Display

| Context | Format | Example |
|---------|--------|---------|
| Dashboard KPIs | ₹XX,XX,XXX | ₹12,50,000 |
| List items | ₹X,XXX | ₹12,500 |
| Invoice amounts | ₹XX,XXX.XX | ₹12,500.00 |
| Negative amounts | -₹X,XXX (red) | -₹5,000 |
| Zero amounts | ₹0 or "—" | — |
| Large amounts | ₹XX.XX L/Cr | ₹12.5 L |

### Date Display

| Context | Format | Example |
|---------|--------|---------|
| Today's date | "Today" | Today |
| Yesterday | "Yesterday" | Yesterday |
| This week | Day name | "Wednesday" |
| This year | DD MMM | 06 Jul |
| Past years | DD MMM YYYY | 06 Jul 2025 |
| Date range | DD MMM – DD MMM | 01 Jul – 15 Jul |

### Status Badges

| Status | Color | Icon | Background |
|--------|-------|------|------------|
| Active / Paid / Completed | Green | ✅ | Light green |
| Pending / Draft | Yellow/Amber | ⏳ | Light amber |
| Overdue / Failed / Bounced | Red | ❌ | Light red |
| In Progress | Blue | 🔄 | Light blue |
| Cancelled / Inactive | Gray | ⊘ | Light gray |
| Verified | Purple | ✔️ | Light purple |

---

## State Handling

### Every Screen Has 5 States

```dart
// All screens must handle these states:
enum ScreenState {
  loading,    // First load, full-screen spinner or skeleton
  data,       // Data loaded, render content
  empty,      // No data, show empty state with CTA
  error,      // Error occurred, show error with retry
  offline,    // No connectivity (future, for cloud features)
}
```

### Loading States

| Duration | UI Pattern |
|----------|-----------|
| < 200ms | No loading indicator (feels instant) |
| 200ms–1s | Shimmer/skeleton placeholder |
| 1s–5s | Circular progress indicator |
| > 5s | Progress bar with percentage (for bulk operations) |

### Empty States

Every empty state includes:
1. **Illustration** — Relevant Lottie animation or icon
2. **Title** — "No restaurants yet" (not "No data found")
3. **Description** — Brief explanation of what this section shows
4. **CTA Button** — "Add your first restaurant" (action-oriented)

### Error States

```
┌─────────────────────────────────┐
│           ⚠️                     │
│                                  │
│   Something went wrong           │
│                                  │
│   Unable to load restaurants.    │
│   Please try again.             │
│                                  │
│   [🔄 Retry]                     │
│                                  │
│   Error: DB_READ_FAILED         │  ← Debug info (collapsed)
└─────────────────────────────────┘
```

---

## Interaction Patterns

### Gestures

| Gesture | Action | Context |
|---------|--------|---------|
| Tap | Select / Navigate | List items, buttons, cards |
| Long press | Context menu / Multi-select | List items for batch actions |
| Swipe left | Quick action (delete/archive) | List items (with confirmation) |
| Swipe right | Quick action (complete/mark) | Collection items |
| Pull down | Refresh data | Any list/grid screen |
| Scroll | Navigate content | All scrollable areas |

### Confirmation Dialogs

Use confirmation dialogs for:
- **Destructive actions** — Delete, cancel, reset
- **Financial actions** — Approve bill, record payment
- **Irreversible actions** — Verify collection, lock records

Do NOT use confirmation for:
- Navigation
- Saving data
- Non-destructive actions
- Filtering / sorting

### Haptic Feedback

| Action | Feedback |
|--------|----------|
| Button tap | Light impact |
| Successful save | Medium impact |
| Error | Heavy impact (double) |
| Swipe action trigger | Selection click |
| Pull-to-refresh threshold | Light impact |

---

## Feedback & Communication

### Toast/Snackbar Messages

| Type | Duration | Position | Example |
|------|----------|----------|---------|
| Success | 2 seconds | Bottom | "✅ Restaurant added successfully" |
| Info | 3 seconds | Bottom | "ℹ️ 5 bills generated" |
| Warning | 4 seconds | Bottom | "⚠️ Stock running low for 20L cans" |
| Error | 5 seconds + Dismiss | Bottom | "❌ Failed to save. Tap to retry" |
| Undo | 5 seconds + Action | Bottom | "🗑️ Restaurant deleted. [Undo]" |

### In-App Notifications

```
┌─────────────────────────────────┐
│ 🔔 Notifications           Mark │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 🔴 3 bills overdue          │ │  High priority
│ │    Total: ₹45,000           │ │
│ │    2 hours ago              │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⚠️ Low stock: 20L cans     │ │  Medium priority
│ │    Current: 15, Min: 50    │ │
│ │    5 hours ago              │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ✅ Collection completed      │ │  Normal priority
│ │    Agent: Suresh · 35 rest.│ │
│ │    Yesterday                │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## Accessibility

### Minimum Requirements

| Criterion | Requirement |
|-----------|-------------|
| Text contrast | WCAG AA (4.5:1 for body, 3:1 for large text) |
| Touch targets | ≥ 44×44dp |
| Font scaling | Support system font size (up to 2x) |
| Screen reader | All interactive elements have semantic labels |
| Color independence | Don't rely solely on color (use icons + text) |
| Keyboard/D-pad | All actions accessible via keyboard (future) |

### Semantic Labels

```dart
// ✅ Good
Semantics(
  label: 'Hotel Rajdhani, outstanding balance 12,500 rupees',
  child: RestaurantCard(restaurant),
)

// ❌ Bad — no semantic label
RestaurantCard(restaurant)
```

---

## Responsive Design

### Breakpoints

| Device | Width | Layout |
|--------|-------|--------|
| Small phone | < 360dp | Single column, compact cards |
| Standard phone | 360–411dp | Single column, standard cards |
| Large phone | 412–599dp | Single column, expanded cards |
| Tablet (portrait) | 600–839dp | Two-column, master-detail |
| Tablet (landscape) | 840dp+ | Three-column, full desktop-like |

### Adaptive Layouts

```dart
class AdaptiveLayout extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      if (constraints.maxWidth >= 840) {
        return ThreeColumnLayout();   // Tablet landscape
      } else if (constraints.maxWidth >= 600) {
        return TwoColumnLayout();     // Tablet portrait
      } else {
        return SingleColumnLayout();  // Phone
      }
    });
  }
}
```

---

## Platform-Specific Guidelines

### Android-Specific

| Element | Android Convention |
|---------|-------------------|
| Navigation | Material 3 bottom nav |
| Back button | System back button support |
| Status bar | Themed to match app bar |
| Splash screen | Android 12+ splash screen API |
| Permissions | Request at point of use, not on launch |

### iOS-Specific

| Element | iOS Convention |
|---------|---------------|
| Navigation | Same as Android (consistent Flutter UX) |
| Gestures | Edge swipe for back navigation |
| Status bar | Light/dark based on theme |
| Haptics | UIFeedbackGenerator patterns |
| Safe areas | Respect notch and home indicator |

---

## Performance Guidelines

### Widget Performance

| Guideline | Rule |
|-----------|------|
| List rendering | Use `ListView.builder` for > 20 items |
| Image loading | Use `cached_network_image` with placeholders |
| Animations | 60 FPS target; use `AnimatedBuilder` |
| Rebuilds | Minimize widget rebuilds with `const` constructors |
| Heavy computation | Use `compute()` or isolates for > 16ms operations |
| Memory | Dispose controllers, streams, and listeners |

### Perceived Performance

| Technique | Purpose |
|-----------|---------|
| Skeleton screens | Show layout structure while loading |
| Optimistic updates | Update UI immediately, persist in background |
| Preloading | Load next screen's data during current screen |
| Debouncing | Delay search API calls until user stops typing (300ms) |
| Pagination | Load 50 items initially, more on scroll |

---

<p align="center">
  <strong>VASUDHA OS UI Guidelines</strong> — Simple enough for a driver, powerful enough for a CEO. 📱
</p>
