# Heurix UI/UX Inspector - Technical Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Details](#component-details)
3. [Data Flow](#data-flow)
4. [API Reference](#api-reference)
5. [Configuration](#configuration)
6. [Development Guide](#development-guide)
7. [Troubleshooting](#troubleshooting)

## Architecture Overview

The Heurix Inspector follows a modular architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Mixed Layer   │    │   Backend       │
│   (UI Layer)    │    │   (Bridge)      │    │   (Logic Core)  │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Popup.tsx     │◄──►│ • content.ts    │◄──►│ • background/   │
│ • Report.tsx    │    │                 │    │   index.ts      │
│ • Tailwind CSS  │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ Communication   │
                    │ Bridge          │
                    │ utils/comm.ts   │
                    └─────────────────┘
```

### Layer Responsibilities

#### Frontend Layer (UI)

- **Purpose**: User interface and user experience
- **Components**: Popup, Report, Styling
- **Technologies**: React, TypeScript, Tailwind CSS
- **Responsibilities**:
  - User interaction handling
  - Data visualization
  - State management for UI
  - User feedback and notifications

#### Mixed Layer (Page Interaction)

- **Purpose**: Bridge between extension and web page
- **Components**: Content Script
- **Technologies**: TypeScript, DOM APIs
- **Responsibilities**:
  - Page element analysis
  - Real-time inspection
  - Visual highlighting
  - Data collection from page

#### Backend Layer (Core Logic)

- **Purpose**: Business logic and data management
- **Components**: Background Service Worker
- **Technologies**: TypeScript, Chrome APIs
- **Responsibilities**:
  - State management
  - Data persistence
  - Cross-tab communication
  - Settings management
  - Data processing and analysis

## Component Details

### 1. Popup Component (`src/popup/Popup.tsx`)

**Purpose**: Main user interface for the extension popup

**Key Features**:

- Inspection status control
- Real-time statistics display
- Quick actions (start/stop, clear data)
- Navigation to detailed reports

**State Management**:

```typescript
interface PopupState {
  isActive: boolean;
  inspectionData: InspectionData[];
  currentUrl: string;
  totalIssues: number;
}
```

**Key Methods**:

- `toggleInspection()`: Start/stop inspection mode
- `clearData()`: Clear all inspection data
- `openReport()`: Navigate to detailed report

### 2. Content Script (`src/content/content.ts`)

**Purpose**: Analyzes web pages and detects UI/UX issues

**Key Features**:

- Real-time page analysis
- Visual element highlighting
- Issue detection algorithms
- User interaction handling

**Analysis Types**:

- **Accessibility**: Alt text, labels, contrast
- **Usability**: Click targets, readability
- **Performance**: Image optimization, resource loading
- **Design**: Spacing, typography, consistency
- **Responsive**: Mobile compatibility, layout issues

**Key Classes**:

```typescript
class HeurixInspector {
  private isActive: boolean;
  private inspectionResults: InspectionResult[];
  private highlightedElements: HTMLElement[];
  private overlay: HTMLElement;
}
```

### 3. Background Service (`src/background/index.ts`)

**Purpose**: Core business logic and state management

**Key Features**:

- Extension state management
- Data persistence
- Cross-component communication
- Settings management
- Data export/import

**State Management**:

```typescript
interface ExtensionState {
  isActive: boolean;
  inspectionData: InspectionData[];
  currentTabId?: number;
  settings: {
    autoInspect: boolean;
    highlightIssues: boolean;
    showRecommendations: boolean;
    inspectionTypes: string[];
  };
}
```

**Key Methods**:

- `toggleInspection()`: Control inspection state
- `updateInspectionData()`: Process and store results
- `exportInspectionData()`: Export data for external use
- `handleTabUpdate()`: Manage tab-specific state

### 4. Report Component (`src/report/Report.tsx`)

**Purpose**: Comprehensive inspection report viewer

**Key Features**:

- Detailed issue analysis
- Filtering and sorting
- Export functionality
- Interactive element inspection
- Statistical overview

**Report Features**:

- Issue categorization
- Severity assessment
- Recommendation engine
- Export capabilities (JSON, CSV)
- Historical data tracking

### 5. Communication Bridge (`src/utils/communication.ts`)

**Purpose**: Unified messaging system between components

**Key Features**:

- Type-safe message passing
- Error handling
- Message routing
- Storage management
- Tab management

**Message Types**:

```typescript
interface Message {
  type: string;
  data?: any;
  error?: string;
}
```

**Key Methods**:

- `sendMessage()`: Send messages to background
- `onMessage()`: Register message handlers
- `getCurrentTabId()`: Get active tab information
- `getStorage()`/`setStorage()`: Data persistence

## Data Flow

### 1. Inspection Initiation

```
User clicks "Start Inspection" → Popup → Background → Content Script
```

### 2. Data Collection

```
Content Script analyzes page → Detects issues → Sends to Background → Stores data
```

### 3. Data Display

```
Background → Popup (real-time updates) → User sees statistics
Background → Report (detailed view) → User sees comprehensive analysis
```

### 4. Data Export

```
User clicks "Export" → Background → Generates report → Downloads file
```

## API Reference

### Chrome Extension APIs Used

#### chrome.runtime

- `onMessage`: Message handling
- `sendMessage`: Inter-component communication
- `getManifest()`: Extension metadata

#### chrome.tabs

- `query()`: Get tab information
- `sendMessage()`: Send messages to content scripts
- `create()`: Open new tabs
- `onUpdated`: Tab change events
- `onActivated`: Tab activation events

#### chrome.storage

- `local`: Local data storage
- `sync`: Synchronized settings
- `get()`/`set()`: Data operations

#### chrome.scripting

- `executeScript()`: Inject content scripts

### Custom APIs

#### Inspection API

```typescript
interface InspectionResult {
  element: string;
  type: string;
  issues: string[];
  recommendations: string[];
  timestamp: number;
  selector: string;
  position: { x: number; y: number; width: number; height: number };
}
```

#### Communication API

```typescript
// Send message
await sendMessage({ type: "TOGGLE_INSPECTION", data: { active: true } });

// Listen for messages
onMessage((message) => {
  if (message.type === "INSPECTION_DATA") {
    // Handle inspection data
  }
});
```

## Configuration

### Manifest Configuration (`manifest.json`)

```json
{
  "manifest_version": 3,
  "name": "Heurix UI/UX Inspector",
  "version": "1.0.0",
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/index.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content.js"],
      "css": ["src/styles/tailwind.css"]
    }
  ]
}
```

### Settings Configuration

```typescript
interface Settings {
  autoInspect: boolean;
  highlightIssues: boolean;
  showRecommendations: boolean;
  inspectionTypes: string[];
}
```

## Development Guide

### Prerequisites

- Node.js 16+
- TypeScript 4.5+
- Chrome/Chromium browser
- Git

### Setup

1. Clone repository
2. Install dependencies: `npm install`
3. Build extension: `npm run build`
4. Load in Chrome: Developer mode → Load unpacked

### Development Workflow

1. Make code changes
2. Build extension: `npm run build`
3. Reload extension in Chrome
4. Test functionality
5. Debug using Chrome DevTools

### Building

```bash
# Development build
npm run build

# Production build
npm run build:prod

# Watch mode
npm run watch
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint
```

### Debugging

#### Popup Debugging

1. Right-click extension icon
2. Select "Inspect popup"
3. Use Chrome DevTools

#### Content Script Debugging

1. Open Chrome DevTools on target page
2. Go to Sources tab
3. Find content script files
4. Set breakpoints

#### Background Script Debugging

1. Go to `chrome://extensions/`
2. Find Heurix Inspector
3. Click "Inspect views: background page"
4. Use Chrome DevTools

### Code Structure

#### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

#### Build Configuration

- TypeScript compilation
- CSS processing
- Asset optimization
- Source maps generation

## Troubleshooting

### Common Issues

#### 1. Extension Not Loading

- Check manifest.json syntax
- Verify file paths
- Check Chrome console for errors

#### 2. Content Script Not Injecting

- Verify permissions in manifest
- Check URL patterns
- Ensure script files exist

#### 3. Communication Errors

- Check message types
- Verify sender/receiver setup
- Check for async/await issues

#### 4. Storage Issues

- Verify storage permissions
- Check data serialization
- Handle storage quota limits

### Debug Tools

#### Chrome DevTools

- Console for error messages
- Network tab for requests
- Sources tab for debugging
- Application tab for storage

#### Extension APIs

- `chrome.runtime.lastError`: Check for API errors
- `chrome.storage.onChanged`: Monitor storage changes
- `chrome.tabs.onUpdated`: Monitor tab changes

### Performance Optimization

#### Memory Management

- Clean up event listeners
- Remove DOM references
- Limit data storage size

#### CPU Optimization

- Debounce user interactions
- Use requestAnimationFrame
- Optimize analysis algorithms

#### Network Optimization

- Minimize external requests
- Cache analysis results
- Use efficient data structures

### Error Handling

#### Try-Catch Blocks

```typescript
try {
  await sendMessage(message);
} catch (error) {
  console.error("Message sending failed:", error);
}
```

#### Error Boundaries

```typescript
// React error boundary for UI components
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error("Component error:", error, errorInfo);
  }
}
```

#### Graceful Degradation

- Fallback UI for errors
- Default values for missing data
- Retry mechanisms for failed operations

---

This technical documentation provides comprehensive information about the Heurix Inspector architecture, components, and development practices. For additional support, refer to the main README.md or create an issue in the repository.
