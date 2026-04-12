# SaaS Gym Platform - MVP Interactive Prototype Design

**Date**: April 12, 2026  
**Phase**: 1 - Visual Mock Prototype (No Real-Time Updates Yet)  
**Stack**: React 18 + Tailwind CSS + recharts + lucide-react  
**Timeline**: Single session (mock complete with static/manual state changes)

---

## 1. OBJECTIVE

Build an **interactive visual prototype** demonstrating:
1. Web admin dashboard with live data displays
2. Mobile app simulator (390x844px phone frame) with 6 navigable screens
3. Both connected to **shared state** — changes in admin reflect instantly in mobile
4. Professional UX/UI for demo to clients/investors
5. Feel like a **real, operational product**

**Scope Clarity**: Phase 1 = Mock data structure + full UI + manual interactivity (click buttons to simulate events). Real-time automated updates (occupancy fluctuations, revenue spikes, live feeds) → Phase 2.

---

## 2. ARCHITECTURE

### 2.1 High-Level Structure

```
Single React App
├── Admin Dashboard (Left panel)
├── Mobile Frame (Right phone frame)
└── Shared State (useGymData context)
    └── Both components read/write same state
```

**Key Principle**: One source of truth. If admin updates occupancy to 72%, mobile gauge shows 72% immediately.

### 2.2 State Management

**Hook**: `useGymData()`

```javascript
const [state, setState] = useState({
  occupancy: 65,                    // 0-100%
  revenue: 1250,                    // $ amount
  activeMemberships: 342,           // count
  pendingPayments: 12,              // count
  checkIns: [...],                  // array of {time, name, membership, status}
  zones: {pesas: 30, cardio: 25, funcional: 10},  // occupancy per zone
  currentGym: {...},                // selected gym on mobile
  selectedMembership: null,         // for QR screen
  userRoutine: [],                  // selected muscle groups today
  liveActivity: [...],              // social feed items
})
```

**Provider Pattern**:
```jsx
<GymDataProvider>
  <div className="flex h-screen">
    <AdminDashboard />
    <MobileFrame />
  </div>
</GymDataProvider>
```

**Mutation Functions**:
- `updateOccupancy(value)` → setState occupancy
- `addRevenue(amount)` → increment revenue
- `addCheckIn(user)` → prepend to checkIns array
- `setUserRoutine(routine)` → update userRoutine
- `updateCurrentGym(gymId)` → set selectedGym on mobile

---

## 3. ADMIN DASHBOARD

### 3.1 Layout

```
┌─────────────────────────────────────────────────────┐
│ Header: Logo | GymName | Bell | Theme Toggle       │
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │ Main Content Area                         │
│ 6 Mods   │                                           │
│ (click)  │  Dashboard / Members / Payments / ...     │
│          │                                           │
│          │  [KPI Row]                                │
│          │  [Revenue Chart]                          │
│          │  [Capacity Gauges]                        │
│          │  [Check-Ins Table]                        │
│          │  [Alerts Panel]                           │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

### 3.2 Components

#### **Header.jsx**
- Logo "FitConnect"
- Gym name (e.g., "PowerGym")
- Logged-in user name
- Bell icon with badge (number of alerts)
- Light/Dark theme toggle

#### **Sidebar.jsx**
- 6 navigation items:
  - Dashboard (active by default)
  - Miembros (Members)
  - Pagos (Payments)
  - Reportes (Reports)
  - Máquinas (Machines)
  - Configuración (Settings)
- Click changes view. Only Dashboard fully functional; others show placeholder text.

#### **KPI Cards Row** (4 columns, responsive grid)

**Card 1 - Ocupación Actual** (CapacityGauge component)
- Circular gauge: "65%" (large number)
- Subtitle: "personas dentro"
- Color coding: Green <60%, Orange 60-80%, Red >80%
- Responsive to state.occupancy

**Card 2 - Ingresos Hoy**
- Large number: "$1,250"
- Subtitle: "Ingresos acumulados"
- Red/Green arrow indicator (up/down from yesterday)
- Responsive to state.revenue

**Card 3 - Miembros Activos**
- Number: "342"
- Subtitle: "Membresías vigentes"
- Static (no update needed in phase 1)

**Card 4 - Pagos Pendientes** (clickable)
- Badge: "12"
- Subtitle: "Por procesar"
- Red badge if count > 0
- Click → opens modal with list of pending payments
- Responsive to state.pendingPayments

#### **Revenue Chart** (recharts BarChart)
- 7 days (Lu-Do) on X-axis
- $ amount on Y-axis (0-5000)
- Bars animate on load (recharts default animation)
- Hover shows exact value
- Mock data: [1200, 950, 1500, 1100, 1800, 2100, 1250]

#### **Capacity Gauges Row** (3 mini-gauges side-by-side)
- Zona Pesas: 30/100 (30%)
- Zona Cardio: 25/100 (25%)
- Zona Funcional: 10/100 (10%)
- Color per capacity (green/orange/red)
- Responsive to state.zones

#### **Check-Ins Table** (last 10)
- Columns: Hora | Nombre | Membresía | Estado
- Scrollable if >10 items
- Mock data from state.checkIns
- Responsive to state updates

#### **Alerts Panel** (max 4 cards stacked)
- Examples:
  - ⚠️ "3 membresías vencen hoy"
  - 🔧 "Máquina #5 en mantenimiento"
  - 📊 "Clase de spinning llena (25/25)"
  - 📈 "Ocupación máxima hoy: 92%"
- Color: Orange (warning), Red (critical)

### 3.3 Admin Interactivity (Phase 1)

**Manual Event Simulation Buttons**:
1. "📊 +$100 Revenue" → calls `addRevenue(100)` → state.revenue updates
2. "👤 Add Check-In" → modal input, calls `addCheckIn({name, membership})` → prepends to state.checkIns
3. "📈 Change Occupancy" → modal input (0-100), calls `updateOccupancy(value)` → state updates immediately

**Clickable Elements**:
- Sidebar modules → change view (Dashboard shows full UI, others placeholders)
- "Pagos Pendientes" card → opens modal with payment list
- Charts/gauges → responsive to state (no additional interaction needed)

---

## 4. MOBILE APP

### 4.1 Device Frame

- iPhone 15 mockup: 390px width × 844px height
- Notch/status bar at top
- Bottom navigation bar (permanent)
- Fully responsive content within frame
- Container: `rounded-3xl border-8 border-gray-900 overflow-hidden`

### 4.2 Bottom Navigation

6 tabs (always visible):
1. 🏠 Home (Explorar)
2. 🏋️ Gym Profile (Perfil)
3. 📋 Memberships (Mis membresías)
4. 📱 QR (Acceso)
5. 💪 Routine (Mi rutina)
6. 👥 Social (Feed)

Click tab → render corresponding screen. Active tab highlighted.

### 4.3 Screens

#### **Screen 1: Home (Explorar)**

**Purpose**: Browse nearby gyms, see real-time occupancy

**Layout**:
- Search bar: "Buscar gymnasios cerca"
- Map area (simple, static mockup with pins)
- Scrollable list below

**Map**:
- 5-7 gym pins displayed
- User pin in center
- Pin click → navigate to GymProfileScreen for that gym
- Map is static visual (no actual Google Maps integration)

**Gym List**:
Each item:
- Gym image (placeholder thumbnail)
- Name
- Distance (km)
- Rating (⭐ 4.8)
- **LIVE Occupancy**: "65% lleno" — **SYNCED with admin state**
- "Ver" button → click navigates to that gym's profile

**Data Source**: `state.gyms` (mock array of 5-7 gyms)

---

#### **Screen 2: Gym Profile (Perfil del Gimnasio)**

**Purpose**: Detailed gym info + capacity status + membership signup

**Layout**:
- Header with back button + gym name
- Image carousel (3-4 photos, dots, manual swipe or static)
- Gym info block
- Capacity gauge (CRITICAL SYNC POINT)
- Action buttons

**Header**:
- "← GymName" (back button)
- Share icon (click → copy link, visual feedback)

**Carousel**:
- 3-4 images of gym (frontage, interior areas)
- Dots indicator (page X of Y)
- Static (no autoplay in phase 1)
- Click dots or swipe gesture to manual change slides

**Info Block**:
```
Name:        FitPlace
Address:     Calle 123, Ciudad
Phone:       +57 XXX-XXXX
Rating:      ⭐ 4.8 (342 reviews)
Hours:       Lun-Dom 6am-10pm
Plans:       $30/mo Basic | $60/mo Premium
```

**Capacity Gauge** (SYNC POINT):
- Circular gauge: "65 / 100 personas"
- Color: Green <60%, Orange 60-80%, Red >80%
- **Value comes from `state.occupancy`**
- **If admin changes occupancy to 72%, this gauge updates immediately**
- Recommendation text: "✨ Mejor hora: 8-10am"

**Buttons**:
- "Inscribirse" (Sign Up) → modal with plan selection
- "Llamar" (Call) → visual feedback (no actual call)
- "Ver más" (See More) → expands description (mock)

**Navigation Back**:
- Back button returns to HomeScreen

---

#### **Screen 3: Memberships (Mis Membresías)**

**Purpose**: View active memberships, access QR code

**Layout**:
- Header: "Mis membresías"
- Membership cards (stacked)
- "Agregar membresía" button

**Card per Membership**:
```
FitPlace
Premium
Vence el 15 mayo
[=======>  ] 12 días restantes
✅ Activo

[Acceso] [Renovar]
```

- Gym name (bold, large)
- Plan name
- Expiration date
- Progress bar (days remaining / total days)
- Status badge (green "Activo")
- "Acceso" button → click navigates to QRScreen for that membership
- "Renovar" button → modal (mock, no actual payment)

**Data Source**: `state.memberships`

---

#### **Screen 4: QR Code (Código de Acceso)**

**Purpose**: Generate/display entry QR code

**Layout**:
- Header: "Código de acceso"
- Large QR code (240×240px, centered)
- Border animation (CSS pulse/glow)
- Info text below
- "Generar nuevo código" button

**QR Code**:
- Use `qrcode.react` or similar library
- Value: random hash (e.g., `crypto.getRandomValues()` or simple random string)
- **Each time screen loads, generate NEW QR** (different hash)
- Animated border: `animation: pulse 2s infinite` (CSS)

**Info**:
```
Escanea en la entrada
GymName
Plan: Premium
✅ Código válido por: 1 entrada
```

**"Generar nuevo código" Button**:
- Click → generate new random hash
- QR updates (fade transition)
- Feedback: "Nuevo código generado ✨"

---

#### **Screen 5: Routine (Mi Rutina Hoy)**

**Purpose**: Select muscle groups for today's workout

**Layout**:
- Header: "Mi rutina hoy"
- Question: "¿Qué vas a entrenar?"
- 6 toggle buttons (multi-select)
- "Registrar" button (active only if ≥1 selected)

**Toggle Buttons** (CSS transitions for style change):
- 🫀 Pecho (Chest)
- 🔄 Espalda (Back)
- 🦵 Piernas (Legs)
- 💪 Brazos (Arms)
- ⚡ Funcional (Functional)
- 🏃 Cardio

**Behavior**:
- Each button has two states: active (primary color, bold) / inactive (gray)
- Click toggles state (multi-select allowed)
- "Registrar" button: disabled if 0 selected, enabled if ≥1
- Click "Registrar":
  - Saves selected groups to `state.userRoutine`
  - Shows toast: "✅ Rutina registrada"
  - List reflects saved routine if revisit screen

**Data Source**: `state.userRoutine` (array of selected muscle groups)

---

#### **Screen 6: Social Feed (Qué Entrenan Otros Ahora)**

**Purpose**: Real-time view of what others are training (simulated)

**Layout**:
- Header: "Qué entrenan en FitPlace"
- Scrollable list of activity items

**Activity Item**:
```
[Avatar] Juan
está entrenando Pecho
hace 2 min
```

- User avatar (circular placeholder image)
- User name (bold)
- Activity text: "está entrenando [Muscle Group]"
- Time ago (e.g., "2 min", "8 min")
- Color code per muscle group (optional)

**Data Source**: `state.liveActivity` (array of {user, muscle, time})

**Mockups Examples**:
```
Juan → Pecho → 2 min ago
María → Piernas → 8 min ago
Carlos → Espalda → 15 min ago
Ana → Cardio → 1 min ago
```

---

### 4.4 Mobile Interactivity (Phase 1)

- **Bottom nav**: Click tab → render corresponding screen
- **HomeScreen**: Click gym item → navigate to GymProfileScreen (populate with that gym's data)
- **GymProfileScreen**: 
  - Carousel: click dots to change image (or mock swipe)
  - Buttons: "Inscribirse" → modal, "Llamar" → toast, "Ver más" → expand
  - **Occupancy gauge: SYNCED to admin** (if admin changes via button, gauge reflects immediately)
- **MembershipsScreen**: Click "Acceso" button → navigate to QRScreen (for that membership)
- **QRScreen**: Click "Generar nuevo código" → new QR hash (fade animation)
- **RoutineScreen**: Click muscle groups to toggle, click "Registrar" → save + toast
- **SocialFeedScreen**: Scroll, items static (no auto-update in phase 1)

---

## 5. SHARED STATE SYNCHRONIZATION

### 5.1 The Sync Mechanism

Both Admin and Mobile read from **same context**:

```jsx
const { state, updateOccupancy, addRevenue, ... } = useGymData()
```

**Example Flow**:
1. Admin clicks "Change Occupancy" button → modal input "75"
2. Admin calls `updateOccupancy(75)` → state.occupancy = 75
3. Mobile's GymProfileScreen receives updated state via context
4. Gauge re-renders: "75 / 100 personas"
5. **Instant visual feedback** (no delay)

### 5.2 Critical Sync Points

- **Occupancy**: HomeScreen list + GymProfileScreen gauge + Admin KPI card
- **Revenue**: Admin KPI card (mobile doesn't display this)
- **Check-Ins**: Admin table (mobile doesn't display this)
- **User Routine**: Mobile only (Admin displays count in alerts, optional)
- **Current Gym**: Mobile tracks selected gym (Admin doesn't care)

---

## 6. FOLDER STRUCTURE

```
src/
├── components/
│   ├── Admin/
│   │   ├── Dashboard.jsx          (main container)
│   │   ├── Header.jsx
│   │   ├── Sidebar.jsx
│   │   ├── KPICard.jsx            (reusable KPI card)
│   │   ├── CapacityGauge.jsx      (circular gauge)
│   │   ├── RevenueChart.jsx       (recharts bar chart)
│   │   ├── CheckInsList.jsx       (table)
│   │   ├── AlertsPanel.jsx        (alert cards)
│   │   └── PendingPaymentsModal.jsx
│   ├── Mobile/
│   │   ├── MobileFrame.jsx        (phone container + bottom nav)
│   │   ├── BottomNav.jsx
│   │   ├── screens/
│   │   │   ├── HomeScreen.jsx
│   │   │   ├── GymProfileScreen.jsx
│   │   │   ├── MembershipsScreen.jsx
│   │   │   ├── QRScreen.jsx
│   │   │   ├── RoutineScreen.jsx
│   │   │   └── SocialFeedScreen.jsx
│   └── Common/
│       ├── Button.jsx
│       ├── Card.jsx
│       ├── Badge.jsx
│       └── Modal.jsx
├── hooks/
│   └── useGymData.js              (context + provider)
├── data/
│   └── mockData.js
├── App.jsx
├── App.css                        (Tailwind imports)
└── index.css
```

---

## 7. DATA STRUCTURE

### 7.1 Initial State (mockData.js)

```javascript
export const initialGymState = {
  occupancy: 65,
  revenue: 1250,
  activeMemberships: 342,
  pendingPayments: 12,
  zones: { pesas: 30, cardio: 25, funcional: 10 },
  
  checkIns: [
    { time: "16:45", name: "Juan Pérez", membership: "Premium", status: "Entrada" },
    { time: "16:32", name: "María García", membership: "Basic", status: "Entrada" },
    // ... 8 more
  ],
  
  gyms: [
    { id: 1, name: "FitPlace", distance: "0.5km", rating: 4.8, occupancy: 65, image: "..." },
    { id: 2, name: "PowerGym", distance: "1.2km", rating: 4.5, occupancy: 92, image: "..." },
    { id: 3, name: "CrossFit Central", distance: "1.8km", rating: 4.9, occupancy: 45, image: "..." },
    // ... 4 more
  ],
  
  memberships: [
    { id: 1, gym: "FitPlace", plan: "Premium", expiresIn: 12, status: "active" },
    { id: 2, gym: "PowerGym", plan: "Basic", expiresIn: 3, status: "active" },
  ],
  
  alerts: [
    { type: "warning", text: "3 membresías vencen hoy" },
    { type: "info", text: "Clase de spinning llena (25/25)" },
    { type: "danger", text: "Máquina #5 en mantenimiento" },
  ],
  
  liveActivity: [
    { user: "Juan", muscle: "Pecho", time: "2 min" },
    { user: "María", muscle: "Piernas", time: "8 min" },
    // ... more
  ],
  
  currentGym: null,     // set when mobile navigates to gym profile
  userRoutine: [],      // selected muscle groups
}
```

---

## 8. STYLING & DESIGN TOKENS

### 8.1 Color Palette

```css
--primary-orange:    #FF6B35
--secondary-blue:    #004E89
--success-green:     #1ECC6F
--warning-yellow:    #FFB703
--danger-red:        #D62828
--neutral-light:     #F8F9FA
--neutral-dark:      #2D3436
```

### 8.2 Typography

- **Headlines**: Inter Bold, 18-32px
- **Body**: Inter Regular, 14-16px
- **Numbers**: Inter SemiBold, 24-48px

### 8.3 Spacing & Borders

- Padding cards: 16-24px
- Gaps: 12-16px
- Border radius: 8-12px
- Mobile frame border-radius: 48px (iPhone notch)

### 8.4 Animations (Phase 1 - CSS Only)

- Transitions: `transition: all 0.3s ease`
- Gauge color change: smooth (300ms)
- QR glow: `animation: pulse 2s infinite`
- Button hover: scale/color shift
- Modal fade-in: opacity 0 → 1 (200ms)

**NO Framer Motion yet** (Phase 2 upgrade)

---

## 9. PHASE 1 DELIVERABLES

### Checklist

- [x] Project structure & git init
- [ ] useGymData context + provider
- [ ] Admin Dashboard layout + all components
- [ ] Mobile Frame + 6 screens
- [ ] Mock data (mockData.js)
- [ ] CSS styling (Tailwind + custom)
- [ ] Admin interactivity (simulation buttons)
- [ ] Mobile navigation + screen switching
- [ ] Shared state synchronization tested
- [ ] No React warnings
- [ ] Responsive (desktop layout: admin left, mobile right)

---

## 10. PHASE 2 (Future - Out of Scope)

- Real-time updates: occupancy fluctuations (±5% every 4s)
- Revenue spikes: +$50-200 every ~10s
- Check-ins auto-populating: every 8-12s
- Live feed items appearing/disappearing
- Framer Motion animations:
  - Count-up for numbers
  - Slide-in for new feed items
  - Smooth bar chart animations
  - QR border glow enhancement
- localStorage persistence (optional)

---

## 11. SUCCESS CRITERIA

**Phase 1 Complete When**:
- ✅ Both views render without errors
- ✅ Click buttons in admin → state updates → mobile reflects immediately
- ✅ Mobile navigation between screens works smoothly
- ✅ QR code generates new hash each screen load
- ✅ Occupancy value in admin KPI matches mobile gauge (always)
- ✅ UI looks polished, professional, ready for demo
- ✅ No console warnings
- ✅ Code is clean, modular, commented where needed

---

## 12. CONSTRAINTS & NOTES

- ❌ No heavy libraries (keep bundle light)
- ❌ No external APIs (all mock data)
- ❌ No localStorage (state resets on refresh, ok)
- ❌ No real payments/authentication
- ✅ Performance: smooth 60fps
- ✅ Accessibility: semantic HTML, ARIA labels where appropriate
- ✅ Mobile responsiveness: desktop (side-by-side) → tablet → mobile (toggle view)

---

**Document Version**: 1.0  
**Last Updated**: April 12, 2026  
**Status**: Ready for Implementation Planning
