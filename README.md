# Heurix AI UX Inspector

**One-click AI UX Audit powered by Chrome Built-in AI**

A revolutionary browser extension that leverages Chrome's built-in AI capabilities to provide automated usability assessment, scoring, and intelligent recommendations for web pages. Transform Chrome into your personal UX research assistant.

## 🚀 Features

### 🤖 AI-Powered Analysis

- **Chrome AI Integration**: Leverages Chrome's built-in AI (Gemini Nano) for intelligent analysis
- **Automatic UX Scoring**: Generates usability scores (0-100) based on Nielsen's 10 heuristics
- **AI-Generated Insights**: Intelligent summaries and actionable recommendations
- **Privacy-First**: Local processing with optional cloud enhancement

### 🔍 Comprehensive UX Evaluation

- **Accessibility Auditing**: AI-powered accessibility issue detection
- **Usability Testing**: Automated analysis of click targets, readability, and user flows
- **Performance Insights**: Detects performance-related UI issues
- **Design Consistency**: Checks for design inconsistencies and responsive design problems
- **Real-time Analysis**: Instant feedback with visual highlighting

### 📊 Smart Reporting

- **Interactive Reports**: Detailed AI-generated reports with filtering
- **Export Capabilities**: PDF/Markdown export for sharing and documentation
- **Confidence Scoring**: AI confidence levels for analysis accuracy
- **Historical Tracking**: Monitor UX improvements over time

## 📁 Project Structure

```
heurix-extension/
├── manifest.json                # Extension configuration
├── src/
│   ├── popup/
│   │   ├── Popup.tsx           # Frontend - Extension popup UI
│   │   └── Popup.html          # Popup HTML template
│   ├── content/
│   │   └── content.ts          # Mixed layer - Page interaction script
│   ├── background/
│   │   └── index.ts            # Backend - Core logic and state management
│   ├── report/
│   │   ├── Report.tsx          # Frontend - Detailed report viewer
│   │   └── Report.html         # Report HTML template
│   ├── utils/
│   │   └── communication.ts    # Communication bridge between frontend/backend
│   └── styles/
│       └── tailwind.css        # Frontend - Styling with Tailwind CSS
└── public/
    └── icons/                  # Extension icons (16px, 32px, 48px, 128px)
```

## 🏗️ Architecture

### Frontend Layer (UI)

- **Popup.tsx**: Main extension popup interface
- **Report.tsx**: Detailed inspection report viewer
- **Tailwind CSS**: Modern styling framework

### Mixed Layer (Page Interaction)

- **content.ts**: Content script that runs on web pages
- Handles page interaction and element analysis
- Communicates with background script

### Backend Layer (Core Logic)

- **background/index.ts**: Service worker managing extension state
- Handles data persistence and cross-tab communication
- Manages inspection settings and data processing

### Communication Bridge

- **communication.ts**: Unified messaging system
- Handles communication between all extension components
- Provides type-safe message passing

## 🔧 Installation

### Prerequisites

- Node.js 16+
- npm or yarn
- Chrome/Chromium-based browser

### Development Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd heurix-extension
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the extension**

   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder from the project

### Production Build

```bash
npm run build:prod
```

## 🎯 Usage

### One-Click AI Analysis

1. **Start AI Analysis**

   - Click the Heurix extension icon
   - Click "Start AI Analysis" in the popup
   - Chrome AI will analyze the page structure and UX

2. **View AI Results**

   - See your usability score (0-100) prominently displayed
   - Read AI-generated summary of key issues
   - Review intelligent recommendations
   - Check confidence level of the analysis

3. **Export AI Reports**
   - Generate comprehensive PDF/Markdown reports
   - Share AI insights with your team
   - Track UX improvements over time

### Chrome AI Requirements

- **Chrome Version**: Latest Chrome with AI capabilities
- **Permissions**: Extension requests AI API permissions
- **Local Processing**: Analysis runs on your device for privacy
- **Optional Cloud**: Choose deeper analysis with cloud AI

### Advanced Features

- **Filter by Issue Type**: Filter results by accessibility, usability, performance, or design issues
- **Element Details**: Click on any issue to see detailed information and recommendations
- **Settings**: Configure inspection preferences and issue types
- **Data Management**: Clear inspection data or import/export results

## 🔍 Inspection Types

### Accessibility Issues

- Missing alt text on images
- Missing form labels
- Insufficient color contrast
- Missing ARIA attributes

### Usability Issues

- Small click targets (< 44px)
- Poor text readability
- Inconsistent navigation
- Confusing user flows

### Performance Issues

- Oversized images
- Inefficient CSS/JS loading
- Render-blocking resources
- Memory leaks

### Design Issues

- Inconsistent spacing
- Poor typography hierarchy
- Color scheme problems
- Layout inconsistencies

### Responsive Design Issues

- Elements too wide for mobile
- Fixed dimensions
- Poor mobile navigation
- Touch target issues

## 🛠️ Development

### Project Structure Explanation

#### Frontend Components

- **Popup.tsx**: Main user interface for the extension popup
- **Report.tsx**: Comprehensive report viewer with filtering and export
- **Tailwind CSS**: Utility-first CSS framework for consistent styling

#### Backend Services

- **background/index.ts**: Core service worker managing extension state
- Handles data persistence, cross-tab communication, and settings management
- Implements inspection logic and data processing

#### Communication Layer

- **communication.ts**: Unified messaging system between components
- Provides type-safe communication between popup, content script, and background
- Handles message routing and error management

#### Content Script

- **content.ts**: Runs in the context of web pages
- Performs real-time analysis of page elements
- Communicates findings back to background script

### Key Technologies

- **TypeScript**: Type-safe development
- **React**: Component-based UI development
- **Tailwind CSS**: Utility-first styling
- **Chrome Extension APIs**: Browser extension functionality
- **Manifest V3**: Latest extension standard

### Development Workflow

1. **Code Changes**: Modify source files in `src/`
2. **Build Process**: Run build command to compile TypeScript
3. **Testing**: Load extension in Chrome for testing
4. **Debugging**: Use Chrome DevTools for debugging
5. **Deployment**: Package for distribution

## 📊 Data Flow

```
User Interaction → Popup → Background Script → Content Script → Page Analysis
                     ↓
                Data Storage ← Results Processing ← Issue Detection
                     ↓
                Report Generation → Export/Display
```

## 🔒 Privacy & Security

- **No Data Collection**: Extension doesn't collect personal data
- **Local Storage**: All data stored locally in browser
- **No External Requests**: No data sent to external servers
- **Secure Communication**: All inter-component communication is secure

## 🚀 Performance

- **Efficient Analysis**: Optimized algorithms for fast page analysis
- **Minimal Resource Usage**: Lightweight extension with minimal memory footprint
- **Background Processing**: Non-blocking analysis that doesn't affect page performance
- **Smart Caching**: Intelligent caching of analysis results

## 🧪 Testing

### Manual Testing

1. Load extension in Chrome
2. Navigate to various websites
3. Test different inspection scenarios
4. Verify data persistence and export

### Automated Testing

```bash
npm test
```

## 📦 Building & Distribution

### Development Build

```bash
npm run build
```

### Production Build

```bash
npm run build:prod
```

### Package for Store

```bash
npm run package
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the documentation
- Review the code comments

## 🔮 Future Enhancements

- **AI-Powered Analysis**: Machine learning-based issue detection
- **Custom Rules**: User-defined inspection rules
- **Team Collaboration**: Shared inspection results
- **Integration**: API for third-party tools
- **Advanced Reporting**: More detailed analytics and insights

---

**Heurix Inspector** - Making the web more accessible, usable, and beautiful, one inspection at a time.
