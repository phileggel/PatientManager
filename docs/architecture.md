# Architecture

## Overview

Single executable desktop application built with **Tauri**:
- **Frontend**: React with TypeScript (web UI)
- **Backend**: Rust (native performance)
- **Database**: SQLite (local, encrypted storage)

## Project Structure

```
ProjectSF/
├── src-tauri/              # Rust backend
│   └── src/
│       ├── api/            # API layer (Tauri command handlers)
│       ├── application/    # Business logic layer
│       ├── domain/         # Domain entities
│       └── infra/          # Infrastructure layer (database)
├── src/                    # React frontend (TypeScript)
│   ├── api/                # DTO declarations for Tauri communication
│   ├── domain/             # Domain entity declarations (mirrored from backend)
│   ├── presentation/       # All UI-related code (DDD-organized)
│   │   ├── components/     # Reusable UI components (common/, layout/)
│   │   ├── pages/          # Full-page components (HomePage)
│   │   ├── contexts/       # React contexts (DrawerContext)
│   │   ├── notification/   # Notification system (useNotification, BottomBar)
│   │   ├── styles/         # Global design tokens and CSS variables
│   │   ├── patient/        # Patient feature module
│   │   └── fund/           # Fund feature module
│   └── lib/                # Shared utilities (logger, version info)
├── scripts/                # Build & dev scripts
└── docs/                   # Documentation
```

## Technology Stack

### Frontend
- **React 18** - UI framework with functional components and hooks
- **TypeScript** - Static type checking and type safety
- **Vite** - Fast build tool with hot module reload
- **CSS Modules** - Scoped component styling with design tokens
- **React Data Grid** - Enterprise-grade table component with sorting and inline editing
- **Pino** - Structured logging on frontend
- **Material Design 3** - Design system for tokens, typography, colors, and spacing

### Backend
- **Rust** - Type-safe, fast system language
- **Tauri** - Desktop application framework

### Communication
- **Tauri Commands** - Type-safe frontend-backend communication
- **JSON serialization** - Data exchange format

## Design Decisions

### Why Tauri over Electron?
- Smaller executable size (10-50MB vs 200MB+)
- Lower memory footprint (100-150MB vs 500MB+)
- Native performance through Rust backend
- Better security through Rust's memory safety

### Why Rust for backend?
- Memory safety without garbage collection
- Type system catches errors at compile time
- Fast execution
- Great async/await support for future features

### Why React for frontend?
- Familiar to web developers
- Large ecosystem and documentation
- Component-based architecture
- Hot reload for fast development

## Frontend Architecture

The React frontend follows a **layered, DDD-inspired architecture** with feature-based organization:

### Core Layers

**Domain Layer** (`src/domain/`)
- Domain entities mirrored from backend (shared ubiquitous language)
- `Patient`, `AffiliatedFund` types
- Ensures type safety across Tauri IPC boundary

**API Layer** (`src/api/`)
- DTO declarations for Tauri IPC communication
- Request/response types with discriminated unions (`Ok`/`Err`)
- Wraps domain entities with metadata (status, timestamps)

### Presentation Layer (`src/presentation/`)

**Components** - Organized by scope:
- **Common** - Generic UI building blocks (`Button`, `Input`, `Card`, `AboutModal`)
- **Layout** - App shell components (`Header`, `Drawer`, `DrawerToggle`, `Footer`)
- **Patient** - Patient domain-specific components (`PatientForm`, etc.)
- Each subdirectory uses barrel exports (`index.ts`) for clean imports

**Pages** - Full-page components:
- Compose features and layout components
- Handle page-level navigation and state
- Examples: `HomePage`, `PatientPage`

**Services** - API client wrappers:
- Wrap Tauri `invoke()` calls for type-safe backend communication
- Return `ServiceResult<T>` for consistent error handling
- Examples: `fundService.ts`, `patientService.ts`
- Components should never invoke Tauri directly—always use services

**Hooks** - Custom React hooks:
- Business logic and state management
- Example: `useFundController.ts` for fund CRUD operations
- `useNotification.ts` for notification display with auto-dismiss

**Contexts** - Global UI state:
- `DrawerContext` for drawer open/close and body scroll locking
- Shared across multiple components

**Notification System** - User feedback:
- `useNotification` hook for showing messages
- `BottomBar` component for display
- Auto-dismiss after 5 seconds
- Four types: success, error, info, warning

**Styles** - Global design tokens and CSS variables:
- `src/presentation/styles/tokens.css` - Material Design 3 typography, spacing, sizes
- `src/presentation/styles/colors.css` - Material Design 3 color palette
- Used by all components through CSS variables for consistent theming
- Each component uses scoped CSS Modules (`.module.css`) for component-specific styles

### Feature-Based Organization

New features use feature modules organized by domain, colocating all related code (components, services, hooks, tests, styles) in a single folder:

**Patient Module** (`src/presentation/patient/`):
- `PatientPage.tsx` - Feature entry point
- `PatientForm.tsx` - Form component for adding patients
- `patientService.ts` - Service wrapper for Tauri commands
- `patientService.test.ts` - Service tests
- `PatientForm.test.tsx` - Form component tests
- `types.ts` - Feature-specific types
- `*.module.css` - Component styles (scoped)
- `index.ts` - Barrel export

**Fund Module** (`src/presentation/fund/`):
- `FundsPage.tsx` - Feature entry point
- `FundList.tsx` - DataGrid with sorting and inline editing
- `AddFundForm.tsx` - Form for creating funds
- `useFundController.ts` - Business logic hook
- `*.test.tsx` - Component tests
- `types.ts` - Feature-specific types (`FundRow`)
- `*.module.css` - Component styles (scoped)
- `index.ts` - Barrel export

This pattern ensures:
- Clear feature boundaries
- All feature code colocated for easy discovery
- Facilitates code splitting and lazy loading
- Reduces component interdependencies

### Enabler Layers

**Lib** (`src/lib/`)
- `logger.ts` - Pino structured logging with localStorage persistence
- `version.ts` - App version management
- Shared utilities used across all layers

### Component Structure

```
├── PageComponent.tsx       # Page entry point
├── PageComponent.module.css # Scoped page styles
├── FeatureContainer.tsx    # Container/orchestrator component
├── FeatureList.tsx         # Presentational list component
├── AddFeatureForm.tsx      # Form component
├── useFeatureController.ts # Business logic hook
├── types.ts                # Feature-specific types
└── index.ts                # Barrel export for clean imports
```

### Design Principles

1. **Separation of Concerns**: Services handle IPC, hooks handle state, components handle UI
2. **Type Safety**: Full TypeScript with domain entities and DTOs
3. **Testability**: Mock services in tests, not React internals
4. **Composition**: Prefer component composition over inheritance
5. **DRY**: Reusable components in `common/`, feature-specific in feature folders
6. **Accessibility**: Semantic HTML and ARIA attributes in components
7. **Performance**: CSS Modules prevent style conflicts, DataGrid for efficient rendering

This architecture ensures separation of concerns, testability through service mocking, and type safety across the entire frontend.

## Backend Architecture

The Rust backend follows a **layered architecture** pattern:

- **API Layer**: Tauri command handlers; converts between DTOs and domain objects
- **Application Layer**: Business logic and orchestration; depends on repository traits, not concrete implementations
- **Infrastructure Layer**: Database, persistence; implements repository traits
- **Domain**: Value objects and entities (not a horizontal layer, but shared across all layers)

This design enables testability through trait mocking, flexibility to swap implementations, and scalability for new features.

## Domain Entities

Domain entities are **identical in frontend and backend**, representing core business concepts. At the Tauri IPC boundary, domain entities are wrapped in DTOs that include metadata (request ID, result/error status, etc.). Commands without domain inputs/outputs may omit the domain entity from the DTO.

## Data Flow

**Request (Frontend → Backend):**
```
React Component → Service Layer → DTO(domain entity + metadata) → Tauri IPC → API Layer (unwraps DTO) → Application Layer → Infrastructure Layer → Database
```

**Response (Backend → Frontend):**
```
Database → Infrastructure Layer → Application Layer → API Layer (wraps in DTO) → Tauri IPC → DTO(domain entity + metadata) → Service Layer → React State → UI Render
```

## Available Commands

These Tauri commands bridge frontend and backend:

### Patient Commands

| Command | Purpose | Feature Module |
|---------|---------|---------|
| `add_patient` | Create a new patient record | `src/presentation/patient/patientService.ts` |
| `read_all_patients` | Retrieve all patient records | `src/presentation/patient/patientService.ts` |

### Fund Commands

| Command | Purpose | Feature Module |
|---------|---------|---------|
| `add_fund` | Create a new affiliated fund record | `src/presentation/fund/` |
| `read_all_funds` | Retrieve all affiliated fund records | `src/presentation/fund/` |
| `update_fund` | Update an existing affiliated fund record | `src/presentation/fund/` |

Each command is wrapped by a service in the feature module that handles type-safe invocation and error handling.
