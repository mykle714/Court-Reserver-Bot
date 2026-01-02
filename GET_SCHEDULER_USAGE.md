# getMemberExpandedScheduler Usage

## Overview
The `getMemberExpandedScheduler` method fetches scheduler data from the CourtReserve API. It simplifies the process by only requiring two parameters while automatically generating all date formats.

## Method Signature

```javascript
async getMemberExpandedScheduler({ requestData, startDate })
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `requestData` | string | Encrypted authentication data (base64 encoded) |
| `startDate` | Date or string | Start date for the scheduler (Date object or ISO string) |

## Constants (Auto-configured)

The following values are hardcoded based on the curl request:
- **orgId**: "7031"
- **TimeZone**: "America/Los_Angeles"
- **UiCulture**: "en-US"
- **CostTypeId**: "88151"
- **CustomSchedulerId**: "17109"
- **ReservationMinInterval**: "60"
- **SelectedCourtIds**: "52667,52668,52669,52670,52671,52672,52673,52674,52675,52676,52677" (11 courts)
- **MemberIds**: "6098795"

## Usage Example

```javascript
const apiClient = require('./src/utils/apiClient');

// Example 1: Using ISO date string
async function getSchedulerData() {
  try {
    const requestData = "SVtXlVuPvpnXO5nnRKOxzcTcYY9TzotlauPP/CBlLvnw..."; // Your encrypted token
    const startDate = "2026-01-29T23:37:45.000Z";
    
    const response = await apiClient.getMemberExpandedScheduler({
      requestData,
      startDate
    });
    
    console.log('Scheduler data:', response);
    return response;
  } catch (error) {
    console.error('Error fetching scheduler:', error);
  }
}

// Example 2: Using Date object
async function getSchedulerForToday() {
  try {
    const requestData = "SVtXlVuPvpnXO5nnRKOxzcTcYY9TzotlauPP/CBlLvnw..."; // Your encrypted token
    const startDate = new Date(); // Today
    
    const response = await apiClient.getMemberExpandedScheduler({
      requestData,
      startDate
    });
    
    console.log('Scheduler data:', response);
    return response;
  } catch (error) {
    console.error('Error fetching scheduler:', error);
  }
}

// Example 3: Using Date object for specific date
async function getSchedulerForSpecificDate() {
  try {
    const requestData = "SVtXlVuPvpnXO5nnRKOxzcTcYY9TzotlauPP/CBlLvnw..."; // Your encrypted token
    const startDate = new Date(2026, 0, 29); // January 29, 2026
    
    const response = await apiClient.getMemberExpandedScheduler({
      requestData,
      startDate
    });
    
    console.log('Scheduler data:', response);
    return response;
  } catch (error) {
    console.error('Error fetching scheduler:', error);
  }
}
```

## Auto-Generated Date Formats

The method automatically generates three date formats from the `startDate` parameter:

1. **ISO String** (`startDate`): `"2026-01-29T23:37:45.000Z"`
2. **GMT String** (`Date`): `"Thu, 29 Jan 2026 23:37:45 GMT"`
3. **Kendo Date** (`KendoDate`): `{ Year: 2026, Month: 1, Day: 29 }`

## API Endpoint

- **URL**: `/api/scheduler/member-expanded`
- **Method**: GET
- **Base URL**: Configured via `API_BASE_URL` environment variable
- **Authentication**: Automatic via Bearer token from authManager

## Response

Returns the response data from the CourtReserve API containing scheduler information for the specified date and courts.

## Error Handling

The method throws errors with detailed logging. Wrap calls in try-catch blocks to handle errors appropriately.

## Logging

The method logs:
- Request info (start date, org ID)
- Success messages
- Error details (error message, HTTP status)
