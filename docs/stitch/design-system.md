# Design System Specification: The Clinical Atelier

> Auto-extracted from the ProjectSF Stitch project (projects/7705025027636758446)

## 1. Overview & Creative North Star
### Creative North Star: "The Empathetic Authority"
In medical practice management, software often feels cold, rigid, and cluttered. This design system rejects the "spreadsheet-trapped-in-a-box" aesthetic. Instead, we embrace a "Clinical Atelier" approach: an environment that feels as high-end and intentional as a modern private clinic.

We move beyond standard Material 3 by utilizing **Editorial Asymmetry** and **Tonal Depth**. By breaking the rigid 12-column grid with intentional white space and overlapping "paper-on-glass" layers, we create a UI that breathes. This system prioritizes cognitive ease for practitioners, using high-contrast typography and soft tonal shifts to guide the eye without the "visual noise" of traditional borders and dividers.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a deep, trustworthy Indigo, but its execution is ethereal and layered.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning or containment. Structural boundaries must be defined solely through:
1.  **Background Color Shifts:** Placing a `surface-container-low` component against a `surface` background.
2.  **Subtle Tonal Transitions:** Using the `surface-container` tiers to denote hierarchy.
3.  **Negative Space:** Using the Spacing Scale (specifically `8` [2rem] and `10` [2.5rem]) to create "invisible" gutters.

### Surface Hierarchy & Nesting
Treat the interface as physical layers of fine stationery.
*   **Base Layer:** `surface` (#FEF7FF) – The desk.
*   **Secondary Layer:** `surface-container-low` (#F8F1F9) – The clipboard.
*   **Primary Interaction Layer:** `surface-container-lowest` (#FFFFFF) – The active patient record.

### The "Glass & Gradient" Rule
To avoid a "flat" medical template look, floating elements (modals, dropdowns) should utilize **Glassmorphism**.
*   **Token:** `surface_container_lowest` at 85% opacity.
*   **Effect:** `backdrop-blur: 12px`.
*   **Signature Texture:** Use a subtle linear gradient on primary CTAs transitioning from `primary` (#4F378A) to `primary_container` (#6750A4) at a 135-degree angle. This adds a "jewel-like" depth that conveys premium quality.

---

## 3. Typography: The Editorial Voice
We use a dual-font pairing to balance authority with approachability.

*   **Display & Headlines (Manrope):** A modern geometric sans-serif with a high x-height. Use `display-lg` and `headline-md` for patient names and key health metrics to give them an "editorial" importance.
*   **Body & Labels (Inter):** Highly legible and neutral. Use `body-md` for all clinical notes.
*   **Hierarchy Tip:** Never use "Bold" for body text. Use `medium` weight with a shift to `on-surface-variant` (#494551) to create contrast. Save high-weight fonts exclusively for `headline` levels to maintain an airy, sophisticated feel.

---

## 4. Elevation & Depth: Tonal Layering
Traditional structural lines create mental friction. We achieve depth through the **Layering Principle**.

*   **The Layering Principle:** Stack `surface-container-lowest` cards on `surface-container-low` sections. This creates a "soft lift" that feels organic.
*   **Ambient Shadows:** For high-priority floating elements (e.g., a "New Appointment" FAB), use a custom shadow:
    *   `box-shadow: 0px 12px 32px rgba(79, 55, 138, 0.08);`
    *   *Note: The shadow is tinted with the primary color to mimic natural light passing through glass.*
*   **The "Ghost Border" Fallback:** If a border is required for accessibility in forms, use `outline-variant` (#CBC4D2) at **20% opacity**. It should be felt, not seen.

---

## 5. Components & Interface Elements

### Buttons
*   **Style:** Rounded corners at `md` (0.75rem / 12px).
*   **Primary:** Gradient fill (`primary` to `primary_container`). White text. No shadow unless hovered.
*   **Secondary:** `surface-container-high` fill with `on-primary-fixed-variant` text.

### Input Fields
*   **Philosophy:** Minimalist. No bottom line or full box.
*   **Style:** Use a `surface-container-lowest` background with a `sm` (4px) corner radius.
*   **Focus State:** A 2px "Ghost Border" using `primary` at 40% opacity. No "glow."

### Cards & Data Lists
*   **Forbid Dividers:** Do not use horizontal rules between patient records.
*   **The Alternative:** Use `8` (2rem) vertical spacing or alternating `surface` and `surface-container-low` backgrounds for list items.
*   **Medical Charts:** Use `tertiary_container` (#C9A74D) for highlight metrics to separate them from administrative data.

### Specialized Medical Components
*   **The "Vitals Grid":** Use asymmetric card sizes. The most critical vital takes up 60% of the container width using `headline-lg`, while secondary vitals stack vertically in the remaining 40%.
*   **Timeline Scrubber:** A horizontal "ghost" track using `outline-variant` at 10% opacity for tracking patient history without cluttering the screen.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use `surface-dim` for inactive sidebar states to push them into the background.
*   **Do** lean into `surface-container-highest` for "Active" states in navigation.
*   **Do** prioritize `tertiary` (#765B00) for "Pending" or "Cautionary" clinical alerts.

### Don't:
*   **Don't** use pure black (#000000) for text. Always use `on-surface` (#1D1B20).
*   **Don't** use 100% opaque `outline` tokens for decorative boxes.
*   **Don't** use standard Material "Drop Shadows." If it doesn't look like ambient, tinted light, it doesn't belong.

---

## 7. Color Tokens

| Token | Value |
|---|---|
| `primary` | #4F378A |
| `primary_container` | #6750A4 |
| `on_primary` | #FFFFFF |
| `on_primary_container` | #E0D2FF |
| `secondary` | #63597C |
| `secondary_container` | #E1D4FD |
| `on_secondary` | #FFFFFF |
| `on_secondary_container` | #645A7D |
| `tertiary` | #765B00 |
| `tertiary_container` | #C9A74D |
| `on_tertiary` | #FFFFFF |
| `surface` | #FEF7FF |
| `surface_dim` | #DED8E0 |
| `surface_bright` | #FEF7FF |
| `surface_container_lowest` | #FFFFFF |
| `surface_container_low` | #F8F1F9 |
| `surface_container` | #F2ECF4 |
| `surface_container_high` | #EDE6EE |
| `surface_container_highest` | #E7E0E8 |
| `on_surface` | #1D1B20 |
| `on_surface_variant` | #494551 |
| `outline` | #7A7582 |
| `outline_variant` | #CBC4D2 |
| `error` | #BA1A1A |
| `error_container` | #FFDAD6 |
| `on_error` | #FFFFFF |

## 8. Typography & Spacing

| Property | Value |
|---|---|
| Headline font | Manrope |
| Body font | Inter |
| Label font | Inter |
| Corner radius | 8px (ROUND_EIGHT) |
| Spacing scale | 2 |
| Color mode | Light |
