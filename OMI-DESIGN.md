# Omi Desktop macOS App: Comprehensive Visual Design Document

## Overview
Omi is a personal AI assistant native macOS desktop app built with Swift and SwiftUI. The design emphasizes a dark, sophisticated aesthetic with purple accents, minimal chrome, and a signature always-on floating control bar. The design is purpose-built for power users who need seamless context capture and AI-powered workflows.

---

## 1. Color System

### Background Colors
All backgrounds use a dark palette derived from deep grays and near-blacks:

| Usage | Hex | RGB | Purpose |
|-------|-----|-----|---------|
| **Primary Background** | `#0F0F0F` | rgb(15, 15, 15) | Main app chrome, window backgrounds |
| **Secondary Background** | `#1A1A1A` | rgb(26, 26, 26) | Cards, raised surfaces, selected states |
| **Tertiary Background** | `#252525` | rgb(37, 37, 37) | Hover states, input fields, subtle surfaces |
| **Quaternary Background** | `#35343B` | rgb(53, 52, 59) | Deepest interactive elements |
| **Raised Surface** | `#1F1F25` | rgb(31, 31, 37) | Floating panels, modals |

### Text Colors
Strict hierarchy with four levels:

| Hierarchy | Hex | RGB | Usage |
|-----------|-----|-----|-------|
| **Primary** | `#FFFFFF` | rgb(255, 255, 255) | Main headings, primary content |
| **Secondary** | `#E5E5E5` | rgb(229, 229, 229) | Body text, secondary headings |
| **Tertiary** | `#B0B0B0` | rgb(176, 176, 176) | Labels, disabled text, hints |
| **Quaternary** | `#888888` | rgb(136, 136, 136) | Disabled buttons, placeholder text |

### Accent Colors (Purple System)
Omi's signature purple palette creates visual hierarchy and indicates actionable elements:

| Level | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Primary Purple** | `#8B5CF6` | rgb(139, 92, 246) | Main CTA buttons, highlights |
| **Secondary Purple** | `#A855F7` | rgb(168, 85, 247) | Gradient base, accents |
| **Accent Purple** | `#7C3AED` | rgb(124, 58, 237) | Gradients, deeper accents |
| **Light Purple** | `#D946EF` | rgb(217, 70, 239) | Hover states, emphasis |

### Semantic Status Colors
Used for feedback and state indication:

| Status | Hex | RGB | Usage |
|--------|-----|-----|-------|
| **Success** | `#10B981` | rgb(16, 185, 129) | Completed tasks, active states (green) |
| **Warning** | `#F59E0B` | rgb(245, 158, 11) | Caution states, amber indicators |
| **Error** | `#EF4444` | rgb(239, 68, 68) | Errors, deleted items, red alerts |
| **Info** | `#3B82F6` | rgb(59, 130, 246) | Informational messages, blue |

### Special Purpose Colors

| Element | Hex | RGB | Purpose |
|---------|-----|-----|---------|
| **Border** | `#3A3940` | rgb(58, 57, 64) | Dividers, subtle separators |
| **User Bubble** | `#43389F` | rgb(67, 56, 159) | User chat messages (distinct from speakers) |
| **Window Close** | `#FF5F57` | rgb(255, 95, 87) | macOS window button (red) |
| **Window Minimize** | `#FFBD2E` | rgb(255, 189, 46) | macOS window button (yellow) |
| **Window Maximize** | `#28CA42` | rgb(40, 202, 66) | macOS window button (green) |

### Speaker Bubble Colors
Chat transcript speaker bubbles use a palette of 6 distinct dark colors to differentiate multiple speakers:

```swift
static let speakerColors: [Color] = [
  Color(hex: 0x2D3748),  // Dark blue-gray
  Color(hex: 0x1E3A5F),  // Navy
  Color(hex: 0x2D4A3E),  // Dark teal
  Color(hex: 0x4A3728),  // Dark brown
  Color(hex: 0x3D2E4A),  // Dark purple
  Color(hex: 0x4A3A2D),  // Dark amber
]
```

### Gradients
Two primary gradient systems:

**Purple Gradient** (Main CTA):
- Start: `#8B5CF6` (Primary Purple)
- End: `#7C3AED` (Accent Purple)
- Direction: Top-leading to bottom-trailing

**Purple Light Gradient** (Hover/Emphasis):
- Start: `#A855F7` (Secondary Purple)
- End: `#D946EF` (Light Purple)
- Direction: Top-leading to bottom-trailing

---

## 2. Typography

### Font Choices
All typography uses **system fonts** (San Francisco), with scaling applied via `FontScaleSettings` for accessibility:

```swift
class FontScaleSettings: ObservableObject {
    @Published var scale: CGFloat { /* user-adjustable */ }
}
```

Users can adjust font scale via Settings, and all text scales proportionally using the `scaledFont()` modifier.

### Font Weights
- **Bold**: `weight: .bold` (headings, critical labels)
- **Semibold**: `weight: .semibold` (emphasis, subheadings)
- **Medium**: `weight: .medium` (secondary labels, button text)
- **Regular**: `weight: .regular` (body text, default)

### Size Hierarchy

| Role | Size | Weight | Usage |
|------|------|--------|-------|
| **App Name** | 22pt | Bold | Sidebar header |
| **Page Title** | 18–20pt | Bold | Main heading |
| **Section Header** | 14–16pt | Medium | Subsection titles |
| **Body Text** | 14pt | Regular | Main content |
| **Secondary Text** | 13pt | Regular | Descriptions, secondary info |
| **Label Text** | 12–13pt | Medium | Form labels, chips |
| **Small Text** | 11pt | Regular | Timestamps, hints |
| **Micro Text** | 9–10pt | Regular | Badges, keyboard hints |

### Monospace Typography
For code and technical content:

```swift
.scaledMonospacedFont(size: 12, weight: .regular)
.scaledMonospacedDigitFont(size: 12, weight: .regular)
```

### Line Height & Letter Spacing
- **Default line height**: System default (typically 1.5x font size)
- **Tracking (letter spacing)**: Subtle adjustments in specific areas:
  - App name in sidebar: `tracking: -0.5` (tighter)
  - Most other text: system default

---

## 3. Spacing System

### Core Spacing Units
Omi uses an 8-point baseline grid with these standard spacings:

| Unit | Points | CSS Equivalent | Usage |
|------|--------|----------------|-------|
| **xs** | 4 | 0.25rem | Minimal spacing |
| **sm** | 8 | 0.5rem | Component padding, tight spacing |
| **md** | 12 | 0.75rem | Card padding, standard spacing |
| **lg** | 16 | 1rem | Section spacing |
| **xl** | 24 | 1.5rem | Major section gaps |
| **2xl** | 32 | 2rem | Page padding |

### Sidebar Dimensions
```swift
private let expandedWidth: CGFloat = 260   // Expanded sidebar
private let collapsedWidth: CGFloat = 64   // Collapsed (icons only)
```

### Item Padding
Standard horizontal and vertical padding for interactive elements:

```swift
.padding(.horizontal, 12)   // Cards, buttons
.padding(.vertical, 11)     // Cards, buttons
// or
.padding(12)                // Balanced all-around
```

### Spacing in Components
- **HStack spacing**: 8–12pt (depends on content density)
- **VStack spacing**: 12–20pt (more generous vertical spacing)
- **Between sections**: 16–24pt
- **Between major sections**: 32pt

### Specific Component Spacing

| Component | Padding/Spacing | Notes |
|-----------|-----------------|-------|
| **Chat Input** | H: 12pt, V: 12pt | `.padding(12)` with multiline support up to 200pt |
| **Cards** | H: 12pt, V: 8pt | Citation cards and similar |
| **Buttons** | H: 10pt, V: 4pt | Inside button pill styling |
| **Sidebar Items** | H: 12pt, V: 11pt | NavItemView padding |
| **Profile Menu** | 10pt | Popover padding |
| **Settings Section** | 16pt | Top/bottom section separation |

---

## 4. Layout Patterns

### Main Window
- **Default size**: 1200pt W × 800pt H (resizable)
- **Minimum resizable**: Yes
- **Window corners**: 26pt border radius (`OmiChrome.windowRadius`)

### Sidebar
- **Width (expanded)**: 260pt
- **Width (collapsed)**: 64pt
- **Collapsible**: Yes, toggle button in header
- **Draggable edge**: 8pt right edge for resizing
- **Structure**:
  1. Header (logo + name + collapse button) — 12pt padding top
  2. Main nav items (Home, Conversations, Chat, Memories, Tasks, Rewind, Apps)
  3. Flexible spacing with notifications/widgets
  4. Status indicators (permissions, device status)
  5. Profile menu at bottom

### Main Content Area
- **Max width**: Flex to fill remaining space after sidebar
- **Padding**: Typically 12–16pt from edges
- **Layout**: Column-based with scrollable content

### Card Dimensions
- **Small card**: ~120–180pt W
- **Medium card**: ~280–320pt W
- **Large card** (full-width): Flex to container
- **Min height**: Variable, typically 40–60pt minimum

### Window State Transitions
- Smooth 0.2s easing when toggling sidebar collapse:
  ```swift
  .animation(.easeInOut(duration: 0.2), value: isCollapsed)
  ```
- Sidebar resize handle with drag gesture

---

## 5. Component Inventory

### Buttons

#### Primary Button
```swift
.background(OmiColors.purplePrimary)
.foregroundColor(.white)
.scaledFont(size: 14, weight: .semibold)
```
- Background: Purple Primary (`#8B5CF6`)
- Used for main CTAs (Send, Ask omi, Save)

#### Secondary Button
```swift
.background(OmiColors.backgroundTertiary)
.foregroundColor(OmiColors.textSecondary)
```
- Background: Tertiary Background
- Used for Cancel, Dismiss, alternate actions

#### Ghost Button (Transparent)
- No background, text only
- Foreground: Text Primary or Tertiary
- Used for inline actions

#### Icon-only Button
```swift
.scaledFont(size: 17)
.foregroundColor(OmiColors.textTertiary)
```
- Uses SF Symbols
- Size: 17–24pt typically
- Color: Tertiary text (dimmed), Primary when active

#### FAB (Floating Action Button)
- Rare in Omi; instead uses floating control bar
- When used: Purple background, large 44–48pt size

### Cards

#### Conversation Card
- Background: Secondary Background
- Padding: H: 12pt, V: 8pt
- Corner radius: 12–16pt
- Hover state: Tertiary Background
- Content: Icon + title + preview + timestamp

#### Citation Card
```swift
.background(OmiColors.backgroundSecondary)
.cornerRadius(8)
.overlay(RoundedRectangle(cornerRadius: 8).stroke(OmiColors.backgroundTertiary, lineWidth: 1))
```
- Displays sources from AI responses
- Emoji icon + title + preview + chevron
- Clickable to navigate to source

#### Memory Card
- Similar to conversation card
- Shows memory title, date, relevance tags

#### Chat Bubble / Message Card
```swift
RoundedRectangle(cornerRadius: 18)
  .fill(bubbleColor)
  .padding(.horizontal, 14)
  .padding(.vertical, 10)
```
- Rounded corners: 18pt
- User bubble: `#43389F` (distinct purple)
- Speaker bubbles: 6-color cycle
- Max width: ~70% of container

### Sidebar Navigation Items

#### Standard NavItemView
```swift
HStack(spacing: 12) {
  Image(systemName: icon)
    .scaledFont(size: 17)
  if !isCollapsed {
    Text(label).scaledFont(size: 14, weight: isSelected ? .medium : .regular)
    Spacer()
  }
}
.padding(.horizontal, 12)
.padding(.vertical, 11)
.background(
  RoundedRectangle(cornerRadius: 14, style: .continuous)
    .fill(isSelected ? OmiColors.backgroundSecondary : (isHovered ? OmiColors.backgroundTertiary.opacity(0.75) : Color.clear))
)
```

- **Selected state**: Secondary Background (darker)
- **Hover state**: Tertiary Background at 75% opacity
- **Corner radius**: 14pt
- **Spacing between items**: 2pt bottom padding for tight stack

#### NavItemWithStatusView (Conversations, Rewind)
- Shows icon with live status (audio bars, pulsing indicator)
- Tap icon to toggle recording/monitoring
- Tap label to navigate

#### Audio Level Icon (Sidebar)
- 4 bars, 3pt width each, 2pt spacing
- Height: 4pt (idle) to 14pt (peak)
- Color: Purple when active, text secondary when idle

#### Rewind Icon (Sidebar)
- Pulsing outer ring + inner dot
- Active: Purple dot with 1.4x scale pulsing ring
- Inactive: Red dot, no ring
- Pulse timing: 1.0s easeOut, repeating

### Pills & Badges

#### Status Badge
```swift
Text("In Progress")
  .scaledFont(size: 11, weight: .semibold)
  .foregroundColor(OmiColors.purplePrimary)
  .padding(.horizontal, 8)
  .padding(.vertical, 3)
  .background(
    RoundedRectangle(cornerRadius: 6)
      .fill(OmiColors.purplePrimary.opacity(0.15))
      .overlay(RoundedRectangle(cornerRadius: 6).stroke(OmiColors.purplePrimary.opacity(0.3), lineWidth: 1))
  )
```

#### Unread Badge (Sidebar)
- Collapsed: 8pt dot in top-right corner
- Expanded: Circular badge with count (min 14pt)
- Color: Purple Primary

#### Lock Badge (Tier-gated items)
- 10pt lock icon
- Color: Tertiary text when locked, Purple on hover

### Input Fields

#### Chat Input Field
```swift
.background(OmiColors.backgroundTertiary)
.clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
.frame(maxHeight: 200)
.padding(12)
.omiPanel(fill: OmiColors.backgroundSecondary, radius: 22, stroke: OmiColors.border.opacity(0.2), shadowOpacity: 0.1, shadowRadius: 12, shadowY: 6)
```

- **Styling**: `omiPanel()` custom modifier with rounded corners, subtle border, shadow
- **Multiline**: Up to 200pt height
- **Corner radius**: 18pt
- **Container radius**: 22pt
- **Padding**: 12pt

#### Text Field (Generic)
- Background: Tertiary
- Border: Subtle
- Corner radius: 8–12pt
- Padding: 8–12pt

#### Search Input
- Slightly larger padding (12pt)
- Debounce: 250ms for query input
- Placeholder color: Text Tertiary

### Modals & Sheets

#### Sheet/Modal Window
```swift
.background(OmiColors.backgroundPrimary)
```
- Background: Primary Background
- Corner radius: 20–26pt (if floating), 0 if full-window
- Shadow: 20pt blur, 8pt Y offset, 0.2 opacity
- Padding: 16–24pt from edges

#### Popover (Profile Menu)
```swift
.background(OmiColors.backgroundPrimary)
VStack(alignment: .leading, spacing: 4)
  .padding(10)
  .frame(width: 220)
```
- Width: 220pt (narrow)
- Padding: 10pt
- Item spacing: 4pt
- Background: Primary

### Empty States
- **Illustration**: Centered, light gray color
- **Title**: 18pt bold, primary text
- **Description**: 14pt regular, secondary text
- **CTA Button**: Purple primary button
- **Layout**: Centered in viewport with generous vertical spacing

### Loading States

#### Spinner
```swift
ProgressView()
  .scaleEffect(0.8)
  .tint(.white.opacity(0.6))
```

- Default size or scaled down
- Color: White with opacity
- Used in buttons, page transitions

#### Page Loading Indicator
- Spinner + optional "Loading..." text in secondary gray
- Centered in content area
- Fades in after 150ms delay

#### Skeleton Loader (not explicitly shown but common pattern)
- Shimmer effect over placeholder shapes
- Same size as actual content

### Tooltips
```swift
.help("Tooltip text here")
```

- Text: 12pt, secondary color
- Shown on hover for collapsed sidebar items
- Standard macOS tooltip behavior

---

## 6. Sidebar Design (Deep Dive)

### Visual Structure

```
┌─────────────────────────────────────────┐
│  [Logo] Omi                    [Collapse]│  ← Header: 12pt top padding
├─────────────────────────────────────────┤
│ [ Home ]                                 │
│ [ Conversations ] [Audio Bars]          │
│ [ Memories ]                             │
│ [ Tasks ]                                │
│ [ Rewind ]     [Pulsing Ring]           │
│ [ Apps ]                                 │
│                                          │
│ ╭─────────────────────────────────────╮ │  ← Device status widget
│ │ [Device Icon] Device Name    [Connected] │
│ │              Battery: 87%           │ │
│ ╰─────────────────────────────────────╯ │
│                                          │
│ ╭─────────────────────────────────────╮ │  ← Get omi promo
│ │ [Omi Device] Get omi Device      [x]│ │
│ ╰─────────────────────────────────────╯ │
│                                          │
│ ┌─────────────────────────────────────┐ │  ← Permission status
│ │ [Icon] Screen Recording    [Toggle]  │ │
│ │ [Icon] Microphone          [Toggle]  │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ═════════════════════════════════════    │  ← Divider
│                                          │
│ [Avatar] Profile Name      [Menu ...]   │  ← Profile button
│                                          │
└─────────────────────────────────────────┘
```

### Sidebar Header
- **Logo**: 20pt SF Symbol or herologo PNG
- **Brand name**: "Omi Dev" (or "Omi", "Omi Beta" in production)
- **Collapse button**: 17pt SF Symbol, icon only
- **Padding**: 16pt horizontal (expanded), 8pt (collapsed)
- **Font**: 22pt bold, tracking: -0.5
- **Color**: Purple primary for icon, white for text

### Navigation Items
- **Icon width**: Fixed 20pt (left-aligned)
- **Label**: Hidden when collapsed
- **Spacing**: 12pt between icon and label
- **Selected indicator**: Secondary Background fill (darker)
- **Hover effect**: Tertiary background at 75% opacity
- **Loading state**: ProgressView replacing icon, 50% scale
- **Animations**: 0.2s easeInOut for collapse/expand

### Widget Section (below nav)
- **Device Status Widget**: Shows connected device, battery level, connection indicator
  - Background: Tertiary at 60% opacity
  - Border: Green if connected, orange if disconnected
  - Corner radius: 10pt
  - Padding: 12pt H, 11pt V

- **Get Omi Widget**: Promo for physical device
  - Background: Tertiary at 60% opacity
  - Dismissible via X button
  - Corner radius: 10pt

- **Update Available Widget**: Purple, pulsing glow
  - Background: Purple Primary
  - Shadow: Purple glow with opacity 0.3–0.7
  - Animation: Repeating easeInOut 1.2s pulse
  - Corner radius: 10pt

### Permission Status Section
- **3 toggles**: Screen Recording, Microphone, Accessibility
- **States**:
  - Granted & enabled: Green background, toggle ON
  - Granted but disabled: Clear background, toggle OFF
  - Denied: Red background, "Fix" button
  - Broken/Stale: Red background, "Reset" button
- **Icon pulsing**: When denied, scales 1.1 on pulse
- **Corner radius**: 10pt
- **Padding**: 10pt H, 7pt V

### Profile Menu Button
```swift
HStack(spacing: 12) {
  Circle()                           // Avatar
    .fill(OmiColors.backgroundTertiary)
    .frame(width: 30, height: 30)
  Text(profileInitials)
    .scaledFont(size: 11, weight: .semibold)
  
  if !isCollapsed {
    VStack(alignment: .leading, spacing: 2) {
      Text(profileName)
        .scaledFont(size: 13, weight: .medium)
    }
    Spacer()
    Image(systemName: "ellipsis")
      .scaledFont(size: 13, weight: .semibold)
  }
}
.padding(.horizontal, 12)
.padding(.vertical, 8)
.background(RoundedRectangle(cornerRadius: 12, style: .continuous)
  .fill(isHovered ? OmiColors.backgroundTertiary.opacity(0.55) : Color.clear))
```

- **Height**: ~46pt when expanded
- **Avatar**: 30pt circle, background secondary
- **Menu items**: Refer a Friend, Discord, Settings
- **Popover width**: 220pt
- **Popover item padding**: 10pt H, 9pt V

---

## 7. Recording/Listening States

### Sidebar Indicators

#### Audio Level Bars (Conversations)
- **Position**: Replaces conversation icon when active
- **Bars**: 4 vertical bars, 3pt width, 2pt spacing
- **Height range**: 4–14pt
- **Colors**:
  - Peak (>60% level): Purple Primary
  - Medium (20–60%): Text Primary
  - Low (2–20%): Text Secondary
  - Idle (<2%): Text Tertiary at 50% opacity
- **Update rate**: 5 Hz (no SwiftUI animations to prevent churn)

#### Rewind Pulsing Icon
- **Position**: Replaces rewind icon when monitoring active
- **Inner element**: 10pt circle (active) or 8pt (inactive)
  - Active: Purple Primary
  - Inactive: Error red
- **Outer ring**: Appears only when active
  - Color: Purple Primary at 30% opacity
  - Animation: Scale 1.0 → 1.4, then fade to 0
  - Duration: 1.0s easeOut, repeating
- **Pulsing effect**: Continuous while monitoring is on

### Floating Bar States

#### Compact State (Idle)
- **Appearance**: 28pt W × 6pt H thin bar
- **Corner radius**: 3pt
- **Background**: White at 50% opacity
- **Position**: Top-center of screen, always-on-top
- **Behavior**: Click to expand or show menu on hover

#### Expanded State (Hover or Active)
- **Width**: Stretches to ~400–600pt or full width
- **Corner radius**: 20pt (rounded, not pill)
- **Height**: Expands to 50–200pt depending on content
- **Transition**: 0.3s spring (response: 0.3, dampingFraction: 0.85)
- **Background**: Dark blur (NSVisualEffectView.hudWindow material) or solid dark (`rgba(31, 31, 37, 1.0)`)
- **Border**: Black at 50% opacity, 1pt stroke

#### Voice Listening State
- **Indicator**: Pulsing red circle (10pt base, 1.2x when pulsing)
- **Duration**: 0.6s easeInOut, repeating
- **Mic icon**: 14pt SF Symbol, white
- **Text**: Transcript or "Release ⌘V to send"
- **Locked badge**: Orange background, "LOCKED" text, 10pt bold
- **Padding**: 8pt spacing, 6pt H × 3pt V padding overall

#### Ask Omi Expanded View
- **Show on expand**: Large input field + AI response area
- **Input field**: Full width minus padding
- **Corner radius**: 18pt (input), 16pt (card container)
- **Response area**: Scrollable, white text on dark background
- **Transitions**: Move edge .top + opacity (0.32s spring response, 0.86 damping)

#### AI Listening/Recording Feedback
- **Pulsing dot**: Red, 10pt when active
- **Mic icon**: White, 14pt semibold
- **Transcript text**: White at 80% opacity, 13pt, truncated with head ellipsis

---

## 8. The Floating Bar

Omi's signature feature: an always-on-top floating control bar that can be toggled, expanded, and moved around the screen.

### Floating Bar Overview

```
Default (Compact):
┌──────────────────┐
│ [          ]     │  ← 28pt W × 6pt H thin pill
└──────────────────┘

On Hover (Expanded):
┌────────────────────────────────────────────────────┐
│ [Ask omi] [Push to talk: ⌘V]           [⚙️] [Close]│  ← 50pt height
│ [Ask omi Input Field ...................]            │  ← Input expands on focus
│ [Generated Response from omi .........]  [Resize]   │  ← Response area
└────────────────────────────────────────────────────┘
```

### Components

#### Compact Bar (Always Visible)
```swift
RoundedRectangle(cornerRadius: 3)
  .fill(Color.white.opacity(0.5))
  .frame(width: 28, height: 6)
```
- **Width**: 28pt
- **Height**: 6pt
- **Corner radius**: 3pt
- **Background**: White at 50% opacity
- **Position**: Always on top of other windows

#### Control Bar Buttons (When Expanded)
```swift
HStack(spacing: 3) {
  Text("Ask omi")
    .scaledFont(size: 11, weight: .medium)
    .foregroundColor(.white)
  ForEach(keys, id: \.self) { key in
    Text(key)
      .scaledFont(size: 9)
      .foregroundColor(.white)
      .padding(.horizontal, key.count > 1 ? 4 : 0)
      .frame(minWidth: 15, minHeight: 15)
      .background(Color.white.opacity(0.1))
      .cornerRadius(3)
  }
}
```
- **Font**: 11pt medium
- **Keyboard hint style**: 9pt in small rounded box
- **Height**: 50pt fixed
- **Padding**: 6pt H, 3pt V

#### Voice Listening Display
- **Content**: Pulsing red dot + mic icon + transcript or instruction
- **Height**: 50pt
- **Spacing**: 8pt between elements
- **Font**: 13pt for transcript, 10pt bold for "LOCKED" badge
- **Indicator**: Red dot pulsing 10pt → 12pt at 1.2x scale

#### Settings Button (Top-right, hover only)
```swift
Image(systemName: "gearshape.fill")
  .font(.system(size: 11))
  .foregroundColor(.white.opacity(0.7))
  .frame(width: 22, height: 22)
  .background(Color.white.opacity(0.12))
  .cornerRadius(5)
```
- **Shown**: Only on hover, fades in/out
- **Icon**: 11pt gear
- **Background**: White at 12% opacity
- **Corner radius**: 5pt
- **Padding**: 6pt around button

#### Close Button (Top-left, when expanded)
- **Icon**: 8pt xmark
- **Circle outline**: 16pt, white at 20% opacity stroke, 0.5pt
- **Button frame**: 28pt × 28pt
- **Transition**: Opacity fade

#### Resize Handle (Bottom-right, when expanded)
- **Size**: 20pt × 20pt container
- **Grip**: 14pt × 14pt showing 3 dots or diagonal lines
- **Color**: White at 30% opacity
- **Only visible**: When AI response is showing

### Input Area (Ask omi)

#### Input Field
```swift
OmiTextEditor(
  text: $inputText,
  fontSize: 14,
  textColor: OmiColors.textPrimary,
  textContainerInset: NSSize(width: 12, height: 12)
)
.background(OmiColors.backgroundTertiary)
.clipShape(RoundedRectangle(cornerRadius: 18))
.frame(maxHeight: 200)
.omiPanel(fill: OmiColors.backgroundSecondary, radius: 22)
```
- **Corner radius**: 18pt (inner), 22pt (outer panel)
- **Max height**: 200pt multiline
- **Background**: Secondary with tertiary inner background
- **Padding**: 12pt H, 12pt V
- **Placeholder**: "Type a message..." in text tertiary
- **Send button**: Purple icon (arrow.up.circle.fill), 24pt, disabled (text quaternary) until text entered

#### Response Area
- **Background**: Scrollable white text on dark
- **Padding**: 12pt
- **Font**: 14pt regular body
- **Citations**: Small cards below response with sources
- **Feedback buttons**: Rate (👍 👎), Share, Copy

### Floating Bar Background

#### Material Options
1. **Blur (Default)**
   - NSVisualEffectView with `.hudWindow` material
   - Blending mode: `.behindWindow`
   - Alpha: 0.95
   - Overlay color: Black at 18% opacity

2. **Solid (Optional, per settings)**
   - Background color: `rgba(31, 31, 37, 1.0)` (raised surface)
   - Solid appearance without blur

#### Border & Shadow
- **Border**: Black at 50% opacity, 1pt stroke
- **Shadow**: None on floating bar (macOS style)
- **Corner radius**: 5pt (compact), 20pt (expanded), smooth continuous style

### Floating Bar Animations

#### Expand/Collapse
```swift
.animation(.spring(response: 0.3, dampingFraction: 0.85), value: state.showingAIConversation)
.animation(.easeInOut(duration: 0.2), value: isHovering)
```
- **Expand on hover**: 0.3s spring (snappy)
- **Collapse on hover exit**: 0.2s easeInOut
- **Window resize**: Happens before SwiftUI update to prevent layout churn

#### Content Transitions
- **Voice listening → Input field**: Move edge .top + opacity (0.32s spring)
- **Input → Response**: Move edge .bottom + opacity (0.4s spring, 0.8 damping)
- **Notification**: Move edge .top + opacity

#### Pulsing Dots
- **Voice listening indicator**: 10pt red circle
- **Animation**: Scale 1.0 → 1.2, repeat every 0.6s easeInOut
- **Authorization glow**: Purple pulsing shadow on update button

### Floating Bar Position & Dragging
- **Draggable**: Full top area with DraggableAreaView
- **Resizable**: Via ResizeHandleView in bottom-right
- **Pinning**: Stays visible even when other windows move
- **Memory**: Position and size persisted across sessions

---

## 9. Animations & Motion

### Timing Functions

#### Spring Animations
Used for most user interactions to feel natural and responsive:

```swift
// Standard spring
.animation(.spring(response: 0.3, dampingFraction: 0.85))

// Snappier spring
.animation(.spring(response: 0.25, dampingFraction: 0.9))

// Bouncy spring (sidebar collapse)
.animation(.easeInOut(duration: 0.2))
```

#### Linear Animations
Used for continuous motion (spinners, pulsing):
```swift
.animation(.linear(duration: 1).repeatForever(autoreverses: false))
```

#### Easing Functions
- **easeInOut(0.2)**: UI state changes (sidebar collapse, theme toggle)
- **easeInOut(0.15)**: Quick toggles (locks, switches)
- **easeInOut(duration: 0.6)**: Breathing animations (pulsing)

### Transition Animations

#### Page Transitions
```swift
.transition(.move(edge: .top).combined(with: .opacity))
.transition(.move(edge: .bottom).combined(with: .opacity))
```
- Slides in from edge + fades simultaneously
- Used for sidebar pages, modals

#### Notification Slides
```swift
.transition(.move(edge: .top).combined(with: .opacity))
```
- Floats down from top when appearing
- Fades out when dismissing

#### Floating Bar Conversation
```swift
.asymmetric(
  insertion: .move(edge: .top).combined(with: .opacity),
  removal: .move(edge: .top).combined(with: .opacity)
)
```
- Input slides in from top
- Response slides in from bottom (opposite)

### Micro-interactions

#### Hover Effects
- **Buttons**: Slight background color shift (0.75 opacity)
- **Sidebar items**: Tertiary background at 75%
- **Links**: Purple color transition
- **Fade in/out**: 0.15–0.2s duration

#### Loading Spinners
```swift
ProgressView()
  .scaleEffect(0.5)
```
- Default macOS spinner, optionally scaled
- Color: White at 60% opacity

#### Recording Indicators
- **Audio bars**: Update at 5 Hz without animation
- **Rewind pulse**: 1.0s easeOut, repeating
- **Voice dot**: 0.6s easeInOut, repeating

#### Form State Changes
- **Enable/disable buttons**: Fade text color 0.15s
- **Toggle switches**: Slide thumb + background color 0.15s easeInOut
- **Text field focus**: Subtle shadow or border change, no snap

#### Page Load Indicator
- Spinner appears after 150ms delay
- Fades in 0.3s opacity
- Fades out immediately on page load complete

### Notification Animations
```swift
.animation(.spring(response: 0.35, dampingFraction: 0.82), value: state.currentNotification?.id)
```
- **Appearance**: Spring in from top
- **Dismissal**: Fade out
- **Stacking**: Multiple notifications stack with 8pt spacing

---

## 10. Visual Hierarchy Techniques

### Size Hierarchy
- **Page titles**: 18–20pt bold (largest, dominates)
- **Section headers**: 14–16pt medium
- **Body text**: 14pt regular
- **Secondary labels**: 12–13pt (de-emphasized)
- **Tertiary text**: 11pt (minimal visual weight)

### Color Hierarchy
- **Primary elements**: White text on dark backgrounds
- **Secondary elements**: Text Secondary (#E5E5E5)
- **Tertiary elements**: Text Tertiary (#B0B0B0)
- **Disabled/hints**: Text Quaternary (#888888)

### Emphasis via Color
- **Call-to-action**: Purple Primary on white/light background
- **Alerts**: Red or Orange
- **Success**: Green
- **Links**: Purple Primary, underlined

### Weight & Contrast
- **Bold text**: Headers, key information (draws eye)
- **Semibold text**: Emphasis within body (subheadings, buttons)
- **Regular text**: Default (lowest visual weight)

### Position Hierarchy
- **Top of page**: Most important (title, search)
- **Left side**: Read first in Western layout (sidebar navigation)
- **Center**: Focus point
- **Bottom**: Secondary info, less frequently accessed

### Spacing as Hierarchy
- **Tight spacing (4–8pt)**: Groups related items
- **Generous spacing (16–32pt)**: Separates major sections
- **Large gaps (32pt+)**: Distinct content areas
- **Negative space**: Drives attention to populated areas

### Interactive States
- **Default**: Text tertiary, subtle background
- **Hover**: Background 75% opacity, text secondary
- **Pressed**: Background 90% opacity, haptic feedback (if enabled)
- **Disabled**: Text quaternary, no hover effect, cursor blocked

### Loading States
- **Skeleton placeholder**: Shimmer effect, same dimensions as content
- **ProgressView**: Spinner replacing content
- **Text indicator**: "Loading..." in secondary color
- **All preserve layout**: Don't collapse or change size during load

---

## 11. Empty States

### Empty Conversations
```
┌─────────────────────────────────────────┐
│                                          │
│                                          │
│             📭 No conversations           │
│           Start recording to capture     │
│              your first conversation     │
│                                          │
│          [Record Now] [Learn More]       │
│                                          │
└─────────────────────────────────────────┘
```

- **Illustration**: Large SF Symbol or custom icon (64pt)
- **Title**: 16pt bold, primary text
- **Subtitle**: 14pt regular, secondary text
- **CTA buttons**: Purple primary + secondary/ghost button
- **Padding**: 24–32pt from edges
- **Vertical alignment**: Center of viewport
- **Spacing between elements**: 16–24pt

### Empty Search Results
```
┌─────────────────────────────────────────┐
│          🔍 No results                   │
│      Try a different search term         │
│                                          │
│      [Clear Search] [Go Back]            │
└─────────────────────────────────────────┘
```

- **Icon**: Magnifying glass at 48pt
- **Message**: Secondary text, 13pt
- **Actions**: Secondary buttons with ghost styling

### No Data States
- **Permissions page** (all permissions granted): Checkmarks, "All set!" message
- **Tasks page** (no tasks): Promo for task creation
- **Memories page** (empty): "Start recording to build your memory" message
- **Focus page** (no sessions): Promo for Focus mode enablement

### Loading Skeletons
- **Shimmer animation**: Subtle left-to-right wave at 2s duration
- **Placeholder boxes**: Same dimensions as final content
- **Gray color**: Tertiary background at 50% opacity
- **Corner radius**: Matches final component radius

---

## 12. Per-Page Layout & Design

### Home/Dashboard
```
┌─────────────────────────────────────────────────────────┐
│ Dashboard                                    Last 30 days│
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Your Stats                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │  Tasks       │ │ Goals        │ │ Conversations│  │
│  │  12 complete │ │ 2 of 3       │ │  1,243       │  │
│  └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                          │
│  Today's Tasks                                          │
│  ┌────────────────────────────────────────────────┐   │
│  │ ☀️  OVERDUE (2)                                 │   │
│  │ □ Fix login bug                        [>]     │   │
│  │ □ Update docs                          [>]     │   │
│  ├────────────────────────────────────────────────┤   │
│  │ 🌅  TODAY (5)                                   │   │
│  │ ☑ Review PR                                     │   │
│  │ □ Write test cases                             │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
│  Goals (Auto-created from memories)                    │
│  ┌────────────────────────────────────────────────┐   │
│  │ 🎯 Exercise 3x/week                  Week 2/4  │   │
│  │    Logged: Mon, Wed                            │   │
│  └────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Layout**:
- Page header with date range selector
- Score cards in 3-column grid
- Task categories with expandable sections
- Goal progress cards

**Colors**: Purple accents for scores, green for complete tasks

---

### Conversations Page
```
┌───────────────────────────────────────────────────────┐
│ [Search] [Filter] [Compact/Expanded] [Date Picker]   │
├───────────────────────────────────────────────────────┤
│                                                        │
│ ⭐ STARRED CONVERSATIONS                              │
│ ┌─────────────────────────────────────────────────┐  │
│ │ [Emoji] Title                    2:43 PM        │  │
│ │ "Preview of first message..."                   │  │
│ └─────────────────────────────────────────────────┘  │
│                                                        │
│ 📝 TODAY                                              │
│ ┌─────────────────────────────────────────────────┐  │
│ │ [Emoji] 1:1 with Sarah           11:20 AM      │  │
│ │ "Yes, let's schedule it..."                     │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─────────────────────────────────────────────────┐  │
│ │ [Emoji] Product planning          9:15 AM      │  │
│ │ "Great insights from the session..." [omi tag]│  │
│ └─────────────────────────────────────────────────┘  │
│                                                        │
│ 📅 YESTERDAY                                          │
│ ┌─────────────────────────────────────────────────┐  │
│ │ [Emoji] Title                    2:45 PM        │  │
│ └─────────────────────────────────────────────────┘  │
│                                                        │
└───────────────────────────────────────────────────────┘
```

**Layout**:
- Search + filters in header
- Sections grouped by date (Today, Yesterday, This Week, etc.)
- Each row: emoji + title + timestamp
- Hover reveals actions (star, more options)

**Colors**: Secondary background for rows, tertiary on hover, amber star when starred

---

### Memories Page
```
┌──────────────────────────────────────────────────────┐
│ Memories          [Search] [Filter] [Graph View]     │
├──────────────────────────────────────────────────────┤
│                                                       │
│ 🧠 PERSONAL                                          │
│ ┌────────────────────────────────────────────────┐  │
│ │ 🎯 "I want to learn Rust"  2 days ago         │  │
│ │ Mentioned in: 3 conversations, 1 note          │  │
│ │ [Related] [Edit] [Delete]                      │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ 💼 WORK                                              │
│ ┌────────────────────────────────────────────────┐  │
│ │ 📊 "Q4 planning meeting takeaways"  1 week ago│  │
│ │ Tags: #work #strategy #quarterly               │  │
│ │ [Export] [Share] [Delete]                      │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Layout**:
- Searchable, filterable list
- Optional graph view showing memory connections
- Each memory card: icon + title + timestamp + sources
- Tag pills for categorization

**Colors**: Purple for tags, secondary text for metadata

---

### Chat Page (Floating Bar Integration)
The Chat page is accessed primarily via the floating bar on the desktop, but also available as a main page:

```
┌────────────────────────────────────────┐
│ Ask omi                                 │
├────────────────────────────────────────┤
│                                         │
│ Q: What did I discuss about AI?        │
│ ┌────────────────────────────────────┐ │
│ │ A: Based on your recent            │ │
│ │ conversations, you discussed:      │ │
│ │ - Claude and language models       │ │
│ │ - Multimodal reasoning             │ │
│ │                                    │ │
│ │ Sources:                           │ │
│ │ [📝 Conversation on Tuesday]       │ │
│ │ [📝 Meeting notes - AI Workshop]   │ │
│ └────────────────────────────────────┘ │
│                                         │
│ [ Rating: 👍 👎 ] [ Share ]           │ │
│                                         │
│ [Follow-up: "Tell me more..."]         │ │
│                                         │
└────────────────────────────────────────┘
```

**Layout**:
- Chat history on scroll
- Each exchange: Q at top (pulled), A in card below
- Citations as clickable source cards
- Inline feedback buttons

---

### Tasks Page
```
┌──────────────────────────────────────────────────────┐
│ Tasks                                                 │
├──────────────────────────────────────────────────────┤
│ [Create Task] [Filters] [Sort]                       │
├──────────────────────────────────────────────────────┤
│                                                       │
│ ☀️ TODAY (5)                                          │
│ ┌────────────────────────────────────────────────┐  │
│ │ ☑ Fix login bug              HIGH [work]      │  │
│ └────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────┐  │
│ │ □ Update documentation         [design]        │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ 🌅 TOMORROW (3)                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ □ Prepare Q4 presentation                      │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│ 📅 LATER (12)                                        │
│ ┌────────────────────────────────────────────────┐  │
│ │ □ Learn Rust                 [personal]        │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Layout**:
- Sections by date category (Today, Tomorrow, Later, No Deadline)
- Each task: checkbox + title + priority badge + category
- Inline edit/delete actions on hover
- Collapsible sections

**Colors**: Red for high priority, amber for medium, green for complete

---

### Rewind Page
```
┌──────────────────────────────────────────────────────┐
│ Rewind                    [Search] [Timeline] [Table] │
├──────────────────────────────────────────────────────┤
│                                                       │
│ Timeline View:                                       │
│ ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 100% recorded    │
│ 9am ↑ 12pm      3pm       6pm       9pm              │
│                                                       │
│ Screenshot Clusters                                  │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│ │ 9:15am │ │12:30pm │ │ 3:45pm │ │ 7:22pm │        │
│ │ [VS]   │ │[Chrome]│ │[Slack] │ │[Figma] │        │
│ └────────┘ └────────┘ └────────┘ └────────┘        │
│                                                       │
│ Detailed Timeline (scrollable)                       │
│ ┌──────────────────────────────────────────────┐   │
│ │ 9:15 AM – Started VS Code                     │   │
│ │          Worked on login form                 │   │
│ └──────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────┐   │
│ │ 12:30 PM – Took lunch break                   │   │
│ │           Browsed news                        │   │
│ └──────────────────────────────────────────────┘   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Layout**:
- Timeline bar showing recording coverage
- Screenshot thumbnails clustered by time + app
- Detailed list on scroll
- Seekable (click timeline to jump)

**Colors**: Purple for timeline progress, app icons for identification

---

### Focus Page
```
┌────────────────────────────────────────────────┐
│ Focus                    [Toggle] [Settings]    │
├────────────────────────────────────────────────┤
│                                                 │
│ Current Status: 🟢 FOCUSED (37 min)           │
│                                                 │
│ Stats: Today                                    │
│ ┌──────────────┐ ┌──────────────┐             │
│ │ Focus Time   │ │ Distracted    │             │
│ │ 2h 14m       │ │ 18 min        │             │
│ └──────────────┘ └──────────────┘             │
│                                                 │
│ Today's Focus Sessions                         │
│ ┌─────────────────────────────────────────┐  │
│ │ 9:30 AM – 10:15 AM · VS Code           │  │
│ │ Worked on authentication module         │  │
│ └─────────────────────────────────────────┘  │
│ ┌─────────────────────────────────────────┐  │
│ │ 2:00 PM – 3:20 PM · Slack (distracted)│  │
│ │ Team discussion                         │  │
│ └─────────────────────────────────────────┘  │
│                                                 │
│ [Show Historical] [Clear All]                 │
│                                                 │
└────────────────────────────────────────────────┘
```

**Layout**:
- Live status indicator (green/orange)
- Daily stats cards
- Session list with app icons
- Toggle for Focus mode, clear history

**Colors**: Green for focused, orange for distracted

---

### Settings Page
```
┌─────────────────────────────────────────┐
│ Settings                                 │
├──────────────┬──────────────────────────┤
│ General      │ General Settings          │
│ Appearance   │ ┌──────────────────────┐ │
│ Floating Bar │ │ Font Scale     [slider]│ │
│ Shortcuts    │ │ Theme    [Light] [Dark]│ │
│ Billing      │ │ Language   [English ▼]│ │
│ About        │ └──────────────────────┘ │
│              │                          │
│              │ Appearance               │
│              │ ┌──────────────────────┐ │
│              │ │ Accent Color [Purple]│ │
│              │ │ Compact Mode [Toggle]│ │
│              │ └──────────────────────┘ │
│              │                          │
│              │ Floating Bar             │
│              │ ┌──────────────────────┐ │
│              │ │ Solid Background [T]│ │
│              │ │ Auto-hide [Off]      │ │
│              │ │ Hotkey [⌘⇧A]         │ │
│              │ └──────────────────────┘ │
│              │                          │
└──────────────┴──────────────────────────┘
```

**Layout**:
- Left sidebar with settings categories
- Right panel with content for selected category
- Form-like presentation with inputs, toggles, sliders

**Colors**: Primary text for labels, secondary for descriptions

---

## 13. Design Distinctiveness: What Makes Omi Look Like Omi

### 1. **The Floating Bar as Primary Interface**
Unlike traditional desktop apps that live in windows, Omi's floating bar is always-on-top and expandable. This represents a paradigm shift: the app can be accessed from anywhere on your Mac without switching windows. The minimal compact form (28pt × 6pt pill) expands smoothly on hover to reveal full controls. This is the signature feature.

### 2. **Purple Accent System with Restrained Usage**
Omi uses a sophisticated purple palette (`#8B5CF6` primary) but applies it sparingly: mainly for CTAs, gradients, and active states. Most of the UI is grayscale (whites, grays), which makes purple elements pop. This creates a premium, focused aesthetic — not overwhelming like some AI apps that use bright colors everywhere.

### 3. **Extreme Dark Mode Commitment**
The darkest background (`#0F0F0F`, nearly pure black) paired with carefully graduated darker backgrounds creates visual depth on dark displays. This isn't just a dark theme; it's the only theme. The app feels native to dark macOS environments.

### 4. **Sophisticated Sidebar with Collapsible State**
The 260pt expanded / 64pt collapsed sidebar with animated transitions and status badges (unread counts, lock icons, focus indicators) provides both information density and minimalism. The collapsing animation is smooth (0.2s easeInOut) and the sidebar contains rich information: nav items with audio level indicators, device status, update notifications, and permission status.

### 5. **Audio Level Visualization in Sidebar**
The Conversations nav item shows animated audio bars (4 vertical bars that scale with mic/system audio levels) when recording. The Rewind item shows a pulsing ring + dot. These are micro-interactions that telegraph real-time state without text, making the app feel alive and responsive.

### Summary
Omi looks distinctive because:
1. **Always-on floating bar** — unique interaction model
2. **Restrained purple accents** — premium feel
3. **Deep dark design** — immersive native experience
4. **Live audio indicators** — responsive feedback
5. **Sophisticated hierarchy** — not chaotic, not boring
6. **Spring animations** — snappy, natural feel

---

## Additional Technical Details

### Window Configuration
- **macOS 13+** required
- **Default size**: 1200 × 800pt
- **Resizable**: Yes
- **Border radius**: 26pt
- **Always-on-top floating bar**: Separate NSWindow with level `.floating`

### View Modifiers (OmiChrome)
```swift
enum OmiChrome {
    static let windowRadius: CGFloat = 26
    static let cardRadius: CGFloat = 24
    static let sectionRadius: CGFloat = 20
    static let controlRadius: CGFloat = 16
    static let chipRadius: CGFloat = 14
}
```

### Custom Extensions
- `scaledFont(size:, weight:, design:)` — applies user font scale
- `omiPanel()` — reusable card/panel styling with fill, stroke, shadow
- `omiControlSurface()` — control element styling
- `floatingBackground(cornerRadius:)` — blur + solid background toggle

### Accessibility
- All interactive elements have `accessibilityLabel` and `accessibilityIdentifier`
- Text contrasts meet WCAG AA standard (white on dark background)
- Font scaling adjustable via settings
- Keyboard navigation supported for core flows

---

## Implementation Notes for Linux Port

When porting Omi to Linux (GTK+/Qt or cross-platform framework):

1. **Floating Bar**: Implement as always-on-top window using platform window manager API (X11 `_NET_WM_WINDOW_TYPE_DOCK` or Wayland equivalent)

2. **Colors**: Exact hex values must be preserved for brand consistency

3. **Typography**: Use system default sans-serif (Noto Sans on Linux, matches SF on macOS)

4. **Spacing**: All values in points (pt) — maintain 8-point grid

5. **Corner Radius**: Use continuous/smooth curves (26pt, 24pt, etc.)

6. **Animations**: Spring functions with exact parameters; easing functions must match

7. **Sidebar**: Implement collapsible drawer pattern with smooth transitions

8. **Audio Visualizations**: Bar animations at 5 Hz update rate, no SwiftUI-style continuous animation

9. **Permissions UI**: Adapt to Linux permission model (different from macOS TCC)

10. **Floating Bar Expansion**: Implement as window resize + content swap, not modal overlay

---

## Document Metadata
- **Design System Version**: 1.0
- **Last Updated**: April 2026
- **Target Platform**: macOS 13+ (Swift/SwiftUI)
- **Port Target**: Linux (Gtk+ / Qt / Web)
- **Figma/Design Files**: Referenced codebase is source of truth
- **All Colors**: Specified in hex, RGB, and in-code constants
- **All Spacing**: Specified in points (pt)
- **All Typography**: Based on SF font system
- **All Animations**: Spring/easing with exact parameters

