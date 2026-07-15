# Water Utility Management System

A comprehensive mobile application for water utility management with separate modules for collectors and consumers.

## System Overview

This system provides offline-first mobile applications for both field collectors and consumers, with automatic synchronization when connectivity is restored.

## Architecture

### Core Components

- **Authentication Flow**: Login screen before accessing main app features
- **Role-Based Access**: Separate modules for Collector and Consumer roles
- **Offline-First Design**: All data stored locally with automatic sync
- **Bluetooth Printing**: Direct thermal printer integration for receipts

## Collector Module

### Features Implemented

1. **Meter Reading System**
   - Record meter readings for assigned routes
   - Automatic consumption calculation
   - Offline storage with sync capability
   - Notes and photo support
   - Previous reading validation

2. **Collection Recording**
   - Daily payment collection recording
   - Multiple payment methods (cash, check, electronic)
   - Automatic receipt generation
   - Bluetooth thermal printer integration
   - Offline operation capability

3. **Service Actions**
   - Water service reconnections
   - Water service disconnections
   - Field verification support
   - Authorization code validation
   - Balance and payment tracking

4. **Reports & Analytics**
   - Reading reports per route/collector
   - Service and invoice reports
   - Collection summaries
   - Sync status monitoring
   - Conflict resolution interface

5. **Offline Sync System**
   - Automatic network detection
   - Background synchronization
   - Conflict resolution
   - Server-side data fetching
   - Manual sync trigger

## Consumer Module

### Features Implemented

1. **Announcements System**
   - Service updates display
   - Advisories and notifications
   - Scheduled interruption alerts
   - Priority-based categorization
   - Zone-specific filtering

2. **Billing Management**
   - Complete billing history
   - Account balance tracking
   - Payment status monitoring
   - Due date information
   - Penalty calculations

3. **Account Management**
   - Multiple account linking
   - Account limit enforcement (max 5 accounts)
   - Account status monitoring
   - Consumer information display
   - Account unlinking capability

4. **Feedback System**
   - Categorized feedback submission
   - Billing-related issues
   - Service quality reports
   - System issue reporting
   - Submission tracking

5. **Notification System**
   - Due date reminders
   - Configurable advance notice (1-14 days)
   - Payment confirmations
   - Service interruption alerts
   - Announcement notifications

## Technical Implementation

### Data Models

Comprehensive TypeScript interfaces for:
- User authentication and roles
- Consumer accounts and billing
- Meter readings and consumption
- Collections and receipts
- Service actions (reconnections/disconnections)
- Announcements and notifications
- Feedback and support tickets

### Storage Services

- **AsyncStorage Integration**: Local data persistence
- **Offline-First Design**: All operations work without internet
- **Sync Service**: Automatic background synchronization
- **Conflict Resolution**: Handle duplicate/overlapping entries

### Printer Integration

- **Bluetooth Support**: GOOJPRT PT-210 thermal printer
- **ESC/POS Commands**: Receipt formatting
- **Offline Printing**: Works without internet
- **Receipt Generation**: Automatic formatting

### Notification System

- **Expo Notifications**: Local notification scheduling
- **Due Date Reminders**: Configurable advance notice
- **Service Alerts**: Interruption notifications
- **Payment Confirmations**: Real-time updates

## File Structure

```
src/
├── types/
│   └── water-utility.ts          # Core data models
├── services/
│   ├── storage-service.ts        # Local storage management
│   ├── sync-service.ts           # Offline synchronization
│   ├── printer-service.ts        # Bluetooth printing
│   └── notification-service.ts   # Notification management
├── contexts/
│   └── auth-context.tsx          # Authentication state
├── app/
│   ├── (auth)/                   # Authenticated routes
│   │   ├── collector/           # Collector module
│   │   │   ├── index.tsx        # Dashboard
│   │   │   ├── meter-reading.tsx
│   │   │   ├── collections.tsx
│   │   │   ├── service-actions.tsx
│   │   │   ├── reports.tsx
│   │   │   └── sync.tsx
│   │   └── consumer/            # Consumer module
│   │       ├── index.tsx        # Dashboard
│   │       ├── announcements.tsx
│   │       ├── billing-history.tsx
│   │       ├── accounts.tsx
│   │       ├── feedback.tsx
│   │       └── notifications.tsx
│   └── login.tsx                # Login screen
└── components/
    └── app-tabs.tsx             # Navigation tabs
```

## Key Features

### Offline Capability
- All core functionality works without internet
- Local data storage using AsyncStorage
- Automatic sync when connection restored
- Conflict resolution for duplicate entries

### Security
- Role-based access control
- Authentication required for all features
- Account linking limitations
- Authorization codes for service actions

### User Experience
- Intuitive dashboard navigation
- Real-time sync status
- Form validation
- Error handling and user feedback

## Dependencies

- `@react-native-async-storage/async-storage` - Local storage
- `react-native-ble-plx` - Bluetooth printer support
- `expo-notifications` - Notification system
- `expo-network` - Network status monitoring
- `expo-router` - Navigation and routing

## Next Steps

To complete the system, you'll need to:

1. **Backend Integration**: Replace mock API calls with real server endpoints
2. **Authentication**: Implement real user authentication
3. **Database**: Set up server-side database for data persistence
4. **Testing**: Add comprehensive testing for all modules
5. **Deployment**: Configure for production deployment

## Configuration

### Authentication Context
Update `auth-context.tsx` with real authentication logic
Replace simulated login with actual API integration

### API Endpoints
Replace mock API calls in `sync-service.ts` with real endpoints
Configure server URLs and authentication headers

### Printer Configuration
Update printer service UUIDs for specific printer models
Configure receipt formatting as per requirements

## Notes

- The system is designed to work fully offline
- Bluetooth printing works without internet connectivity
- All data is synced automatically when online
- Conflict resolution is handled server-side
- Notification permissions are requested on first use
